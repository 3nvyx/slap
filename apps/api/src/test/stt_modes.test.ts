// Sentence building for the fast (Flux) and accurate (Soniox) caption modes: pure functions, no network.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
const { captionWord, settledCount, splitSentences } = await import("../pipeline/sttLink.ts");
const { tokensToWords } = await import("../pipeline/sttSoniox.ts");

const w = (s: string) => s.split(" ");

test("a sentence is settled only once enough words follow it", () => {
  assert.equal(settledCount(w("This is done. And"), 3, 45), 0);
  assert.equal(settledCount(w("This is done. And now we go"), 3, 45), 3);
  assert.equal(settledCount(w("One. Two is here. And now we"), 3, 45), 4);
  assert.equal(settledCount(w("no end in sight here"), 3, 45), 0);
  assert.equal(settledCount([], 3, 45), 0);
});

test("a long run with no sentence end is cut at the last comma, else at the limit", () => {
  const run = Array.from({ length: 50 }, (_, i) => (i === 30 ? "data," : "word"));
  assert.equal(settledCount(run, 3, 45), 31);
  assert.equal(settledCount(Array.from({ length: 50 }, () => "word"), 3, 45), 47);
  assert.equal(settledCount(Array.from({ length: 44 }, () => "word"), 3, 45), 0);
});

test("splitSentences keeps an unfinished tail and closing quotes", () => {
  assert.deepEqual(splitSentences(w('He said "stop." Then we left. And'), s => s), [w('He said "stop."'), w("Then we left."), ["And"]]);
  assert.deepEqual(splitSentences(w("Is it? Yes!"), s => s), [w("Is it?"), ["Yes!"]]);
  assert.deepEqual(splitSentences([], (s: string) => s), []);
});

test("captionWord strips punctuation for the bare word and keeps it for display", () => {
  assert.deepEqual(captionWord("Gaussian,", 1, 1.5, 0.9), { word: "gaussian", punctuated: "Gaussian,", start: 1, end: 1.5, confidence: 0.9 });
  assert.deepEqual(captionWord("it's", 0, 0.2), { word: "it's", punctuated: "it's", start: 0, end: 0.2 });
});

test("Soniox tokens join into words with times, offset and the lowest confidence", () => {
  const toks = [
    { text: "I", start_ms: 0, end_ms: 60, confidence: 0.9 },
    { text: " w", start_ms: 120, end_ms: 180, confidence: 0.8 },
    { text: "ant", start_ms: 180, end_ms: 240, confidence: 0.6 },
    { text: " 3", start_ms: 300, end_ms: 400, confidence: 1 },
    { text: ".", start_ms: 400, end_ms: 420, confidence: 1 },
    { text: "5", start_ms: 420, end_ms: 500, confidence: 1 },
    { text: ".", start_ms: 500, end_ms: 520, confidence: 1 },
  ];
  const words = tokensToWords(toks, 10);
  assert.deepEqual(words.map(x => x.punctuated), ["I", "want", "3.5."]);
  assert.deepEqual(words[1], { word: "want", punctuated: "want", start: 10.12, end: 10.24, confidence: 0.6 });
  assert.equal(words[2]!.end, 10.52);
  assert.deepEqual(tokensToWords([], 0), []);
});
