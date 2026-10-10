// One process: Hono REST API + two ws WebSocket paths + the built web app, from one origin.
// In-memory session state lives in sessions.ts, so run exactly one instance.
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Health } from "@slap/contracts";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "./db/index.ts";
import { resumePendingJobs } from "./pipeline/bundle.ts";
import { routes } from "./routes/index.ts";
import { settings } from "./settings.ts";
import { handleDeviceUpgrade } from "./ws/device.ts";
import { handleLectureAudioUpgrade } from "./ws/audio.ts";
import { handleLiveUpgrade } from "./ws/live.ts";

const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webDist = path.resolve(apiDir, settings.webDist);

function backends(dbUp: boolean): Health["backends"] {
  const has = (k: string | undefined) => !!k;
  const llm = settings.llm.backend;
  return {
    stt: settings.stt.backend === "deepgram" && has(settings.stt.deepgramKey) ? "live" : "mock",
    translate: settings.translate.backend === "google" ? (has(settings.translate.googleKey) ? "live" : "down") : "mock",
    llm: llm === "mock" ? "mock" : has(llm === "claude" ? settings.llm.anthropicKey : llm === "openai" ? settings.llm.openaiKey : settings.llm.geminiKey) ? "live" : "down",
    auth: has(settings.auth.jwksUrl) && has(settings.auth.baseUrl) ? "live" : "down",
    db: dbUp ? "live" : "down",
  };
}

export const app = new Hono();

app.get("/api/health", c => c.json({ ok: true }));
app.get("/api/health/ready", async (c) => {
  const t0 = performance.now();
  let dbUp = true;
  try { await db.execute(sql`select 1`); } catch { dbUp = false; }
  const body: Health & { dbMs: number } = { ok: dbUp, mode: settings.mode, backends: backends(dbUp), dbMs: Math.round(performance.now() - t0) };
  return c.json(body, dbUp ? 200 : 503);
});
// Aliases for container health checks (docs/architecture.md).
app.get("/health", c => c.json({ ok: true }));
app.get("/health/ready", c => app.fetch(new Request(new URL("/api/health/ready", c.req.url))));

app.route("/api", routes);
app.all("/api/*", c => c.json({ error: "not found" }, 404));
app.all("/ws/*", c => c.json({ error: "WebSocket upgrade required" }, 426));

// Built web app, then SPA fallback for client routes (paths without a file extension).
app.use("/*", serveStatic({ root: path.relative(process.cwd(), webDist) || "." }));
app.get("*", (c) => {
  if (path.extname(c.req.path)) return c.text("not found", 404);
  const index = path.join(webDist, "index.html");
  if (!existsSync(index)) return c.text("web app not built (pnpm --filter @slap/web build)", 404);
  return c.html(readFileSync(index, "utf8"));
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error("[api]", c.req.method, c.req.path, err);
  return c.json({ error: "internal error" }, 500);
});
app.notFound(c => c.json({ error: "not found" }, 404));

export function start(port = settings.port): Server {
  const server = serve({ fetch: app.fetch, port }, info => {
    console.log(`[api] listening on http://localhost:${info.port} (mode ${settings.mode}, stt ${settings.stt.backend}, translate ${settings.translate.backend}, llm ${settings.llm.backend})`);
  }) as Server;
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/ws/device") {
      handleDeviceUpgrade(req, socket, head).catch(() => socket.destroy());
      return;
    }
    const m = /^\/ws\/live\/([^/]+)\/?$/.exec(pathname);
    if (m) { handleLiveUpgrade(req, socket, head, decodeURIComponent(m[1]!)); return; }
    const a = /^\/ws\/lecture\/([^/]+)\/audio\/?$/.exec(pathname);
    if (a) { handleLectureAudioUpgrade(req, socket, head, decodeURIComponent(a[1]!)); return; }
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  server.on("error", (e) => { console.error("[api] server error:", e.message); process.exit(1); });
  resumePendingJobs().then(n => { if (n) console.log(`[api] resumed ${n} pending job(s)`); }, e => console.error("[api] resume jobs:", (e as Error).message));
  return server;
}

if (import.meta.main) start();
