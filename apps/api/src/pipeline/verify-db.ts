/**
 * Manual end-to-end check of the study pipeline against the real database, mock LLM.
 * Creates a throwaway class + lecture from fixtures/lecture_sample.txt, runs the study
 * bundle twice (idempotency), exercises review / practice / grading / recall / mastery /
 * exam topics / today, ingests a generated syllabus and book PDF, prints row counts,
 * then deletes everything it created (pass --keep to leave it).
 *   node --env-file-if-exists=../../.env.local --env-file-if-exists=../../../.env.local src/pipeline/verify-db.ts [--keep]
 * Not a node:test file on purpose: it needs DATABASE_URL and writes rows.
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { setLlmBackend } from "./llm.ts";
import { addDays, isoDate, segmentsFromText } from "./util.ts";
import { runStudyBundle, getBundleStatus, waitForJob } from "./bundle.ts";
import { getDueCards, reviewCard } from "./cards.ts";
import { grade, pickPractice } from "./practice.ts";
import { recallCheck } from "./recall.ts";
import { getMastery } from "./mastery.ts";
import { getExamTopics } from "./examTopics.ts";
import { getToday } from "./plan.ts";
import { createDocument, getDocument } from "./documents.ts";
import { makeTextPdf } from "./pdfText.ts";

setLlmBackend("mock");
const keep = process.argv.includes("--keep");
const midterm = isoDate(addDays(new Date(), 2));
const user = "verify-script-user";
const code = `VFY${Date.now().toString(36).toUpperCase()}`;
const count = async (table: string, where: string) =>
  ((await db.execute(sql.raw(`select count(*)::int as n from ${table} where ${where}`))).rows[0] as { n: number }).n;

const [cls] = await db.insert(schema.classes).values({ name: "Pipeline verify (throwaway)", code, ownerUserId: user }).returning();
const classId = cls!.id;
const jobRefs: string[] = [];
try {
  const [lec] = await db.insert(schema.lectures).values({ classId, title: "CS229: Gaussians and the error model", date: "2026-10-06", status: "ended", source: "import" }).returning();
  const lectureId = lec!.id;
  jobRefs.push(lectureId);
  const segs = segmentsFromText(readFileSync(new URL("../../fixtures/lecture_sample.txt", import.meta.url), "utf8"), 300);
  await db.insert(schema.segments).values(segs.map(s => ({ lectureId, idx: s.idx, startS: s.start, endS: s.end, text: s.text })));

  let t = Date.now();
  const run1 = await runStudyBundle(lectureId);
  console.log(`bundle #1 ${Date.now() - t} ms`, run1.status, run1.counts);
  assert.equal(run1.status?.status, "done");
  const lc = `class_id = '${classId}'`;
  const rows1 = {
    concepts: await count("concepts", lc), links: await count("concept_links", `from_id in (select id from concepts where ${lc})`),
    mentions: await count("concept_mentions", `lecture_id = '${lectureId}'`), cards: await count("cards", lc),
    questions: await count("questions", lc), outlines: await count("outlines", `lecture_id = '${lectureId}'`),
  };
  console.log("rows after bundle #1", rows1);
  const [l1] = await db.select({ status: schema.lectures.status }).from(schema.lectures).where(eq(schema.lectures.id, lectureId));
  assert.equal(l1!.status, "ready");

  t = Date.now();
  const run2 = await runStudyBundle(lectureId);
  const rows2 = { ...rows1, concepts: await count("concepts", lc), mentions: await count("concept_mentions", `lecture_id = '${lectureId}'`), cards: await count("cards", lc), questions: await count("questions", lc) };
  console.log(`bundle #2 (re-run) ${Date.now() - t} ms`, run2.status?.status, rows2);
  assert.deepEqual({ ...rows2, links: rows1.links }, rows1, "re-run is idempotent");
  const [mc] = (await db.execute(sql.raw(`select sum(mention_count)::int as n from concepts where ${lc}`))).rows as Array<{ n: number }>;
  assert.equal(mc!.n, rows1.mentions, "mention_count matches mention rows after re-run");

  const due = await getDueCards(user, classId, 50);
  console.log(`due cards: ${due.length}; first: ${JSON.stringify(due[0]).slice(0, 160)}`);
  assert.equal(due.length, rows1.cards);
  const r = await reviewCard(user, due[0]!.id, 3);
  assert.ok(new Date(r.due) > new Date(), "review moves due forward");
  await reviewCard(user, due[1]!.id, 4);
  console.log("reviewed:", r);

  const practice = await pickPractice(user, classId, 5);
  console.log(`practice: ${practice.map(q => `${q.kind}:${q.prompt.slice(0, 50)}`).join(" | ")}`);
  assert.ok(practice.length > 0);
  const focusId = practice.at(-1)!.conceptId;
  const focused = await pickPractice(user, classId, 3, undefined, focusId);
  assert.equal(focused[0]!.conceptId, focusId, "conceptId focus puts that concept first");
  const [q0] = await db.select().from(schema.questions).where(eq(schema.questions.id, practice[0]!.id));
  const right = await grade(user, q0!.id, q0!.answer);
  const wrong = await grade(user, practice[1]!.id, "no idea");
  console.log("grade right:", right?.correct, right?.feedback, "| wrong:", wrong?.correct, wrong?.feedback);
  assert.equal(right?.correct, true);
  assert.equal(wrong?.correct, false);

  const recall = await recallCheck(user, lectureId, "We talked about the Gaussian distribution and its variance, and the error term epsilon being Gaussian noise.");
  console.log("recall:", recall);

  const mastery = await getMastery(user, classId);
  console.log("mastery:", mastery);
  const topics = await getExamTopics(user, classId);
  console.log("exam topics:", topics.slice(0, 5).map(t => `${t.name} ${t.score} (e ${t.emphasis}, m ${t.mastery})`));

  const syl = await createDocument(classId, "syllabus", "CS229 syllabus", makeTextPdf([
    "CS229 Machine Learning, Fall 2026",
    "Week 1: Linear regression, least squares",
    "Week 2: Gaussian distribution; maximum likelihood",
    "Problem Set 1 due October 16, 2026",
    `Midterm Exam: ${midterm} - covers Gaussian distribution, variance and GLMs`,
    `Final Exam: ${isoDate(addDays(new Date(), 60))}`,
  ]));
  const book = await createDocument(classId, "book", "Chapter 3", makeTextPdf([
    "Chapter 3: Probabilistic Interpretation",
    "The Gaussian distribution is a continuous distribution parameterised by a mean and a variance.",
    "Maximum likelihood estimation is a method that picks parameters maximising the probability of the data.",
    "Exercises",
    "1. Show that maximum likelihood estimation under Gaussian noise gives least squares.",
    "2. Why does the normalizing constant not affect the maximum likelihood estimate?",
  ]));
  jobRefs.push(syl.id, book.id);
  await waitForJob(syl.jobId);
  await waitForJob(book.jobId);
  const sylDoc = await getDocument(syl.id);
  const bookDoc = await getDocument(book.id);
  console.log("syllabus parsed:", JSON.stringify(sylDoc?.parsed));
  console.log("book parsed:", JSON.stringify(bookDoc?.parsed));
  assert.ok((sylDoc?.parsed as { exams: unknown[] }).exams.length === 2);
  const bookConcepts = await db.select({ name: schema.concepts.name, source: schema.concepts.source }).from(schema.concepts).where(eq(schema.concepts.classId, classId));
  console.log("concept sources:", bookConcepts.map(c => `${c.name}:${c.source}`).join(", "));
  assert.ok(bookConcepts.some(c => c.source === "both"), "book merged into a lecture concept");
  console.log("book-style questions:", await count("questions", `${lc} and style_source = 'book'`));

  const today = await getToday(user, classId);
  console.log("today:", JSON.stringify({ ...today, cardsDue: today.cardsDue.length, practice: today.practice.length, weakConcepts: today.weakConcepts.map(c => `${c.name} m=${c.mastery}`) }, null, 1));
  assert.equal(today.plan.length, 7);
  assert.deepEqual(today.nextExam, { name: "Midterm Exam", date: midterm });
  assert.ok(today.plan.flatMap(d => d.concepts).every(id => /^[0-9a-f-]{36}$/.test(id)), "plan concepts are ids");

  // Route wiring: paths exist under /api and need no sign-in.
  const { routes } = await import("../routes/index.ts");
  const res = await routes.request(`/classes/${classId}/today`);
  console.log("GET /api/classes/:id/today ->", res.status);
  assert.equal(res.status, 200);

  console.log("bundle status:", await getBundleStatus(lectureId));
  console.log("OK");
} finally {
  if (!keep) {
    await db.delete(schema.classes).where(eq(schema.classes.id, classId));
    if (jobRefs.length) await db.delete(schema.jobs).where(inArray(schema.jobs.refId, jobRefs));
    console.log(`cleaned up class ${code}`);
  } else console.log(`kept class ${classId} (${code})`);
}
