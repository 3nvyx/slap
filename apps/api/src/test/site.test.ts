// What the server hands a browser: the web app's pages, rendered on the server (the landing page at "/"),
// or "not built" before the first `pnpm --filter @slap/web build`. Through the real app; nothing is written.
// Skipped without DATABASE_URL, which server.ts needs to load.
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

test("/ is the landing page, with its links into the app", { skip }, async () => {
  const home = await app.request("/");
  const html = await home.text();
  if (home.status === 404) return assert.match(html, /web app not built/);
  assert.equal(home.status, 200);
  assert.match(html, /What is Slap\?/);
  assert.match(html, /href="\/demo"/);
  assert.match(html, /href="\/home"/);
});

test("app pages are rendered on the server; a missing file is a 404", { skip }, async () => {
  for (const p of ["/demo", "/home", "/courses"]) {
    const r = await app.request(p);
    const body = await r.text();
    if (r.status === 404) assert.match(body, /web app not built/);
    else {
      assert.equal(r.status, 200);
      assert.match(body, /<html lang="en">/);
    }
  }
  assert.equal((await app.request("/missing.png")).status, 404);
  assert.equal((await app.request("/api/nope")).status, 404);
});
