// Study plan: class pace (pure), the plan horizon, and generating/normalising a plan with the mock LLM (no database).
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.LLM_BACKEND = "mock";
import type { GatheredInput } from "./studyPlan.ts";
const { computePace, planHorizon, generateStudyPlan } = await import("./studyPlan.ts");
type Payload = GatheredInput["payload"];

test("planHorizon: through the next exam within 7..21 days, two weeks without one", () => {
  assert.equal(planHorizon(null), 14);
  assert.equal(planHorizon({ daysLeft: 2 }), 7);
  assert.equal(planHorizon({ daysLeft: 11 }), 12);
  assert.equal(planHorizon({ daysLeft: 40 }), 21);
});

test("computePace: lectures a week from the dates, syllabus week by date, topic coverage from concept names", () => {
  const syllabus = { weeks: [
    { week: 1, topics: ["Linear regression", "Gradient descent"], date: "2026-09-28" },
    { week: 2, topics: ["Logistic regression"], date: "2026-10-05" },
    { week: 3, topics: ["GLMs", "Softmax"], date: "2026-10-12" },
  ] };
  const p = computePace(["2026-09-29", "2026-10-01", "2026-10-06", "2026-10-08"], syllabus, ["Gradient descent", "Logistic regression"], new Date("2026-10-09T12:00:00Z"));
  assert.equal(p.lecturesHeld, 4);
  assert.equal(p.lecturesPerWeek, 2.8, "4 lectures over 10 days");
  assert.equal(p.firstLectureDate, "2026-09-29");
  assert.equal(p.lastLectureDate, "2026-10-08");
  assert.equal(p.currentWeek, 2, "the last dated week that has started");
  assert.equal(p.totalWeeks, 3);
  assert.deepEqual(p.weeks.map(w => w.covered), [1, 1, 0]);
});

test("computePace: undated weeks count one per lecture; no lectures gives nulls", () => {
  const syllabus = { weeks: [{ week: 1, topics: ["A"], date: null }, { week: 2, topics: ["B"], date: null }, { week: 3, topics: ["C"], date: null }] };
  assert.equal(computePace(["2026-10-01", "2026-10-03"], syllabus, [], new Date("2026-10-09T12:00:00Z")).currentWeek, 2);
  assert.equal(computePace(["2026-10-01"], syllabus, []).lecturesPerWeek, null, "one lecture: no rate yet");
  const none = computePace([], null, []);
  assert.deepEqual([none.lecturesHeld, none.lecturesPerWeek, none.currentWeek, none.totalWeeks, none.weeks], [0, null, null, 0, []]);
});

function input(over: Partial<Payload> = {}): GatheredInput {
  const concepts = [
    { name: "Gradient descent", definition: "Steps against the gradient.", emphasis: 0.9, examFlag: true, mastery: 0.3 },
    { name: "Learning rate", definition: "The step size.", emphasis: 0.6, examFlag: false, mastery: 0.8 },
    { name: "Loss function", definition: "What is minimised.", emphasis: 0.7, examFlag: true, mastery: null },
    { name: "Convexity", definition: "One global minimum.", emphasis: 0.4, examFlag: false, mastery: 0.5 },
  ];
  const payload: Payload = {
    today: "2026-10-10", horizonDays: 7,
    exams: [{ name: "Midterm", date: "2026-10-16", daysLeft: 6, topics: ["Gradient descent", "Loss function"] }],
    deadlines: [{ name: "Problem set 2", date: "2026-10-13", daysLeft: 3 }],
    announcements: [{ lecture: "Lecture 3", lectureDate: "2026-10-08", kind: "deadline", text: "Project proposals are due Friday", when: "2026-10-17" }],
    lectures: [{ title: "Lecture 3", date: "2026-10-08", summary: "Optimisation.", sections: ["Gradient descent", "Step size"] }],
    concepts,
    pace: computePace(["2026-10-01", "2026-10-06", "2026-10-08"], null, concepts.map(c => c.name), new Date("2026-10-10T12:00:00Z")),
    cardsDueByDay: [5, 0, 3, 0, 0, 2, 0],
    ...over,
  };
  const conceptIds = new Map(concepts.map((c, i) => [c.name.toLowerCase(), `id-${i}`]));
  return { payload, conceptIds, nextExam: { name: "Midterm", date: "2026-10-16", daysLeft: 6 }, fingerprint: "t" };
}

test("generateStudyPlan (mock): consecutive days through the exam, names mapped to ids, key dates with days left", async () => {
  const plan = await generateStudyPlan(input(), new Date("2026-10-10T12:00:00Z"));
  assert.equal(plan.date, "2026-10-10");
  assert.equal(plan.horizonDays, 7);
  assert.deepEqual(plan.days.map(d => d.date), ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.deepEqual(plan.days.map(d => d.cardsDue), [5, 0, 3, 0, 0, 2, 0], "due cards come from the forecast, not the model");
  for (const d of plan.days) {
    assert.ok(d.minutes > 0 && d.tasks.length > 0 && d.reason, `day ${d.date} is complete`);
    for (const c of d.concepts) assert.match(c.id ?? "", /^id-\d$/, `${c.name} maps to a concept id`);
  }
  const examDay = plan.days.at(-1)!;
  assert.ok(examDay.concepts.every(c => ["Gradient descent", "Loss function"].includes(c.name)), "exam day: flagged concepts only");
  assert.match(plan.days[5]!.reason, /weakest/i, "the day before the exam is for weak spots");
  assert.match(plan.days[2]!.reason, /deadline/i, "a deadline tomorrow makes a light day");
  assert.deepEqual(plan.keyDates.map(k => [k.date, k.kind, k.daysLeft]), [["2026-10-13", "deadline", 3], ["2026-10-16", "exam", 6]], "the announcement after the window is left out");
  assert.ok(plan.overview && plan.pace, "overview and pace lines");
  assert.equal(plan.paceData.lecturesHeld, 3);
  assert.deepEqual(plan.nextExam, { name: "Midterm", date: "2026-10-16", daysLeft: 6 });
});

test("generateStudyPlan (mock): no exam gives a two-week steady plan with the exam-less reason", async () => {
  const inp = input({ horizonDays: 14, exams: [], deadlines: [], announcements: [], cardsDueByDay: [] });
  inp.nextExam = null;
  const plan = await generateStudyPlan(inp, new Date("2026-10-10T12:00:00Z"));
  assert.equal(plan.days.length, 14);
  assert.equal(plan.nextExam, null);
  assert.ok(plan.days.every(d => /no exam date/i.test(d.reason)));
  assert.ok(plan.days.every(d => d.cardsDue === 0));
});
