/**
 * Post-lecture diarization pass (docs/api.md "Diarization pass"). While a lecture is live,
 * sessions.ts feeds every PCM frame (16 kHz s16le mono) here with its lecture-relative
 * time. Each lecture keeps a ring of at most 6 minutes of audio in memory (never on disk).
 * Every 5 minutes of audio, and when the lecture stops, the buffered chunk is wrapped in a
 * 44-byte WAV header and sent to Fish ASR with `diarize=auto`; the speaker turns are mapped
 * onto the stored `segments` by time overlap (`mapSpeakers`), `segments.speaker` is set
 * (0 = the speaker with the most talk time in that chunk = lecturer; 1, 2... = others by
 * talk time) and the chunk is dropped. The outline's questionsAsked is then refreshed.
 * A discontinuity in the audio clock (device reconnect) flushes the ring first, so a chunk
 * is always contiguous. While a pass is in flight the ring keeps filling up to its cap,
 * after which the oldest audio is dropped (those segments keep speaker null).
 * Disabled unless settings.fish.diarize and a live Fish key (tests: `setDiarizeEnabled`).
 */
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { AUDIO_SAMPLE_RATE } from "@slap/contracts";
import { settings } from "../settings.ts";
import { asr, fishMode, pcmToWav, type AsrSpeakerTurn } from "./fishAudio.ts";
import { refreshQuestionsAsked } from "./outline.ts";
import { getDb } from "./db.ts";

export const BYTES_PER_S = AUDIO_SAMPLE_RATE * 2;
export const BUFFER_CAP_S = 6 * 60;
export const PASS_EVERY_S = 5 * 60;
const MIN_PASS_S = 5;               // shorter tails are not worth a request
const GAP_TOLERANCE_S = 1;
const FINAL_GRACE_MS = 3000;        // let STT finals for the chunk's last seconds land first

const log = (...a: unknown[]) => console.log("[diarize]", ...a);

// ---------- ring buffer (pure) ----------

/** Contiguous PCM with its lecture-relative start time, capped by dropping whole frames from the head. */
export class PcmRing {
  private frames: Buffer[] = [];
  bytes = 0;
  startS = 0;
  readonly capBytes: number;
  constructor(capBytes = BUFFER_CAP_S * BYTES_PER_S) { this.capBytes = capBytes; }
  get durationS() { return this.bytes / BYTES_PER_S; }
  get endS() { return this.startS + this.durationS; }
  /** True when `atS` continues the buffered audio (or the ring is empty). */
  continues(atS: number): boolean { return this.bytes === 0 || Math.abs(atS - this.endS) <= GAP_TOLERANCE_S; }
  push(pcm: Buffer, atS: number) {
    if (this.bytes === 0) this.startS = atS;
    this.frames.push(Buffer.from(pcm));      // copy: the caller's buffer may be reused
    this.bytes += pcm.length;
    while (this.bytes > this.capBytes && this.frames.length > 1) {
      const f = this.frames.shift()!;
      this.bytes -= f.length;
      this.startS += f.length / BYTES_PER_S;
    }
  }
  /** Removes and returns the buffered chunk. */
  take(): { pcm: Buffer; startS: number } | null {
    if (!this.bytes) return null;
    const out = { pcm: Buffer.concat(this.frames, this.bytes), startS: this.startS };
    this.frames = []; this.bytes = 0;
    return out;
  }
}

// ---------- speaker mapping (pure) ----------

export interface SegTime { id: number; start: number; end: number }

/** Raw speaker label -> 0 for the one with the most talk time, then 1, 2... by talk time. */
export function rankSpeakers(turns: AsrSpeakerTurn[]): Map<number, number> {
  const total = new Map<number, number>();
  for (const t of turns) total.set(t.speaker, (total.get(t.speaker) ?? 0) + Math.max(0, t.end - t.start));
  const order = [...total.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(e => e[0]);
  return new Map(order.map((sp, i) => [sp, i]));
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * Segment id -> speaker for the segments this chunk covers (at least half their duration
 * inside the chunk). Turn times are chunk-relative; segment times lecture-relative. A
 * segment takes the speaker with the most overlap; segments in a gap between turns are left out.
 */
export function mapSpeakers(turns: AsrSpeakerTurn[], segs: SegTime[], chunkStartS: number, chunkDurS: number): Map<number, number> {
  const rank = rankSpeakers(turns);
  const abs = turns.map(t => ({ sp: rank.get(t.speaker)!, start: t.start + chunkStartS, end: t.end + chunkStartS }));
  const c0 = chunkStartS, c1 = chunkStartS + chunkDurS;
  const out = new Map<number, number>();
  for (const s of segs) {
    const dur = s.end - s.start;
    if (dur <= 0) {
      if (s.start < c0 || s.start >= c1) continue;
      const hit = abs.find(t => s.start >= t.start && s.start < t.end);
      if (hit) out.set(s.id, hit.sp);
      continue;
    }
    if (overlap(s.start, s.end, c0, c1) < dur / 2) continue;
    const by = new Map<number, number>();
    for (const t of abs) {
      const o = overlap(s.start, s.end, t.start, t.end);
      if (o > 0) by.set(t.sp, (by.get(t.sp) ?? 0) + o);
    }
    let best: number | null = null, bestO = 0;
    for (const [sp, o] of by) if (o > bestO || (o === bestO && best !== null && sp < best)) { best = sp; bestO = o; }
    if (best !== null) out.set(s.id, best);
  }
  return out;
}

// ---------- pass ----------

export interface PassStats { chunkStartS: number; durationS: number; turns: number; speakers: number; labelled: number; students: number; asrMs: number }

/** Runs Fish ASR (diarize=auto) on one contiguous chunk and writes segments.speaker for the segments it covers. */
export async function diarizeChunk(lectureId: string, pcm: Buffer, chunkStartS: number): Promise<PassStats> {
  const durationS = pcm.length / BYTES_PER_S;
  const t0 = performance.now();
  const r = await asr(pcmToWav(pcm), { mime: "audio/wav", diarize: true, language: "en", filename: "chunk.wav" });
  const asrMs = Math.round(performance.now() - t0);
  const { db, schema } = await getDb();
  const s = schema.segments;
  const segs = await db.select({ id: s.id, start: s.startS, end: s.endS }).from(s)
    .where(and(eq(s.lectureId, lectureId), gt(s.endS, chunkStartS), lt(s.startS, chunkStartS + durationS)));
  const map = mapSpeakers(r.speakerTurns, segs, chunkStartS, durationS);
  const bySpeaker = new Map<number, number[]>();
  for (const [id, sp] of map) (bySpeaker.get(sp) ?? bySpeaker.set(sp, []).get(sp)!).push(id);
  for (const [sp, ids] of bySpeaker) {
    for (let i = 0; i < ids.length; i += 500) await db.update(s).set({ speaker: sp }).where(inArray(s.id, ids.slice(i, i + 500)));
  }
  const stats: PassStats = {
    chunkStartS, durationS, turns: r.speakerTurns.length, speakers: new Set(r.speakerTurns.map(t => t.speaker)).size,
    labelled: map.size, students: [...map.values()].filter(v => v >= 1).length, asrMs,
  };
  if (map.size) await refreshQuestionsAsked(lectureId);
  log(`${lectureId.slice(0, 8)} +${chunkStartS.toFixed(0)}s ${durationS.toFixed(0)}s: ${stats.turns} turns, ${stats.speakers} speakers, ${stats.labelled} segments labelled (${stats.students} student) in ${asrMs} ms`);
  return stats;
}

// ---------- per-lecture state ----------

interface LectureState { ring: PcmRing; pending: number; chain: Promise<void>; ready?: () => Promise<void>; stats: PassStats[] }
const states = new Map<string, LectureState>();
let enabledOverride: boolean | null = null;
let graceMs = FINAL_GRACE_MS;

/** Tests: force diarization on/off (null = settings), and the wait before a periodic pass. */
export function setDiarizeEnabled(on: boolean | null, opts: { graceMs?: number } = {}) { enabledOverride = on; if (opts.graceMs !== undefined) graceMs = opts.graceMs; }
export function diarizeEnabled(): boolean { return enabledOverride ?? (settings.fish.diarize && fishMode() === "live"); }

/** Seconds of audio currently buffered for a lecture (0 if none). */
export function bufferedSeconds(lectureId: string): number { return states.get(lectureId)?.ring.durationS ?? 0; }

function stateOf(lectureId: string): LectureState {
  let st = states.get(lectureId);
  if (!st) states.set(lectureId, st = { ring: new PcmRing(), pending: 0, chain: Promise.resolve(), stats: [] });
  return st;
}

function enqueuePass(lectureId: string, st: LectureState, chunk: { pcm: Buffer; startS: number } | null, waitMs: number) {
  if (!chunk || chunk.pcm.length < MIN_PASS_S * BYTES_PER_S) return;
  st.pending++;
  st.chain = st.chain.then(async () => {
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    await st.ready?.();
    st.stats.push(await diarizeChunk(lectureId, chunk.pcm, chunk.startS));
  }).catch(e => console.error("[diarize] pass failed:", (e as Error).message))
    .finally(() => {
      st.pending--;
      if (!st.pending && st.ring.durationS >= PASS_EVERY_S) enqueuePass(lectureId, st, st.ring.take(), graceMs);
    });
}

/**
 * One frame of live audio at lecture-relative time `atS`. `ready` resolves once the
 * lecture's finals so far are persisted (awaited before each pass).
 */
export function feedPcm(lectureId: string, pcm: Buffer, atS: number, ready?: () => Promise<void>): void {
  if (!diarizeEnabled() || !pcm.length) return;
  const st = stateOf(lectureId);
  if (ready) st.ready = ready;
  if (!st.ring.continues(atS)) enqueuePass(lectureId, st, st.ring.take(), graceMs);
  st.ring.push(pcm, atS);
  if (st.ring.durationS >= PASS_EVERY_S && st.pending === 0) enqueuePass(lectureId, st, st.ring.take(), graceMs);
}

/** At stop: diarizes what is left, waits for every pass, frees the lecture's state. Returns the passes' stats. */
export async function flushLecture(lectureId: string, ready?: () => Promise<void>): Promise<PassStats[]> {
  const st = states.get(lectureId);
  if (!st) return [];
  if (ready) st.ready = ready;
  enqueuePass(lectureId, st, st.ring.take(), 0);
  await st.chain;
  if (states.get(lectureId) === st && st.ring.bytes === 0 && st.pending === 0) states.delete(lectureId);
  return st.stats;
}

/** Drops a lecture's buffered audio without a pass. */
export function discardLecture(lectureId: string): void { states.delete(lectureId); }
