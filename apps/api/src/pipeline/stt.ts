// Speech-to-text behind one small interface: 16 kHz s16le mono PCM in, interim/final captions out.
// `deepgram` talks raw WebSocket to Deepgram live (no SDK, see spikes/smoke); `flux` (fast mode,
// sttFlux.ts) and `soniox` (accurate mode, sttSoniox.ts) are the two alternatives measured in
// spikes/README.md; `mock` replays the fixture transcript, paced by how loud the incoming audio
// is, so the system runs without a key.
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import type { CaptionWord } from "@slap/contracts";
import { AUDIO_SAMPLE_RATE } from "@slap/contracts";
import { settings } from "../settings.ts";
import { createFluxStt } from "./sttFlux.ts";
import { emitter } from "./sttLink.ts";
import { createSonioxStt } from "./sttSoniox.ts";

export type SttBackend = "deepgram" | "flux" | "soniox" | "mock";

export interface SttResult {
  text: string;
  words: CaptionWord[];
  start: number;            // seconds since the session's audio started
  end: number;
  latencyMs?: number;       // wall time from sending the audio at `end` to receiving this result
}
export type SttEvent = "interim" | "final";
export type SttListener = (r: SttResult) => void;

export interface SttSession {
  readonly backend: SttBackend;
  sendAudio(buf: Buffer): void;
  /** Flushes pending audio and resolves once the last finals have been emitted (or after a timeout). */
  close(): Promise<void>;
  on(event: SttEvent, cb: SttListener): void;
}

export interface SttOptions {
  backend?: SttBackend;
  /** Added to every timestamp, e.g. when a lecture resumes after a reconnect. */
  offsetS?: number;
  label?: string;
  /** Mock only: transcript to replay (defaults to fixtures/lecture_sample.txt). */
  mockText?: string;
  /** Mock only: seconds of loud audio per sentence. */
  mockSentenceS?: number;
}

const BYTES_PER_S = AUDIO_SAMPLE_RATE * 2;
const DG_QUERY = "model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true"
  + "&smart_format=true&punctuate=true&endpointing=300&utterance_end_ms=1000&diarize=false";
const DG_URL = `wss://api.deepgram.com/v1/listen?${DG_QUERY}`;
const MAX_PENDING_FRAMES = 100;   // 10 s of audio while (re)connecting; older frames are dropped
const CLOSE_TIMEOUT_MS = 4000;

/** RMS of s16le PCM, normalised to 0..1. */
export function pcmRms(buf: Buffer): number {
  const n = buf.length >> 1;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) { const s = buf.readInt16LE(i * 2) / 32768; sum += s * s; }
  return Math.sqrt(sum / n);
}

export function createStt(opts: SttOptions = {}): SttSession {
  const backend = opts.backend ?? settings.stt.backend;
  if (backend === "soniox") {
    if (settings.stt.sonioxKey) return createSonioxStt(settings.stt.sonioxKey, opts);
    console.warn("[stt] soniox selected but SONIOX_API_KEY is missing; falling back to deepgram");
  }
  if (backend !== "mock") {
    const key = settings.stt.deepgramKey;
    if (key) return backend === "flux" ? createFluxStt(key, opts) : createDeepgramStt(key, opts);
    console.warn(`[stt] ${backend} selected but DEEPGRAM_API_KEY is missing; using mock`);
  }
  return createMockStt(opts);
}

// ---------- Deepgram ----------

interface DgWord { word: string; punctuated_word?: string; start: number; end: number; confidence?: number }
interface DgMessage {
  type?: string; is_final?: boolean; start?: number; duration?: number;
  channel?: { alternatives?: Array<{ transcript?: string; words?: DgWord[] }> };
}

function createDeepgramStt(key: string, opts: SttOptions): SttSession {
  const ev = emitter();
  const base = opts.offsetS ?? 0;
  const tag = `[stt:deepgram${opts.label ? " " + opts.label : ""}]`;
  let ws: WebSocket | null = null;
  const pending: Buffer[] = [];
  let sentS = 0;                 // audio seconds actually sent, across connections
  let streamOffset = 0;          // sentS when the current connection opened (Deepgram restarts at 0)
  let retryAllowed = true;       // reconnect once per failure; re-armed when results flow again
  let closing = false;
  let lastAudioAt = Date.now();
  const sentAt = new Map<number, number>();   // decisecond of audio -> wall ms when sent
  let resolveClosed: (() => void) | null = null;
  const closed = new Promise<void>(r => { resolveClosed = r; });

  const keepAlive = setInterval(() => {
    // Deepgram drops a stream after ~10 s without audio; KeepAlive holds it open between frames.
    if (ws?.readyState === WebSocket.OPEN && Date.now() - lastAudioAt > 4000) ws.send(JSON.stringify({ type: "KeepAlive" }));
  }, 4000);

  function send(buf: Buffer) {
    ws!.send(buf);
    sentS += buf.length / BYTES_PER_S;
    const ds = Math.round(sentS * 10);
    sentAt.set(ds, Date.now());
    sentAt.delete(ds - 600);
  }

  function latencyFor(endS: number): number | undefined {
    for (let ds = Math.round(endS * 10), k = 0; k < 5; ds++, k++) {
      const t = sentAt.get(ds);
      if (t !== undefined) return Date.now() - t;
    }
    return undefined;
  }

  function connect() {
    const sock = new WebSocket(DG_URL, { headers: { Authorization: `Token ${key}` } });
    ws = sock;
    sock.on("open", () => {
      streamOffset = sentS;
      for (const b of pending.splice(0)) send(b);
      if (closing) sock.send(JSON.stringify({ type: "CloseStream" }));
    });
    sock.on("message", (raw) => {
      let d: DgMessage;
      try { d = JSON.parse(raw.toString()) as DgMessage; } catch { return; }
      if (d.type !== "Results") return;
      const alt = d.channel?.alternatives?.[0];
      const text = alt?.transcript?.trim();
      if (!text) return;
      retryAllowed = true;
      const off = base + streamOffset;
      const start = off + (d.start ?? 0);
      const end = start + (d.duration ?? 0);
      const words: CaptionWord[] = (alt?.words ?? []).map(w => ({
        word: w.word, punctuated: w.punctuated_word, start: off + w.start, end: off + w.end, confidence: w.confidence,
      }));
      ev.emit(d.is_final ? "final" : "interim", { text, words, start, end, latencyMs: latencyFor(end - base) });
    });
    sock.on("error", (e) => console.warn(tag, "error:", e.message));
    sock.on("close", (code) => {
      if (ws !== sock) return;
      ws = null;
      if (closing) { resolveClosed?.(); return; }
      if (retryAllowed) {
        retryAllowed = false;
        console.warn(tag, `closed (${code}); reconnecting once`);
        connect();
      } else {
        console.error(tag, `closed (${code}) again; audio is dropped until the session restarts`);
      }
    });
  }
  connect();

  return {
    backend: "deepgram",
    on: ev.on,
    sendAudio(buf) {
      if (closing) return;
      lastAudioAt = Date.now();
      if (ws?.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > MAX_PENDING_FRAMES * buf.length) return;   // Deepgram not draining: drop, never queue unboundedly
        return send(buf);
      }
      if (!ws) return;  // permanently down: drop
      pending.push(buf);
      if (pending.length > MAX_PENDING_FRAMES) pending.shift();
    },
    async close() {
      if (closing) return closed;
      closing = true;
      clearInterval(keepAlive);
      const sock = ws;
      if (!sock) { resolveClosed?.(); return closed; }
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "CloseStream" }));
      const timer = setTimeout(() => { sock.terminate(); resolveClosed?.(); }, CLOSE_TIMEOUT_MS);
      await closed;
      clearTimeout(timer);
    },
  };
}

// ---------- Mock ----------

let fixtureText: string | null = null;
function fixture(): string {
  fixtureText ??= readFileSync(new URL("../../fixtures/lecture_sample.txt", import.meta.url), "utf8");
  return fixtureText;
}

function sentencesOf(text: string): string[] {
  return text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(s => s.split(" ").length >= 3);
}

function createMockStt(opts: SttOptions): SttSession {
  const ev = emitter();
  const base = opts.offsetS ?? 0;
  const sentences = sentencesOf(opts.mockText ?? fixture());
  const perSentence = opts.mockSentenceS ?? 4;
  let audioS = 0;           // total audio received
  let progress = 0;         // loudness-weighted seconds into the current sentence
  let sentenceStart = 0;
  let shownWords = 0;
  let i = 0;
  let closed = false;

  function wordsFor(ws: string[], start: number, end: number): CaptionWord[] {
    const step = (end - start) / Math.max(ws.length, 1);
    return ws.map((w, k) => ({ word: w.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase(), punctuated: w, start: start + k * step, end: start + (k + 1) * step, confidence: 1 }));
  }

  function emit(kind: SttEvent, words: string[]) {
    const start = base + sentenceStart, end = base + audioS;
    ev.emit(kind, { text: words.join(" "), words: wordsFor(words, start, end), start, end, latencyMs: 0 });
  }

  return {
    backend: "mock",
    on: ev.on,
    sendAudio(buf) {
      if (closed || !sentences.length) return;
      const dur = buf.length / BYTES_PER_S;
      audioS += dur;
      // Loud audio advances the script at full speed, silence pauses it.
      progress += dur * Math.min(1, pcmRms(buf) / 0.02);
      const words = sentences[i % sentences.length]!.split(" ");
      const n = Math.min(words.length, Math.floor((progress / perSentence) * words.length));
      if (progress >= perSentence) {
        emit("final", words);
        i++; progress = 0; shownWords = 0; sentenceStart = audioS;
      } else if (n > shownWords) {
        shownWords = n;
        emit("interim", words.slice(0, n));
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (shownWords > 0) emit("final", sentences[i % sentences.length]!.split(" ").slice(0, shownWords));
    },
  };
}
