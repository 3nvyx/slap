// Streams the same lecture clip to Deepgram Flux (/v2/listen) in real time and measures, per
// word, how long after that word's audio was SENT it first appeared, and when it stopped changing.
//   node --env-file=../../.env.local flux_stream.mjs [seconds=60]
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "/Users/nootnoot/slap/apps/api/node_modules/ws/wrapper.mjs";
const KEY = process.env.DEEPGRAM_API_KEY; if (!KEY) throw new Error("DEEPGRAM_API_KEY is not set");
const SECONDS = Number(process.argv[2] ?? 60), CHUNK_MS = 80;   // Deepgram recommends 80 ms for Flux
const wav = readFileSync("/Users/nootnoot/slap/apps/api/fixtures/lecture_sample_16k.wav");
let off = 12, pcm = null;
while (off + 8 <= wav.length) { const id = wav.toString("ascii", off, off + 4), size = wav.readUInt32LE(off + 4); if (id === "data") { pcm = wav.subarray(off + 8, off + 8 + size); break; } off += 8 + size + (size & 1); }
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : null; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length * 0.9)]) : null; };
const ws = new WebSocket("wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000", { headers: { Authorization: `Token ${KEY}` } });
const sends = [];
const sentAt = s => { let lo = 0, hi = sends.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (sends[m][0] >= s) hi = m; else lo = m + 1; } return sends[lo]?.[1]; };
const slots = new Map();   // "turn:index" -> { first: wall ms, text, changedAt: wall ms, end: s, changes }
const gaps = [], turns = new Map(); let lastMsg = 0, ends = 0;
ws.on("open", () => {
  const t0 = performance.now(), bytes = CHUNK_MS * 32; let i = 0;
  const tick = () => {
    if (i >= SECONDS * 32000 || i >= pcm.length) { ws.send(JSON.stringify({ type: "CloseStream" })); return; }
    const wait = t0 + (i / 32000) * 1000 - performance.now();
    if (wait > 0) return setTimeout(tick, wait);
    ws.send(pcm.subarray(i, i + bytes)); i += bytes; sends.push([i / 32000, performance.now()]); setImmediate(tick);
  };
  tick();
});
ws.on("message", raw => {
  const d = JSON.parse(raw.toString()), now = performance.now();
  if (d.type !== "TurnInfo") return;
  if (lastMsg) gaps.push(now - lastMsg); lastMsg = now;
  if (d.event === "EndOfTurn") ends++;
  turns.set(d.turn_index, d.transcript);
  (d.words ?? []).forEach((w, i) => {
    const k = `${d.turn_index}:${i}`, s = slots.get(k);
    if (!s) slots.set(k, { first: now, firstEnd: w.end, text: w.word, changedAt: now, end: w.end, changes: 0 });
    else { if (s.text !== w.word) { s.text = w.word; s.changedAt = now; s.changes++; } s.end = w.end; }
  });
});
ws.on("close", () => {
  const first = [], stable = []; let changed = 0;
  for (const s of slots.values()) {
    const a = sentAt(s.firstEnd), b = sentAt(s.end);
    if (a) first.push(s.first - a); if (b) stable.push(s.changedAt - b); if (s.changes) changed++;
  }
  console.log(JSON.stringify({ service: "deepgram flux-general-en", packet_ms: CHUNK_MS, seconds: SECONDS, words: slots.size,
    word_delay_median_ms: med(first), word_delay_p90_ms: p90(first), settled_delay_median_ms: med(stable), settled_delay_p90_ms: p90(stable),
    words_rewritten_pct: Math.round(100 * changed / slots.size), update_gap_median_ms: med(gaps), turns: turns.size, end_of_turn_events: ends }));
  writeFileSync(new URL("./flux_en.txt", import.meta.url), [...turns.entries()].sort((a, b) => a[0] - b[0]).map(t => t[1]).join(" ") + "\n");
});
ws.on("unexpected-response", (_q, r) => { console.error("HTTP", r.statusCode); process.exit(1); });
ws.on("error", e => { console.error("socket error:", e.message); process.exit(1); });
