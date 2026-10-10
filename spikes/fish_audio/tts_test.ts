// Throwaway: Fish Audio TTS latency for a tutor-style turn.
// 1) HTTP /v1/tts: time to first audio byte and total time. 2) WebSocket live mode with
// latency=low, feeding the sentence in two chunks like a streaming LLM would.
import { writeFileSync } from "node:fs";
import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";

const KEY = process.env.FISH_API_KEY;
if (!KEY) throw new Error("FISH_API_KEY missing in .env.local");
const MODEL = process.env.FISH_TTS_MODEL ?? "s2.1-pro";
const VOICE = process.env.FISH_VOICE_ID;   // optional reference_id; default voice if unset
const text = "Quick check before we move on. In your own words, why does the normalizing constant in the Gaussian density not matter when we minimize the loss?";

async function httpTest() {
  const t0 = performance.now();
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", model: MODEL },
    body: JSON.stringify({ text, format: "mp3", mp3_bitrate: 64, latency: "low", ...(VOICE ? { reference_id: VOICE } : {}) }),
  });
  if (!res.ok || !res.body) { console.log("HTTP TTS failed", res.status, await res.text()); return; }
  const reader = res.body.getReader();
  let first = 0, bytes = 0; const chunks: Uint8Array[] = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break; if (!first) first = performance.now() - t0; bytes += value.length; chunks.push(value); }
  const total = performance.now() - t0;
  writeFileSync("out_http.mp3", Buffer.concat(chunks));
  console.log(`HTTP ${MODEL}: first audio ${first.toFixed(0)} ms, total ${total.toFixed(0)} ms, ${(bytes/1024).toFixed(0)} kB -> out_http.mp3`);
}

async function wsTest() {
  const t0 = performance.now();
  const ws = new WebSocket("wss://api.fish.audio/v1/tts/live", { headers: { Authorization: `Bearer ${KEY}`, model: MODEL } });
  let first = 0, bytes = 0; const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      ws.send(encode({ event: "start", request: { text: "", format: "mp3", mp3_bitrate: 64, latency: "low", ...(VOICE ? { reference_id: VOICE } : {}) } }));
      const parts = text.split(". ");
      ws.send(encode({ event: "text", text: parts[0] + ". " }));
      setTimeout(() => { ws.send(encode({ event: "text", text: parts.slice(1).join(". ") })); ws.send(encode({ event: "flush" })); ws.send(encode({ event: "stop" })); }, 300);
    });
    ws.on("message", (raw) => {
      const m = decode(raw as Buffer) as { event: string; audio?: Uint8Array; reason?: string };
      if (m.event === "audio" && m.audio) { if (!first) first = performance.now() - t0; bytes += m.audio.length; chunks.push(Buffer.from(m.audio)); }
      if (m.event === "finish") { ws.close(); resolve(); }
    });
    ws.on("error", reject);
    ws.on("close", () => resolve());
  });
  const total = performance.now() - t0;
  writeFileSync("out_ws.mp3", Buffer.concat(chunks));
  console.log(`WS   ${MODEL}: first audio ${first.toFixed(0)} ms, total ${total.toFixed(0)} ms, ${(bytes/1024).toFixed(0)} kB -> out_ws.mp3`);
}

await httpTest();
await wsTest();
