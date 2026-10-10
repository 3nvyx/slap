// Diarization pass, pure parts: speaker ranking and mapping onto segments by time overlap,
// the 6-minute PCM ring, and student-question detection for the outline.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";   // never connected by these tests
const d = await import("../pipeline/diarize.ts");
const o = await import("../pipeline/outline.ts");

const turn = (speaker: number, start: number, end: number) => ({ speaker, text: "", start, end });

test("rankSpeakers: most talk time is 0 (lecturer), others by talk time", () => {
  const r = d.rankSpeakers([turn(3, 0, 10), turn(1, 10, 200), turn(3, 200, 215), turn(2, 215, 220)]);
  assert.deepEqual([...r.entries()].sort(), [[1, 0], [2, 2], [3, 1]]);
});

test("mapSpeakers: chunk-relative turns onto lecture-relative segments by majority overlap", () => {
  // Chunk starts 600 s into the lecture and lasts 300 s. Raw speaker 1 talks most -> lecturer.
  const turns = [turn(1, 0, 120), turn(0, 120, 130), turn(1, 130, 290)];
  const segs = [
    { id: 1, start: 590, end: 598 },     // before the chunk: untouched
    { id: 2, start: 598, end: 606 },     // 6 of 8 s inside the chunk -> lecturer
    { id: 3, start: 700, end: 715 },     // lecturer
    { id: 4, start: 719, end: 729 },     // 9 s with the student (720-730), 1 s lecturer -> student
    { id: 5, start: 728, end: 740 },     // 2 s student, 10 s lecturer -> lecturer
    { id: 6, start: 891, end: 899 },     // in the trailing gap after the last turn -> left out
    { id: 7, start: 896, end: 910 },     // mostly after the chunk -> next chunk decides
    { id: 8, start: 725, end: 725 },     // zero-length, inside the student turn
  ];
  const m = d.mapSpeakers(turns, segs, 600, 300);
  assert.deepEqual([...m.entries()].sort((a, b) => a[0] - b[0]), [[2, 0], [3, 0], [4, 1], [5, 0], [8, 1]]);
});

test("mapSpeakers: no turns -> nothing labelled", () => {
  assert.equal(d.mapSpeakers([], [{ id: 1, start: 0, end: 5 }], 0, 300).size, 0);
});

test("PcmRing: capped at 6 minutes by dropping the oldest frames, start time advances", () => {
  const ring = new d.PcmRing();
  const frame = Buffer.alloc(3200);   // 100 ms
  for (let i = 0; i < 4000; i++) ring.push(frame, 10 + i * 0.1);   // 400 s of audio from t=10
  assert.equal(ring.durationS, d.BUFFER_CAP_S);
  assert.ok(Math.abs(ring.startS - 50) < 1e-6, `startS ${ring.startS}`);
  assert.ok(Math.abs(ring.endS - 410) < 1e-6);
  assert.ok(ring.continues(410));
  assert.ok(!ring.continues(420), "a jump in the audio clock is a discontinuity");
  const chunk = ring.take()!;
  assert.equal(chunk.pcm.length, d.BUFFER_CAP_S * d.BYTES_PER_S);
  assert.ok(Math.abs(chunk.startS - 50) < 1e-6);
  assert.equal(ring.bytes, 0);
  assert.equal(ring.take(), null);
  assert.ok(ring.continues(999), "an empty ring accepts any start time");
});

test("PcmRing copies frames so callers may reuse their buffers", () => {
  const ring = new d.PcmRing();
  const b = Buffer.alloc(4, 1);
  ring.push(b, 0);
  b.fill(9);
  assert.deepEqual([...ring.take()!.pcm], [1, 1, 1, 1]);
});

test("feedPcm is a no-op while diarization is disabled", () => {
  d.setDiarizeEnabled(false);
  try {
    const id = crypto.randomUUID();
    d.feedPcm(id, Buffer.alloc(3200), 0);
    assert.equal(d.bufferedSeconds(id), 0);
  } finally { d.setDiarizeEnabled(null); }
});

test("feedPcm buffers below the 5-minute trigger and flushLecture without a lecture is empty", async () => {
  d.setDiarizeEnabled(true);
  try {
    const id = crypto.randomUUID();
    for (let i = 0; i < 100; i++) d.feedPcm(id, Buffer.alloc(3200), i * 0.1);
    assert.ok(Math.abs(d.bufferedSeconds(id) - 10) < 1e-6);
    d.discardLecture(id);
    assert.equal(d.bufferedSeconds(id), 0);
    assert.deepEqual(await d.flushLecture(crypto.randomUUID()), []);
  } finally { d.setDiarizeEnabled(null); }
});

test("student questions: speaker >= 1 and ends with ? or starts with a question word", () => {
  const segs = [
    { id: 1, text: "So what is the variance here?", start: 1, speaker: 0 },
    { id: 2, text: "Is it because the error is y minus theta x", start: 5, speaker: 1 },
    { id: 3, text: "Thanks, that makes sense.", start: 9, speaker: 1 },
    { id: 4, text: "um, why do we square it", start: 3, speaker: 2 },
    { id: 5, text: "Right?", start: 12, speaker: null },
  ];
  assert.deepEqual(o.questionsAskedFrom(segs), [
    { segmentId: 4, text: "um, why do we square it", start: 3 },
    { segmentId: 2, text: "Is it because the error is y minus theta x", start: 5 },
  ]);
  assert.ok(o.isQuestionText("So, how does that work"));
  assert.ok(!o.isQuestionText("Okay let's move on."));
});

test("questionsAsked round-trips through the announcements jsonb", () => {
  const ann = [{ kind: "exam" as const, text: "Midterm next week", when: null }];
  const qs = [{ segmentId: 7, text: "Why?", start: 3 }];
  const packed = o.packAnnouncements(ann, qs);
  assert.equal(packed.length, 2);
  const un = o.unpackAnnouncements(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(un.announcements, ann);
  assert.deepEqual(un.questionsAsked, qs);
  assert.deepEqual(o.unpackAnnouncements(null), { announcements: [], questionsAsked: [] });
  assert.equal(o.packAnnouncements(un.announcements, []).length, 1, "re-packing replaces old questions");
});
