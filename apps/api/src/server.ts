// One process: Hono REST API + two ws WebSocket paths + the built web app (landing page included), from one origin.
// In-memory session state lives in sessions.ts, so run exactly one instance.
import { cpSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { startArduinoBridge } from "./arduino.ts";

const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const webDir = path.resolve(apiDir, settings.webDir);
const webClient = path.join(webDir, "build/client");
const webServerBuild = path.join(webDir, "build/server");

function backends(dbUp: boolean): Health["backends"] {
  const has = (k: string | undefined) => !!k;
  const llm = settings.llm.backend;
  return {
    stt: settings.stt.backend !== "mock" && has(settings.stt.backend === "soniox" ? settings.stt.sonioxKey : settings.stt.deepgramKey) ? "live" : "mock",
    translate: settings.translate.backend === "google" ? (has(settings.translate.googleKey) ? "live" : "down") : "mock",
    llm: llm === "mock" ? "mock" : has(llm === "claude" ? settings.llm.anthropicKey : llm === "openai" ? settings.llm.openaiKey : settings.llm.geminiKey) ? "live" : "down",
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

// The web app (apps/web, React Router), landing page included. Its built files come from build/client;
// every other address is a page, rendered here on the server by build/server through apps/web/server.ts.
// A rebuild is picked up without a restart. Before the first build, pages answer "not built".
app.use("/*", serveStatic({
  root: path.relative(process.cwd(), webClient) || ".",
  // Files under assets/ carry a hash of their contents in the name, so a browser may keep them for good.
  onFound: (file, c) => { if (file.includes("/assets/")) c.header("Cache-Control", "public, max-age=31536000, immutable"); },
}));

type PageHandler = (request: Request) => Promise<Response>;
let pages: { builtAt: number; render: PageHandler } | undefined;     // the build being served
let staged: { builtAt: number; dir: string; at: number } | undefined; // a newer build, copied and settling
let pagesTmp: string | undefined;
const SETTLE_MS = 1500;

/** Where to load the server build from. In dev (`node --watch`) a change to any imported file restarts the
 *  server, and a restart ends the live sessions. So a web rebuild must not touch a file this process has
 *  imported: each build is copied to a temporary folder outside the repo, named after its build time, and
 *  loaded from there. A link to apps/web/node_modules beside the copies lets them find React and React
 *  Router. On macOS a file written just before it is imported also counts as changed, so a copy is left to
 *  settle for SETTLE_MS before it is loaded. Copies are never deleted while running (that too would count
 *  as a change); the folder goes when the process exits. If no copy can be made, the build is loaded in place. */
function stableCopy(builtAt: number): string {
  try {
    if (!pagesTmp) {
      const dir = mkdtempSync(path.join(os.tmpdir(), "slap-pages-"));
      symlinkSync(path.join(webDir, "node_modules"), path.join(dir, "node_modules"), "dir");
      process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
      pagesTmp = dir;
    }
    const copy = path.join(pagesTmp, String(Math.round(builtAt)));
    cpSync(webServerBuild, copy, { recursive: true });
    return copy;
  } catch {
    return webServerBuild;
  }
}

async function pageHandler(): Promise<PageHandler | undefined> {
  let builtAt: number;
  try { builtAt = statSync(path.join(webServerBuild, "index.js")).mtimeMs; } catch { return pages?.render; }
  if (pages?.builtAt === builtAt) return pages.render;
  // A build still being written (under a second old) waits while the previous one keeps serving.
  if (pages && Date.now() - builtAt < 1000) return pages.render;
  if (staged?.builtAt !== builtAt) staged = { builtAt, dir: stableCopy(builtAt), at: Date.now() };
  const { dir, at } = staged;
  const wait = dir === webServerBuild ? 0 : at + SETTLE_MS - Date.now();
  if (wait > 0) {
    if (pages) return pages.render;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  if (pages?.builtAt !== builtAt) {
    const web = await import(pathToFileURL(path.join(webDir, "server.ts")).href) as { pageHandler: (build: unknown) => PageHandler };
    // The query string makes Node load a rebuilt file again instead of the one it already holds.
    const build: unknown = await import(`${pathToFileURL(path.join(dir, "index.js")).href}?built=${builtAt}`);
    pages = { builtAt, render: web.pageHandler(build) };
  }
  return pages.render;
}

app.all("*", async (c) => {
  // A missing file is a 404, not a page. ".data" is how React Router's browser side asks for a page's data.
  const ext = path.extname(c.req.path);
  if (ext && ext !== ".data") return c.text("not found", 404);
  const render = await pageHandler();
  if (!render) return c.text("web app not built (pnpm --filter @slap/web build)", 404);
  return render(c.req.raw);
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error("[api]", c.req.method, c.req.path, err);
  return c.json({ error: "internal error" }, 500);
});
app.notFound(c => c.json({ error: "not found" }, 404));

export function start(port = settings.port): Server {
  const stopArduino = startArduinoBridge();
  const server = serve({ fetch: app.fetch, port }, info => {
    console.log(`[api] listening on http://localhost:${info.port} (mode ${settings.mode}, stt ${settings.stt.backend}, translate ${settings.translate.backend}, llm ${settings.llm.backend})`);
  }) as Server;
  server.on("close", stopArduino);
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
  void pageHandler().catch(e => console.error("[api] web app:", (e as Error).message)); // copy and load the web build now, so the first page does not wait
  resumePendingJobs().then(n => { if (n) console.log(`[api] resumed ${n} pending job(s)`); }, e => console.error("[api] resume jobs:", (e as Error).message));
  return server;
}

if (import.meta.main) start();
