// Streams the same lecture clip to Deepgram in real time with different packet sizes and
// measures, per word, how long after that word's audio was SENT it first appeared in a result.
import { readFileSync } from "node:fs";
import WebSocket from "/Users/nootnoot/slap/apps/api/node_modules/ws/wrapper.mjs";
const KEY = process.env.DEEPGRAM_API_KEY; if (!KEY) throw new Error("no DEEPGRAM_API_KEY");
const QUERY = "model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true&punctuate=true&endpointing=300&utterance_end_ms=1000&diarize=false";
const wav = readFileSync("/Users/nootnoot/slap/apps/api/fixtures/lecture_sample_16k.wav");
let off = 12, pcm = null;
while (off + 8 <= wav.length) { const id = wav.toString("ascii", off, off + 4), size = wav.readUInt32LE(off + 4); if (id === "data") { pcm = wav.subarray(off + 8, off + 8 + size); break; } off += 8 + size + (size & 1); }
const SECONDS = Number(process.argv[2] ?? 60), SIZES = (process.argv[3] ?? "20,50,100,250").split(",").map(Number);
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * p)] : null; };
function run(chunkMs) {
  return new Promise(resolve => {
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${QUERY}`, { headers: { Authorization: `Token ${KEY}` } });
    const bytes = chunkMs * 32, sends = [];          // [audioEndS, wallMs]
    const seen = new Set(), wordLat = [], interimGaps = []; let interims = 0, finals = 0, lastInterim = 0, finalLat = [];
    const sentAt = s => { let lo = 0, hi = sends.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (sends[m][0] >= s) hi = m; else lo = m + 1; } return sends[lo]?.[1]; };
    ws.on("open", () => {
      const t0 = performance.now(); let i = 0;
      const tick = () => {
        const due = (i / 32000) * 1000;
        if (i >= SECONDS * 32000 || i >= pcm.length) { ws.send(JSON.stringify({ type: "CloseStream" })); return; }
        const wait = t0 + due - performance.now();
        if (wait > 0) return setTimeout(tick, wait);
        ws.send(pcm.subarray(i, i + bytes)); i += bytes; sends.push([i / 32000, performance.now()]); setImmediate(tick);
      };
      tick();
    });
    ws.on("message", raw => {
      const d = JSON.parse(raw.toString()); if (d.type !== "Results") return;
      const alt = d.channel?.alternatives?.[0]; if (!alt?.transcript?.trim()) return;
      const now = performance.now();
      if (d.is_final) { finals++; const t = sentAt(d.start + d.duration); if (t) finalLat.push(now - t); }
      else { interims++; if (lastInterim) interimGaps.push(now - lastInterim); lastInterim = now; }
      for (const w of alt.words ?? []) { const k = Math.round(w.start * 20); if (seen.has(k)) continue; seen.add(k); const t = sentAt(w.end); if (t) wordLat.push(now - t); }
    });
    ws.on("close", () => resolve({ chunkMs, packets_per_s: 1000 / chunkMs, words: wordLat.length, word_delay_median_ms: Math.round(med(wordLat)), word_delay_p90_ms: Math.round(pct(wordLat, 0.9)), interims, finals, interim_gap_median_ms: Math.round(med(interimGaps)), final_after_audio_median_ms: Math.round(med(finalLat)) }));
    ws.on("error", e => resolve({ chunkMs, error: e.message }));
  });
}
const out = await Promise.all(SIZES.map(run));
for (const r of out) console.log(JSON.stringify(r));
