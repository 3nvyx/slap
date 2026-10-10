import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
const { Hono } = await import("hono");
const { requireUser, optionalUser } = await import("../auth.ts");

const app = new Hono();
app.get("/private", requireUser, c => c.json({ id: c.var.user.id }));
app.get("/maybe", optionalUser, c => c.json({ user: c.var.user }));

test("requireUser: no token -> 401", async () => {
  const res = await app.request("/private");
  assert.equal(res.status, 401);
  assert.ok(((await res.json()) as { error: string }).error);
});

test("requireUser: malformed token -> 401 (rejected before any key fetch)", async () => {
  const res = await app.request("/private", { headers: { authorization: "Bearer not-a-jwt" } });
  assert.equal(res.status, 401);
});

test("optionalUser: bogus token is treated as a guest", async () => {
  const res = await app.request("/maybe", { headers: { authorization: "Bearer not-a-jwt" } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: null });
});

test("requireUser: well-formed token signed by a foreign key -> 401", { skip: !process.env.NEON_AUTH_JWKS_URL && "no NEON_AUTH_JWKS_URL (needs the network)" }, async () => {
  const { SignJWT, generateKeyPair } = await import("jose");
  const { privateKey } = await generateKeyPair("EdDSA");
  const jwt = await new SignJWT({ email: "x@example.com" }).setProtectedHeader({ alg: "EdDSA", kid: "forged" })
    .setSubject("user-1").setIssuer(process.env.NEON_AUTH_BASE_URL ?? "x").setIssuedAt().setExpirationTime("10m").sign(privateKey);
  const res = await app.request("/private", { headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(res.status, 401);
});

test("/ws/lecture/:id/audio closes with 4401 for a missing or bogus token", async () => {
  const http = await import("node:http");
  const { default: WebSocket } = await import("ws");
  const { handleLectureAudioUpgrade, AUDIO_CLOSE } = await import("../ws/audio.ts");
  const server = http.createServer();
  server.on("upgrade", (req, sock, head) => handleLectureAudioUpgrade(req, sock, head, crypto.randomUUID()));
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const closeCode = (q: string) => new Promise<number>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/lecture/x/audio${q}`);
    ws.on("close", code => resolve(code));
  });
  try {
    assert.equal(await closeCode(""), AUDIO_CLOSE.badToken);
    assert.equal(await closeCode("?token=not-a-jwt"), AUDIO_CLOSE.badToken);
  } finally {
    server.close();
  }
});
