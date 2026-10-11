// Streams the same lecture clip to Soniox in real time and measures, per token, how long
// after that token's audio was SENT it first appeared, and how long until it was final.
// With a target language it also times Soniox's own translation, sentence by sentence.
//   node --env-file=../../.env.local sn_stream.mjs [seconds=60] [target language, e.g. ja] [endpoint]
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "/Users/nootnoot/slap/apps/api/node_modules/ws/wrapper.mjs";
const KEY = process.env.SONIOX_API_KEY; if (!KEY) throw new Error("SONIOX_API_KEY is not set");
const ENDPOINT = process.argv.includes("endpoint");   // also ask Soniox to detect the end of each utterance
const args = process.argv.slice(2).filter(a => a !== "endpoint");
const SECONDS = Number(args[0] ?? 60), TARGET = args[1] ?? null, CHUNK_MS = 100;
const wav = readFileSync("/Users/nootnoot/slap/apps/api/fixtures/lecture_sample_16k.wav");
let off = 12, pcm = null;
while (off + 8 <= wav.length) { const id = wav.toString("ascii", off, off + 4), size = wav.readUInt32LE(off + 4); if (id === "data") { pcm = wav.subarray(off + 8, off + 8 + size); break; } off += 8 + size + (size & 1); }
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length * 0.9)]) : null; };

const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket", { headers: { Authorization: `Bearer ${KEY}` } });
const sends = [];   // [audioEndS, wallMs]
const sentAt = s => { let lo = 0, hi = sends.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (sends[m][0] >= s) hi = m; else lo = m + 1; } return sends[lo]?.[1]; };
const firstSeen = new Set(), finalSeen = new Set(), tokenDelay = [], finalDelay = [], gaps = [];
const visible = [];   // [wallMs, source chars on screen, translated chars on screen]
const srcEnds = [], trDelay = []; let trSentences = 0, lastMsg = 0, text = "", translated = "";
const isEnd = t => /[.?!。？！]\s*$/.test(t);

ws.on("open", () => {
  ws.send(JSON.stringify({
    model: "stt-rt-v5", audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1, language_hints: ["en"],
    ...(ENDPOINT ? { enable_endpoint_detection: true } : {}),
    ...(TARGET ? { translation: { type: "one_way", target_language: TARGET } } : {}),
  }));
  const t0 = performance.now(), bytes = CHUNK_MS * 32; let i = 0;
  const tick = () => {
    if (i >= SECONDS * 32000 || i >= pcm.length) { ws.send(""); return; }   // empty text frame ends the stream
    const wait = t0 + (i / 32000) * 1000 - performance.now();
    if (wait > 0) return setTimeout(tick, wait);
    ws.send(pcm.subarray(i, i + bytes)); i += bytes; sends.push([i / 32000, performance.now()]); setImmediate(tick);
  };
  tick();
});
ws.on("message", raw => {
  const d = JSON.parse(raw.toString()), now = performance.now();
  if (d.error_code) { console.error("Soniox error:", d.error_code, d.error_type, d.error_message); process.exit(1); }
  if (d.tokens?.length) { if (lastMsg) gaps.push(now - lastMsg); lastMsg = now; }
  // Text on screen after this message: everything final so far plus this message's non-final tail.
  const tail = k => (d.tokens ?? []).filter(t => !t.is_final && (t.translation_status === "translation") === k).reduce((n, t) => n + t.text.length, 0);
  visible.push([now, text.length + tail(false), translated.length + tail(true)]);
  for (const t of d.tokens ?? []) {
    if (t.translation_status === "translation") {
      if (!t.is_final) continue;
      translated += t.text;
      if (isEnd(t.text)) { const src = srcEnds[trSentences++]; if (src !== undefined) trDelay.push(now - src); }
      continue;
    }
    if (t.end_ms === undefined) continue;
    const k = Math.round(t.start_ms / 40), sent = sentAt(t.end_ms / 1000);
    if (!firstSeen.has(k)) { firstSeen.add(k); if (sent) tokenDelay.push(now - sent); }
    if (t.is_final && !finalSeen.has(k)) { finalSeen.add(k); text += t.text; if (sent) { finalDelay.push(now - sent); if (isEnd(t.text)) srcEnds.push(sent); } }
  }
  if (d.finished) ws.close();
});
ws.on("close", () => {
  // Lag of the text on screen behind the audio: when the text reached x% of its final length,
  // minus when x% of the audio had been sent. Assumes text grows evenly with the audio.
  const lag = (col, total) => { const out = []; for (let f = 0.1; f < 0.95; f += 0.05) { const hit = visible.find(v => v[col] >= f * total); const sent = sentAt(f * sends.at(-1)[0]); if (hit && sent) out.push(hit[0] - sent); } return out; };
  const srcLag = lag(1, text.length), trLag = TARGET ? lag(2, translated.length) : [];
  const out = { service: "soniox stt-rt-v5", endpoint_detection: ENDPOINT, packet_ms: CHUNK_MS, seconds: SECONDS, tokens: tokenDelay.length,
    token_delay_median_ms: med(tokenDelay), token_delay_p90_ms: p90(tokenDelay), update_gap_median_ms: med(gaps),
    final_delay_median_ms: med(finalDelay), final_delay_p90_ms: p90(finalDelay),
    source_text_lag_median_ms: med(srcLag),
    ...(TARGET ? { target: TARGET, translated_text_lag_median_ms: med(trLag), translated_text_lag_p90_ms: p90(trLag), source_sentences: srcEnds.length, translated_sentences: trSentences,
      translated_sentence_delay_median_ms: med(trDelay), translated_sentence_delay_p90_ms: p90(trDelay) } : {}) };
  console.log(JSON.stringify(out));
  writeFileSync(new URL(`./soniox_${TARGET ?? "en"}${ENDPOINT ? "_endpoint" : ""}.txt`, import.meta.url), TARGET ? `${text.trim()}\n\n${translated.trim()}\n` : text.trim() + "\n");
});
ws.on("error", e => { console.error("socket error:", e.message); process.exit(1); });
