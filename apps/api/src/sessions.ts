// In-memory registry of connected devices and live lectures (single process, no cluster).
// Lectures own the STT stream, the caption sequence counter, a ring of recent finals for
// reconnect snapshots, the viewers and their languages, and the translation cache.
import type { CaptionEvent, CaptionMode, CaptionModeInfo, CaptionWord, DeviceLang, DeviceState, LectureSummary } from "@slap/contracts";
import { AUDIO_SAMPLE_RATE, INBOX_CODE } from "@slap/contracts";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db/index.ts";
import { enqueueStudyBundle } from "./pipeline/bundle.ts";
import { createStt, type SttBackend, type SttResult, type SttSession } from "./pipeline/stt.ts";
import { feedPcm, flushLecture } from "./pipeline/diarize.ts";
import { isSourceLang, translate, translateMany } from "./pipeline/translate.ts";
import { settings } from "./settings.ts";

const RING = 200;                         // finals kept in memory per lecture for snapshots
const RESUME_WINDOW_MS = 6 * 3600_000;    // a "live" lecture older than this is not resumed
const BACKFILL = 20;                      // finals translated when a new language joins mid-lecture
const INTERIM_TR_GAP_MS = 700;            // the sentence being spoken is translated at most this often per language
const DEVICE_GONE_MS = 90_000;            // a device that stays away this long has its recording ended and saved
const RESUME_GAP_MS = 5 * 60_000;         // after a server restart a device carries on in its lecture if that was active this recently
const DEVICE_CAPTION_CHARS = 160;         // tail of the transcript sent to the device screen (it shows the last three or four lines)
const ID_BATCH = 32;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LectureStatus = LectureSummary["status"];
type LectureSource = "device" | "browser" | "import";

export interface FinalEntry {
  seq: number;
  segmentId: number;        // segments.id; negative when the database was unreachable
  idx: number;
  text: string;
  start: number;
  end: number;
  words: CaptionWord[];
  tr: Map<string, { text: string; seq: number }>;
}

export interface Viewer {
  lang: string;
  /** Live events are only sent after the viewer has received its snapshot. */
  ready: boolean;
  send(ev: CaptionEvent): void;
}

/** A connected device as seen by sessions; ws/device.ts owns the socket and implements refresh().
 *  A device that is on records: attachDevice starts a lecture for it in the inbox (the hidden class INBOX_CODE),
 *  with no pairing and no course to pick first. The app puts the recording into a course while it runs or
 *  afterwards (assignLecture). Devices are shared: every caller sees and controls the ones that are online. */
export interface DeviceLink {
  readonly id: string;
  name: string | null;
  state: DeviceState;
  /** The course its current recording was put into. Null = still in the inbox, or not recording. */
  classId: string | null;
  classCode: string | null;
  className: string | null;
  lectureId: string | null;
  level: number;            // 0..1 for the OLED meter
  /** Caption language on the device's own screen (tilt left or right on the device). */
  lang: DeviceLang;
  /** Tail of the caption in `lang`. */
  lastCaption: string;
  /** Length in seconds of the recording that just ended, for the "Saved" screen. Null before the first stop. */
  savedSeconds: number | null;
  /** Re-sends state JSON and the OLED frame if either changed. */
  refresh(): void;
}

/** Translation of the sentence being spoken, for one language: one request at a time, the newest text wins. */
interface InterimTranslation {
  next: string | null;
  busy: boolean;
  lastAt: number;
  timer: NodeJS.Timeout | null;
}

export interface BrowserAudioSource {
  /** Ends the browser stream (called when the lecture stops). */
  close(reason: string): void;
}

/** A saved lecture being played back through the caption path (demo replay): no STT, nothing persisted. */
export interface ReplayState {
  sourceId: string;
  speed: number;
  timer: ReturnType<typeof setInterval> | null;
}

export interface LiveLecture {
  id: string;
  classId: string;
  title: string;
  date: string;
  startedAt: number;
  endedAt: number | null;
  status: LectureStatus;
  source: LectureSource;
  deviceId: string | null;
  seq: number;
  /** seq when this process loaded the lecture from the DB; a client `since` at or below it predates this process. */
  seqFloor: number;
  nextIdx: number;
  finals: FinalEntry[];
  viewers: Set<Viewer>;
  stt: SttSession | null;
  /** Browser-microphone fallback currently streaming into this lecture (one audio source at a time). */
  browserAudio: BrowserAudioSource | null;
  queue: Promise<void>;       // finals handled strictly in order
  persist: Promise<void>;     // database writes, in order
  idPool: number[];
  refilling: Promise<void> | null;
  stopping: Promise<LectureSummary> | null;
  inflight: Set<string>;      // `${segmentId}|${lang}` translations in progress
  utterance: number;          // finals received so far; a translation of an unfinished sentence is dropped once it moves
  interimTr: Map<string, InterimTranslation>;   // by language
  latency: { interim: number[]; final: number[] };
  /** False for ephemeral lectures (tests, no database): nothing is written and segment ids are negative. */
  persistent: boolean;
  sttBackend?: SttBackend;
  /** Lecture-relative time of the current STT stream's first byte, and bytes sent since (audio clock for diarization). */
  audioClock: { offsetS: number; bytes: number } | null;
  /** Set while this (ephemeral) lecture replays a saved one. */
  replay: ReplayState | null;
}

const lectures = new Map<string, LiveLecture>();
const loading = new Map<string, Promise<LiveLecture | null>>();
const devices = new Map<string, DeviceLink>();
const starting = new Map<string, Promise<LectureSummary>>();
let tempId = 0;

const log = (...a: unknown[]) => console.log("[sessions]", ...a);
const logErr = (what: string) => (e: unknown) => console.error(`[sessions] ${what}:`, (e as Error).message ?? e);

export function isUuid(s: string): boolean { return UUID_RE.test(s); }

export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]!);
}

function pushCapped(xs: number[], x: number, cap = 100) { xs.push(x); if (xs.length > cap) xs.shift(); }

// ---------- lecture objects ----------

type LectureRow = typeof schema.lectures.$inferSelect;

function newLecture(row: LectureRow): LiveLecture {
  return {
    id: row.id, classId: row.classId, title: row.title, date: row.date,
    startedAt: row.startedAt.getTime(), endedAt: row.endedAt?.getTime() ?? null,
    status: row.status, source: row.source, deviceId: row.deviceId,
    seq: 0, seqFloor: 0, nextIdx: 0, finals: [], viewers: new Set(), stt: null,
    queue: Promise.resolve(), persist: Promise.resolve(), idPool: [], refilling: null, stopping: null,
    inflight: new Set(), utterance: 0, interimTr: new Map(), latency: { interim: [], final: [] }, persistent: true, browserAudio: null, audioClock: null, replay: null,
  };
}

/** An in-memory-only live lecture (no database rows); used by tests and offline runs. */
export function createEphemeralLecture(opts: { classId?: string; title?: string; sttBackend?: SttBackend } = {}): LiveLecture {
  const now = new Date();
  const l = newLecture({
    id: crypto.randomUUID(), classId: opts.classId ?? crypto.randomUUID(), title: opts.title ?? "Ephemeral lecture", date: today(now),
    status: "live", startedAt: now, endedAt: null, deviceId: null, source: "browser",
  });
  l.persistent = false;
  l.sttBackend = opts.sttBackend;
  lectures.set(l.id, l);
  return l;
}

export function toSummary(l: Pick<LiveLecture, "id" | "classId" | "title" | "date" | "status" | "startedAt" | "endedAt" | "finals">): LectureSummary {
  const last = l.finals.at(-1)?.end;
  const wall = ((l.endedAt ?? Date.now()) - l.startedAt) / 1000;
  return { id: l.id, classId: l.classId, title: l.title, date: l.date, status: l.status, durationS: Math.round(last ?? wall) };
}

/** The lecture if it is in memory (live, or opened by a viewer). */
export function getLecture(id: string): LiveLecture | undefined { return lectures.get(id); }

/** Memory first, else rebuilt from the database (recent finals and their translations). */
export async function loadLecture(id: string): Promise<LiveLecture | null> {
  if (!isUuid(id)) return null;
  const mem = lectures.get(id);
  if (mem) return mem;
  let p = loading.get(id);
  if (!p) {
    p = loadFromDb(id).finally(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

async function loadFromDb(id: string): Promise<LiveLecture | null> {
  const [row] = await db.select().from(schema.lectures).where(eq(schema.lectures.id, id)).limit(1);
  if (!row) return null;
  const segs = (await db.select().from(schema.segments).where(eq(schema.segments.lectureId, id))
    .orderBy(desc(schema.segments.idx)).limit(RING)).reverse();
  const l = newLecture(row);
  l.finals = segs.map((s, i) => ({
    seq: i + 1, segmentId: s.id, idx: s.idx, text: s.text, start: s.startS, end: s.endS,
    words: (s.words as CaptionWord[] | null) ?? [], tr: new Map(),
  }));
  // Seq never goes backwards within a lecture, even across a server restart: resume from
  // elapsed time at 100 events/s, above anything the previous process can have sent.
  l.seq = l.seqFloor = Math.max(l.finals.length, Math.floor((Date.now() - l.startedAt) / 10));
  l.nextIdx = (segs.at(-1)?.idx ?? -1) + 1;
  if (segs.length) {
    const byId = new Map(l.finals.map(f => [f.segmentId, f]));
    const trs = await db.select().from(schema.translations).where(inArray(schema.translations.segmentId, segs.map(s => s.id)));
    for (const t of trs) { const f = byId.get(t.segmentId); f?.tr.set(t.lang, { text: t.text, seq: f.seq }); }
  }
  return lectures.get(id) ?? (lectures.set(id, l), l);
}

function maybeEvict(l: LiveLecture) {
  if (l.status !== "live" && l.viewers.size === 0 && !l.stt && !l.stopping) lectures.delete(l.id);
}

// ---------- viewers and broadcast ----------

export function viewerLanguages(l: LiveLecture): string[] {
  return [...new Set([...l.viewers].map(v => v.lang))].sort();
}

export function lectureState(l: LiveLecture): DeviceState | "ended" {
  if (l.status !== "live") return "ended";
  if (l.replay) return "recording";
  const d = l.deviceId ? devices.get(l.deviceId) : undefined;
  if (d && d.lectureId === l.id) return "recording";
  if (l.browserAudio) return "recording";
  if (l.deviceId && l.source === "device") return "error";   // its device dropped mid-lecture
  return l.stt ? "recording" : "idle";
}

export function statusEvent(l: LiveLecture): CaptionEvent {
  const latencyMs = median(l.latency.interim.slice(-20));
  return { type: "status", state: lectureState(l), viewers: l.viewers.size, languages: viewerLanguages(l), ...(latencyMs !== undefined ? { latencyMs } : {}), ...(l.replay ? { replay: true } : {}) };
}

function broadcast(l: LiveLecture, ev: CaptionEvent, lang?: string) {
  for (const v of l.viewers) if (v.ready && (!lang || v.lang === lang)) v.send(ev);
}

export function broadcastStatus(l: LiveLecture) { broadcast(l, statusEvent(l)); }

export function addViewer(l: LiveLecture, v: Viewer) {
  l.viewers.add(v);
  broadcastStatus(l);
}

export function removeViewer(l: LiveLecture, v: Viewer) {
  if (!l.viewers.delete(v)) return;
  broadcastStatus(l);
  maybeEvict(l);
}

/** Switches a viewer's language; the first viewer of a new language triggers a backfill of recent finals. */
export function setViewerLang(l: LiveLecture, v: Viewer, lang: string) {
  const isNew = !viewerLanguages(l).includes(lang);
  v.lang = lang;
  if (isNew && !isSourceLang(lang)) {
    const todo = l.finals.slice(-BACKFILL).filter(f => !f.tr.has(lang));
    if (todo.length) void translateEntries(l, todo, lang);
  }
}

/** Finals after `since` (or whose translation in `lang` arrived after it). A `since` from before this process
 *  loaded the lecture (or ahead of the counter) gets everything; clients dedupe finals by segmentId. */
export function snapshot(l: LiveLecture, since: number, lang: string): CaptionEvent {
  const from = since > l.seq || since <= l.seqFloor ? 0 : Math.max(0, since);
  const finals = l.finals
    .filter(f => f.seq > from || (f.tr.get(lang)?.seq ?? 0) > from)
    .map(f => {
      const tr = isSourceLang(lang) ? undefined : f.tr.get(lang)?.text;
      return { segmentId: f.segmentId, text: f.text, start: f.start, end: f.end, ...(tr !== undefined ? { translation: tr } : {}) };
    });
  return { type: "snapshot", seq: l.seq, finals };
}

// ---------- captions, translation, persistence ----------

function refillIds(l: LiveLecture): Promise<void> {
  l.refilling ??= (async () => {
    try {
      const res = await db.execute<{ id: number }>(sql`select nextval(pg_get_serial_sequence('segments', 'id'))::int as id from generate_series(1, ${ID_BATCH})`);
      l.idPool.push(...res.rows.map(r => Number(r.id)));
    } catch (e) { logErr("segment id prefetch")(e); }
    finally { l.refilling = null; }
  })();
  return l.refilling;
}

/** Segment ids are reserved from the serial sequence in batches so a final is broadcast without waiting on an insert. */
async function takeSegmentId(l: LiveLecture): Promise<number> {
  if (!l.persistent) return -(++tempId);
  if (l.idPool.length < 8) {
    const p = refillIds(l);
    if (!l.idPool.length) await p;
  }
  return l.idPool.shift() ?? -(++tempId);
}

function onInterim(l: LiveLecture, r: SttResult) {
  if (r.latencyMs !== undefined) pushCapped(l.latency.interim, r.latencyMs);
  broadcast(l, { type: "interim", seq: ++l.seq, text: r.text, words: r.words, start: r.start, end: r.end });
  const dev = deviceOf(l);
  if (dev && isSourceLang(dev.lang)) {
    dev.lastCaption = `${l.finals.at(-1)?.text ?? ""} ${r.text}`.trim().slice(-DEVICE_CAPTION_CHARS);
    dev.refresh();
  }
  for (const lang of captionLanguages(l)) {
    if (isSourceLang(lang)) continue;
    let st = l.interimTr.get(lang);
    if (!st) l.interimTr.set(lang, st = { next: null, busy: false, lastAt: 0, timer: null });
    st.next = r.text;
    pumpInterimTranslation(l, lang, st);
  }
}

/** Sends the newest unfinished sentence for translation unless a request is in flight or the last one was under
 *  INTERIM_TR_GAP_MS ago. A result that arrives after its sentence became a final is dropped. */
function pumpInterimTranslation(l: LiveLecture, lang: string, st: InterimTranslation) {
  if (l.status !== "live") { st.next = null; return; }
  if (st.busy || st.timer || st.next === null) return;
  const wait = st.lastAt + INTERIM_TR_GAP_MS - Date.now();
  if (wait > 0) {
    st.timer = setTimeout(() => { st.timer = null; pumpInterimTranslation(l, lang, st); }, wait);
    st.timer.unref();
    return;
  }
  const text = st.next;
  const utterance = l.utterance;
  st.next = null;
  st.busy = true;
  st.lastAt = Date.now();
  translate(text, lang)
    .then(out => {
      if (l.utterance !== utterance || l.status !== "live") return;
      broadcast(l, { type: "interimTranslation", seq: ++l.seq, lang, text: out }, lang);
      const dev = deviceOf(l);
      if (dev && dev.lang === lang) {
        dev.lastCaption = `${l.finals.at(-1)?.tr.get(lang)?.text ?? ""} ${out}`.trim().slice(-DEVICE_CAPTION_CHARS);
        dev.refresh();
      }
    })
    .catch(logErr(`translate interim ${lang}`))
    .finally(() => { st.busy = false; pumpInterimTranslation(l, lang, st); });
}

/** `stored`: translations already known for this final (replay), sent instead of translating again. */
function onFinal(l: LiveLecture, r: SttResult, stored?: Map<string, string>) {
  l.utterance++;
  for (const st of l.interimTr.values()) st.next = null;
  l.queue = l.queue.then(() => handleFinal(l, r, stored)).catch(logErr("final"));
}

async function handleFinal(l: LiveLecture, r: SttResult, stored?: Map<string, string>) {
  if (r.latencyMs !== undefined) pushCapped(l.latency.final, r.latencyMs);
  const segmentId = await takeSegmentId(l);
  const f: FinalEntry = { seq: ++l.seq, segmentId, idx: l.nextIdx++, text: r.text, start: r.start, end: r.end, words: r.words, tr: new Map() };
  l.finals.push(f);
  if (l.finals.length > RING) l.finals.shift();
  broadcast(l, { type: "final", seq: f.seq, segmentId, text: f.text, words: f.words, start: f.start, end: f.end });
  if (stored) for (const [lang, text] of stored) {
    const seq = ++l.seq;
    f.tr.set(lang, { text, seq });
    broadcast(l, { type: "translation", seq, segmentId, lang, text }, lang);
  }

  const dev = deviceOf(l);
  if (dev && isSourceLang(dev.lang)) { dev.lastCaption = f.text.slice(-DEVICE_CAPTION_CHARS); dev.refresh(); }

  if (segmentId > 0) {
    l.persist = l.persist.then(async () => {
      await db.insert(schema.segments).values({ id: segmentId, lectureId: l.id, idx: f.idx, startS: f.start, endS: f.end, text: f.text, words: f.words });
    }).catch(logErr("segment insert"));
  }
  for (const lang of captionLanguages(l)) if (!isSourceLang(lang)) void translateEntries(l, [f], lang);
}

/** The device recording this lecture right now, if any. */
function deviceOf(l: LiveLecture): DeviceLink | undefined {
  const d = l.deviceId ? devices.get(l.deviceId) : undefined;
  return d && d.lectureId === l.id ? d : undefined;
}

/** Languages someone is reading now: the viewers', plus the one on the device's own screen. */
function captionLanguages(l: LiveLecture): string[] {
  const d = deviceOf(l);
  return [...new Set([...viewerLanguages(l), ...(d ? [d.lang] : [])])];
}

/** Puts the newest finished sentence on the device's screen in the device's language, once it is translated. */
function showLatestOnDevice(l: LiveLecture) {
  const d = deviceOf(l), last = l.finals.at(-1);
  if (!d || !last) return;
  const text = isSourceLang(d.lang) ? last.text : last.tr.get(d.lang)?.text;
  if (text === undefined) return;
  d.lastCaption = text.slice(-DEVICE_CAPTION_CHARS);
  d.refresh();
}

/** Switches the caption language on the device's screen. The English caption stays up until the first translation arrives. */
export function setDeviceLang(d: DeviceLink, lang: DeviceLang) {
  d.lang = lang;
  const l = d.lectureId ? lectures.get(d.lectureId) : undefined;
  if (l) {
    showLatestOnDevice(l);
    if (!isSourceLang(lang)) void translateEntries(l, l.finals.slice(-2), lang);
  }
  d.refresh();
}

async function translateEntries(l: LiveLecture, entries: FinalEntry[], lang: string) {
  const todo = entries.filter(f => !f.tr.has(lang) && !l.inflight.has(`${f.segmentId}|${lang}`));
  if (!todo.length) return;
  for (const f of todo) l.inflight.add(`${f.segmentId}|${lang}`);
  try {
    const out = await translateMany(todo.map(f => f.text), lang);
    const rows: Array<typeof schema.translations.$inferInsert> = [];
    todo.forEach((f, i) => {
      const text = out[i]!;
      const seq = ++l.seq;
      f.tr.set(lang, { text, seq });
      broadcast(l, { type: "translation", seq, segmentId: f.segmentId, lang, text }, lang);
      if (f.segmentId > 0) rows.push({ segmentId: f.segmentId, lang, text });
    });
    if (deviceOf(l)?.lang === lang && todo.includes(l.finals.at(-1)!)) showLatestOnDevice(l);
    if (rows.length) {
      l.persist = l.persist.then(async () => {
        await db.insert(schema.translations).values(rows)
          .onConflictDoUpdate({ target: [schema.translations.segmentId, schema.translations.lang], set: { text: sql`excluded.text` } });
      }).catch(logErr("translation insert"));
    }
  } catch (e) {
    logErr(`translate ${lang}`)(e);
  } finally {
    for (const f of todo) l.inflight.delete(`${f.segmentId}|${lang}`);
  }
}

function ensureStt(l: LiveLecture): SttSession {
  if (l.stt) return l.stt;
  const offsetS = Math.max(l.finals.at(-1)?.end ?? 0, (Date.now() - l.startedAt) / 1000);
  const stt = createStt({ offsetS, label: l.id.slice(0, 8), ...(l.sttBackend ? { backend: l.sttBackend } : {}) });
  stt.on("interim", r => onInterim(l, r));
  stt.on("final", r => onFinal(l, r));
  l.stt = stt;
  l.audioClock = { offsetS, bytes: 0 };
  if (l.persistent && !l.idPool.length) void refillIds(l);
  log(`stt ${stt.backend} started for ${l.id} at +${offsetS.toFixed(1)}s`);
  return stt;
}

async function closeStt(l: LiveLecture) {
  const stt = l.stt;
  l.stt = null;
  if (stt) await stt.close();
  await l.queue;
}

/** True while a connected device is streaming into this lecture. */
export function deviceStreaming(l: LiveLecture): boolean {
  const d = l.deviceId ? devices.get(l.deviceId) : undefined;
  return !!d && d.lectureId === l.id;
}

/** Claims the lecture's single audio input for a browser microphone. */
export function attachBrowserAudio(l: LiveLecture, src: BrowserAudioSource): "ok" | "not-live" | "busy" {
  if (l.status !== "live") return "not-live";
  if (deviceStreaming(l) || (l.browserAudio && l.browserAudio !== src)) return "busy";
  l.browserAudio = src;
  ensureStt(l);
  broadcastStatus(l);
  return "ok";
}

/** Releases the browser input; the lecture stays live and its STT stream is closed (reopened on the next audio). */
export function detachBrowserAudio(l: LiveLecture, src: BrowserAudioSource) {
  if (l.browserAudio !== src) return;
  l.browserAudio = null;
  void closeStt(l).then(() => broadcastStatus(l));
  broadcastStatus(l);
}

/** Device or browser audio for a live lecture. Dropped (never queued here) if the lecture is not live. */
export function pushAudio(lectureId: string, pcm: Buffer) {
  const l = lectures.get(lectureId);
  if (!l || l.status !== "live") return;
  const stt = ensureStt(l);
  const clock = l.audioClock!;
  const atS = clock.offsetS + clock.bytes / (AUDIO_SAMPLE_RATE * 2);
  clock.bytes += pcm.length;
  stt.sendAudio(pcm);
  // Diarization pass (pipeline/diarize.ts): in-memory ring, persisted lectures only.
  if (l.persistent) feedPcm(l.id, pcm, atS, () => settled(l));
}

/** Resolves once the finals received so far are handled and written. */
function settled(l: LiveLecture): Promise<void> { return l.queue.then(() => l.persist); }

// ---------- caption mode ----------

const MODE_BACKEND: Record<CaptionMode, SttBackend> = { standard: "deepgram", fast: "flux", accurate: "soniox" };

/** The mode new speech-to-text streams use, and the modes whose API key is set. */
export function captionMode(): CaptionModeInfo {
  const dg = !!settings.stt.deepgramKey;
  const available: CaptionMode[] = [...(dg ? ["standard", "fast"] as const : []), ...(settings.stt.sonioxKey ? ["accurate"] as const : [])];
  const mode = (Object.keys(MODE_BACKEND) as CaptionMode[]).find(m => MODE_BACKEND[m] === settings.stt.backend);
  return { mode: mode && available.includes(mode) ? mode : "mock", available };
}

/**
 * Switches the caption mode for the whole server until it restarts (STT_BACKEND sets the mode at
 * start). A lecture that is recording moves over at once: its stream is closed, which flushes
 * its last finals, and the next audio frame opens one on the new service with timestamps continuing.
 */
export function setCaptionMode(mode: CaptionMode): CaptionModeInfo {
  const backend = MODE_BACKEND[mode];
  if (settings.stt.backend !== backend) {
    settings.stt.backend = backend;
    log(`caption mode -> ${mode} (${backend})`);
    for (const l of lectures.values()) if (l.stt && !l.sttBackend) void closeStt(l).catch(logErr("caption mode switch"));
  }
  return captionMode();
}

// ---------- devices ----------

export function getDevice(id: string): DeviceLink | undefined { return devices.get(id); }

/** A connected device whose active class is `classId`. */
export function connectedDeviceForClass(classId: string): DeviceLink | undefined {
  for (const d of devices.values()) if (d.classId === classId) return d;
  return undefined;
}

function bindDevice(l: LiveLecture, d: DeviceLink) {
  if (l.deviceId !== d.id) {
    l.deviceId = d.id;
    if (l.persistent) void db.update(schema.lectures).set({ deviceId: d.id }).where(eq(schema.lectures.id, l.id)).catch(logErr("lecture device"));
  }
  d.lectureId = l.id;
  d.state = "recording";
  d.lastCaption = "";
  ensureStt(l);
  showLatestOnDevice(l);
  d.refresh();
  broadcastStatus(l);
}

/** True if `d` may take over the lecture's audio input: no browser microphone and no other device streaming. */
function canBind(l: LiveLecture, d: DeviceLink): boolean {
  if (l.browserAudio) return false;
  const cur = l.deviceId ? devices.get(l.deviceId) : undefined;
  return !cur || cur === d || cur.lectureId !== l.id;
}

// ---------- the inbox: device recordings that are not in a course yet ----------

let inbox: Promise<string> | null = null;

/** Id of the hidden class that holds device recordings until someone puts them into a course (made on first use). */
export function inboxClassId(): Promise<string> {
  inbox ??= (async () => {
    const { classes } = schema;
    const [made] = await db.insert(classes).values({ name: "New recordings", code: INBOX_CODE, ownerUserId: "system" }).onConflictDoNothing().returning({ id: classes.id });
    if (made) return made.id;
    const [row] = await db.select({ id: classes.id }).from(classes).where(eq(classes.code, INBOX_CODE)).limit(1);
    if (!row) throw new Error("inbox class is missing");
    return row.id;
  })().catch(e => { inbox = null; throw e; });
  return inbox;
}

function recordingTitle(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Recording ${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Shows on the device link which course its recording is in (none while it is in the inbox). */
async function pointDeviceAt(d: DeviceLink, classId: string) {
  const [cls] = classId === await inboxClassId() ? [] : await db.select({ id: schema.classes.id, name: schema.classes.name, code: schema.classes.code })
    .from(schema.classes).where(eq(schema.classes.id, classId)).limit(1);
  Object.assign(d, { classId: cls?.id ?? null, classCode: cls?.code ?? null, className: cls?.name ?? null });
}

const startingDevice = new Map<string, Promise<LectureSummary | null>>();
const goneTimers = new Map<string, NodeJS.Timeout>();

/** Starts recording for a connected device: it carries on in its own live lecture after a short drop, otherwise
 *  a new lecture is made in the inbox. Null if the device went away meanwhile. */
export function startDeviceSession(d: DeviceLink): Promise<LectureSummary | null> {
  let p = startingDevice.get(d.id);
  if (!p) {
    p = doStartDevice(d).finally(() => startingDevice.delete(d.id));
    startingDevice.set(d.id, p);
  }
  return p;
}

async function doStartDevice(d: DeviceLink): Promise<LectureSummary | null> {
  const cur = d.lectureId ? lectures.get(d.lectureId) : undefined;
  if (cur?.status === "live") return toSummary(cur);
  const resume = async (l: LiveLecture) => {
    await pointDeviceAt(d, l.classId);
    if (devices.get(d.id) !== d) return null;
    bindDevice(l, d);
    return toSummary(l);
  };
  // A Wi-Fi drop: this process still has the device's lecture.
  for (const l of lectures.values()) {
    if (l.status === "live" && l.deviceId === d.id && l.persistent && !l.replay && !l.stopping && canBind(l, d)) return resume(l);
  }
  // Lectures the device left live in the database (the server restarted, or the device lost power): the newest
  // carries on if it was active a moment ago, the others are ended and saved.
  const left = await db.select({ id: schema.lectures.id }).from(schema.lectures)
    .where(and(eq(schema.lectures.deviceId, d.id), eq(schema.lectures.status, "live"))).orderBy(desc(schema.lectures.startedAt));
  let recent: LiveLecture | null = null;
  for (const row of left) {
    const l = await loadLecture(row.id);
    if (!l || l.status !== "live") continue;
    const lastActive = l.startedAt + (l.finals.at(-1)?.end ?? 0) * 1000;
    if (!recent && Date.now() - lastActive < RESUME_GAP_MS && canBind(l, d)) recent = l;
    else await stopSession(l.id).catch(logErr("stop left-over lecture"));
  }
  if (devices.get(d.id) !== d) return null;
  if (recent) return resume(recent);
  const [row] = await db.insert(schema.lectures).values({
    classId: await inboxClassId(), title: recordingTitle(), date: today(), status: "live", deviceId: d.id, source: "device",
  }).returning();
  const l = newLecture(row!);
  lectures.set(l.id, l);
  void refillIds(l);
  log(`device ${d.id} started recording ${l.id} "${l.title}"`);
  Object.assign(d, { classId: null, classCode: null, className: null });
  bindDevice(l, d);
  return toSummary(l);
}

/** Registers a connected device and starts recording for it. */
export async function attachDevice(d: DeviceLink): Promise<void> {
  devices.set(d.id, d);
  clearTimeout(goneTimers.get(d.id));
  goneTimers.delete(d.id);
  await startDeviceSession(d);
  d.refresh();
}

/** Called when a device socket closes. Its lecture stays live for DEVICE_GONE_MS in case the device comes back
 *  (the STT stream is closed meanwhile); after that it is ended and saved like any other. */
export function detachDevice(d: DeviceLink) {
  if (devices.get(d.id) !== d) return;
  devices.delete(d.id);
  const l = d.lectureId ? lectures.get(d.lectureId) : undefined;
  if (!l) return;
  void closeStt(l).then(() => broadcastStatus(l));
  broadcastStatus(l);
  if (l.status !== "live" || l.source !== "device") return;
  const t = setTimeout(() => {
    goneTimers.delete(d.id);
    if (l.status === "live" && !deviceOf(l)) void stopSession(l.id).catch(logErr("end recording of a device that left"));
  }, DEVICE_GONE_MS);
  t.unref();
  goneTimers.set(d.id, t);
}

/** Thrown when a device change would cut a recording short (routes answer 409). */
export class DeviceBusyError extends Error {}

export interface ActiveClass { id: string; name: string; code: string }
/** A connected device, as the app lists it. `activeClass`: the course its recording is in (null = the inbox). */
export interface DeviceView {
  id: string;
  name: string | null;
  activeClass: ActiveClass | null;
  state: DeviceState;
  lectureId: string | null;
}

function deviceView(d: DeviceLink): DeviceView {
  return {
    id: d.id, name: d.name, state: d.state, lectureId: d.lectureId,
    activeClass: d.classId && d.classCode ? { id: d.classId, name: d.className ?? d.classCode, code: d.classCode } : null,
  };
}

/** Every device that is online now, by name. Devices that are switched off are not listed. */
export function listDevices(): DeviceView[] {
  return [...devices.values()].map(deviceView)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.id.localeCompare(b.id));
}

/** Puts a recording from the inbox into a course (the caller checked that the class exists): a live one carries
 *  on there, a finished one gets its study bundle. Null if there is no such lecture. Throws DeviceBusyError when
 *  it is already in a course, or the course has another live lecture. */
export async function assignLecture(lectureId: string, classId: string, title?: string): Promise<LectureSummary | null> {
  const l = await loadLecture(lectureId);
  if (!l || !l.persistent) return null;
  if (l.classId === classId) return toSummary(l);
  if (l.classId !== await inboxClassId()) throw new DeviceBusyError("the recording is already in a course");
  if (l.stopping) await l.stopping;
  if (l.status === "live") {
    const other = await findLiveLecture(classId);
    if (other && other.id !== l.id) throw new DeviceBusyError("that course has a live lecture; stop it first");
  }
  const name = title?.trim() || await defaultTitle(classId);
  await db.update(schema.lectures).set({ classId, title: name }).where(eq(schema.lectures.id, l.id));
  l.classId = classId;
  l.title = name;
  const d = deviceOf(l);
  if (d) { await pointDeviceAt(d, classId); d.refresh(); }
  if (l.status === "ended" && l.finals.length) {
    await db.update(schema.lectures).set({ status: "processing" }).where(eq(schema.lectures.id, l.id));
    l.status = await enqueueBundle(l.id) ? "processing" : "ended";
    if (l.status === "ended") await db.update(schema.lectures).set({ status: "ended" }).where(eq(schema.lectures.id, l.id)).catch(logErr("lecture status"));
  }
  log(`recording ${l.id} put into class ${classId} as "${name}"`);
  broadcastStatus(l);
  maybeEvict(l);
  return toSummary(l);
}

/** Puts what a connected device is recording into a course. Null if the device is not online.
 *  Throws DeviceBusyError while it records into another course. */
export async function setActiveClass(deviceId: string, classId: string): Promise<DeviceView | null> {
  const d = devices.get(deviceId);
  if (!d) return null;
  if (d.classId && d.classId !== classId && d.lectureId) throw new DeviceBusyError("the device is recording another course; stop that lecture first");
  if (!d.lectureId) await startDeviceSession(d);
  if (d.lectureId) await assignLecture(d.lectureId, classId);
  return deviceView(d);
}

/** For a web start of `classId`: the device that records it. One already recording into the class is used as it
 *  is; otherwise a device recording into the inbox has its recording put into the class. Null if there is none,
 *  or the class is live already (the browser microphone records instead).
 *  Throws DeviceBusyError if every online device is recording another class. */
export async function deviceForWebStart(classId: string): Promise<string | null> {
  const all = [...devices.values()];
  const here = all.find(d => d.classId === classId && d.lectureId);
  if (here) return here.id;
  if (await findLiveLecture(classId)) return null;
  const free = all.find(d => d.lectureId && !d.classId);   // not one that was stopped and is about to sleep
  if (!free) {
    if (all.some(d => d.lectureId)) throw new DeviceBusyError(`the device is recording ${all.find(d => d.lectureId)?.classCode ?? "another course"}; stop that lecture first`);
    return null;
  }
  return (await setActiveClass(free.id, classId)) ? free.id : null;
}

// ---------- session lifecycle ----------

/** The live lecture of a class: in memory, else a recent `live` row in the database (resumed after a restart). */
/** The class's live lecture if this process has it in memory (no database); viewers and languages are only known here. */
export function liveLectureInMemory(classId: string): LiveLecture | undefined {
  for (const l of lectures.values()) if (l.classId === classId && l.status === "live") return l;
  return undefined;
}

export async function findLiveLecture(classId: string): Promise<LiveLecture | null> {
  const mem = liveLectureInMemory(classId);
  if (mem) return mem;
  const [row] = await db.select({ id: schema.lectures.id }).from(schema.lectures)
    .where(and(eq(schema.lectures.classId, classId), eq(schema.lectures.status, "live"), gt(schema.lectures.startedAt, new Date(Date.now() - RESUME_WINDOW_MS))))
    .orderBy(desc(schema.lectures.startedAt)).limit(1);
  return row ? loadLecture(row.id) : null;
}

async function defaultTitle(classId: string): Promise<string> {
  const [r] = await db.select({ n: count() }).from(schema.lectures).where(eq(schema.lectures.classId, classId));
  return `Lecture ${(r?.n ?? 0) + 1}`;
}

export interface StartOpts {
  title?: string;
  source: "device" | "browser";
  /** The device that records (the device that was pressed, or the one deviceForWebStart picked). It is
   *  bound only if it is connected and its active class is `classId`. Omitted: the first connected device pointed at the class. */
  deviceId?: string | null;
}

/** Creates today's live lecture for a class (or returns the one already live) and switches its device to recording. */
export function startSession(classId: string, opts: StartOpts): Promise<LectureSummary> {
  let p = starting.get(classId);
  if (!p) {
    p = doStart(classId, opts).finally(() => starting.delete(classId));
    starting.set(classId, p);
  }
  return p;
}

async function doStart(classId: string, opts: StartOpts): Promise<LectureSummary> {
  const picked = opts.deviceId !== undefined ? (opts.deviceId ? devices.get(opts.deviceId) : undefined) : connectedDeviceForClass(classId);
  const device = picked && picked.classId === classId && !picked.lectureId ? picked : undefined;
  const existing = await findLiveLecture(classId);
  if (existing) {
    if (device && canBind(existing, device)) bindDevice(existing, device);
    return toSummary(existing);
  }
  const title = opts.title?.trim() || await defaultTitle(classId);
  const [row] = await db.insert(schema.lectures).values({
    classId, title, date: today(), status: "live", deviceId: device?.id ?? null, source: device ? "device" : opts.source,
  }).returning();
  const l = newLecture(row!);
  lectures.set(l.id, l);
  void refillIds(l);
  log(`started lecture ${l.id} "${title}" (${l.source})`);
  if (device) bindDevice(l, device);
  else broadcastStatus(l);
  return toSummary(l);
}

/** Ends a live lecture: flushes STT, persists, marks it processing and enqueues the study bundle. */
export async function stopSession(lectureId: string): Promise<LectureSummary | null> {
  const l = await loadLecture(lectureId);
  if (!l) return null;
  if (l.stopping) return l.stopping;
  if (l.status !== "live") {
    if (l.persistent) {   // the study bundle moves processing -> ready/ended in the DB
      const [row] = await db.select({ status: schema.lectures.status }).from(schema.lectures).where(eq(schema.lectures.id, l.id)).limit(1);
      if (row) l.status = row.status;
    }
    return toSummary(l);
  }
  l.stopping = (async () => {
    l.status = "ended";
    l.endedAt = Date.now();
    if (l.replay?.timer) { clearInterval(l.replay.timer); l.replay.timer = null; }
    const d = deviceOf(l);
    if (d) {
      Object.assign(d, { lectureId: null, state: "idle", lastCaption: "", classId: null, classCode: null, className: null, savedSeconds: Math.round((l.endedAt - l.startedAt) / 1000) });
      d.refresh();
    }
    l.browserAudio?.close("lecture ended");
    l.browserAudio = null;
    await closeStt(l);
    await l.persist;
    if (!l.persistent) { broadcastStatus(l); return toSummary(l); }
    const hasText = l.finals.length > 0;
    const inInbox = l.classId === await inboxClassId().catch(() => "");
    // A device that was switched on and off with nothing said leaves nothing behind.
    if (inInbox && !hasText) {
      await db.delete(schema.lectures).where(eq(schema.lectures.id, l.id)).catch(logErr("delete empty recording"));
      log(`dropped empty recording ${l.id}`);
      broadcastStatus(l);
      return toSummary(l);
    }
    // Last diarization chunk runs in the background; it refreshes the outline's questionsAsked when done.
    void flushLecture(l.id, () => settled(l)).catch(logErr("diarize flush"));
    // Nothing was said, or the recording is not in a course yet: no study bundle, the lecture just ends.
    // A recording in the inbox gets its bundle when it is put into a course (assignLecture).
    const bundle = hasText && !inInbox;
    await db.update(schema.lectures).set({ status: bundle ? "processing" : "ended", endedAt: new Date(l.endedAt) }).where(eq(schema.lectures.id, l.id));
    const enqueued = bundle && await enqueueBundle(l.id);
    l.status = enqueued ? "processing" : "ended";
    if (bundle && !enqueued) await db.update(schema.lectures).set({ status: "ended" }).where(eq(schema.lectures.id, l.id)).catch(logErr("lecture status"));
    const { interim, final } = l.latency;
    log(`stopped lecture ${l.id}: ${l.finals.length} finals, interim latency median ${median(interim) ?? "-"} ms (n=${interim.length}), final ${median(final) ?? "-"} ms`);
    broadcastStatus(l);
    return toSummary(l);
  })().finally(() => { l.stopping = null; maybeEvict(l); });
  return l.stopping;
}

/** Queues the study bundle (pipeline/bundle.ts); false if that failed, so the lecture is left "ended" and can be re-run. */
export async function enqueueBundle(lectureId: string): Promise<boolean> {
  try {
    await enqueueStudyBundle(lectureId);
    return true;
  } catch (e) {
    logErr("enqueueStudyBundle")(e);
    return false;
  }
}

// Periodic status (carries the latency figure) for lectures being watched.
setInterval(() => {
  for (const l of lectures.values()) if (l.status === "live" && l.viewers.size) broadcastStatus(l);
}, 10_000).unref();

// ---------- replay (demo operations: a saved lecture through the live caption path) ----------

export interface ReplaySegment { start: number; end: number; text: string; words: CaptionWord[]; tr: Map<string, string> }
export interface ReplayOpts {
  /** Lecture-relative window in seconds (default: the whole transcript). */
  from?: number;
  to?: number;
  /** Playback rate, 0.25–10 (default 1). */
  speed?: number;
  title?: string;
}

/** Replay refused for a reason the caller can fix (no transcript, bad window). */
export class ReplayError extends Error {}

/** Word-level prefix of a segment at time `now`, from its word timestamps or, without them, spread evenly over the segment. */
function wordsUntil(s: ReplaySegment, now: number): CaptionWord[] {
  if (s.words.length) return s.words.filter(w => w.end <= now);
  const toks = s.text.split(/\s+/).filter(Boolean);
  const dur = Math.max(0.01, s.end - s.start);
  const n = Math.min(toks.length, Math.floor(((now - s.start) / dur) * toks.length));
  return toks.slice(0, n).map((t, k) => ({ word: t, punctuated: t, start: s.start + (k / toks.length) * dur, end: s.start + ((k + 1) / toks.length) * dur }));
}

/** Plays `segs` through a new ephemeral live lecture of `classId`: interims grow word by word between a segment's
 *  start and end, the final fires at its end with any stored translations, and the lecture stops itself at the end.
 *  No STT, no device, nothing persisted; viewers join it exactly like a live lecture (status events say `replay`). */
export function startReplayFrom(classId: string, sourceId: string, segs: ReplaySegment[], opts: ReplayOpts = {}): LiveLecture {
  const speed = Math.min(10, Math.max(0.25, opts.speed ?? 1));
  const from = Math.max(0, opts.from ?? 0);
  const to = opts.to ?? Infinity;
  if (to <= from) throw new ReplayError("the replay window is empty");
  const list = segs.filter(s => s.end > from && s.start < to).sort((a, b) => a.start - b.start);
  if (!list.length) throw new ReplayError("no transcript in that window");
  const l = createEphemeralLecture({ classId, title: opts.title ?? "Replay" });
  const base = Math.max(from, list[0]!.start);
  const t0 = Date.now();
  let i = 0;
  let lastInterim = "";
  const tick = () => {
    if (l.status !== "live") return;
    const now = base + ((Date.now() - t0) / 1000) * speed;
    while (i < list.length) {
      const s = list[i]!;
      if (now >= s.end || now >= to) {
        onFinal(l, { text: s.text, words: s.words, start: s.start, end: s.end }, s.tr);
        i++;
        lastInterim = "";
        continue;
      }
      if (now >= s.start) {
        const words = wordsUntil(s, now);
        const key = `${i}:${words.length}`;
        if (words.length && key !== lastInterim) {
          lastInterim = key;
          onInterim(l, { text: words.map(w => w.punctuated ?? w.word).join(" "), words, start: s.start, end: words.at(-1)!.end });
        }
      }
      break;
    }
    if (i >= list.length || now >= to) void stopSession(l.id);
  };
  l.replay = { sourceId, speed, timer: setInterval(tick, Math.max(50, Math.round(250 / speed))) };
  log(`replay ${l.id} of ${sourceId}: ${list.length} segments from +${base.toFixed(0)}s at ${speed}x`);
  broadcastStatus(l);
  return l;
}

/** Replays a saved lecture into its class. Null if the lecture is unknown; DeviceBusyError if the class has a live
 *  lecture (or a replay) already; ReplayError if there is nothing to replay. */
export async function startReplay(sourceId: string, opts: ReplayOpts = {}): Promise<LectureSummary | null> {
  const [row] = await db.select().from(schema.lectures).where(eq(schema.lectures.id, sourceId)).limit(1);
  if (!row) return null;
  const live = await findLiveLecture(row.classId);
  if (live) throw new DeviceBusyError(live.replay ? "a replay is already running in this class; stop it first" : `"${live.title}" is live in this class; stop it first`);
  const segRows = await db.select().from(schema.segments).where(eq(schema.segments.lectureId, sourceId)).orderBy(asc(schema.segments.idx));
  if (!segRows.length) throw new ReplayError("the lecture has no transcript to replay");
  const trRows = await db.select().from(schema.translations).where(inArray(schema.translations.segmentId, segRows.map(s => s.id)));
  const tr = new Map<number, Map<string, string>>();
  for (const t of trRows) (tr.get(t.segmentId) ?? tr.set(t.segmentId, new Map()).get(t.segmentId)!).set(t.lang, t.text);
  const segs: ReplaySegment[] = segRows.map(s => ({ start: s.startS, end: s.endS, text: s.text, words: (s.words as CaptionWord[] | null) ?? [], tr: tr.get(s.id) ?? new Map() }));
  return toSummary(startReplayFrom(row.classId, sourceId, segs, { ...opts, title: opts.title ?? `Replay · ${row.title}` }));
}

// ---------- transcript import ----------

export interface ParsedSegment { start: number; end: number; text: string }

const VTT_TIME = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function vttSeconds(t: string): number {
  const [hms, frac = "0"] = t.split(/[.,]/);
  const parts = hms!.split(":").map(Number);
  while (parts.length < 3) parts.unshift(0);
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]! + Number(`0.${frac}`);
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

export function looksLikeVtt(input: string): boolean {
  return /^﻿?WEBVTT/.test(input) || input.split(/\r?\n/).some(l => VTT_TIME.test(l));
}

/** WebVTT (or SRT) cues -> segments using the cue times. Consecutive duplicate cues are dropped. */
export function parseVtt(input: string): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = VTT_TIME.exec(lines[i]!);
    if (!m) continue;
    const text: string[] = [];
    while (i + 1 < lines.length && lines[i + 1]!.trim() !== "" && !VTT_TIME.test(lines[i + 1]!)) text.push(lines[++i]!.trim());
    const t = decodeEntities(text.join(" ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!t || out.at(-1)?.text === t) continue;
    out.push({ start: vttSeconds(m[1]!), end: vttSeconds(m[2]!), text: t });
  }
  return out;
}

/** Plain text -> roughly sentence-sized segments (6..40 words) with synthetic times at `wps` words per second. */
export function splitPlainText(input: string, wps = 2.5): ParsedSegment[] {
  const sentences = input.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[][] = [];
  let cur: string[] = [];
  for (const s of sentences) {
    cur.push(...s.split(" "));
    if (cur.length >= 6) { chunks.push(cur); cur = []; }
  }
  if (cur.length) { if (chunks.length && cur.length < 6) chunks.at(-1)!.push(...cur); else chunks.push(cur); }
  const out: ParsedSegment[] = [];
  let t = 0;
  for (const words of chunks) {
    const parts = Math.ceil(words.length / 40);
    const size = Math.ceil(words.length / parts);
    for (let k = 0; k < words.length; k += size) {
      const w = words.slice(k, k + size);
      const dur = w.length / wps;
      out.push({ start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100, text: w.join(" ") });
      t += dur;
    }
  }
  return out;
}

export function parseTranscript(input: string): ParsedSegment[] {
  return looksLikeVtt(input) ? parseVtt(input) : splitPlainText(input);
}

/** Creates an imported lecture with its segments and enqueues the study bundle. */
export async function importLecture(args: { classId: string; title: string; date: string; transcript: string }): Promise<LectureSummary> {
  const segs = parseTranscript(args.transcript);
  if (!segs.length) throw new Error("transcript has no text");
  const durationS = segs.at(-1)!.end;
  const startedAt = new Date(`${args.date}T09:00:00`);
  const [row] = await db.insert(schema.lectures).values({
    classId: args.classId, title: args.title, date: args.date, status: "processing", source: "import",
    startedAt, endedAt: new Date(startedAt.getTime() + durationS * 1000),
  }).returning();
  const lecture = row!;
  for (let i = 0; i < segs.length; i += 200) {
    await db.insert(schema.segments).values(segs.slice(i, i + 200).map((s, k) => ({
      lectureId: lecture.id, idx: i + k, startS: s.start, endS: s.end, text: s.text,
    })));
  }
  const enqueued = await enqueueBundle(lecture.id);
  const status: LectureStatus = enqueued ? "processing" : "ended";
  if (!enqueued) await db.update(schema.lectures).set({ status }).where(eq(schema.lectures.id, lecture.id));
  log(`imported ${segs.length} segments into ${lecture.id}`);
  return { id: lecture.id, classId: lecture.classId, title: lecture.title, date: lecture.date, status, durationS: Math.round(durationS) };
}
