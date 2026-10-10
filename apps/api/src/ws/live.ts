// /ws/live/:lectureId?lang=xx: caption stream for browsers. The client sends `subscribe`
// (with `since` = last seq seen, to recover after a reconnect); the server answers with a
// `snapshot` and then streams interim/final/translation/status. Without a subscribe within
// 1.5 s the server sends a full snapshot on its own.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { LiveClientMessage } from "@slap/contracts";
import { WebSocket, WebSocketServer } from "ws";
import { normalizeLang } from "../pipeline/translate.ts";
import { settings } from "../settings.ts";
import { addViewer, loadLecture, removeViewer, setViewerLang, snapshot, statusEvent, type LiveLecture, type Viewer } from "../sessions.ts";

const AUTO_SNAPSHOT_MS = 1500;
const MAX_BUFFERED = 1024 * 1024;   // a viewer this far behind is skipped until it drains

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();

setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) { ws.terminate(); continue; }
    alive.set(ws, false);
    ws.ping();
  }
}, 20_000).unref();

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;

/** Same-origin only: the page's own host, the public URL, or (outside cloud mode) a local/LAN dev origin
 *  such as the Vite dev server, whose proxy rewrites Host. Clients without an Origin (scripts) are allowed. */
export function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  let o: URL;
  try { o = new URL(origin); } catch { return false; }
  if (host && o.host === host) return true;
  try { if (o.origin === new URL(settings.publicUrl).origin) return true; } catch { /* bad PUBLIC_URL */ }
  return settings.mode !== "cloud" && PRIVATE_HOST.test(o.hostname);
}

export function handleLiveUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, lectureId: string): void {
  if (!originAllowed(req.headers.origin, req.headers.host)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => onConnection(ws, req, lectureId));
}

function onConnection(ws: WebSocket, req: IncomingMessage, lectureId: string) {
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));
  const url = new URL(req.url ?? "/", "http://localhost");
  const viewer: Viewer = {
    lang: normalizeLang(url.searchParams.get("lang")) ?? "en",
    ready: false,
    send(ev) { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_BUFFERED) ws.send(JSON.stringify(ev)); },
  };

  const lecture: Promise<LiveLecture | null> = loadLecture(lectureId).then(l => {
    if (!l) { ws.close(4404, "lecture not found"); return null; }
    if (ws.readyState !== WebSocket.OPEN) return null;
    addViewer(l, viewer);
    return l;
  }).catch((e: unknown) => {
    console.error("[live] load failed:", (e as Error).message);
    ws.close(1011, "server error");
    return null;
  });

  const subscribe = (lang: string, since: number) => void lecture.then(l => {
    if (!l || ws.readyState !== WebSocket.OPEN) return;
    clearTimeout(auto);
    setViewerLang(l, viewer, lang);
    viewer.send(snapshot(l, since, lang));
    viewer.ready = true;
    viewer.send(statusEvent(l));
  });

  const sinceParam = Number(url.searchParams.get("since"));
  const auto = setTimeout(() => subscribe(viewer.lang, Number.isFinite(sinceParam) ? sinceParam : 0),
    url.searchParams.has("since") ? 0 : AUTO_SNAPSHOT_MS);

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let m: LiveClientMessage;
    try { m = JSON.parse(data.toString()) as LiveClientMessage; } catch { return; }
    // {type:"ping"} needs no reply: the traffic itself keeps proxies from closing the socket.
    if (m.type === "subscribe") {
      subscribe(normalizeLang(m.lang) ?? viewer.lang, typeof m.since === "number" && Number.isFinite(m.since) ? m.since : 0);
    }
  });
  ws.on("close", () => {
    clearTimeout(auto);
    void lecture.then(l => { if (l) removeViewer(l, viewer); });
  });
  ws.on("error", () => {});
}
