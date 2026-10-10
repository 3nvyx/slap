// Study bundle generation on the real CS229 fixture with the mock LLM: valid shapes, no network.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLlmBackend } from "./llm.ts";
import { segmentsFromText, type Seg } from "./util.ts";
import { buildOutline, linkSectionsToConcepts } from "./outline.ts";
import { computeEmphasis, extractConcepts, BATCH_SEGMENTS } from "./concepts.ts";
import { generateCards } from "./cards.ts";
import { generateQuestions, lectureExamples, validateQuestions } from "./practice.ts";

const transcript = readFileSync(new URL("../../fixtures/lecture_sample.txt", import.meta.url), "utf8");
let segs: Seg[];

before(() => {
  setLlmBackend("mock");
  segs = segmentsFromText(transcript, 300).map((s, i) => ({ ...s, id: 1000 + i }));
});

test("outline: ordered timed sections covering the lecture", async () => {
  const o = await buildOutline(segs);
  assert.ok(o.summary.length > 10);
  assert.ok(o.sections.length >= 3 && o.sections.length <= 10, `sections: ${o.sections.length}`);
  for (const s of o.sections) {
    assert.ok(s.title.length > 0);
    assert.ok(s.end >= s.start);
    assert.ok(Array.isArray(s.conceptSlugs));
  }
  for (let i = 1; i < o.sections.length; i++) assert.ok(o.sections[i]!.start >= o.sections[i - 1]!.start);
  assert.equal(o.sections[0]!.start, 0);
  assert.ok(o.sections.at(-1)!.end >= 299);
});

test("concepts: batched extraction merges by slug with valid mentions and emphasis", async () => {
  assert.ok(segs.length > BATCH_SEGMENTS, "fixture needs more than one batch");
  const { concepts } = await extractConcepts(segs, ["Normal Distribution"]);
  assert.ok(concepts.length >= 5, `concepts: ${concepts.map(c => c.name)}`);
  const slugs = new Set(concepts.map(c => c.slug));
  assert.equal(slugs.size, concepts.length, "slugs unique");
  const idxs = new Set(segs.map(s => s.idx));
  for (const c of concepts) {
    assert.match(c.slug, /^[a-z0-9-]+$/);
    assert.ok(c.definition.length > 0, `${c.name} has a definition`);
    for (const m of c.mentions) assert.ok(idxs.has(m.segmentIdx));
    for (const r of c.related) assert.notEqual(r, c.slug);
  }
  assert.ok(concepts.some(c => /gaussian/i.test(c.name)), "finds Gaussian");
  assert.ok(concepts.some(c => /variance/i.test(c.name)), "finds variance");

  const e = computeEmphasis(concepts, segs);
  const values = [...e.values()];
  assert.ok(values.every(v => v >= 0 && v <= 1));
  assert.ok(Math.max(...values) >= 0.5, "the most emphasised concept scores high");

  const o = await buildOutline(segs);
  const linked = linkSectionsToConcepts(o.sections, concepts, segs);
  assert.ok(linked.some(s => s.conceptSlugs.length > 0));
  for (const s of linked) for (const slug of s.conceptSlugs) assert.ok(slugs.has(slug));
});

test("emphasis: exam flag and mentions raise the score", () => {
  const s: Seg[] = [0, 1, 2, 3].map(i => ({ idx: i, start: i * 10, end: i * 10 + 10, text: "x" }));
  const e = computeEmphasis([
    { slug: "a", examFlag: false, mentions: [{ segmentIdx: 0, excerpt: "" }, { segmentIdx: 1, excerpt: "" }] },
    { slug: "b", examFlag: false, mentions: [{ segmentIdx: 2, excerpt: "" }] },
    { slug: "c", examFlag: true, mentions: [{ segmentIdx: 3, excerpt: "" }] },
  ], s);
  assert.equal(e.get("a"), 0.8);
  assert.equal(e.get("b"), 0.4);
  assert.equal(e.get("c"), 0.6);
});

test("cards: 1-3 per concept, all fields filled", async () => {
  const { concepts } = await extractConcepts(segs);
  const cards = await generateCards(concepts.map(c => ({ slug: c.slug, name: c.name, definition: c.definition, excerpts: c.mentions.map(m => m.excerpt), related: c.related })));
  for (const c of concepts) {
    const n = cards.filter(k => k.conceptSlug === c.slug).length;
    assert.ok(n >= 1 && n <= 3, `${c.slug}: ${n} cards`);
  }
  for (const k of cards) { assert.ok(k.front.length > 3); assert.ok(k.back.length > 0); }
});

test("questions: mcq has 4 options incl. the answer, relate points at a known concept", async () => {
  const { concepts } = await extractConcepts(segs);
  const bySlug = new Map(concepts.map(c => [c.slug, c]));
  const qs = await generateQuestions({
    lectureTitle: "CS229 Gaussians",
    count: 10,
    concepts: concepts.map(c => ({ slug: c.slug, name: c.name, definition: c.definition, related: c.related.map(r => ({ slug: r, name: bySlug.get(r)?.name ?? r })) })),
    lectureExamples: lectureExamples(segs),
    bookExercises: ["Show that the maximum likelihood estimate of the mean of a Gaussian is the sample mean."],
  });
  assert.ok(qs.length >= 6, `questions: ${qs.length}`);
  const kinds = new Set(qs.map(q => q.kind));
  assert.ok(kinds.has("mcq") && kinds.has("short"), `kinds: ${[...kinds]}`);
  for (const q of qs) {
    assert.ok(bySlug.has(q.conceptSlug));
    if (q.kind === "mcq") { assert.equal(q.options?.length, 4); assert.ok(q.options!.includes(q.answer)); }
    if (q.kind === "relate") { assert.ok(q.relateToSlug && bySlug.has(q.relateToSlug)); assert.notEqual(q.relateToSlug, q.conceptSlug); }
  }
  assert.ok(qs.some(q => q.styleSource === "book"), "book exercise style present");
});

test("validateQuestions repairs letter answers and downgrades broken items", () => {
  const out = validateQuestions([
    { concept: "a", kind: "mcq", prompt: "Q1", options: ["w", "x", "y", "z"], answer: "C", explanation: "", relateTo: null, styleSource: "lecture" },
    { concept: "a", kind: "mcq", prompt: "Q2", options: ["w", "x"], answer: "w", explanation: "", relateTo: null, styleSource: "lecture" },
    { concept: "a", kind: "relate", prompt: "Q3", options: null, answer: "r", explanation: "", relateTo: "nope", styleSource: "lecture" },
    { concept: "zzz", kind: "short", prompt: "Q4", options: null, answer: "r", explanation: "", relateTo: null, styleSource: "lecture" },
    { concept: "a", kind: "short", prompt: "q1", options: null, answer: "dup", explanation: "", relateTo: null, styleSource: "lecture" },
  ], new Set(["a", "b"]));
  assert.equal(out.length, 3);
  assert.equal(out[0]!.answer, "y");
  assert.equal(out[1]!.kind, "short");
  assert.equal(out[2]!.kind, "short");
});
