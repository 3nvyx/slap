// /ws/lecture/:lectureId/audio?token=<Neon Auth JWT>: browser-microphone fallback input.
// Browsers cannot set headers on a WebSocket, so the token travels in the query string.
// Binary frames are the device's format (16 kHz s16le mono, 3,200 bytes = 100 ms).
// The upgrade is always accepted so the browser can read the reason from the close code:
// 4401 bad/missing token, 4403 not the class owner, 4404 no such lecture, 4410 lecture not live,
// 4009 another audio source (the device) is streaming.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { AUDIO_FRAME_BYTES } from "@slap/contracts";
import { WebSocket, WebSocketServer } from "ws";
import { classRole, verifyToken, type AuthUser } from "../auth.ts";
import { attachBrowserAudio, detachBrowserAudio, loadLecture, pushAudio, type BrowserAudioSource } from "../sessions.ts";

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

export const AUDIO_CLOSE = { badToken: 4401, notOwner: 4403, notFound: 4404, notLive: 4410, busy: 4009 } as const;

export function handleLectureAudioUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, lectureId: string): void {
  wss.handleUpgrade(req, socket, head, ws => void onConnection(ws, req, lectureId));
}

async function onConnection(ws: WebSocket, req: IncomingMessage, lectureId: string) {
  // Frames that arrive while the token is being checked are dropped (no listener yet), never queued.
  const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token");
  let user: AuthUser;
  try {
    if (!token) throw new Error("missing token");
    user = await verifyToken(token);
  } catch {
    ws.close(AUDIO_CLOSE.badToken, "invalid or missing token");
    return;
  }
  try {
    const l = await loadLecture(lectureId);
    if (!l) { ws.close(AUDIO_CLOSE.notFound, "lecture not found"); return; }
    if ((await classRole(user.id, l.classId)) !== "owner") { ws.close(AUDIO_CLOSE.notOwner, "only the class owner can stream audio"); return; }
    if (ws.readyState !== WebSocket.OPEN) return;
    const src: BrowserAudioSource = { close: (reason) => { if (ws.readyState === WebSocket.OPEN) ws.close(1000, reason); } };
    const r = attachBrowserAudio(l, src);
    if (r === "not-live") { ws.close(AUDIO_CLOSE.notLive, "lecture is not live"); return; }
    if (r === "busy") { ws.close(AUDIO_CLOSE.busy, "another audio source is streaming"); return; }
    console.log(`[audio] browser mic streaming into ${l.id} (user ${user.id})`);
    ws.on("message", (data, isBinary) => {
      if (!isBinary) return;
      const buf = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
      if (buf.length % 2 || buf.length > 4 * AUDIO_FRAME_BYTES) return;
      pushAudio(l.id, buf);
    });
    ws.on("close", () => detachBrowserAudio(l, src));
  } catch (e) {
    console.error("[audio] setup failed:", (e as Error).message);
    ws.close(1011, "server error");
  }
}
