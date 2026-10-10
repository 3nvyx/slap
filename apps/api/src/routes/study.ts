/**
 * Study routes (docs/api.md "Study"): study bundle status/re-run, FSRS review,
 * practice + grading, recall check, exam topics, Today page, the model-written study
 * plan, mastery, and course document upload. Mounted by routes/index.ts under /api, so paths here are relative
 * to /api. Every route needs a signed-in class member; re-running a bundle and
 * uploading documents need the class owner. Errors are { error } via HTTPException.
 */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { optionalUser, requireClassRole, requireUser, type MaybeUserEnv, type UserEnv } from "../auth.ts";
import { enqueueStudyBundle, getBundleStatus } from "../pipeline/bundle.ts";
import { getDueCards, reviewCard } from "../pipeline/cards.ts";
import { grade, pickPractice } from "../pipeline/practice.ts";
import { recallCheck } from "../pipeline/recall.ts";
import { getExamTopics } from "../pipeline/examTopics.ts";
import { getToday } from "../pipeline/plan.ts";
import { getStudyPlan } from "../pipeline/studyPlan.ts";
import { getMastery } from "../pipeline/mastery.ts";
import { getPretest, gradePretest } from "../pipeline/pretest.ts";
import { askLecture } from "../pipeline/ask.ts";
import { MAX_UPLOAD_BYTES, createDocument, getDocument } from "../pipeline/documents.ts";
import { getSyllabus, nextExam } from "../pipeline/syllabus.ts";
import { getDb } from "../pipeline/db.ts";

type C = Context<UserEnv>;
type MaybeC = Context<MaybeUserEnv>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idParam(c: C | MaybeC, name: string, what: string): string {
  const v = c.req.param(name) ?? "";
  if (!UUID.test(v)) throw new HTTPException(404, { message: `${what} not found` });
  return v;
}

async function jsonBody<T>(c: C, schema: z.ZodType<T>): Promise<T> {
  const raw = await c.req.json().catch(() => { throw new HTTPException(400, { message: "body must be JSON" }); });
  const r = schema.safeParse(raw);
  if (!r.success) throw new HTTPException(400, { message: r.error.issues.map(i => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
  return r.data;
}

function intQuery(c: C, name: string, def: number, min: number, max: number): number {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new HTTPException(400, { message: `${name} must be an integer ${min}-${max}` });
  return n;
}

/** Loads the class id of a row and checks the caller's role in it (`read` admits guests of a guest-access class). */
async function classOf(c: C | MaybeC, table: "lectures" | "cards" | "questions" | "documents", id: string, need: "read" | "member" | "owner"): Promise<string> {
  const { db, schema } = await getDb();
  const t = schema[table];
  const [row] = await db.select({ classId: t.classId }).from(t).where(eq(t.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: `${table.replace(/s$/, "")} not found` });
  await requireClassRole(c.var.user?.id ?? null, row.classId, need);
  return row.classId;
}

async function member(c: C, need: "member" | "owner" = "member"): Promise<string> {
  const classId = idParam(c, "classId", "class");
  await requireClassRole(c.var.user.id, classId, need);
  return classId;
}

/** Class id plus whether the caller is a guest (read-only: no mastery or per-student state). */
async function reader(c: MaybeC): Promise<{ classId: string; guest: boolean }> {
  const classId = idParam(c, "classId", "class");
  const role = await requireClassRole(c.var.user?.id ?? null, classId, "read");
  return { classId, guest: role === "guest" };
}

// Untyped like coreRoutes: each route's middleware (requireUser / optionalUser) types `c.var.user`.
export const studyRoutes = new Hono();

// ---------- study bundle ----------

studyRoutes.get("/lectures/:id/bundle", optionalUser, async c => {
  const id = idParam(c, "id", "lecture");
  await classOf(c, "lectures", id, "read");
  const s = await getBundleStatus(id);
  if (!s) return c.json({ error: "no study bundle has been run for this lecture yet" }, 404);
  return c.json(s);
});

studyRoutes.post("/lectures/:id/bundle", requireUser, async c => {
  const id = idParam(c, "id", "lecture");
  await classOf(c, "lectures", id, "owner");
  await enqueueStudyBundle(id);
  return c.json(await getBundleStatus(id), 202);
});

// ---------- flashcards ----------

studyRoutes.get("/classes/:classId/review/due", requireUser, async c => {
  const classId = await member(c);
  return c.json(await getDueCards(c.var.user.id, classId, intQuery(c, "limit", 20, 1, 200)));
});

const ReviewBody = z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) });
studyRoutes.post("/cards/:id/review", requireUser, async c => {
  const id = idParam(c, "id", "card");
  await classOf(c, "cards", id, "member");
  const { rating } = await jsonBody(c, ReviewBody);
  return c.json(await reviewCard(c.var.user.id, id, rating));
});

// ---------- practice ----------

studyRoutes.get("/classes/:classId/practice", requireUser, async c => {
  const classId = await member(c);
  const focus = c.req.query("conceptId");
  if (focus !== undefined && !UUID.test(focus)) throw new HTTPException(400, { message: "conceptId must be a concept id" });
  const lectureId = c.req.query("lectureId");
  if (lectureId !== undefined && !UUID.test(lectureId)) throw new HTTPException(400, { message: "lectureId must be a lecture id" });
  return c.json(await pickPractice(c.var.user.id, classId, intQuery(c, "n", 5, 1, 50), undefined, focus, lectureId));
});

const AttemptBody = z.object({ answer: z.string().max(4000) });
studyRoutes.post("/questions/:id/attempt", requireUser, async c => {
  const id = idParam(c, "id", "question");
  await classOf(c, "questions", id, "member");
  const { answer } = await jsonBody(c, AttemptBody);
  const a = await grade(c.var.user.id, id, answer);
  if (!a) throw new HTTPException(404, { message: "question not found" });
  return c.json(a);
});

// ---------- recall ----------

const RecallBody = z.object({ text: z.string().trim().min(1, "write what you remember first").max(20_000) });
studyRoutes.post("/lectures/:id/recall", requireUser, async c => {
  const id = idParam(c, "id", "lecture");
  await classOf(c, "lectures", id, "member");
  const { text } = await jsonBody(c, RecallBody);
  const r = await recallCheck(c.var.user.id, id, text);
  if (!r) throw new HTTPException(404, { message: "lecture not found" });
  return c.json(r);
});

// ---------- ask the lecture ----------

const AskBody = z.object({ question: z.string().trim().min(2, "ask a question").max(500) });
studyRoutes.post("/lectures/:id/ask", requireUser, async c => {
  const id = idParam(c, "id", "lecture");
  await classOf(c, "lectures", id, "member");
  const { question } = await jsonBody(c, AskBody);
  const a = await askLecture(id, question);
  if (!a) throw new HTTPException(404, { message: "lecture not found" });
  return c.json(a);
});

// ---------- pretest (before the next lecture) ----------

studyRoutes.get("/classes/:classId/pretest", requireUser, async c => c.json(await getPretest(await member(c))));

studyRoutes.post("/classes/:classId/pretest", requireUser, async c => c.json(await getPretest(await member(c), { fresh: true })));

studyRoutes.post("/classes/:classId/pretest/:questionId/attempt", requireUser, async c => {
  const classId = await member(c);
  const questionId = idParam(c, "questionId", "question");
  const { answer } = await jsonBody(c, AttemptBody);
  const a = await gradePretest(classId, questionId, answer);
  if (!a) throw new HTTPException(404, { message: "that pretest question has expired; load the pretest again" });
  return c.json(a);
});

// ---------- derived pages ----------

studyRoutes.get("/classes/:classId/exam-topics", optionalUser, async c => {
  const { classId, guest } = await reader(c);
  const exam = nextExam(await getSyllabus(classId));
  return c.json(await getExamTopics(c.var.user?.id ?? "", classId, { syllabusTopics: exam?.topics ?? [], ...(guest ? { mastery: {} } : {}) }));
});

studyRoutes.get("/classes/:classId/today", requireUser, async c => {
  const classId = await member(c);
  return c.json(await getToday(c.var.user.id, classId));
});

// The model-written plan (syllabus dates, lecture notes, concept notes, class pace); cached per student per day.
studyRoutes.get("/classes/:classId/study-plan", requireUser, async c => {
  const classId = await member(c);
  return c.json(await getStudyPlan(c.var.user.id, classId));
});

studyRoutes.post("/classes/:classId/study-plan", requireUser, async c => {
  const classId = await member(c);
  return c.json(await getStudyPlan(c.var.user.id, classId, { fresh: true }));
});

studyRoutes.get("/classes/:classId/mastery", requireUser, async c => {
  const classId = await member(c);
  return c.json(await getMastery(c.var.user.id, classId));
});

// ---------- documents ----------

const DocKind = z.enum(["book", "syllabus"]);
studyRoutes.post("/classes/:classId/documents", requireUser,
  bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: c => c.json({ error: "file too large (max 20 MB)" }, 413) }),
  async c => {
    const classId = await member(c, "owner");
    const form = await c.req.parseBody().catch(() => { throw new HTTPException(400, { message: "expected multipart/form-data" }); });
    const kind = DocKind.safeParse(form["kind"]);
    if (!kind.success) throw new HTTPException(400, { message: "kind must be book or syllabus" });
    const file = form["file"];
    if (!(file instanceof File)) throw new HTTPException(400, { message: "file is required" });
    if (file.size > MAX_UPLOAD_BYTES) throw new HTTPException(400, { message: "file too large (max 20 MB)" });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HTTPException(400, { message: "file must be a PDF" });
    const title = (typeof form["title"] === "string" && form["title"].trim()) || file.name.replace(/\.pdf$/i, "") || `Uploaded ${kind.data}`;
    return c.json(await createDocument(classId, kind.data, title, bytes), 201);
  });

studyRoutes.get("/documents/:id", requireUser, async c => {
  const id = idParam(c, "id", "document");
  const doc = await getDocument(id);
  if (!doc) throw new HTTPException(404, { message: "document not found" });
  await requireClassRole(c.var.user.id, doc.classId, "member");
  return c.json({ id: doc.id, kind: doc.kind, title: doc.title, parsed: doc.parsed });
});

export default studyRoutes;
