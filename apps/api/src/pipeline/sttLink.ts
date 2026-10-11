// Shared plumbing for the WebSocket speech-to-text backends added after Deepgram Nova (Flux and
// Soniox): one connection that buffers audio while it opens, reconnects once per failure, keeps
// itself alive between frames, and remembers when each stretch of audio was sent so results can
// report their latency. Also the helpers that turn a service's words into caption sentences.
import WebSocket from "ws";
import type { CaptionWord } from "@slap/contracts";
import { AUDIO_SAMPLE_RATE } from "@slap/contracts";
import type { SttEvent, SttListener, SttResult } from "./stt.ts";

const BYTES_PER_S = AUDIO_SAMPLE_RATE * 2;
const MAX_PENDING_FRAMES = 100;   // 10 s of audio while (re)connecting; older frames are dropped
const CLOSE_TIMEOUT_MS = 4000;

export function emitter() {
  const ls: Record<SttEvent, SttListener[]> = { interim: [], final: [] };
  return {
    on(e: SttEvent, cb: SttListener) { ls[e].push(cb); },
    emit(e: SttEvent, r: SttResult) { for (const cb of ls[e]) { try { cb(r); } catch (err) { console.error("[stt] listener", err); } } },
  };
}

export interface SttLinkOptions {
  tag: string;
  url: string;
  headers: Record<string, string>;
  /** Text message sent first on every connection (the service's start request), if it needs one. */
  hello?: string;
  /** Text message that tells the service the audio has ended. */
  bye: string;
  /** Text message sent every 4 s without audio; omit if the service has no keep-alive. */
  keepAlive?: string;
  onMessage(d: unknown): void;
  /** The connection dropped and a new one is opening: the service's turn and token state is gone. */
  onReconnect(): void;
}

export interface SttLink {
  sendAudio(buf: Buffer): void;
  /** Ends the stream and resolves when the service has closed it (or after a timeout). */
  close(): Promise<void>;
  /** Wall ms since the audio at `s` session seconds was sent; undefined if it is too old. */
  latencyFor(s: number): number | undefined;
  /** Session seconds sent before the current connection opened (services restart their clock at 0). */
  streamOffset(): number;
}

export function openSttLink(o: SttLinkOptions): SttLink {
  let ws: WebSocket | null = null;
  const pending: Buffer[] = [];
  let sentS = 0;
  let streamOffset = 0;
  let retryAllowed = true;       // reconnect once per failure; re-armed when messages flow again
  let closing = false;
  let lastAudioAt = Date.now();
  const sentAt = new Map<number, number>();   // decisecond of audio -> wall ms when sent
  let resolveClosed: (() => void) | null = null;
  const closed = new Promise<void>(r => { resolveClosed = r; });

  const keepAlive = setInterval(() => {
    if (o.keepAlive && ws?.readyState === WebSocket.OPEN && Date.now() - lastAudioAt > 4000) ws.send(o.keepAlive);
  }, 4000);

  function send(buf: Buffer) {
    ws!.send(buf);
    sentS += buf.length / BYTES_PER_S;
    const ds = Math.round(sentS * 10);
    sentAt.set(ds, Date.now());
    sentAt.delete(ds - 600);
  }

  function connect() {
    const sock = new WebSocket(o.url, { headers: o.headers });
    ws = sock;
    sock.on("open", () => {
      streamOffset = sentS;
      if (o.hello) sock.send(o.hello);
      for (const b of pending.splice(0)) send(b);
      if (closing) sock.send(o.bye);
    });
    sock.on("message", (raw) => {
      let d: unknown;
      try { d = JSON.parse(raw.toString()); } catch { return; }
      retryAllowed = true;
      o.onMessage(d);
    });
    sock.on("error", (e) => console.warn(o.tag, "error:", e.message));
    sock.on("close", (code) => {
      if (ws !== sock) return;
      ws = null;
      if (closing) { resolveClosed?.(); return; }
      if (retryAllowed) {
        retryAllowed = false;
        console.warn(o.tag, `closed (${code}); reconnecting once`);
        o.onReconnect();
        connect();
      } else {
        console.error(o.tag, `closed (${code}) again; audio is dropped until the session restarts`);
      }
    });
  }
  connect();

  return {
    sendAudio(buf) {
      if (closing) return;
      lastAudioAt = Date.now();
      if (ws?.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > MAX_PENDING_FRAMES * buf.length) return;   // service not draining: drop, never queue unboundedly
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
      if (sock.readyState === WebSocket.OPEN) sock.send(o.bye);
      const timer = setTimeout(() => { sock.terminate(); resolveClosed?.(); }, CLOSE_TIMEOUT_MS);
      await closed;
      clearTimeout(timer);
    },
    latencyFor(s) {
      for (let ds = Math.round(s * 10), k = 0; k < 5; ds++, k++) {
        const t = sentAt.get(ds);
        if (t !== undefined) return Date.now() - t;
      }
      return undefined;
    },
    streamOffset: () => streamOffset,
  };
}

// ---------- Words and sentences ----------

/** A word ends a sentence if it ends in . ? or !, optionally followed by a closing quote or bracket. */
export const SENTENCE_END = /[.?!]["'”’)\]]?$/;

export function captionWord(punctuated: string, start: number, end: number, confidence?: number): CaptionWord {
  const word = punctuated.replace(/[^\p{L}\p{N}'-]/gu, "").toLowerCase();
  return { word, punctuated, start, end, ...(confidence !== undefined ? { confidence } : {}) };
}

export function resultOf(words: CaptionWord[], latencyMs?: number): SttResult {
  return {
    text: words.map(w => w.punctuated ?? w.word).join(" "), words,
    start: words[0]!.start, end: words.at(-1)!.end, ...(latencyMs !== undefined ? { latencyMs } : {}),
  };
}

/** Cuts a run of words into sentences: one array per sentence, the last one possibly unfinished. */
export function splitSentences<T>(words: T[], textOf: (w: T) => string): T[][] {
  const out: T[][] = [];
  let from = 0;
  words.forEach((w, i) => { if (SENTENCE_END.test(textOf(w))) { out.push(words.slice(from, i + 1)); from = i + 1; } });
  if (from < words.length) out.push(words.slice(from));
  return out;
}

/**
 * How many leading words can be emitted as final. A sentence is settled once `settleWords` more
 * words follow it: they take longer to say than the service takes to stop rewriting a word. With
 * no sentence end in `maxRun` words the run is cut anyway, at the last comma if there is one, so
 * finals (and with them translation and storage) keep flowing through a long sentence.
 */
export function settledCount(words: string[], settleWords: number, maxRun: number): number {
  const limit = words.length - settleWords;
  let n = 0;
  for (let i = 0; i < limit; i++) if (SENTENCE_END.test(words[i]!)) n = i + 1;
  if (n || words.length < maxRun) return n;
  for (let i = limit - 1; i >= maxRun / 2; i--) if (/[,;:]$/.test(words[i]!)) return i + 1;
  return limit;
}

