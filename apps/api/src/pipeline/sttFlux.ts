// "Fast" speech-to-text: Deepgram Flux on /v2/listen. Words reach the screen about 0.2 s after
// they are spoken (Nova-3 and Soniox: about 0.6 s; spikes/README.md, 10 Oct 2026). Flux is built
// for voice agents: every message carries the whole current turn, it rewrites about a quarter of
// its words within half a second of first showing them, and text is only final when it decides
// the speaker's turn has ended, every 15-20 s in a lecture. So this adapter cuts the turn into
// sentences itself and emits a sentence as final once it has settled.
import type { CaptionWord } from "@slap/contracts";
import type { SttOptions, SttSession } from "./stt.ts";
import { SENTENCE_END, captionWord, emitter, openSttLink, resultOf, settledCount, splitSentences } from "./sttLink.ts";

const FLUX_URL = "wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000";
/** Flux stops rewriting a word within about 0.5 s (p90 453 ms), less than three words take to say. */
const SETTLE_WORDS = 3;
const MAX_RUN_WORDS = 45;
/** A finished sentence followed by silence is settled after this long without a change. */
const PAUSE_SETTLE_MS = 1200;

interface FluxWord { word: string; confidence?: number; start: number; end: number }
interface FluxMessage { type?: string; event?: string; turn_index?: number; words?: FluxWord[]; description?: string }

export function createFluxStt(key: string, opts: SttOptions): SttSession {
  const ev = emitter();
  const base = opts.offsetS ?? 0;
  const tag = `[stt:flux${opts.label ? " " + opts.label : ""}]`;
  let turn = -1;
  let committed = 0;            // words of the current turn already emitted as finals
  let rest: CaptionWord[] = []; // the turn's words after those, as last seen
  let restText = "";
  let restSince = 0;
  let shown = "";               // last interim text emitted

  function emitFinals(words: CaptionWord[]) {
    for (const s of splitSentences(words, w => w.punctuated ?? w.word)) ev.emit("final", resultOf(s, link.latencyFor(s.at(-1)!.end - base)));
    shown = "";
  }

  /** Emits whatever is left of the turn as final: the turn ended, the connection dropped, or the session is closing. */
  function flush() {
    if (rest.length) emitFinals(rest);
    rest = []; restText = ""; committed = 0;
  }

  const link = openSttLink({
    tag, url: FLUX_URL, headers: { Authorization: `Token ${key}` },
    bye: JSON.stringify({ type: "CloseStream" }),
    onReconnect: flush,
    onMessage(raw) {
      const d = raw as FluxMessage;
      if (d.type === "Error") { console.warn(tag, "service error:", d.description ?? ""); return; }
      if (d.type !== "TurnInfo" || d.turn_index === undefined) return;
      if (d.turn_index !== turn) { flush(); turn = d.turn_index; }
      const off = base + link.streamOffset();
      let words = (d.words ?? []).slice(committed).map(w => captionWord(w.word, off + w.start, off + w.end, w.confidence));
      const text = words.map(w => w.punctuated).join(" ");
      if (text !== restText) { restText = text; restSince = Date.now(); }
      const ended = d.event === "EndOfTurn";
      const paused = words.length > 0 && SENTENCE_END.test(words.at(-1)!.punctuated!) && Date.now() - restSince >= PAUSE_SETTLE_MS;
      const n = ended || paused ? words.length : settledCount(words.map(w => w.punctuated!), SETTLE_WORDS, MAX_RUN_WORDS);
      if (n) {
        emitFinals(words.slice(0, n));
        committed += n;
        words = words.slice(n);
        restText = words.map(w => w.punctuated).join(" ");
        restSince = Date.now();
      }
      rest = words;
      if (ended) { rest = []; restText = ""; committed = 0; turn = -1; return; }
      if (restText && restText !== shown) { shown = restText; ev.emit("interim", resultOf(words, link.latencyFor(words.at(-1)!.end - base))); }
    },
  });

  return {
    backend: "flux",
    on: ev.on,
    sendAudio: link.sendAudio,
    async close() {
      await link.close();
      flush();   // Flux closes without ending the open turn
    },
  };
}
