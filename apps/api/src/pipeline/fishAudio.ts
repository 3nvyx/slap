/**
 * Fish Audio client (HTTP, no SDK): TTS for the learning partner and batch ASR for the
 * partner's spoken turns and the post-lecture diarization pass. Calls match the measured
 * spike in spikes/fish_audio: TTS POST /v1/tts JSON with `Authorization: Bearer` and a
 * `model` header (s2.1-pro, latency "low", mp3 64 kbps); ASR POST /v1/asr multipart with
 * the `model` header (transcribe-1-pro), `ignore_timestamps=false` and optional
 * `diarize=auto`. The ASR text carries `<|speaker:N|>` markers and `[audio event]` tags;
 * `parseAsr` strips them into structured fields.
 * Mock mode (no FISH_API_KEY, or `setFishMock`): TTS returns a 1-second silent mp3 and
 * ASR a canned transcript, so tests and keyless demos never touch the network.
 */
import type { PartnerVoice } from "@slap/contracts";
import { settings } from "../settings.ts";

const TTS_URL = "https://api.fish.audio/v1/tts";
const ASR_URL = "https://api.fish.audio/v1/asr";
const TTS_TIMEOUT_MS = 30_000;
const ASR_TIMEOUT_MS = 90_000;
/** A failed Fish call (HTTP status, or 0 for a network error / timeout). */
export class FishError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.name = "FishError"; this.status = status; }
}

async function fishFetch(what: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(url, init); }
  catch (e) { throw new FishError(`fish ${what}: ${(e as Error).message}`, 0); }
  if (!res.ok) throw new FishError(`fish ${what} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`, res.status);
  return res;
}

// ---------- mode ----------

interface MockOpts { transcript?: string; speakerTurns?: AsrSpeakerTurn[] }
let mockOverride: MockOpts | null | false = null;   // null = follow settings, false = force live

/** Tests: `setFishMock(true)` or `setFishMock({ transcript })` forces mock; `null` follows settings. */
export function setFishMock(m: boolean | MockOpts | null): void {
  mockOverride = m === true ? {} : m === false ? false : m;
}
export function fishMode(): "live" | "mock" {
  if (mockOverride === false) return "live";
  if (mockOverride) return "mock";
  return settings.fish.key ? "live" : "mock";
}

// ---------- voices ----------

/** The partner voices on offer, the default first: four of Fish Audio's own library voices, then community-made
 *  voices of famous people from the public Fish library (those can be withdrawn by their uploader). */
export const PARTNER_VOICES: readonly PartnerVoice[] = Object.freeze([
  { id: "536d3a5e000945adb7038665781a4aca", name: "Ethan", style: "calm explainer", default: true },
  { id: "e3cd384158934cc9a01029cd7d278634", name: "Laura", style: "warm and steady" },
  { id: "9a9cf47702da476aa4629e2506d4a857", name: "Hannah", style: "bright and friendly" },
  { id: "79d0bd3e4e5444b18f7b6d89b5927bf1", name: "Jordan", style: "upbeat coach" },
  { id: "03397b4c4be74759b72533b663fbd001", name: "Elon Musk", style: "calm and measured" },
  { id: "c39a76f685cf4f8fb41cd5d3d66b497d", name: "David Attenborough", style: "documentary narrator" },
  { id: "4ce7e917cedd4bc2bb2e6ff3a46acaa1", name: "Barack Obama", style: "steady and presidential" },
  { id: "cfc33da8775c47afacccf4eebabe44dc", name: "Taylor Swift", style: "soft and sincere" },
  { id: "cc1d2d26fddf487496c74a7f40c7c871", name: "MrBeast", style: "fast and hyped" },
]);
export function defaultVoiceId(): string { return PARTNER_VOICES[0]!.id; }
export function isKnownVoice(id: string): boolean { return PARTNER_VOICES.some(v => v.id === id); }

// ---------- TTS ----------

/** ~1 s of silence: 28 MPEG-1 Layer III frames, 32 kbps, 32 kHz, mono, all-zero side info. */
function silentMp3(): Buffer {
  const frame = Buffer.alloc(144);
  frame.set([0xff, 0xfb, 0x18, 0xc0]);
  return Buffer.concat(Array.from({ length: 28 }, () => frame));
}
export const SILENT_MP3 = silentMp3();

export interface TtsOptions { voiceId?: string | null; format?: "mp3" }

function ttsRequest(text: string, opts: TtsOptions): Promise<Response> {
  const key = settings.fish.key;
  if (!key) throw new Error("FISH_API_KEY is not set");
  return fishFetch("tts", TTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: settings.fish.ttsModel },
    body: JSON.stringify({ text, format: opts.format ?? "mp3", mp3_bitrate: 64, latency: "low", ...(opts.voiceId ? { reference_id: opts.voiceId } : {}) }),
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
  });
}

/** Text -> mp3 (low-latency HTTP), whole clip. Mock mode: 1 s of silence. */
export async function tts(text: string, opts: TtsOptions = {}): Promise<Buffer> {
  if (fishMode() === "mock") return SILENT_MP3;
  return Buffer.from(await (await ttsRequest(text, opts)).arrayBuffer());
}

/** Text -> mp3 bytes as Fish sends them (first bytes after ~0.6 s). Mock mode: one silent chunk. */
export async function* ttsStream(text: string, opts: TtsOptions = {}): AsyncGenerator<Uint8Array> {
  if (fishMode() === "mock") { yield SILENT_MP3; return; }
  const res = await ttsRequest(text, opts);
  if (!res.body) throw new FishError("fish tts: empty body", res.status);
  const reader = res.body.getReader();
  try {
    for (;;) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try { r = await reader.read(); } catch (e) { throw new FishError(`fish tts stream: ${(e as Error).message}`, 0); }
      if (r.done) return;
      if (r.value.length) yield r.value;
    }
  } finally { reader.releaseLock(); }
}

// ---------- ASR ----------

export interface AsrWord { word: string; start: number; end: number }
export interface AsrSegment { text: string; start: number; end: number; speaker?: number; words?: AsrWord[] }
export interface AsrSpeakerTurn { speaker: number; text: string; start: number; end: number }
export interface AsrResult {
  text: string;                 // markers and [tags] removed
  segments: AsrSegment[];
  speakerTurns: AsrSpeakerTurn[];
  duration: number;             // seconds
  events: string[];             // [audio event] tags, e.g. "crowd talking noise"
}
export interface AsrOptions { mime?: string; diarize?: boolean; language?: string | null; filename?: string }

const MARKER_RE = /<\|[^|>]*\|>/g;
const TAG_RE = /\[([^\]]{1,80})\]/g;

/** Removes `<|speaker:N|>` markers and `[tags]`, collapsing whitespace. */
export function cleanAsrText(s: string): string {
  return s.replace(MARKER_RE, " ").replace(TAG_RE, " ").replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
}

type RawSpeaker = string | number | null | undefined;
interface RawAsr {
  text?: string; duration?: number;
  segments?: Array<{ text?: string; start?: number; end?: number; speaker?: RawSpeaker; words?: Array<{ text?: string; word?: string; start?: number; end?: number }> }>;
  speaker_turns?: Array<{ speaker?: RawSpeaker; text?: string; start?: number; end?: number }>;
}

/** Normalises a raw /v1/asr JSON body. Speaker labels ("SPEAKER_1", "1", 1) become integers; ms timestamps become seconds. */
export function parseAsr(raw: RawAsr): AsrResult {
  const labels = new Map<string, number>();
  const spk = (s: RawSpeaker): number | undefined => {
    if (s === null || s === undefined || s === "") return undefined;
    if (typeof s === "number") return s;
    const m = /(\d+)\s*$/.exec(s);
    if (m) return Number(m[1]);
    if (!labels.has(s)) labels.set(s, labels.size);
    return labels.get(s);
  };
  const rawText = raw.text ?? "";
  const events = [...rawText.matchAll(TAG_RE)].map(m => m[1]!.trim()).filter(Boolean);
  const segments: AsrSegment[] = (raw.segments ?? []).map(s => {
    const sp = spk(s.speaker);
    const words = s.words?.map(w => ({ word: cleanAsrText(w.word ?? w.text ?? ""), start: Number(w.start ?? 0), end: Number(w.end ?? 0) })).filter(w => w.word);
    return { text: cleanAsrText(s.text ?? ""), start: Number(s.start ?? 0), end: Number(s.end ?? 0), ...(sp !== undefined ? { speaker: sp } : {}), ...(words?.length ? { words } : {}) };
  });
  const speakerTurns: AsrSpeakerTurn[] = (raw.speaker_turns ?? []).flatMap(t => {
    const sp = spk(t.speaker);
    return sp === undefined ? [] : [{ speaker: sp, text: cleanAsrText(t.text ?? ""), start: Number(t.start ?? 0), end: Number(t.end ?? 0) }];
  });
  let duration = Number(raw.duration ?? 0);
  const maxEnd = Math.max(0, ...segments.map(s => s.end), ...speakerTurns.map(t => t.end));
  if (duration > 0 && maxEnd > duration * 1.5 + 1) {   // timestamps in milliseconds
    const k = 1 / 1000;
    for (const s of segments) { s.start *= k; s.end *= k; s.words?.forEach(w => { w.start *= k; w.end *= k; }); }
    for (const t of speakerTurns) { t.start *= k; t.end *= k; }
  }
  if (!duration) duration = Math.max(0, ...segments.map(s => s.end), ...speakerTurns.map(t => t.end));
  return { text: cleanAsrText(rawText), segments, speakerTurns, duration, events };
}

const MOCK_TRANSCRIPT = "I think it is the mean squared error.";

function mockAsr(audio: Buffer, opts: AsrOptions): AsrResult {
  const m = mockOverride || {};
  const text = m.transcript ?? MOCK_TRANSCRIPT;
  const isWav = audio.subarray(0, 4).toString("latin1") === "RIFF";
  const duration = isWav ? Math.max(0, audio.length - 44) / 32000 : 1;
  const speakerTurns = opts.diarize ? (m.speakerTurns ?? [{ speaker: 0, text, start: 0, end: duration }]) : [];
  return { text, segments: [{ text, start: 0, end: duration }], speakerTurns, duration, events: [] };
}

const EXT: Record<string, string> = { "audio/wav": "wav", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a" };

/** Audio -> transcript (+ speaker turns with `diarize`). Mock mode: canned transcript. */
export async function asr(audio: Buffer, opts: AsrOptions = {}): Promise<AsrResult> {
  if (fishMode() === "mock") return mockAsr(audio, opts);
  const key = settings.fish.key;
  if (!key) throw new Error("FISH_API_KEY is not set");
  const mime = (opts.mime ?? "audio/wav").split(";")[0]!.trim().toLowerCase();
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: mime }), opts.filename ?? `audio.${EXT[mime] ?? "bin"}`);
  if (opts.language) form.append("language", opts.language.split("-")[0]!);
  form.append("ignore_timestamps", "false");
  if (opts.diarize) form.append("diarize", "auto");
  const res = await fishFetch("asr", ASR_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, model: settings.fish.asrModel },
    body: form,
    signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
  });
  return parseAsr((await res.json()) as RawAsr);
}

// ---------- WAV helpers ----------

/** 44-byte PCM WAV header for s16le mono. */
export function wavHeader(pcmBytes: number, sampleRate = 16000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1"); h.writeUInt32LE(36 + pcmBytes, 4); h.write("WAVE", 8, "latin1");
  h.write("fmt ", 12, "latin1"); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1"); h.writeUInt32LE(pcmBytes, 40);
  return h;
}

export function pcmToWav(pcm: Buffer, sampleRate = 16000): Buffer {
  return Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]);
}

/** Format and PCM of a RIFF/WAVE file (walks the chunks, so LIST/INFO headers are fine). Null if not a PCM WAV. */
export function readWav(buf: Buffer): { sampleRate: number; channels: number; bits: number; pcm: Buffer; durationS: number } | null {
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") return null;
  let fmt: { sampleRate: number; channels: number; bits: number } | null = null;
  for (let p = 12; p + 8 <= buf.length;) {
    const id = buf.toString("latin1", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === "fmt " && body + 16 <= buf.length) fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === "data" && fmt) {
      const pcm = buf.subarray(body, Math.min(buf.length, body + size));
      return { ...fmt, pcm, durationS: pcm.length / (fmt.sampleRate * fmt.channels * (fmt.bits / 8) || 1) };
    }
    p = body + size + (size & 1);
  }
  return null;
}
