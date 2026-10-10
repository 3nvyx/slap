// /ws/lecture/:lectureId/audio: browser-microphone fallback input. Anyone may stream into a live lecture.
// Binary frames are the device's format (16 kHz s16le mono, 3,200 bytes = 100 ms).
// The upgrade is always accepted so the browser can read the reason from the close code:
// 4404 no such lecture, 4410 lecture not live, 4009 another audio source (the device) is streaming.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { AUDIO_FRAME_BYTES } from "@slap/contracts";
import { WebSocket, WebSocketServer } from "ws";
import { attachBrowserAudio, detachBrowserAudio, loadLecture, pushAudio, type BrowserAudioSource } from "../sessions.ts";

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

export const AUDIO_CLOSE = { notFound: 4404, notLive: 4410, busy: 4009 } as const;

export function handleLectureAudioUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, lectureId: string): void {
  wss.handleUpgrade(req, socket, head, ws => void onConnection(ws, lectureId));
}

async function onConnection(ws: WebSocket, lectureId: string) {
  // Frames that arrive while the lecture is being loaded are dropped (no listener yet), never queued.
  try {
    const l = await loadLecture(lectureId);
    if (!l) { ws.close(AUDIO_CLOSE.notFound, "lecture not found"); return; }
    if (ws.readyState !== WebSocket.OPEN) return;
    const src: BrowserAudioSource = { close: (reason) => { if (ws.readyState === WebSocket.OPEN) ws.close(1000, reason); } };
    const r = attachBrowserAudio(l, src);
    if (r === "not-live") { ws.close(AUDIO_CLOSE.notLive, "lecture is not live"); return; }
    if (r === "busy") { ws.close(AUDIO_CLOSE.busy, "another audio source is streaming"); return; }
    console.log(`[audio] browser mic streaming into ${l.id}`);
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
