// /ws/device?key=...: the desk device. A device that is on records: its hello starts a session, a `button`
// ends it, and `lang` picks the caption language on its own screen. Text frames are JSON (DeviceToServer / ServerToDevice),
// binary up is 16 kHz s16le PCM (3,200 bytes = 100 ms), binary down is a 1,024-byte OLED frame.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { AUDIO_FRAME_BYTES, DEVICE_LANGS, type DeviceLang, type DeviceToServer, type ServerToDevice } from "@slap/contracts";
import { eq } from "drizzle-orm";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { db, schema } from "../db/index.ts";
import { CaptionRoll, renderLanguage, renderNotice, renderSaved, renderText, SHAKE_MS, shakeFrame } from "../oled.ts";
import { pcmRms } from "../pipeline/stt.ts";
import { attachDevice, detachDevice, getLecture, pushAudio, setDeviceLang, startDeviceSession, stopSession, type DeviceLink } from "../sessions.ts";
import { settings } from "../settings.ts";

const PING_MS = 10_000;
const DEAD_MS = 30_000;
const SEEN_WRITE_MS = 60_000;
const MAX_BUFFERED = 256 * 1024;                            // skip OLED frames if the device is not draining
const LANG_BANNER_MS = 1500;     // how long the language name covers the caption after a tilt
const ANIMATION_MS = 50;         // frame spacing while captions roll or fade in (the firmware draws up to 20 a second)
const FRAME_REFRESH_MS = 3000;   // firmware shows a server frame for 5 s (OLED_SERVER_FRAME_TTL_MS), so resend before that

type DeviceRow = typeof schema.devices.$inferSelect;
interface DeviceAuth { key: string; row: DeviceRow | null }

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const sockets = new Map<string, WebSocket>();   // device id -> current socket
const usbTargets = new Map<string, { socket: WebSocket; shake: () => Promise<void> }>();

/** A shake seen by the USB motion sensor that sits with the device (arduino.ts): it starts a recording, or, while
 *  one runs, only throws the captions about for a moment. It never stops one (that is REC held for 2 s). False if the device is offline. */
export async function triggerUsbSlap(firmwareDeviceId: string): Promise<boolean> {
  const target = usbTargets.get(firmwareDeviceId);
  if (!target || target.socket.readyState !== WebSocket.OPEN) return false;
  await target.shake();
  return true;
}

const log = (...a: unknown[]) => console.log("[device]", ...a);

/** Known key: a devices row, or one of settings.deviceKeys (row created on first hello). The key is all a
 *  device needs: once it says hello it is online, listed in the app and ready to record. */
async function authorize(key: string | null): Promise<DeviceAuth | null> {
  if (!key) return null;
  try {
    const [row] = await db.select().from(schema.devices).where(eq(schema.devices.deviceKey, key)).limit(1);
    if (row) return { key, row };
  } catch (e) {
    console.error("[device] key lookup failed:", (e as Error).message);
  }
  return settings.deviceKeys.includes(key) ? { key, row: null } : null;
}

export async function handleDeviceUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const auth = await authorize(url.searchParams.get("key"));
  if (!auth) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => onConnection(ws, auth));
}

/** dB-scaled meter: -50 dBFS -> 0, -6 dBFS -> 1. */
function meter(rms: number): number {
  if (rms <= 0) return 0;
  return Math.min(1, Math.max(0, (20 * Math.log10(rms) + 50) / 44));
}

const isLang = (v: unknown): v is DeviceLang => (DEVICE_LANGS as readonly unknown[]).includes(v);

function screen(d: DeviceLink, roll: CaptionRoll, banner: boolean, message?: string): Uint8Array {
  switch (d.state) {
    // Idle: waiting for a shake after power-up, or just saved (the device then sleeps or goes dark).
    case "idle": return d.savedSeconds === null ? renderNotice("Slap", "Shake to record") : renderSaved(d.savedSeconds);
    case "recording": {
      if (banner) return renderLanguage(d.lang);
      const l = d.lectureId ? getLecture(d.lectureId) : undefined;
      const secs = l ? (Date.now() - l.startedAt) / 1000 : 0;
      roll.update(d.caption, Date.now());
      return roll.frame(secs, d.level, Date.now());   // refresh() adds the wobble
    }
    case "error": return renderText(["Error", message ?? "something went wrong"]);
  }
}

function onConnection(ws: WebSocket, auth: DeviceAuth) {
  let link: DeviceLink | null = null;
  let firmwareDeviceId: string | undefined;
  let buttonBusy = false;
  let helloSeen = false;
  let lastAlive = Date.now();
  let lastSeenWrite = 0;
  let lastPress = 0;
  let pendingPress = false;     // a wake-up slap can arrive before hello has been processed
  let peak = 0;                 // loudest frame since the last OLED tick
  let deviceLevelAt = 0;        // device-reported levels win for 3 s
  let errorMessage: string | undefined;
  let errorTimer: NodeJS.Timeout | undefined;
  let bannerUntil = 0;          // the language name is on screen until then
  const roll = new CaptionRoll();   // where each caption word sits on this device's screen
  let shakenAt = -Infinity;         // a shake during a recording: the captions are thrown about for SHAKE_MS
  let animation: NodeJS.Timeout | undefined;

  const send = (m: ServerToDevice) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  const touchSeen = (force = false) => {
    if (!link || (!force && Date.now() - lastSeenWrite < SEEN_WRITE_MS)) return;
    lastSeenWrite = Date.now();
    void db.update(schema.devices).set({ lastSeenAt: new Date() }).where(eq(schema.devices.id, link.id)).catch(() => {});
  };

  const heartbeat = setInterval(() => {
    if (Date.now() - lastAlive > DEAD_MS) { log(`${link?.id ?? "?"} missed pongs; dropping`); ws.terminate(); return; }
    send({ type: "ping", t: Date.now() });
    ws.ping();
    touchSeen();
  }, PING_MS);

  // Ticks once a second: recording clock + level meter, and the periodic frame resend the firmware needs.
  const tick = setInterval(() => {
    if (!link) return;
    if (link.state === "recording" && Date.now() - deviceLevelAt > 3000) link.level = meter(peak);
    peak = 0;
    link.refresh();
  }, 1000);

  function showError(message: string) {
    if (!link) return;
    errorMessage = message;
    link.state = "error";
    link.refresh();
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => {
      if (!link || link.state !== "error") return;
      link.state = link.lectureId ? "recording" : "idle";
      errorMessage = undefined;
      link.refresh();
    }, 3000);
  }

  function makeLink(row: DeviceRow, lang: DeviceLang): DeviceLink {
    let lastState = "";
    let lastFrame: Uint8Array | null = null;
    let lastFrameAt = 0;
    const d: DeviceLink = {
      id: row.id,
      name: row.name,
      state: "idle",
      classId: null,
      classCode: null,
      className: null,
      lectureId: null,
      level: 0,
      lang,
      caption: { finals: [], interim: "" },
      savedSeconds: null,
      refresh() {
        if (ws.readyState !== WebSocket.OPEN) return;
        const msg: ServerToDevice = {
          type: "state", state: d.state,
          ...(d.lectureId ? { sessionId: d.lectureId } : {}),
          ...(d.classCode ? { classCode: d.classCode } : {}),
          ...(d.state === "error" && errorMessage ? { message: errorMessage } : {}),
        };
        const s = JSON.stringify(msg);
        if (s !== lastState) { ws.send(s); lastState = s; }
        if (ws.bufferedAmount > MAX_BUFFERED) return;
        const drawn = screen(d, roll, Date.now() < bannerUntil, errorMessage);
        const frame = d.state === "recording" ? shakeFrame(drawn, Date.now() - shakenAt) : drawn;
        if (!lastFrame || Buffer.compare(frame, lastFrame) !== 0 || Date.now() - lastFrameAt >= FRAME_REFRESH_MS) {
          ws.send(frame, { binary: true });
          lastFrame = frame;
          lastFrameAt = Date.now();
        }
        // Captions rolling up or fading in: keep drawing until they have settled.
        if (!animation && d.state === "recording" && (roll.animating(Date.now()) || Date.now() - shakenAt < SHAKE_MS)) {
          animation = setTimeout(() => { animation = undefined; d.refresh(); }, ANIMATION_MS);
          animation.unref();
        }
      },
    };
    return d;
  }

  async function onHello(m: Extract<DeviceToServer, { type: "hello" }>) {
    if (helloSeen) { link?.refresh(); return; }
    helloSeen = true;
    let row = auth.row;
    if (!row) {
      [row] = await db.insert(schema.devices).values({ deviceKey: auth.key, name: m.deviceId }).onConflictDoNothing().returning();
      row ??= (await db.select().from(schema.devices).where(eq(schema.devices.deviceKey, auth.key)).limit(1))[0] ?? null;
      if (!row) throw new Error("device row could not be created");
      log(`registered device ${row.id} (${m.deviceId})`);
    }
    // The row belongs to the key. Its name is what the app shows: the firmware's id when the key is first seen,
    // and from then on whatever the row has been named (e.g. "SLAP 0"), so a later hello does not rename it.
    const name = typeof m.deviceId === "string" ? m.deviceId.trim().slice(0, 64) : "";
    if (name && !row.name) {
      await db.update(schema.devices).set({ name }).where(eq(schema.devices.id, row.id));
      row = { ...row, name };
    }
    const old = sockets.get(row.id);
    if (old && old !== ws) old.close(4000, "replaced by a newer connection");
    sockets.set(row.id, ws);
    if (ws.readyState !== WebSocket.OPEN) return;
    link = makeLink(row, isLang(m.lang) ? m.lang : "en");
    // Switched on by a shake or the button: it records. Only powered up or reset: it waits for a shake.
    const start = m.wake !== "power";
    log(`hello ${m.deviceId} fw=${m.fw} -> ${row.id} online (${m.wake ?? "on"}), captions in ${link.lang}`);
    await attachDevice(link, start);
    firmwareDeviceId = m.deviceId;
    usbTargets.set(m.deviceId, { socket: ws, shake: onShake });
    touchSeen(true);
    if (pendingPress) { pendingPress = false; void onButton(); }
  }

  async function onButton() {
    if (!link) { pendingPress = helloSeen; return; }
    if (buttonBusy) return;
    if (Date.now() - lastPress < 1000) return;   // debounce double reports
    lastPress = Date.now();
    const d = link;
    buttonBusy = true;
    try {
      if (d.lectureId) await stopSession(d.lectureId);
      else await startDeviceSession(d);
    } catch (e) {
      console.error("[device] button action failed:", (e as Error).message);
      showError(d.lectureId ? "could not stop" : "could not start");
    } finally {
      buttonBusy = false;
    }
  }

  async function onShake() {
    if (!link) return;
    if (!link.lectureId) return onButton();   // not recording: a shake starts
    shakenAt = Date.now();
    link.refresh();
  }

  function onText(raw: string) {
    let m: DeviceToServer;
    try { m = JSON.parse(raw) as DeviceToServer; } catch { return; }
    switch (m.type) {
      case "hello":
        onHello(m).catch(e => {
          console.error("[device] hello failed:", (e as Error).message);
          send({ type: "state", state: "error", message: "server database unavailable" });
          if (ws.readyState === WebSocket.OPEN) ws.send(renderText(["Server error", "Retrying..."]), { binary: true });
          helloSeen = false;
        });
        break;
      case "button": void onButton(); break;
      case "lang":
        if (!link || !isLang(m.lang) || m.lang === link.lang) break;
        setDeviceLang(link, m.lang);
        bannerUntil = Date.now() + LANG_BANNER_MS;
        link.refresh();
        setTimeout(() => link?.refresh(), LANG_BANNER_MS + 20).unref();
        break;
      case "level":
        if (!link || !Number.isFinite(m.rms)) break;
        link.level = meter(m.rms);
        deviceLevelAt = Date.now();
        if (link.state === "recording") link.refresh();   // the level column follows the voice, not only the 1 s tick
        break;
      case "pong": break;
    }
  }

  ws.on("pong", () => { lastAlive = Date.now(); });
  ws.on("message", (data: RawData, isBinary: boolean) => {
    lastAlive = Date.now();
    if (!isBinary) { onText(data.toString()); return; }
    if (!link?.lectureId) return;   // not recording: audio is dropped
    const buf = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
    if (buf.length % 2 || buf.length > 4 * AUDIO_FRAME_BYTES) return;
    peak = Math.max(peak, pcmRms(buf));
    pushAudio(link.lectureId, buf);
  });
  ws.on("close", (code) => {
    if (firmwareDeviceId && usbTargets.get(firmwareDeviceId)?.socket === ws) usbTargets.delete(firmwareDeviceId);
    clearInterval(heartbeat);
    clearInterval(tick);
    clearTimeout(errorTimer);
    clearTimeout(animation);
    if (!link) return;
    if (sockets.get(link.id) === ws) sockets.delete(link.id);
    touchSeen(true);
    detachDevice(link);
    log(`${link.id} disconnected (${code})`);
  });
  ws.on("error", (e) => console.warn("[device] socket error:", e.message));
}
