// Pretest: picking the upcoming syllabus week (pure) and generating/grading with the mock LLM (no database).
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.LLM_BACKEND = "mock";
const { pickUpcomingWeek, generatePretest } = await import("./pretest.ts");
const { gradeAnswer } = await import("./practice.ts");

const weeks = (ws: Array<[number, string[], string | null]>) => ({ weeks: ws.map(([week, topics, date]) => ({ week, topics, date })) });

test("pickUpcomingWeek: dated weeks pick this week (started within 6 days) or the next; past courses give null", () => {
  const s = weeks([[1, ["Intro"], "2026-09-28"], [2, ["Regression"], "2026-10-05"], [3, ["GLMs"], "2026-10-12"]]);
  assert.deepEqual(pickUpcomingWeek(s, 5, new Date("2026-10-07T12:00:00Z")), { week: 2, topics: ["Regression"], date: "2026-10-05" }, "mid-week: this week");
  assert.deepEqual(pickUpcomingWeek(s, 5, new Date("2026-10-11T12:00:00Z"))?.week, 2, "6 days in still counts as this week");
  assert.deepEqual(pickUpcomingWeek(s, 5, new Date("2026-10-12T12:00:00Z"))?.week, 3, "next week's start");
  assert.equal(pickUpcomingWeek(s, 5, new Date("2026-11-01T12:00:00Z")), null, "course over");
});

test("pickUpcomingWeek: a dated week that has had its usual lectures is done, so the next one is upcoming", () => {
  const s = weeks([[1, ["Intro"], "2026-09-28"], [2, ["Regression"], "2026-10-05"], [3, ["GLMs"], "2026-10-12"]]);
  const wed = new Date("2026-10-07T12:00:00Z");
  // Once-a-week course (one lecture in week 1): this week's lecture was held on Monday, so week 3 is next.
  assert.equal(pickUpcomingWeek(s, 2, wed, ["2026-09-29", "2026-10-05"])?.week, 3);
  // Twice-a-week course (two lectures in week 1): only one held so far this week, so week 2 is still upcoming…
  assert.equal(pickUpcomingWeek(s, 3, wed, ["2026-09-28", "2026-09-30", "2026-10-05"])?.week, 2);
  // …and after the second one, week 3.
  assert.equal(pickUpcomingWeek(s, 4, new Date("2026-10-08T12:00:00Z"), ["2026-09-28", "2026-09-30", "2026-10-05", "2026-10-07"])?.week, 3);
  // First week of a course with one lecture held: nothing earlier to compare with, one lecture counts as done.
  assert.equal(pickUpcomingWeek(s, 1, new Date("2026-09-30T12:00:00Z"), ["2026-09-29"])?.week, 2);
  // The last week stays the answer even after its lecture (there is nothing after it).
  assert.equal(pickUpcomingWeek(s, 3, new Date("2026-10-13T12:00:00Z"), ["2026-09-29", "2026-10-05", "2026-10-12"])?.week, 3);
  // A week that has not started yet is never skipped.
  assert.equal(pickUpcomingWeek(s, 2, new Date("2026-10-11T12:00:00Z"), ["2026-09-29", "2026-10-05"])?.week, 3);
});

test("pickUpcomingWeek: undated weeks go by lectures held; empty topics and missing syllabus give null", () => {
  const s = weeks([[1, ["Intro"], null], [2, ["Regression"], null], [4, ["GLMs"], null]]);
  assert.equal(pickUpcomingWeek(s, 0)?.week, 1);
  assert.equal(pickUpcomingWeek(s, 1)?.week, 2);
  assert.equal(pickUpcomingWeek(s, 2)?.week, 4, "skips to the next listed week");
  assert.equal(pickUpcomingWeek(s, 4), null);
  assert.equal(pickUpcomingWeek(weeks([[1, [], null]]), 0), null);
  assert.equal(pickUpcomingWeek(null, 0), null);
});

test("generatePretest (mock): one question per topic, mcq only with 4 options, graded by the practice grader", async () => {
  const known = [
    { name: "Gradient descent", definition: "Iterative optimisation that steps against the gradient." },
    { name: "Learning rate", definition: "The step size of each gradient update." },
    { name: "Loss function", definition: "What the model minimises during training." },
    { name: "Convexity", definition: "A loss with a single global minimum, so gradient descent finds it." },
  ];
  const qs = await generatePretest({ week: 3, topics: ["Stochastic gradient descent", "Momentum", "Adam"], date: null }, known);
  assert.equal(qs.length, 3);
  assert.deepEqual(qs.map(q => q.topic), ["Stochastic gradient descent", "Momentum", "Adam"]);
  for (const q of qs) {
    assert.match(q.id, /^[0-9a-f-]{36}$/);
    if (q.kind === "mcq") { assert.equal(q.options?.length, 4); assert.ok(q.options!.includes(q.answer)); } else assert.equal(q.options, null);
  }
  const mcq = qs.find(q => q.kind === "mcq")!;
  assert.ok(mcq, "enough known concepts for an mcq");
  assert.equal((await gradeAnswer(mcq, mcq.answer)).correct, true);
  assert.equal((await gradeAnswer(mcq, mcq.options!.find(o => o !== mcq.answer)!)).correct, false);
  const short = qs.find(q => q.kind === "short")!;
  assert.equal((await gradeAnswer(short, short.answer)).correct, true, "the model answer itself passes");

  const few = await generatePretest({ week: 1, topics: ["Intro"], date: null }, []);
  assert.equal(few.length, 3, "repeats the topic when there is only one");
  assert.ok(few.every(q => q.kind === "short"), "no mcq without known concepts");
});
