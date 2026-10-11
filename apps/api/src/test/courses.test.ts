// Course details and hand-entered dates over the real routes against the real database: a class created with
// details, changed by PATCH, exam/quiz/assignment dates that feed "next exam", and the study plan that is
// written from them (mock model) and kept in `study_plans`.
// Seeds a throwaway class and deletes it afterwards (cascade). Skipped without DATABASE_URL.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test:test@localhost");
const skip = hasDb ? false : "DATABASE_URL not set";

const CODE = `CT${Date.now().toString(36).toUpperCase()}`.slice(0, 16);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

let m: { app: typeof import("../server.ts")["app"]; db: typeof import("../db/index.ts") };
let classId = "";

const json = (method: string, path: string, body?: unknown) =>
  m.app.request(path, { method, headers: { "content-type": "application/json", "x-slap-user": "coursetest-user" }, ...(body ? { body: JSON.stringify(body) } : {}) });

before(async () => {
  if (!hasDb) return;
  Object.assign(process.env, { STT_BACKEND: "mock", TRANSLATE_BACKEND: "mock", LLM_BACKEND: "mock", FISH_DIARIZE: "0" });
  const [server, db] = await Promise.all([import("../server.ts"), import("../db/index.ts")]);
  m = { app: server.app, db };
});

after(async () => {
  if (!hasDb || !classId) return;
  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
});

test("a class keeps its details, and PATCH changes or clears them", { skip }, async () => {
  const made = await json("POST", "/api/classes", { name: "Course test (throwaway)", code: CODE, description: "A test course.", term: "Autumn 2026" });
  assert.equal(made.status, 201);
  const cls = await made.json() as { id: string; description: string | null; instructor: string | null; term: string | null };
  classId = cls.id;
  assert.deepEqual([cls.description, cls.instructor, cls.term], ["A test course.", null, "Autumn 2026"]);

  const patched = await (await json("PATCH", `/api/classes/${classId}`, { instructor: "Ada", term: "" })).json() as typeof cls;
  assert.deepEqual([patched.description, patched.instructor, patched.term], ["A test course.", "Ada", null]);
});

test("exam and quiz dates are listed in order and set the next exam; assignments do not", { skip }, async () => {
  const bad = await json("POST", `/api/classes/${classId}/assessments`, { kind: "exam", name: "Final", date: "next week" });
  assert.equal(bad.status, 400);

  for (const a of [
    { kind: "exam", name: "Midterm", date: day(20), topics: ["GLMs"] },
    { kind: "assignment", name: "Problem set 1", date: day(3) },
    { kind: "quiz", name: "Quiz 1", date: day(7) },
  ]) assert.equal((await json("POST", `/api/classes/${classId}/assessments`, a)).status, 201);

  const list = await (await json("GET", `/api/classes/${classId}/assessments`)).json() as Array<{ id: string; name: string; topics: string[] }>;
  assert.deepEqual(list.map(a => a.name), ["Problem set 1", "Quiz 1", "Midterm"]);
  assert.deepEqual(list[2]!.topics, ["GLMs"]);

  const detail = await (await json("GET", `/api/classes/${classId}`)).json() as { nextExam: { name: string; date: string } | null };
  assert.deepEqual(detail.nextExam, { name: "Quiz 1", date: day(7) });

  const quiz = list.find(a => a.name === "Quiz 1")!;
  assert.equal((await json("DELETE", `/api/assessments/${quiz.id}`)).status, 200);
  assert.equal((await json("DELETE", `/api/assessments/${quiz.id}`)).status, 404);
  const after = await (await json("GET", `/api/classes/${classId}`)).json() as typeof detail;
  assert.equal(after.nextExam?.name, "Midterm");
});

test("the study plan works back from a hand-entered exam and is kept across a restart", { skip }, async () => {
  const first = await (await json("GET", `/api/classes/${classId}/study-plan`)).json() as { generatedAt: string; nextExam: { name: string; daysLeft: number } | null; days: unknown[] };
  assert.equal(first.nextExam?.name, "Midterm");
  assert.equal(first.days.length, 21);   // through the exam, capped at three weeks

  // What a restart leaves: no memory, the saved row.
  (await import("../pipeline/studyPlan.ts")).clearStudyPlanCache();
  const again = await (await json("GET", `/api/classes/${classId}/study-plan`)).json() as typeof first;
  assert.equal(again.generatedAt, first.generatedAt);

  const { db, schema } = m.db;
  const { eq } = await import("drizzle-orm");
  const rows = await db.select({ userId: schema.studyPlans.userId }).from(schema.studyPlans).where(eq(schema.studyPlans.classId, classId));
  assert.deepEqual(rows, [{ userId: "coursetest-user" }]);
});
