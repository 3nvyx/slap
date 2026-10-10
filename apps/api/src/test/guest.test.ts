// Guest access (read-only class browsing without an account), the owner switch for it, the class
// announcements feed and the lecture-first practice pick, over the real routes against the real database.
// Signed in with JWTs from a local JWKS; seeds a throwaway class and deletes it afterwards (cascade).
// Skipped without DATABASE_URL.
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test:test@localhost");
const skip = hasDb ? false : "DATABASE_URL not set";

const run = Date.now().toString(36).toUpperCase();
const owner = `guesttest-owner-${run}`, stranger = `guesttest-stranger-${run}`;

let jwksServer: http.Server;
let sign: (sub: string) => Promise<string>;
let m: { app: typeof import("../server.ts")["app"]; db: typeof import("../db/index.ts") };
const ids = { cls: "", l1: "", l2: "", concept: "", q1: "", q2: "", q3: "" };

before(async () => {
  if (!hasDb) return;
  const jose = await import("jose");
  const { publicKey, privateKey } = await jose.generateKeyPair("EdDSA", { extractable: true });
  const jwk = { ...(await jose.exportJWK(publicKey)), kid: "guesttest", alg: "EdDSA", use: "sig" };
  jwksServer = http.createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>(r => jwksServer.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}`;
  Object.assign(process.env, { NEON_AUTH_BASE_URL: `${base}/auth`, NEON_AUTH_JWKS_URL: `${base}/jwks`, STT_BACKEND: "mock", TRANSLATE_BACKEND: "mock", LLM_BACKEND: "mock", FISH_DIARIZE: "0" });
  sign = (sub) => new jose.SignJWT({ email: `${sub}@example.com` }).setProtectedHeader({ alg: "EdDSA", kid: "guesttest" })
    .setSubject(sub).setIssuer(`${base}/auth`).setIssuedAt().setExpirationTime("10m").sign(privateKey);

  const [server, db] = await Promise.all([import("../server.ts"), import("../db/index.ts")]);
  m = { app: server.app, db };
  const { db: d, schema: s } = db;
  const [c] = await d.insert(s.classes).values({ name: `Guest test (throwaway)`, code: `GT${run}`.slice(0, 16), ownerUserId: owner }).returning();
  ids.cls = c!.id;
  await d.insert(s.enrollments).values({ userId: owner, classId: ids.cls, role: "owner" });
  const [l1, l2] = await d.insert(s.lectures).values([
    { classId: ids.cls, title: "Lecture 1", date: "2026-10-01", status: "ready", source: "import", endedAt: new Date() },
    { classId: ids.cls, title: "Lecture 2", date: "2026-10-08", status: "ready", source: "import", endedAt: new Date() },
  ]).returning();
  ids.l1 = l1!.id; ids.l2 = l2!.id;
  await d.insert(s.segments).values([
    { lectureId: ids.l1, idx: 0, startS: 0, endS: 1, text: "Gradient descent takes a step." },
    { lectureId: ids.l1, idx: 1, startS: 1.2, endS: 2, text: "Against the gradient." },
  ]);
  await d.insert(s.outlines).values([
    { lectureId: ids.l1, summary: "s", sections: [], announcements: [{ kind: "other", text: "Slides are online", when: null }, { kind: "deadline", text: "Problem set 2", when: "2099-01-15" }] },
    { lectureId: ids.l2, summary: "s", sections: [], announcements: [{ kind: "exam", text: "Midterm", when: "2099-01-02" }] },
  ]);
  const [k] = await d.insert(s.concepts).values({ classId: ids.cls, slug: "gradient-descent", name: "Gradient descent", definition: "Iterative optimisation.", emphasis: 0.8 }).returning();
  ids.concept = k!.id;
  const q = (lectureId: string, prompt: string) => ({ classId: ids.cls, lectureId, conceptId: ids.concept, kind: "short" as const, prompt, answer: "a", explanation: "" });
  const [q1, q2, q3] = await d.insert(s.questions).values([q(ids.l1, "Q1 from lecture 1"), q(ids.l2, "Q2 from lecture 2"), q(ids.l2, "Q3 from lecture 2")]).returning();
  ids.q1 = q1!.id; ids.q2 = q2!.id; ids.q3 = q3!.id;
});

after(async () => {
  if (!hasDb || !m) return;
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  if (ids.cls) await db.delete(schema.classes).where(eq(schema.classes.id, ids.cls));
  jwksServer?.close();
});

async function call<T = any>(user: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await m.app.request(path, {
    method,
    headers: { ...(user ? { authorization: `Bearer ${await sign(user)}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: (await res.json()) as T };
}

test("without guest access, anonymous reads are 401 and a signed-in non-member is 403", { skip }, async () => {
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}`)).status, 401);
  assert.equal((await call(null, "GET", `/api/lectures/${ids.l1}`)).status, 401);
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}/graph`)).status, 401);
  assert.equal((await call(stranger, "GET", `/api/classes/${ids.cls}`)).status, 403);
  // Only the owner can flip the switch.
  assert.equal((await call(stranger, "POST", `/api/classes/${ids.cls}/guest-access`, { enabled: true })).status, 403);
  assert.equal((await call(null, "POST", `/api/classes/${ids.cls}/guest-access`, { enabled: true })).status, 401);
});

test("the owner turns guest access on; the class summary reports it", { skip }, async () => {
  const r = await call(owner, "POST", `/api/classes/${ids.cls}/guest-access`, { enabled: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.guestAccess, true);
  assert.equal(r.data.role, "owner");
  const me = await call(owner, "GET", "/api/me");
  assert.equal(me.data.classes.find((c: any) => c.id === ids.cls)?.guestAccess, true);
  const join = await call(null, "GET", `/api/join/${`GT${run}`.slice(0, 16)}`);
  assert.equal(join.status, 200);
  assert.equal(join.data.guestAccess, true);
  const pub = await call(null, "GET", `/api/lectures/${ids.l1}/public`);
  assert.equal(pub.data.classId, ids.cls);
  assert.equal(pub.data.guestAccess, true);
});

test("guests (anonymous or non-member) read the class, lectures, concepts, graph, exam topics and announcements as role guest", { skip }, async () => {
  for (const who of [null, stranger]) {
    const cls = await call(who, "GET", `/api/classes/${ids.cls}`);
    assert.equal(cls.status, 200, `class for ${who ?? "anonymous"}`);
    assert.equal(cls.data.class.role, "guest");
    assert.equal(cls.data.class.guestAccess, true);
    assert.equal(cls.data.lectures.length, 2);
    assert.equal(cls.data.live, null);

    const lec = await call(who, "GET", `/api/lectures/${ids.l1}`);
    assert.equal(lec.status, 200);
    assert.equal(lec.data.lecture.title, "Lecture 1");
    assert.equal(lec.data.announcements.length, 2);

    const concepts = await call(who, "GET", `/api/classes/${ids.cls}/concepts`);
    assert.equal(concepts.status, 200);
    assert.equal(concepts.data[0].mastery, null, "guests have no mastery");

    assert.equal((await call(who, "GET", `/api/classes/${ids.cls}/graph`)).status, 200);
    const one = await call(who, "GET", `/api/concepts/${ids.concept}`);
    assert.equal(one.status, 200);
    assert.equal(one.data.concept.mastery, null);
    assert.equal(one.data.questionCount, 3);

    const topics = await call(who, "GET", `/api/classes/${ids.cls}/exam-topics`);
    assert.equal(topics.status, 200);
    assert.equal(topics.data[0].mastery, null);

    // Bundle status: readable (404 because none was run, not 401/403).
    assert.equal((await call(who, "GET", `/api/lectures/${ids.l1}/bundle`)).status, 404);
  }
});

test("vault export: a zip of the notes, readable by guests, with the concept and lecture files", { skip }, async () => {
  const res = await m.app.request(`/api/classes/${ids.cls}/export`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/zip");
  assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="GT.*-vault\.zip"/);
  const zip = Buffer.from(await res.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  const text = zip.toString("utf8");
  assert.ok(text.includes("Concepts/Gradient descent.md"), "concept note");
  assert.ok(text.includes("Lectures/2026-10-01 Lecture 1.md") && text.includes("Lectures/2026-10-08 Lecture 2.md"), "lecture notes");
  assert.ok(text.includes("Guest test (throwaway).md"), "index note");
  assert.ok(text.includes("- **deadline** (2099-01-15): Problem set 2"), "announcements in the lecture note");
  const asStranger = await m.app.request(`/api/classes/${ids.cls}/export`, { headers: { authorization: `Bearer ${await sign(stranger)}` } });
  assert.equal(asStranger.status, 200, "signed-in non-member of a guest class");
});

test("per-student routes stay closed to guests", { skip }, async () => {
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}/practice`)).status, 401);
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}/review/due`)).status, 401);
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}/today`)).status, 401);
  assert.equal((await call(null, "POST", `/api/questions/${ids.q1}/attempt`, { answer: "x" })).status, 401);
  assert.equal((await call(null, "POST", `/api/lectures/${ids.l1}/recall`, { text: "x" })).status, 401);
  assert.equal((await call(stranger, "GET", `/api/classes/${ids.cls}/practice`)).status, 403);
  assert.equal((await call(stranger, "GET", `/api/classes/${ids.cls}/today`)).status, 403);
  assert.equal((await call(stranger, "POST", `/api/classes/${ids.cls}/sessions/start`)).status, 403);
});

test("announcements feed: dated ones first in date order, each with its lecture", { skip }, async () => {
  const r = await call(null, "GET", `/api/classes/${ids.cls}/announcements`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((a: any) => [a.text, a.lectureTitle]), [["Midterm", "Lecture 2"], ["Problem set 2", "Lecture 1"], ["Slides are online", "Lecture 1"]]);
  assert.equal(r.data[0].lectureId, ids.l2);
  assert.equal(r.data[0].lectureDate, "2026-10-08");
});

test("practice ?lectureId puts that lecture's questions first; ?conceptId still wins over it", { skip }, async () => {
  const l2 = await call(owner, "GET", `/api/classes/${ids.cls}/practice?n=2&lectureId=${ids.l2}`);
  assert.equal(l2.status, 200);
  assert.deepEqual(new Set(l2.data.map((q: any) => q.id)), new Set([ids.q2, ids.q3]));
  const l1 = await call(owner, "GET", `/api/classes/${ids.cls}/practice?n=3&lectureId=${ids.l1}`);
  assert.equal(l1.data[0].id, ids.q1);
  assert.equal(l1.data.length, 3, "fills up from the rest of the class");
  assert.equal((await call(owner, "GET", `/api/classes/${ids.cls}/practice?lectureId=nope`)).status, 400);
});

test("replay route: owner only; the replay is the class's live lecture, public and stoppable by its own id", { skip }, async () => {
  assert.equal((await call(stranger, "POST", `/api/lectures/${ids.l1}/replay`, { speed: 10 })).status, 403);
  assert.equal((await call(owner, "POST", `/api/lectures/${ids.l2}/replay`, { speed: 10 })).status, 400, "no transcript");
  assert.equal((await call(owner, "POST", `/api/lectures/${ids.l1}/replay`, { from: 5 })).status, 400, "empty window");

  const r = await call(owner, "POST", `/api/lectures/${ids.l1}/replay`, { speed: 0.25 });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "live");
  assert.equal(r.data.title, "Replay · Lecture 1");
  assert.notEqual(r.data.id, ids.l1);
  const replayId: string = r.data.id;

  assert.equal((await call(owner, "POST", `/api/lectures/${ids.l1}/replay`)).status, 409, "one replay per class");
  const join = await call(null, "GET", `/api/join/${`GT${run}`.slice(0, 16)}`);
  assert.equal(join.data.live, true);
  assert.equal(join.data.lectureId, replayId);
  const pub = await call(null, "GET", `/api/lectures/${replayId}/public`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.replay, true);
  assert.equal(pub.data.title, "Replay · Lecture 1");
  const cls = await call(owner, "GET", `/api/classes/${ids.cls}`);
  assert.equal(cls.data.live?.lectureId, replayId);
  assert.equal(cls.data.live?.replay, true);
  assert.equal(cls.data.lectures.length, 2, "a replay adds no lecture row");

  assert.equal((await call(stranger, "POST", `/api/lectures/${replayId}/stop`)).status, 403);
  const stop = await call(owner, "POST", `/api/lectures/${replayId}/stop`);
  assert.equal(stop.status, 200);
  assert.equal(stop.data.status, "ended");
  assert.equal((await call(null, "GET", `/api/join/${`GT${run}`.slice(0, 16)}`)).data.live, false);
});

test("turning guest access off closes the class again", { skip }, async () => {
  const r = await call(owner, "POST", `/api/classes/${ids.cls}/guest-access`, { enabled: false });
  assert.equal(r.data.guestAccess, false);
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}`)).status, 401);
  assert.equal((await call(stranger, "GET", `/api/classes/${ids.cls}/announcements`)).status, 403);
  assert.equal((await call(owner, "GET", `/api/classes/${ids.cls}`)).status, 200);
});
