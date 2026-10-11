// Study plan: class pace (pure), the plan horizon, and generating/normalising a plan with the mock LLM (no database).
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.LLM_BACKEND = "mock";
import type { GatheredInput } from "./studyPlan.ts";
const { buildStudyPlan, computePace, examScope, planHorizon, generateStudyPlan } = await import("./studyPlan.ts");
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
    { name: "Gradient descent", definition: "Steps against the gradient.", emphasis: 0.9, examFlag: true, mastery: 0.3, lectures: ["L3"] },
    { name: "Learning rate", definition: "The step size.", emphasis: 0.6, examFlag: false, mastery: 0.8, lectures: ["L3"] },
    { name: "Loss function", definition: "What is minimised.", emphasis: 0.7, examFlag: true, mastery: null, lectures: ["L2"] },
    { name: "Convexity", definition: "One global minimum.", emphasis: 0.4, examFlag: false, mastery: 0.5, lectures: ["L2"] },
  ];
  const payload: Payload = {
    today: "2026-10-10", horizonDays: 7, budget: { normal: 30, examWeek: 75 },
    exams: [{ name: "Midterm", date: "2026-10-16", daysLeft: 6, kind: "exam", topics: ["Gradient descent", "Loss function"], concepts: ["Gradient descent", "Loss function"], lectures: ["L2", "L3"] }],
    deadlines: [{ name: "Problem set 2", date: "2026-10-13", daysLeft: 3 }],
    announcements: [{ lecture: "Lecture 3", lectureDate: "2026-10-08", kind: "deadline", text: "Project proposals are due Friday", when: "2026-10-17" }],
    lectures: [
      { key: "L2", title: "Lecture 2", date: "2026-10-06", daysAgo: 4, summary: "Losses.", sections: ["Loss functions"], concepts: ["Loss function", "Convexity"] },
      { key: "L3", title: "Lecture 3", date: "2026-10-08", daysAgo: 2, summary: "Optimisation.", sections: ["Gradient descent", "Step size"], concepts: ["Gradient descent", "Learning rate"] },
    ],
    materials: [{ key: "M1", kind: "book", title: "Chapter 4: Optimisation", concepts: ["Convexity", "Learning rate"], exercises: 6 }],
    concepts,
    pace: computePace(["2026-10-01", "2026-10-06", "2026-10-08"], null, concepts.map(c => c.name), new Date("2026-10-10T12:00:00Z")),
    cardsDueByDay: [5, 0, 3, 0, 0, 2, 0],
    ...over,
  };
  const conceptIds = new Map(concepts.map((c, i) => [c.name.toLowerCase(), `id-${i}`]));
  const l2 = { id: "lec-2", title: "Lecture 2" }, l3 = { id: "lec-3", title: "Lecture 3" };
  const lectures = new Map([["l2", l2], ["lecture 2", l2], ["l3", l3], ["lecture 3", l3]]);   // by key and by title
  const book = { id: "doc-1", kind: "book" as const, title: "Chapter 4: Optimisation" };
  const exams = payload.exams.map(e => ({
    name: e.name, date: e.date, daysLeft: e.daysLeft, kind: e.kind, readiness: 0.15, strategy: "",
    concepts: [{ id: "id-0", name: "Gradient descent", mastery: 0.3 }, { id: "id-2", name: "Loss function", mastery: null }],
    lectures: [l2, l3],
  }));
  return { payload, conceptIds, lectures, materials: new Map([["m1", book]]), exams, nextExam: { name: "Midterm", date: "2026-10-16", daysLeft: 6 }, fingerprint: "t" };
}

test("generateStudyPlan (mock): consecutive days through the exam, names mapped to ids, key dates with days left", async () => {
  const plan = await generateStudyPlan(input(), new Date("2026-10-10T12:00:00Z"));
  assert.equal(plan.date, "2026-10-10");
  assert.equal(plan.horizonDays, 7);
  assert.deepEqual(plan.days.map(d => d.date), ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.deepEqual(plan.days.map(d => d.cardsDue), [5, 0, 3, 0, 0, 2, 0], "due cards come from the forecast, not the model");
  for (const d of plan.days) {
    assert.ok(d.tasks.length > 0 && d.reason, `day ${d.date} is complete`);
    assert.equal(d.minutes, d.tasks.reduce((n, t) => n + t.minutes, 0), "a day's minutes are its tasks' minutes");
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

test("generateStudyPlan (mock): tasks are typed and point at real lectures, uploads and the exam", async () => {
  const plan = await generateStudyPlan(input(), new Date("2026-10-10T12:00:00Z"));
  const tasks = plan.days.flatMap(d => d.tasks);
  const today = plan.days[0]!.tasks;
  assert.deepEqual(today[0], { kind: "cards", title: "Review 5 due cards", minutes: 5, lecture: null, concepts: [], material: null, exam: null });
  const recall = today.find(t => t.kind === "recall")!;
  assert.deepEqual(recall.lecture, { id: "lec-3", title: "Lecture 3" }, "the newest lecture is recalled first, by its key");
  assert.ok(plan.days.every(d => (d.cardsDue > 0) === d.tasks.some(t => t.kind === "cards")), "a cards task exactly on the days with cards due");
  assert.ok(tasks.filter(t => t.kind === "recall" || t.kind === "notes").every(t => t.lecture), "recall and notes always name a lecture");
  const material = tasks.find(t => t.kind === "material")!;
  assert.deepEqual(material.material, { id: "doc-1", kind: "book", title: "Chapter 4: Optimisation" });
  assert.ok(tasks.some(t => t.exam === "Midterm" && t.concepts.some(c => c.id === "id-0")), "practice on an exam concept is marked for that exam");
  assert.ok(tasks.every(t => t.minutes >= 3 && t.minutes <= 60 && t.title));

  assert.equal(plan.exams.length, 1);
  assert.equal(plan.exams[0]!.kind, "exam");
  assert.ok(plan.exams[0]!.strategy, "the model's line on the exam is attached");
  assert.deepEqual(plan.materials, [{ id: "doc-1", kind: "book", title: "Chapter 4: Optimisation" }]);
});

test("buildStudyPlan: a task that points at nothing is turned into one that works", async () => {
  const { StudyPlanOut } = await import("./schemas.ts");
  const reply = StudyPlanOut.parse({ exams: [{ name: "MIDTERM", strategy: "Rehearse twice." }], days: [{ date: "2026-10-10", tasks: [
    "Practice gradient descent",                                                    // the old free-text shape
    { kind: "recall", title: "Recall the lecture", lecture: "L9" },                 // no such lecture
    { kind: "material", title: "Read the chapter", material: "M7", lecture: "Lecture 2" },   // no such upload; a lecture by title
    { kind: "quiz-me", title: "Odd kind", minutes: 500, exam: "midterm", concepts: ["gradient descent", "Unknown idea", "Gradient descent"] },
    { kind: "pretest", title: "Fifth" }, { kind: "practice", title: "Sixth" },
  ] }] });
  const plan = buildStudyPlan(reply, input({ horizonDays: 2, cardsDueByDay: [4, 0] }), new Date("2026-10-10T12:00:00Z"));
  const [today, tomorrow] = plan.days;
  assert.deepEqual(today!.tasks.map(t => t.kind), ["cards", "practice", "practice", "notes", "practice"], "due cards first, five tasks at most");
  assert.equal(today!.tasks[1]!.title, "Practice gradient descent");
  assert.deepEqual(today!.tasks[3]!.lecture, { id: "lec-2", title: "Lecture 2" });
  const odd = today!.tasks[4]!;
  assert.deepEqual([odd.minutes, odd.exam], [60, "Midterm"], "minutes capped, the exam matched whatever its case");
  assert.deepEqual(odd.concepts, [{ id: "id-0", name: "Gradient descent" }, { id: null, name: "Unknown idea" }]);
  assert.deepEqual(tomorrow!.tasks.map(t => t.kind), ["practice"], "a day the model left out still has something to do");
  assert.equal(plan.exams[0]!.strategy, "Rehearse twice.");
});

test("examScope: the concepts an exam's topics name, else those of the lectures since the previous exam", () => {
  const lectures = [{ key: "L1", date: "2026-09-20" }, { key: "L2", date: "2026-10-06" }, { key: "L3", date: "2026-10-08" }];
  const concepts = [
    { name: "Sample spaces", lectures: ["L1"] }, { name: "Loss function", lectures: ["L2"] }, { name: "Gradient descent", lectures: ["L3"] },
  ];
  const names = (exam: { date: string; topics: string[] }, dates: string[]) => examScope(exam, dates, lectures, concepts).map(c => c.name);
  assert.deepEqual(names({ date: "2026-10-16", topics: ["Gradient descent and learning rates"] }, []), ["Gradient descent"]);
  assert.deepEqual(names({ date: "2026-10-16", topics: [] }, ["2026-09-25", "2026-10-16"]), ["Loss function", "Gradient descent"], "after the September exam");
  assert.deepEqual(names({ date: "2026-10-16", topics: ["Something unrelated"] }, []), ["Sample spaces", "Loss function", "Gradient descent"], "topics that match nothing fall back to the lectures");
  assert.deepEqual(names({ date: "2026-09-10", topics: [] }, []).length, 3, "no lecture before it: everything");
});

test("generateStudyPlan (mock): no exam gives a two-week steady plan with the exam-less reason", async () => {
  const inp = input({ horizonDays: 14, exams: [], deadlines: [], announcements: [], cardsDueByDay: [] });
  inp.nextExam = null;
  inp.exams = [];
  const plan = await generateStudyPlan(inp, new Date("2026-10-10T12:00:00Z"));
  assert.equal(plan.days.length, 14);
  assert.equal(plan.nextExam, null);
  assert.ok(plan.days.every(d => /no exam date/i.test(d.reason)));
  assert.ok(plan.days.every(d => d.cardsDue === 0));
});
