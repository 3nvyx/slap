// Class routes with no sign-in: any caller reads and changes any class, and per-student state follows the
// X-Slap-User id. Also the class list, the announcements feed, the lecture-first practice pick, ask, pretest,
// replay and the vault export, over the real routes against the real database.
// Seeds a throwaway class and deletes it afterwards (cascade). Skipped without DATABASE_URL.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test:test@localhost");
const skip = hasDb ? false : "DATABASE_URL not set";

const run = Date.now().toString(36).toUpperCase();
const alice = `classtest-alice-${run}`, bob = `classtest-bob-${run}`;
const CODE = `GT${run}`.slice(0, 16);

let m: { app: typeof import("../server.ts")["app"]; db: typeof import("../db/index.ts") };
const ids = { cls: "", l1: "", l2: "", concept: "", q1: "", q2: "", q3: "" };

before(async () => {
  if (!hasDb) return;
  Object.assign(process.env, { STT_BACKEND: "mock", TRANSLATE_BACKEND: "mock", LLM_BACKEND: "mock", FISH_DIARIZE: "0" });

  const [server, db] = await Promise.all([import("../server.ts"), import("../db/index.ts")]);
  m = { app: server.app, db };
  const { db: d, schema: s } = db;
  const [c] = await d.insert(s.classes).values({ name: `Class test (throwaway)`, code: CODE, ownerUserId: alice }).returning();
  ids.cls = c!.id;
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
  await d.insert(s.documents).values({ classId: ids.cls, kind: "syllabus", title: "Syllabus", parsed: {
    title: null, exams: [], deadlines: [],
    weeks: [{ week: 1, topics: ["Intro"], date: null }, { week: 2, topics: ["Gradient descent"], date: null }, { week: 3, topics: ["Learning rate", "Momentum"], date: null }],
  } });
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
});

async function call<T = any>(user: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await m.app.request(path, {
    method,
    headers: { ...(user ? { "x-slap-user": user } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: (await res.json()) as T };
}

test("the class list has every class; join and the public lecture need nothing", { skip }, async () => {
  const list = await call(null, "GET", "/api/classes");
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.find((c: any) => c.id === ids.cls), { id: ids.cls, name: "Class test (throwaway)", code: CODE, description: null, instructor: null, term: null, lectureCount: 2, nextExam: null });
  const join = await call(null, "GET", `/api/join/${CODE}`);
  assert.equal(join.status, 200);
  assert.deepEqual(join.data, { classId: ids.cls, className: "Class test (throwaway)", lectureId: null, live: false });
  const pub = await call(null, "GET", `/api/lectures/${ids.l1}/public`);
  assert.equal(pub.data.classId, ids.cls);
});

test("any caller, with or without an id, reads the class, lectures, concepts, graph, exam topics and announcements", { skip }, async () => {
  for (const who of [null, alice, bob]) {
    const cls = await call(who, "GET", `/api/classes/${ids.cls}`);
    assert.equal(cls.status, 200, `class for ${who ?? "no id"}`);
    assert.deepEqual(cls.data.class, { id: ids.cls, name: "Class test (throwaway)", code: CODE, description: null, instructor: null, term: null, lectureCount: 2, nextExam: null });
    assert.equal(cls.data.lectures.length, 2);
    assert.equal(cls.data.live, null);

    const lec = await call(who, "GET", `/api/lectures/${ids.l1}`);
    assert.equal(lec.status, 200);
    assert.equal(lec.data.lecture.title, "Lecture 1");
    assert.equal(lec.data.announcements.length, 2);

    const concepts = await call(who, "GET", `/api/classes/${ids.cls}/concepts`);
    assert.equal(concepts.status, 200);
    assert.equal(concepts.data[0].mastery, null, "nothing answered yet");

    assert.equal((await call(who, "GET", `/api/classes/${ids.cls}/graph`)).status, 200);
    const one = await call(who, "GET", `/api/concepts/${ids.concept}`);
    assert.equal(one.status, 200);
    assert.equal(one.data.questionCount, 3);
    assert.equal((await call(who, "GET", `/api/classes/${ids.cls}/exam-topics`)).status, 200);
    assert.equal((await call(who, "GET", `/api/classes/${ids.cls}/today`)).status, 200);
    assert.equal((await call(who, "GET", `/api/classes/${ids.cls}/review/due`)).status, 200);

    // Bundle status: 404 because none was run.
    assert.equal((await call(who, "GET", `/api/lectures/${ids.l1}/bundle`)).status, 404);
  }
  const unknown = crypto.randomUUID();
  for (const path of [`/api/classes/${unknown}`, `/api/classes/${unknown}/concepts`, `/api/classes/${unknown}/today`, `/api/classes/${unknown}/announcements`])
    assert.equal((await call(alice, "GET", path)).status, 404, path);
  assert.equal((await call(alice, "POST", `/api/classes/${unknown}/sessions/start`)).status, 404);
});

test("study state follows the X-Slap-User id: one caller's attempts do not show up for another", { skip }, async () => {
  const a = await call(alice, "POST", `/api/questions/${ids.q1}/attempt`, { answer: "a" });
  assert.equal(a.status, 200);
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  const rows = await db.select({ userId: schema.attempts.userId }).from(schema.attempts).where(eq(schema.attempts.questionId, ids.q1));
  assert.deepEqual(rows.map(r => r.userId), [alice]);
  assert.notEqual((await call(alice, "GET", `/api/classes/${ids.cls}/mastery`)).data[ids.concept], undefined, "alice has a mastery signal");
  assert.equal((await call(bob, "GET", `/api/classes/${ids.cls}/mastery`)).data[ids.concept], undefined, "bob has none");
  assert.equal((await call(null, "GET", `/api/classes/${ids.cls}/mastery`)).data[ids.concept], undefined, "callers without an id share one, which has none");
  await db.delete(schema.attempts).where(eq(schema.attempts.questionId, ids.q1));
});

test("creating a class needs no sign-in; a taken code is refused", { skip }, async () => {
  const code = `GN${run}`.slice(0, 16);
  const r = await call(bob, "POST", "/api/classes", { name: "Made by bob (throwaway)", code: code.toLowerCase() });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  try {   // every assertion after the insert sits inside, so a failure cannot leave the class behind
    assert.deepEqual(r.data, { id: r.data.id, name: "Made by bob (throwaway)", code, description: null, instructor: null, term: null, lectureCount: 0, nextExam: null });
    assert.equal((await call(alice, "POST", "/api/classes", { name: "Again", code })).status, 409);
    assert.equal((await call(alice, "GET", `/api/classes/${r.data.id}`)).status, 200, "another caller opens it");
  } finally {
    const { eq } = await import("drizzle-orm");
    await m.db.db.delete(m.db.schema.classes).where(eq(m.db.schema.classes.id, r.data.id));
  }
});

test("vault export: a zip of the notes with the concept and lecture files", { skip }, async () => {
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
  assert.ok(text.includes("Class test (throwaway).md"), "index note");
  assert.ok(text.includes("- **deadline** (2099-01-15): Problem set 2"), "announcements in the lecture note");
});

test("announcements feed: dated ones first in date order, each with its lecture", { skip }, async () => {
  const r = await call(null, "GET", `/api/classes/${ids.cls}/announcements`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.map((a: any) => [a.text, a.lectureTitle]), [["Midterm", "Lecture 2"], ["Problem set 2", "Lecture 1"], ["Slides are online", "Lecture 1"]]);
  assert.equal(r.data[0].lectureId, ids.l2);
  assert.equal(r.data[0].lectureDate, "2026-10-08");
});

test("practice ?lectureId puts that lecture's questions first; ?conceptId still wins over it", { skip }, async () => {
  const l2 = await call(alice, "GET", `/api/classes/${ids.cls}/practice?n=2&lectureId=${ids.l2}`);
  assert.equal(l2.status, 200);
  assert.deepEqual(new Set(l2.data.map((q: any) => q.id)), new Set([ids.q2, ids.q3]));
  const l1 = await call(alice, "GET", `/api/classes/${ids.cls}/practice?n=3&lectureId=${ids.l1}`);
  assert.equal(l1.data[0].id, ids.q1);
  assert.equal(l1.data.length, 3, "fills up from the rest of the class");
  assert.equal((await call(alice, "GET", `/api/classes/${ids.cls}/practice?lectureId=nope`)).status, 400);
});

test("ask the lecture: answers cite the transcript's segments; empty transcript says so", { skip }, async () => {
  assert.equal((await call(alice, "POST", `/api/lectures/${ids.l1}/ask`, { question: "x" })).status, 400);
  const a = await call(alice, "POST", `/api/lectures/${ids.l1}/ask`, { question: "What does gradient descent do?" });
  assert.equal(a.status, 200);
  assert.equal(a.data.notInLecture, false);
  assert.ok(a.data.answer.includes("Gradient descent takes a step"));
  assert.ok(a.data.citations.length >= 1 && typeof a.data.citations[0].segmentId === "number" && a.data.citations[0].excerpt.length > 0);
  const empty = await call(alice, "POST", `/api/lectures/${ids.l2}/ask`, { question: "Anything?" });
  assert.equal(empty.data.notInLecture, true);
  assert.equal(empty.data.citations.length, 0);
});

test("pretest: the week after the lectures held, graded attempts, regenerate", { skip }, async () => {
  const r = await call(alice, "GET", `/api/classes/${ids.cls}/pretest`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.week, { week: 3, topics: ["Learning rate", "Momentum"], date: null }, "two lectures held → week 3");
  assert.equal(r.data.questions.length, 3);
  assert.ok(r.data.questions.every((q: any) => !("answer" in q)), "answers are not sent");
  const again = await call(alice, "GET", `/api/classes/${ids.cls}/pretest`);
  assert.deepEqual(again.data.questions.map((q: any) => q.id), r.data.questions.map((q: any) => q.id), "cached for the day");

  const q = r.data.questions[0];
  const a = await call(alice, "POST", `/api/classes/${ids.cls}/pretest/${q.id}/attempt`, { answer: "no idea" });
  assert.equal(a.status, 200);
  assert.equal(typeof a.data.correct, "boolean");
  assert.ok(a.data.feedback.length > 0);
  assert.equal((await call(alice, "POST", `/api/classes/${ids.cls}/pretest/${crypto.randomUUID()}/attempt`, { answer: "x" })).status, 404);

  const fresh = await call(alice, "POST", `/api/classes/${ids.cls}/pretest`);
  assert.equal(fresh.status, 200);
  assert.notDeepEqual(fresh.data.questions.map((q: any) => q.id), r.data.questions.map((q: any) => q.id), "regenerated");
});

test("replay route: the replay is the class's live lecture, public and stoppable by its own id", { skip }, async () => {
  assert.equal((await call(alice, "POST", `/api/lectures/${ids.l2}/replay`, { speed: 10 })).status, 400, "no transcript");
  assert.equal((await call(alice, "POST", `/api/lectures/${ids.l1}/replay`, { from: 5 })).status, 400, "empty window");

  const r = await call(alice, "POST", `/api/lectures/${ids.l1}/replay`, { speed: 0.25 });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "live");
  assert.equal(r.data.title, "Replay · Lecture 1");
  assert.notEqual(r.data.id, ids.l1);
  const replayId: string = r.data.id;

  assert.equal((await call(alice, "POST", `/api/lectures/${ids.l1}/replay`)).status, 409, "one replay per class");
  const join = await call(null, "GET", `/api/join/${CODE}`);
  assert.equal(join.data.live, true);
  assert.equal(join.data.lectureId, replayId);
  const pub = await call(null, "GET", `/api/lectures/${replayId}/public`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.replay, true);
  assert.equal(pub.data.title, "Replay · Lecture 1");
  const cls = await call(alice, "GET", `/api/classes/${ids.cls}`);
  assert.equal(cls.data.live?.lectureId, replayId);
  assert.equal(cls.data.live?.replay, true);
  assert.equal(cls.data.lectures.length, 2, "a replay adds no lecture row");

  const stop = await call(bob, "POST", `/api/lectures/${replayId}/stop`);
  assert.equal(stop.status, 200);
  assert.equal(stop.data.status, "ended");
  assert.equal((await call(null, "GET", `/api/join/${CODE}`)).data.live, false);
});
