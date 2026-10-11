// Ask the lecture: relevant-segment selection (pure) and answering with the mock LLM (no database).
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.LLM_BACKEND = "mock";
const { selectRelevantSegments, answerQuestion } = await import("./ask.ts");

const seg = (idx: number, text: string) => ({ id: 100 + idx, idx, start: idx * 10, end: idx * 10 + 9, text });
const segs = [
  seg(0, "Welcome back. Today we continue with regression."),
  seg(1, "Gradient descent takes a step against the gradient of the loss."),
  seg(2, "The learning rate sets how big that step is; too large and it diverges."),
  seg(3, "Now a quick aside about the problem set deadline on Friday."),
  seg(4, "Back to the learning rate: a common trick is to decay it over time."),
  seg(5, "Next week we start on logistic regression."),
];

test("selectRelevantSegments: everything when it fits, else the best lines with neighbours in order", () => {
  assert.equal(selectRelevantSegments(segs, "learning rate").length, 6);
  const few = selectRelevantSegments(segs, "What about the learning rate?", 260);
  assert.ok(few.length >= 2 && few.length < 6, `picked ${few.length}`);
  assert.ok(few.some(s => s.idx === 2) && few.some(s => s.idx === 4), "both learning-rate lines");
  assert.deepEqual(few.map(s => s.idx), [...few.map(s => s.idx)].sort((a, b) => a - b), "transcript order");
  const none = selectRelevantSegments(segs, "quantum chromodynamics", 200);
  assert.ok(none.length >= 1 && none.length < 6, "no matches: still sends a little context");
});

test("answerQuestion (mock): quotes the matching lines with citations; off-topic questions say so", async () => {
  const a = await answerQuestion("Lecture 2", "How does the learning rate affect gradient descent?", segs, [{ name: "Learning rate", definition: "Step size." }]);
  assert.equal(a.notInLecture, false);
  assert.ok(a.citations.length >= 1 && a.citations.length <= 4);
  assert.ok(a.citations.some(c => c.segmentId === 102), "cites the learning-rate line by segment id");
  assert.deepEqual(a.citations.map(c => c.start), [...a.citations.map(c => c.start)].sort((x, y) => x - y));
  assert.match(a.answer, /learning rate/i);

  const off = await answerQuestion("Lecture 2", "Who won the 1998 World Cup?", segs, []);
  assert.equal(off.notInLecture, true);
  assert.equal(off.citations.length, 0);
});
