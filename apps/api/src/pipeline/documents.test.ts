// PDF fallback text extraction, LLM JSON validation, and mock book / syllabus parsing.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { setLlmBackend, completeJson } from "./llm.ts";
import { extractPdfText, makeTextPdf } from "./pdfText.ts";
import { parseModelJson, GradeOut, SyllabusOut } from "./schemas.ts";
import { parseSyllabus, nextExam } from "./syllabus.ts";
import { parseBook, bookConcepts, bookExerciseQuestions } from "./book.ts";
import { findDate } from "./mock.ts";

before(() => setLlmBackend("mock"));

test("pdf text: plain and FlateDecode content streams", () => {
  const pdf = makeTextPdf(["Hello (world)", "Second line"]);
  assert.equal(extractPdfText(pdf), "Hello (world)\nSecond line");
  const content = "BT /F1 12 Tf 72 700 Td [(Compre)-50(ssed)-400(text)] TJ ET";
  const z = deflateSync(Buffer.from(content, "latin1"));
  const flate = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), z, Buffer.from("\nendstream\nendobj\n%%EOF", "latin1")]);
  assert.equal(extractPdfText(flate), "Compressed text");
});

test("model JSON: fences stripped, schema enforced", () => {
  const ok = parseModelJson(GradeOut, 'Sure!\n```json\n{"correct": true, "feedback": "Nice"}\n```');
  assert.deepEqual(ok, { ok: true, value: { correct: true, feedback: "Nice" } });
  const bad = parseModelJson(SyllabusOut, '{"exams":[{"name":"Midterm","date":"Oct 20"}]}');
  assert.equal(bad.ok, false);
  assert.equal(parseModelJson(GradeOut, "no json here").ok, false);
});

test("completeJson throws after one retry on invalid output", async () => {
  await assert.rejects(() => completeJson("unknown-task", "x", SyllabusOut.extend({ title: SyllabusOut.shape.title.unwrap().unwrap() })), /invalid JSON twice/);
});

test("dates: ISO, US and month-name formats", () => {
  assert.equal(findDate("Midterm 2026-10-20", "2026-10-06"), "2026-10-20");
  assert.equal(findDate("Final exam on 12/9", "2026-10-06"), "2026-12-09");
  assert.equal(findDate("Due October 30, 2026", "2026-10-06"), "2026-10-30");
  assert.equal(findDate("HW1 due Jan 15", "2026-10-06"), "2027-01-15");
  assert.equal(findDate("no date", "2026-10-06"), null);
});

test("syllabus (mock): exams, weeks and deadlines from a PDF", async () => {
  const pdf = makeTextPdf([
    "CS229 Machine Learning, Fall 2026",
    "Week 1: Linear regression, least squares",
    "Week 2: Gaussian distribution; maximum likelihood",
    "Problem Set 1 due October 16, 2026",
    "Midterm Exam: October 22, 2026 - covers linear regression, Gaussian distribution and GLMs",
    "Final Exam: 2026-12-10",
  ]);
  const s = await parseSyllabus({ pdf }, new Date("2026-10-06T00:00:00Z"));
  assert.equal(s.title, "CS229 Machine Learning, Fall 2026");
  assert.deepEqual(s.exams.map(e => [e.name, e.date]), [["Midterm Exam", "2026-10-22"], ["Final Exam", "2026-12-10"]]);
  assert.ok(s.exams[0]!.topics.includes("GLMs"));
  assert.deepEqual(s.weeks.map(w => w.week), [1, 2]);
  assert.deepEqual(s.weeks[1]!.topics, ["Gaussian distribution", "maximum likelihood"]);
  assert.deepEqual(s.deadlines, [{ name: "Problem Set 1 due October 16, 2026", date: "2026-10-16" }]);
  assert.equal(nextExam(s, new Date("2026-10-06T00:00:00Z"))?.daysLeft, 16);
});

test("book (mock): concepts and exercise questions from a chapter PDF", async () => {
  const pdf = makeTextPdf([
    "Chapter 3: Probabilistic Interpretation",
    "The Gaussian distribution is a continuous distribution parameterised by a mean and a variance.",
    "Maximum likelihood estimation is a method that picks parameters maximising the probability of the data.",
    "Exercises",
    "1. Show that maximum likelihood estimation under Gaussian noise gives least squares.",
    "2. Why does the normalizing constant not affect the maximum likelihood estimate?",
  ]);
  const out = await parseBook({ pdf }, ["Gaussian Distribution"]);
  const concepts = bookConcepts(out);
  assert.deepEqual(concepts.map(c => c.slug), ["gaussian-distribution", "maximum-likelihood-estimation"]);
  assert.equal(out.exercises.length, 2);
  const qs = bookExerciseQuestions(out, new Map(concepts.map(c => [c.slug, c.name])));
  assert.equal(qs.length, 2);
  assert.ok(qs.every(q => q.styleSource === "book" && q.kind === "short"));
  assert.equal(qs[0]!.conceptSlug, "maximum-likelihood-estimation");
});
