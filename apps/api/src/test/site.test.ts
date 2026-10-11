// What the server hands a browser: the landing page (website/) at "/" with its own files, and the web app
// (or "not built") on client routes. Through the real app; nothing is written. Skipped without DATABASE_URL,
// which server.ts needs to load.
import assert from "node:assert/strict";
import { before, test } from "node:test";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test:test@localhost");
const skip = hasDb ? false : "DATABASE_URL not set";

let app: typeof import("../server.ts")["app"];

before(async () => {
  if (!hasDb) return;
  Object.assign(process.env, { STT_BACKEND: "mock", TRANSLATE_BACKEND: "mock", LLM_BACKEND: "mock", FISH_DIARIZE: "0" });
  app = (await import("../server.ts")).app;
});

test("/ is the landing page, with its files and its links into the app", { skip }, async () => {
  const home = await app.request("/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /data-app="\/demo"/);
  assert.match(html, /data-app="\/classes"/);

  const css = await app.request("/style.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type") ?? "", /text\/css/);
});

test("client routes get the web app, not the landing page", { skip }, async () => {
  for (const p of ["/demo", "/classes"]) {
    const r = await app.request(p);
    const body = await r.text();
    if (r.status === 404) assert.match(body, /web app not built/);
    else assert.match(body, /id="root"/);
  }
  assert.equal((await app.request("/missing.png")).status, 404);
});
