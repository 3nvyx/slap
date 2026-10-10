// Pretends to be the ESP32: hello, then 3,200-byte PCM chunks every 100 ms.
import { readFileSync } from "node:fs";
import WebSocket from "ws";
const wav = readFileSync(process.argv[2]);
const pcm = wav.subarray(44);                     // 16 kHz mono 16-bit, header skipped
const url = process.env.DEVICE_WS ?? "ws://localhost:8787/ws/device";
const ws = new WebSocket(url);
ws.on("open", async () => {
  ws.send(JSON.stringify({ hello: "fake-device", fw: "smoke", code: "A7K2QX" }));
  const t0 = Date.now();
  for (let i = 0; i < pcm.length; i += 3200) {
    const due = t0 + (i / 32000) * 1000;
    const wait = due - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    ws.send(pcm.subarray(i, i + 3200));
  }
  setTimeout(() => ws.close(), 3000);
});
ws.on("close", () => process.exit(0));
