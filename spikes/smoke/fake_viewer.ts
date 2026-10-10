// Pretends to be a browser on /ws/live: counts captions and measures server->viewer delay.
import WebSocket from "ws";
const ws = new WebSocket(process.env.LIVE_WS ?? "ws://localhost:8787/ws/live");
let n = 0, finals = 0, sum = 0;
ws.on("message", (m) => { const d = JSON.parse(m.toString()); if (d.t) { n++; sum += Date.now() - d.t; if (d.type === "final") finals++; } });
setTimeout(() => { console.log(`viewer: ${n} caption events (${finals} final), mean server->viewer ${(sum / Math.max(n,1)).toFixed(1)} ms`); process.exit(0); }, Number(process.env.VIEW_SECS ?? 320) * 1000);
