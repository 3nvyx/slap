// Recall classification (mock LLM = concept-name matching) and grading of free answers.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { setLlmBackend } from "./llm.ts";
import { classifyRecall } from "./recall.ts";
import { gradeAnswer } from "./practice.ts";

before(() => setLlmBackend("mock"));

const concepts = [
  { id: "1", name: "Gaussian Distribution", definition: "A bell-shaped distribution set by its mean and variance." },
  { id: "2", name: "Variance", definition: "The expected squared distance from the mean." },
  { id: "3", name: "Generalized Linear Models", definition: "Models that put a linear predictor under an exponential-family distribution." },
  { id: "4", name: "Normalizing Constant", definition: "The factor that makes a density integrate to one." },
];

test("recall: got / missed partition the lecture's concepts; score is the share recalled", async () => {
  const r = await classifyRecall("Gaussians", concepts, ["Intro"],
    "We modelled the errors with a gaussian distribution. The variance is not the mean squared distance. Something about linear models.");
  assert.deepEqual(r.got, ["Gaussian Distribution", "Variance"]);
  assert.deepEqual(r.missed, ["Generalized Linear Models", "Normalizing Constant"]);
  assert.deepEqual(r.gotIds, ["1", "2"]);
  assert.deepEqual(r.missedIds, ["3", "4"]);
  assert.equal(r.score, 0.5);
  assert.equal(r.wrong.length, 1, "negated claim about a recalled concept is flagged");
});

test("recall: nothing remembered means everything missed", async () => {
  const r = await classifyRecall("Gaussians", concepts, [], "I don't remember much.");
  assert.equal(r.got.length, 0);
  assert.equal(r.missed.length, 4);
  assert.equal(r.score, 0);
});

test("grading: mcq exact/letter match; short answers by keyword overlap", async () => {
  const mcq = { kind: "mcq" as const, prompt: "?", options: ["alpha", "beta", "gamma", "delta"], answer: "gamma", explanation: "because" };
  assert.equal((await gradeAnswer(mcq, "gamma")).correct, true);
  assert.equal((await gradeAnswer(mcq, "C")).correct, true);
  assert.equal((await gradeAnswer(mcq, "beta")).correct, false);
  const short = { kind: "short" as const, prompt: "What is variance?", options: null, answer: "The expected squared distance of a random variable from its mean.", explanation: "" };
  const good = await gradeAnswer(short, "It's the expected squared distance from the mean");
  assert.equal(good.correct, true);
  const bad = await gradeAnswer(short, "A kind of bird");
  assert.equal(bad.correct, false);
  assert.ok(bad.feedback.length > 0 && !bad.feedback.includes("\n"));
});
