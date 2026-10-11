// Replay of saved segments through the live caption path (no database, no STT): interims grow word by word,
// finals fire in order with stored translations, other languages are translated, status says replay, and the
// lecture stops itself at the end. Also the from/to window and the empty-window refusal.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaptionEvent, CaptionWord } from "@slap/contracts";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
process.env.TRANSLATE_BACKEND = "mock";
const s = await import("../sessions.ts");

function viewer(lang: string) {
  const got: CaptionEvent[] = [];
  return { got, v: { lang, ready: true, send: (ev: CaptionEvent) => { got.push(ev); } } satisfies import("../sessions.ts").Viewer };
}

const words = (text: string, start: number, end: number): CaptionWord[] => {
  const toks = text.split(" ");
  const step = (end - start) / toks.length;
  return toks.map((t, i) => ({ word: t.toLowerCase().replace(/[^a-z]/g, ""), punctuated: t, start: start + i * step, end: start + (i + 1) * step }));
};

const segs = (): import("../sessions.ts").ReplaySegment[] => [
  { start: 0, end: 2, text: "Gradient descent takes a step.", words: words("Gradient descent takes a step.", 0, 2), tr: new Map([["es", "El descenso de gradiente da un paso."]]) },
  { start: 2.5, end: 4, text: "The step size is the learning rate.", words: [], tr: new Map() },
  { start: 4.5, end: 6, text: "Too large and it diverges.", words: words("Too large and it diverges.", 4.5, 6), tr: new Map() },
];

const until = async (pred: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!pred()) { if (Date.now() > end) throw new Error("timed out"); await new Promise(r => setTimeout(r, 20)); }
};

test("replay: interims before each final, finals in order, stored and fresh translations, replay status, self-stop", async () => {
  const en = viewer("en"), es = viewer("es");
  const l = s.startReplayFrom("class-1", "source-1", segs(), { speed: 20 });
  s.addViewer(l, en.v);
  s.addViewer(l, es.v);
  assert.equal(l.replay?.sourceId, "source-1");
  assert.equal(s.lectureState(l), "recording");

  await until(() => l.status === "ended" && en.got.some(e => e.type === "status" && e.state === "ended"));

  const finals = en.got.filter(e => e.type === "final");
  assert.deepEqual(finals.map(f => f.type === "final" && f.text), segs().map(x => x.text));
  assert.ok(finals.every(f => f.type === "final" && f.segmentId < 0), "ephemeral ids");

  // Word-by-word interims precede each final, including for the segment without word timestamps.
  const types = en.got.filter(e => e.type === "interim" || e.type === "final").map(e => e.type);
  assert.equal(types[0], "interim");
  const firstFinalAt = en.got.findIndex(e => e.type === "final");
  const secondFinalAt = en.got.findIndex((e, i) => i > firstFinalAt && e.type === "final");
  assert.ok(en.got.slice(firstFinalAt + 1, secondFinalAt).some(e => e.type === "interim"), "interims for the second segment");
  const growing = en.got.filter(e => e.type === "interim").slice(0, 3).map(e => e.type === "interim" && e.words.length);
  assert.deepEqual(growing, [...growing].sort((a, b) => Number(a) - Number(b)), "interims grow");

  // seq strictly increases across everything.
  const seqs = en.got.filter(e => "seq" in e).map(e => (e as { seq: number }).seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));

  // Spanish viewer: the stored translation for segment 1 verbatim, the mock translator for the others; English viewer gets none.
  const trs = es.got.filter(e => e.type === "translation");
  assert.equal(trs.length, 3);
  assert.equal(trs[0]!.type === "translation" && trs[0]!.text, "El descenso de gradiente da un paso.");
  assert.ok(trs[1]!.type === "translation" && trs[1]!.text.startsWith("[es]"));
  assert.equal(en.got.filter(e => e.type === "translation").length, 0);

  const statuses = en.got.filter(e => e.type === "status");
  assert.ok(statuses.every(e => e.type === "status" && e.replay === true), "status events say replay");
  assert.equal(statuses.at(-1)!.type === "status" && statuses.at(-1)!.state, "ended");
  assert.equal(l.replay?.timer, null, "timer cleared");

  const snap = s.snapshot(l, 0, "es");
  assert.ok(snap.type === "snapshot" && snap.finals.length === 3 && snap.finals[0]!.translation === "El descenso de gradiente da un paso.");
});

test("replay window: from/to picks the segments, stopping early; empty windows are refused", async () => {
  const en = viewer("en");
  const l = s.startReplayFrom("class-1", "source-1", segs(), { from: 2.2, to: 5, speed: 20 });
  s.addViewer(l, en.v);
  await until(() => l.status === "ended");
  const finals = en.got.filter(e => e.type === "final").map(e => e.type === "final" && e.text);
  assert.deepEqual(finals, ["The step size is the learning rate.", "Too large and it diverges."]);

  assert.throws(() => s.startReplayFrom("class-1", "source-1", segs(), { from: 10 }), s.ReplayError);
  assert.throws(() => s.startReplayFrom("class-1", "source-1", segs(), { from: 3, to: 3 }), s.ReplayError);
});

test("stopping a replay early clears its timer and ends it for viewers", async () => {
  const en = viewer("en");
  const l = s.startReplayFrom("class-1", "source-1", segs(), { speed: 0.5 });
  s.addViewer(l, en.v);
  await until(() => en.got.some(e => e.type === "interim"));
  await s.stopSession(l.id);
  assert.equal(l.status, "ended");
  assert.equal(l.replay?.timer, null);
  const last = en.got.at(-1)!;
  assert.ok(last.type === "status" && last.state === "ended");
  assert.equal(s.liveLectureInMemory("class-1"), undefined);
});
