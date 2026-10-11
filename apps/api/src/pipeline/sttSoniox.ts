// "Accurate" speech-to-text: Soniox real-time. Same typical delay as Deepgram Nova-3 (about
// 0.6 s per word) but text arrives every 0.1 s and it made fewer errors on the lecture fixture
// (spikes/README.md, 10 Oct 2026). Soniox streams tokens (pieces of words), each marked final or
// not, and has no utterances. Tokens are only marked final about 5 s after they are spoken, but
// in the same measurement no word changed more than 1.1 s after it first appeared. So this
// adapter builds words from tokens and emits a sentence as final once it has settled, without
// waiting for the final flag, and reports everything after that as the interim.
import type { CaptionWord } from "@slap/contracts";
import { settings } from "../settings.ts";
import type { SttOptions, SttSession } from "./stt.ts";
import { captionWord, emitter, openSttLink, resultOf, settledCount, splitSentences } from "./sttLink.ts";

const SONIOX_URL = "wss://stt-rt.soniox.com/transcribe-websocket";
/** Five words take about 1.5 s to say, longer than Soniox kept changing any word (1.1 s at most). */
const SETTLE_WORDS = 5;
const MAX_RUN_WORDS = 45;

export interface SonioxToken { text: string; start_ms?: number; end_ms?: number; confidence?: number; is_final?: boolean; translation_status?: string }
interface SonioxMessage { tokens?: SonioxToken[]; error_code?: number; error_type?: string; error_message?: string }

/** Tokens -> words. A token that starts with a space starts a new word; punctuation tokens join the word before them. */
export function tokensToWords(tokens: SonioxToken[], offsetS: number): CaptionWord[] {
  const out: CaptionWord[] = [];
  let text = "", start = 0, end = 0, conf = 1;
  const push = () => { if (text.trim()) out.push(captionWord(text.trim(), offsetS + start / 1000, offsetS + end / 1000, conf)); };
  for (const t of tokens) {
    if (/^\s/.test(t.text) || !text) { push(); text = ""; start = t.start_ms ?? end; conf = 1; }
    text += t.text;
    end = t.end_ms ?? end;
    conf = Math.min(conf, t.confidence ?? 1);
  }
  push();
  return out;
}

export function createSonioxStt(key: string, opts: SttOptions): SttSession {
  const ev = emitter();
  const base = opts.offsetS ?? 0;
  const tag = `[stt:soniox${opts.label ? " " + opts.label : ""}]`;
  let kept: SonioxToken[] = [];   // final tokens after the cut (Soniox sends a final token only once)
  let cutMs = 0;                  // stream time up to which text has been emitted as final
  let rest: CaptionWord[] = [];   // words after the cut, as last seen
  let shown = "";                 // last interim text emitted

  /** Emits the first `n` of `words` as finals, one per sentence, and moves the cut past them. */
  function commit(words: CaptionWord[], n: number, off: number) {
    if (!n) return;
    for (const s of splitSentences(words.slice(0, n), w => w.punctuated ?? w.word)) ev.emit("final", resultOf(s, link.latencyFor(s.at(-1)!.end - base)));
    cutMs = Math.round((words[n - 1]!.end - off) * 1000);
    kept = kept.filter(t => !emitted(t));
    shown = "";
  }

  // A token belongs to emitted text if its middle lies before the cut. Soniox resends non-final
  // tokens in every message and later sends them once more as final, so they must be skipped then.
  const emitted = (t: SonioxToken) => ((t.start_ms ?? 0) + (t.end_ms ?? 0)) / 2 <= cutMs;

  function flush() {
    commit(rest, rest.length, base + link.streamOffset());
    rest = [];
  }

  const link = openSttLink({
    tag, url: SONIOX_URL, headers: { Authorization: `Bearer ${key}` },
    hello: JSON.stringify({
      model: settings.stt.sonioxModel, audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1,
      language_hints: ["en"], enable_endpoint_detection: true,
    }),
    bye: "",   // an empty text frame ends the stream; Soniox then finalises what is left and closes
    keepAlive: JSON.stringify({ type: "keepalive" }),
    onReconnect() { flush(); kept = []; cutMs = 0; },   // the new connection's clock restarts at 0
    onMessage(raw) {
      const d = raw as SonioxMessage;
      if (d.error_code) { console.warn(tag, `service error ${d.error_code} ${d.error_type ?? ""}: ${d.error_message ?? ""}`); return; }
      const tail: SonioxToken[] = [];
      let atPause = false;
      for (const t of d.tokens ?? []) {
        if (t.translation_status === "translation") continue;
        if (t.text === "<end>" || t.text === "<fin>") { atPause = true; continue; }   // end-of-utterance markers, not speech
        if (emitted(t)) continue;
        (t.is_final ? kept : tail).push(t);
      }
      const off = base + link.streamOffset();
      let words = tokensToWords([...kept, ...tail], off);
      // At a pause Soniox has finalised the whole utterance, so all of it can go; otherwise only what has settled.
      const n = atPause ? tokensToWords(kept, off).length : settledCount(words.map(w => w.punctuated!), SETTLE_WORDS, MAX_RUN_WORDS);
      commit(words, n, off);
      words = words.slice(n);
      rest = words;
      const text = words.map(w => w.punctuated).join(" ");
      if (text && text !== shown) { shown = text; ev.emit("interim", resultOf(words, link.latencyFor(words.at(-1)!.end - base))); }
    },
  });

  return {
    backend: "soniox",
    on: ev.on,
    sendAudio: link.sendAudio,
    async close() {
      await link.close();
      flush();
    },
  };
}
