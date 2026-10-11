// Hand-entered dates joining the syllabus (pure; no database).
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextExam, withAssessments, type Syllabus } from "./syllabus.ts";

const syllabus: Syllabus = {
  title: "CS229",
  exams: [{ name: "Midterm", date: "2026-11-05", topics: ["GLMs"] }],
  weeks: [{ week: 1, topics: ["Linear regression"], date: null }],
  deadlines: [{ name: "Problem set 1", date: "2026-10-20" }],
};

test("no hand-entered dates leaves the syllabus as it is, or null without one", () => {
  assert.equal(withAssessments(syllabus, []), syllabus);
  assert.equal(withAssessments(null, []), null);
});

test("exams and quizzes become exams, assignments become deadlines, in date order", () => {
  const s = withAssessments(syllabus, [
    { kind: "quiz", name: "Quiz 1", date: "2026-10-18", topics: [] },
    { kind: "assignment", name: "Project proposal", date: "2026-10-15", topics: [] },
    { kind: "exam", name: "midterm", date: "2026-11-05", topics: [] },   // already on the syllabus
  ])!;
  assert.deepEqual(s.exams.map(e => e.name), ["Quiz 1", "Midterm"]);
  assert.deepEqual(s.deadlines.map(d => d.name), ["Project proposal", "Problem set 1"]);
  assert.equal(s.weeks.length, 1);
  assert.equal(nextExam(s, new Date("2026-10-11T12:00:00Z"))?.name, "Quiz 1");
});

test("a class with dates but no syllabus still gets them", () => {
  const s = withAssessments(null, [{ kind: "exam", name: "Final", date: "2026-12-10", topics: ["Everything"] }])!;
  assert.deepEqual(s, { title: null, weeks: [], exams: [{ name: "Final", date: "2026-12-10", topics: ["Everything"] }], deadlines: [] });
});
