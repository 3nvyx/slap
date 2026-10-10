// Throwaway smoke test: device audio -> Deepgram -> captions to browsers.
// One process, two WebSocket paths: /ws/device (binary PCM up, JSON down),
// /ws/live (caption JSON to any number of viewers). Deleted before Saturday.
import http from "node:http";
import { readFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const key = process.env.DEEPGRAM_API_KEY;
if (!key) throw new Error("DEEPGRAM_API_KEY missing");
const DG_URL = "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true&punctuate=true&endpointing=300&utterance_end_ms=1000";

const viewers = new Set<WebSocket>();
const html = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");

const server = http.createServer((req, res) => {
  if (req.url === "/health") return res.writeHead(200).end("ok");
  res.writeHead(200, { "content-type": "text/html" }).end(html);
});

const wssDevice = new WebSocketServer({ noServer: true });
const wssLive = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, sock, head) => {
  const wss = req.url?.startsWith("/ws/device") ? wssDevice : req.url?.startsWith("/ws/live") ? wssLive : null;
  if (!wss) return sock.destroy();
  wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws, req));
});

function broadcast(msg: object) {
  const s = JSON.stringify(msg);
  for (const v of viewers) if (v.readyState === WebSocket.OPEN) v.send(s);
}

wssLive.on("connection", (ws) => { viewers.add(ws); ws.on("close", () => viewers.delete(ws)); });

wssDevice.on("connection", (ws) => {
  console.log("[device] connected");
  const sentAt = new Map<number, number>();   // audio seconds -> ms timestamp
  let audioSec = 0;
  const lat: number[] = [], latFinal: number[] = [];

  // Raw WebSocket to Deepgram (no SDK): works on every Node version, lowest latency.
  const dg = new WebSocket(DG_URL, { headers: { Authorization: `Token ${key}` } });
  const pending: Buffer[] = [];
  dg.on("open", () => { console.log("[dg] open"); for (const b of pending) dg.send(b); pending.length = 0; });
  dg.on("error", (e) => console.log("[dg] error", e.message));
  dg.on("message", (raw) => {
    const d = JSON.parse(raw.toString());
    if (d.type !== "Results") return;
    const alt = d.channel?.alternatives?.[0];
    if (!alt?.transcript) return;
    const end = Math.round((d.start + d.duration) * 10) / 10;
    let k = end; while (!sentAt.has(k) && k < audioSec + 1) k = Math.round((k + 0.1) * 10) / 10;
    const l = sentAt.has(k) ? Date.now() - sentAt.get(k)! : NaN;
    (d.is_final ? latFinal : lat).push(l);
    broadcast({ type: d.is_final ? "final" : "interim", text: alt.transcript, words: alt.words, start: d.start, duration: d.duration, latency_ms: l, t: Date.now() });
    if (d.is_final) console.log(`FINAL +${l}ms  ${alt.transcript.slice(0, 60)}`);
  });
  const dgSend = (b: Buffer) => dg.readyState === WebSocket.OPEN ? dg.send(b) : pending.push(b);

  ws.on("message", (data, isBinary) => {
    if (!isBinary) { console.log("[device] text:", data.toString()); broadcast({ type: "device", msg: data.toString() }); return; }
    const buf = data as Buffer;
    audioSec = Math.round((audioSec + buf.length / 32000) * 10) / 10;
    sentAt.set(audioSec, Date.now());
    dgSend(buf);
  });
  ws.on("close", () => {
    if (dg.readyState === WebSocket.OPEN) dg.send(JSON.stringify({ type: "CloseStream" }));
    const med = (a: number[]) => { const x = a.filter(Number.isFinite).sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : NaN; };
    console.log(`[device] closed. interim median ${med(lat)} ms (n=${lat.length}), final median ${med(latFinal)} ms (n=${latFinal.length})`);
  });
});

server.listen(PORT, () => console.log(`smoke server on http://localhost:${PORT}`));
