// Pretends to be the desk device, speaking the real /ws/device protocol:
// hello -> (wait for idle) -> button -> PCM frames from a WAV in real time -> button -> close.
//   node src/scripts/fake_device.ts [file.wav] [--url ws://localhost:8787/ws/device] [--key dev-device-key]
//        [--id fake-device-1] [--pair-code ABC123] [--seconds 60] [--speed 1] [--no-start] [--show-oled]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import WebSocket from "ws";
import { AUDIO_FRAME_BYTES, OLED_FRAME_BYTES, type DeviceToServer, type ServerToDevice, type DeviceState } from "@slap/contracts";
import { frameToAscii } from "../oled.ts";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: "string", default: process.env.DEVICE_WS ?? "ws://localhost:8787/ws/device" },
    key: { type: "string", default: process.env.DEVICE_KEY ?? "dev-device-key" },
    id: { type: "string", default: "fake-device-1" },
    "pair-code": { type: "string" },   // the real firmware derives one from its MAC
    seconds: { type: "string", default: "60" },
    speed: { type: "string", default: "1" },
    "no-start": { type: "boolean", default: false },
    "show-oled": { type: "boolean", default: false },
  },
});

/** Returns the PCM payload of a 16 kHz mono s16le WAV (walks the RIFF chunks). */
function readWavPcm(file: string): Buffer {
  const wav = readFileSync(file);
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let off = 12;
  let fmtOk = false;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4), size = wav.readUInt32LE(off + 4);
    if (id === "fmt ") {
      const ch = wav.readUInt16LE(off + 10), rate = wav.readUInt32LE(off + 12), bits = wav.readUInt16LE(off + 22);
      if (ch !== 1 || rate !== 16000 || bits !== 16) throw new Error(`need 16 kHz mono 16-bit, got ${rate} Hz ${ch} ch ${bits}-bit`);
      fmtOk = true;
    }
    if (id === "data") { if (!fmtOk) throw new Error("WAV data before fmt"); return wav.subarray(off + 8, off + 8 + size); }
    off += 8 + size + (size & 1);
  }
  throw new Error("WAV has no data chunk");
}

const wavPath = positionals[0] ?? new URL("../../fixtures/lecture_sample_16k.wav", import.meta.url).pathname;
const pcm = readWavPcm(wavPath);
const seconds = Math.min(Number(opt.seconds), pcm.length / 32000);
const speed = Math.max(0.1, Number(opt.speed));
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

const ws = new WebSocket(`${opt.url}?key=${encodeURIComponent(opt.key!)}`);
const send = (m: DeviceToServer) => ws.send(JSON.stringify(m));
let state: DeviceState | null = null;
let waiter: { want: DeviceState[]; resolve: () => void } | null = null;
const waitFor = (...want: DeviceState[]) => new Promise<void>(resolve => { if (state && want.includes(state)) resolve(); else waiter = { want, resolve }; });
let frames = 0;

ws.on("unexpected-response", (_req, res) => { console.error(`server refused: HTTP ${res.statusCode}`); process.exit(1); });
ws.on("error", (e) => { console.error("socket error:", e.message); process.exit(1); });
ws.on("close", (code, reason) => { console.log(`${ts()} closed ${code} ${reason.toString()}`); process.exit(0); });

ws.on("message", (data, isBinary) => {
  if (isBinary) {
    const buf = data as Buffer;
    frames++;
    if (buf.length !== OLED_FRAME_BYTES) console.warn(`OLED frame of ${buf.length} bytes (expected ${OLED_FRAME_BYTES})`);
    else if (opt["show-oled"]) console.log(`${ts()} OLED frame #${frames}\n${frameToAscii(buf)}`);
    return;
  }
  const m = JSON.parse(data.toString()) as ServerToDevice;
  if (m.type === "ping") { send({ type: "pong", t: m.t }); return; }
  if (m.state !== state) console.log(`${ts()} state ${m.state}${m.sessionId ? ` lecture=${m.sessionId}` : ""}${m.classCode ? ` class=${m.classCode}` : ""}${m.message ? ` (${m.message})` : ""}`);
  state = m.state;
  if (waiter && waiter.want.includes(state)) { const w = waiter; waiter = null; w.resolve(); }
});

ws.on("open", async () => {
  console.log(`${ts()} connected to ${opt.url} as ${opt.id}; ${seconds.toFixed(0)} s of audio at ${speed}x`);
  send({ type: "hello", deviceId: opt.id!, fw: "fake-0.2", ...(opt["pair-code"] ? { pairCode: opt["pair-code"] } : {}) });
  await new Promise(r => setTimeout(r, 1500));
  if (state === "unpaired") console.log("device is unpaired: enter the code shown above in the app (POST /api/devices/pair); waiting...");
  await waitFor("idle", "recording");
  if (opt["no-start"]) { console.log("--no-start: idling (Ctrl-C to quit)"); return; }
  if (state === "recording") console.log(`${ts()} server resumed a live lecture; streaming without pressing start`);
  else { send({ type: "button", button: "boot" }); await waitFor("recording"); }
  const total = Math.floor((seconds * 32000) / AUDIO_FRAME_BYTES) * AUDIO_FRAME_BYTES;
  const start = Date.now();
  for (let i = 0; i < total; i += AUDIO_FRAME_BYTES) {
    const due = start + (i / 32000) * 1000 / speed;
    const wait = due - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (state !== "recording") { console.log(`${ts()} recording stopped by server`); break; }
    ws.send(pcm.subarray(i, i + AUDIO_FRAME_BYTES));
    if (i % (32000 * 10) === 0 && i) console.log(`${ts()} sent ${(i / 32000).toFixed(0)} s`);
  }
  await new Promise(r => setTimeout(r, 1200));
  send({ type: "button", button: "slap" });
  await waitFor("idle");
  console.log(`${ts()} done; ${frames} OLED frames received`);
  setTimeout(() => ws.close(1000, "bye"), 500);
});
