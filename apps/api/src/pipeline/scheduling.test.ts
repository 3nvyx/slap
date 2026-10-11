// FSRS wrapper, mastery math, exam-topic ranking, practice selection and the 7-day plan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReview, newSchedule } from "./cards.ts";
import { cardScore, computeMastery } from "./mastery.ts";
import { examTopicScore, rankExamTopics } from "./examTopics.ts";
import { selectPractice } from "./practice.ts";
import { buildPlan } from "./plan.ts";
import { nextExam } from "./syllabus.ts";

const T0 = new Date("2026-10-06T09:00:00Z");

test("FSRS: a new card reviewed Good moves due forward and keeps moving on", () => {
  const s0 = newSchedule(T0);
  assert.equal(s0.state, 0);
  assert.equal(s0.due.getTime(), T0.getTime());
  const r1 = applyReview(s0, 3, T0);
  assert.ok(r1.next.due > T0);
  assert.equal(r1.next.reps, 1);
  assert.equal(r1.log.rating, 3);
  const r2 = applyReview(r1.next, 3, r1.next.due);
  assert.ok(r2.next.due > r1.next.due);
  const easy = applyReview(s0, 4, T0);
  const again = applyReview(s0, 1, T0);
  assert.ok(easy.next.due > again.next.due, "easy schedules later than again");
  assert.ok(easy.next.stability > again.next.stability);
});

test("FSRS: a lapse in review state increments lapses", () => {
  let s = newSchedule(T0);
  let t = T0;
  for (let i = 0; i < 3; i++) { const r = applyReview(s, 3, t); s = r.next; t = s.due; }
  assert.equal(s.state, 2);
  const r = applyReview(s, 1, t);
  assert.equal(r.next.lapses, 1);
  assert.equal(r.next.state, 3);
});

test("mastery: weighted combination of cards, attempts and recall", () => {
  const at = (h: number) => new Date(T0.getTime() + h * 3600_000);
  const m = computeMastery({
    cards: [{ conceptId: "a", stability: 10, reps: 3, lapses: 0, state: 2 }, { conceptId: "z", stability: 5, reps: 0, lapses: 0, state: 0 }],
    attempts: [
      { conceptId: "a", correct: true, at: at(2) },
      { conceptId: "a", correct: false, at: at(1) },
      { conceptId: "b", correct: false, at: at(1) },
    ],
    recalls: [{ conceptId: "a", got: true, at: at(0) }, { conceptId: "c", got: false, at: at(0) }, { conceptId: "c", got: true, at: at(-5) }],
  });
  const card = 1 - Math.exp(-1);                         // 0.632
  const att = 1 / (1 + 0.7);                              // newest correct, older wrong
  assert.equal(m["a"], Math.round(((0.4 * card + 0.4 * att + 0.2 * 0.7) / 1.0) * 1000) / 1000);
  assert.equal(m["b"], 0);
  assert.equal(m["c"], 0, "latest recall (missed) wins");
  assert.equal(m["z"], undefined, "unreviewed card gives no signal");
  assert.ok(cardScore({ stability: 10, reps: 2, lapses: 2, state: 3 }) < cardScore({ stability: 10, reps: 2, lapses: 0, state: 2 }));
});

test("exam topics: emphasis x (1 - mastery) with exam-flag and syllabus boosts", () => {
  assert.equal(examTopicScore({ id: "x", name: "x", emphasis: 0.8, examFlag: false }, null), 0.8);
  assert.equal(examTopicScore({ id: "x", name: "x", emphasis: 0.8, examFlag: true }, 0.5), Math.round(1.3 * 0.55 * 1000) / 1000);
  const ranked = rankExamTopics([
    { id: "a", name: "Variance", emphasis: 0.9, examFlag: false },
    { id: "b", name: "Gaussian Distribution", emphasis: 0.5, examFlag: true },
    { id: "c", name: "Least Squares", emphasis: 0.6, examFlag: false },
    { id: "d", name: "Notation", emphasis: 0.95, examFlag: false },
  ], { a: 0.2, d: 1 }, ["least squares and linear regression"]);
  assert.deepEqual(ranked.map(r => r.conceptId), ["b", "c", "a", "d"]);
  assert.equal(ranked[0]!.mastery, null);
  assert.equal(ranked[2]!.mastery, 0.2);
});

test("practice selection: weak first, interleaved across lectures, recent last", () => {
  const pool = [
    { id: "q1", conceptId: "strong", lectureId: "L1" },
    { id: "q2", conceptId: "weak1", lectureId: "L1" },
    { id: "q3", conceptId: "weak1", lectureId: "L1" },
    { id: "q4", conceptId: "weak2", lectureId: "L2" },
    { id: "q5", conceptId: "mid", lectureId: "L2" },
    { id: "q6", conceptId: "book", lectureId: null },
    { id: "q7", conceptId: "weak3", lectureId: "L1" },
  ];
  const picked = selectPractice(pool, { n: 4, mastery: { strong: 0.95, weak1: 0.05, weak2: 0.1, mid: 0.5, weak3: 0.1, book: 0.6 }, recent: new Set(["q7"]), seed: "s" });
  assert.equal(picked.length, 4);
  assert.equal(picked[0]!.id === "q2" || picked[0]!.id === "q3", true, "weakest concept first");
  const lectures = picked.slice(0, 3).map(p => p.lectureId ?? "book");
  assert.equal(new Set(lectures).size, 3, `first round covers every lecture group: ${lectures}`);
  assert.equal(new Set(picked.map(p => p.conceptId)).size, 4, "no concept twice while others remain");
  assert.ok(!picked.some(p => p.id === "q7"), "recently attempted skipped");
  const all = selectPractice(pool, { n: 7, mastery: {}, recent: new Set(["q7"]) });
  assert.equal(all.at(-1)!.id, "q7", "recent questions only fill in at the end");
});

const topics = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n, i) => ({
  conceptId: n, name: `Topic ${n}`, emphasis: 1 - i * 0.1, examFlag: i === 0, mastery: i % 3 === 0 ? 0.2 : null, score: 1 - i * 0.1,
}));

test("plan: back-scheduled from an exam inside the window", () => {
  const exam = nextExam({ exams: [{ name: "Midterm", date: "2026-10-10", topics: [] }, { name: "Old", date: "2026-09-01", topics: [] }] }, T0);
  assert.deepEqual(exam, { name: "Midterm", date: "2026-10-10", topics: [], daysLeft: 4, kind: "exam" });
  const plan = buildPlan({ today: T0, exam, followingExam: { name: "Final", date: "2026-12-10", topics: [], daysLeft: 65, kind: "exam" }, topics, dueByDay: [5, 2, 0, 1, 0, 0, 3], questionsByConcept: new Map([["A", ["qa"]], ["B", ["qb1", "qb2"]]]) });
  assert.equal(plan.length, 7);
  assert.equal(plan[0]!.date, "2026-10-06");
  assert.equal(plan[6]!.date, "2026-10-12");
  assert.ok(plan.every(d => d.reason.length > 0 && !d.reason.includes("\n")));
  assert.match(plan[4]!.reason, /Midterm today/);
  assert.match(plan[3]!.reason, /Day before Midterm/);
  assert.match(plan[5]!.reason, /After Midterm: 60 days to Final/);
  assert.equal(plan[5]!.concepts.length, 3);
  assert.ok(plan[0]!.concepts.every(id => topics.some(t => t.conceptId === id)), "plan days list concept ids");
  const studied = new Set(plan.slice(0, 3).flatMap(d => d.concepts));
  assert.ok(studied.size >= 6, "topics spread over the days before the exam");
  assert.equal(plan[0]!.cardsDue, 5);
  assert.ok(plan.flatMap(d => d.questions).includes("qa"));
});

test("plan: exam far away paces topics to finish early; no exam gives a steady plan", () => {
  const far = buildPlan({ today: T0, exam: { name: "Final", date: "2026-10-30", topics: [], daysLeft: 24, kind: "exam" }, topics, dueByDay: [], questionsByConcept: new Map() });
  assert.match(far[0]!.reason, /24 days to Final/);
  assert.ok(far.every(d => d.concepts.length >= 1));
  const none = buildPlan({ today: T0, exam: null, topics, dueByDay: [], questionsByConcept: new Map() });
  assert.equal(none.length, 7);
  assert.match(none[0]!.reason, /No exam date/);
  assert.ok(none.every(d => d.concepts.length >= 1 && d.concepts.length <= 3));
  const empty = buildPlan({ today: T0, exam: null, topics: [], dueByDay: [4], questionsByConcept: new Map() });
  assert.match(empty[0]!.reason, /review due cards/);
});
