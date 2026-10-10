import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";   // never connected by these tests
const { parseTranscript, parseVtt, splitPlainText, looksLikeVtt } = await import("../sessions.ts");

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.500
<v Prof>Welcome back &amp; good morning.</v>

2
00:00:04.500 --> 00:00:09.250
Today we talk about
Gaussian noise.

00:00:09.250 --> 00:00:09.900
Today we talk about Gaussian noise.

01:02:03.040 --> 01:02:05.000
Last cue.
`;

test("WebVTT cues keep their times, strip tags and entities, join lines", () => {
  assert.ok(looksLikeVtt(VTT));
  const s = parseVtt(VTT);
  assert.equal(s.length, 3);   // the consecutive duplicate cue is dropped
  assert.deepEqual(s[0], { start: 1, end: 4.5, text: "Welcome back & good morning." });
  assert.deepEqual(s[1], { start: 4.5, end: 9.25, text: "Today we talk about Gaussian noise." });
  assert.equal(s[2]!.start, 3723.04);
});

test("SRT (comma decimals) is parsed by the same path", () => {
  const s = parseTranscript("1\n00:00:00,500 --> 00:00:02,000\nHello there.\n\n2\n00:00:02,000 --> 00:00:03,000\nGeneral Kenobi.\n");
  assert.deepEqual(s.map(x => x.text), ["Hello there.", "General Kenobi."]);
  assert.equal(s[0]!.start, 0.5);
});

test("plain text splits into sentence-sized segments at 2.5 words/s", () => {
  const text = "Okay. So today we look at linear regression in detail. "
    + "The model predicts y from x with a weight vector theta and a bias term that we learn. "
    + Array.from({ length: 90 }, (_, i) => `w${i}`).join(" ") + ". Thanks.";
  const s = splitPlainText(text);
  // "Okay." is too short alone and merges forward; the 90-word run splits into chunks of <= 40 words.
  assert.ok(s[0]!.text.startsWith("Okay. So today"));
  for (const seg of s) assert.ok(seg.text.split(" ").length <= 40, seg.text);
  const words = s.reduce((n, x) => n + x.text.split(" ").length, 0);
  assert.equal(words, text.split(/\s+/).length);
  assert.equal(s[0]!.start, 0);
  for (let i = 1; i < s.length; i++) assert.equal(s[i]!.start, s[i - 1]!.end);
  assert.ok(Math.abs(s.at(-1)!.end - words / 2.5) < 0.05);
  assert.ok(s.at(-1)!.text.endsWith("Thanks."), "a short tail merges into the previous segment");
});

test("plain text is not mistaken for VTT", () => {
  assert.equal(looksLikeVtt("We meet at 10:30 today. Bring notes."), false);
});
