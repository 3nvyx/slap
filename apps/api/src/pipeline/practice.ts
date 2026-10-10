/**
 * Exam-style practice questions.
 * Generation (pure): `generateQuestions` asks for questions in two style sources, the
 * lecturer's worked examples / questions found in the transcript (styleSource lecture)
 * and the book's exercises when a book is uploaded (styleSource book); kinds mcq
 * (exactly 4 options), short and relate ("how are X and Y related?", relateTo).
 * Invalid items are repaired (mcq answer given as a letter) or downgraded to short.
 * Selection (pure): `selectPractice` interleaves across lectures, weak concepts first,
 * skipping questions attempted in the last 12 h unless the pool runs out.
 * Grading: mcq by exact match; short/relate by the LLM (mock: keyword overlap) with a
 * one-line formative feedback. DB layer: `saveQuestions`, `pickPractice`, `grade`
 * (writes attempts; a wrong answer makes the concept's card due now).
 */
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { Attempt, Question } from "@slap/contracts";
import { completeJson } from "./llm.ts";
import { GradeOut, QuestionsOut } from "./schemas.ts";
import { SYSTEM_TUTOR, gradePrompt, questionsPrompt, type QuestionsPayload } from "./tasks.ts";
import { hash32, isoDate, type Seg } from "./util.ts";
import { getMastery } from "./mastery.ts";
import { scheduleConceptCard } from "./cards.ts";
import { getDb } from "./db.ts";

export interface GeneratedQuestion {
  conceptSlug: string;
  kind: "mcq" | "short" | "relate";
  prompt: string;
  options: string[] | null;
  answer: string;
  explanation: string;
  relateToSlug: string | null;
  styleSource: "lecture" | "book";
}

const EXAMPLE_RE = /\?\s*$|\b(for example|for instance|suppose|let's say|imagine|consider|example|exercise|what happens if|how would)\b/i;

/** Transcript lines that look like worked examples or questions (the lecture style source). */
export function lectureExamples(segs: Seg[], max = 15): string[] {
  return segs.filter(s => EXAMPLE_RE.test(s.text) && s.text.split(/\s+/).length >= 5).slice(0, max).map(s => s.text.trim().slice(0, 300));
}

export async function generateQuestions(p: QuestionsPayload): Promise<GeneratedQuestion[]> {
  if (!p.concepts.length) return [];
  const payload: QuestionsPayload = {
    ...p,
    concepts: p.concepts.slice(0, 30).map(c => ({ ...c, definition: c.definition.slice(0, 500) })),
    lectureExamples: p.lectureExamples.slice(0, 15),
    bookExercises: p.bookExercises.slice(0, 15).map(e => e.slice(0, 400)),
  };
  const out = await completeJson("questions", questionsPrompt(payload), QuestionsOut, { system: SYSTEM_TUTOR, maxTokens: 8000 });
  return validateQuestions(out.questions, new Set(payload.concepts.map(c => c.slug)));
}

export function validateQuestions(raw: QuestionsOut["questions"], slugs: Set<string>): GeneratedQuestion[] {
  const seen = new Set<string>();
  const res: GeneratedQuestion[] = [];
  for (const q of raw) {
    if (!slugs.has(q.concept)) continue;
    const key = q.prompt.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    let kind = q.kind;
    let options: string[] | null = null;
    let answer = q.answer;
    if (kind === "mcq") {
      const opts = [...new Set((q.options ?? []).map(o => o.trim()).filter(Boolean))];
      const letter = /^[A-Da-d]$/.test(answer.trim()) ? opts["abcd".indexOf(answer.trim().toLowerCase())] : undefined;
      const match = letter ?? opts.find(o => norm(o) === norm(answer));
      if (opts.length === 4 && match) { options = opts; answer = match; } else kind = "short";
    }
    let relateToSlug: string | null = null;
    if (kind === "relate") {
      if (q.relateTo && slugs.has(q.relateTo) && q.relateTo !== q.concept) relateToSlug = q.relateTo; else kind = "short";
    }
    res.push({ conceptSlug: q.concept, kind, prompt: q.prompt, options, answer, explanation: q.explanation, relateToSlug, styleSource: q.styleSource });
  }
  return res;
}

function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

// ---------- selection ----------

export interface PoolQuestion { id: string; conceptId: string; lectureId: string | null }

/**
 * Picks n questions: priority = 0.7 x weakness (1 - mastery, unknown = 0.65) + 0.3 x emphasis,
 * then round-robin across lectures (book questions form their own group), one per concept
 * where possible. Recently attempted questions only fill in when the pool runs short.
 */
export function selectPractice<T extends PoolQuestion>(pool: T[], opts: {
  n: number; mastery: Record<string, number>; emphasis?: Record<string, number>; recent?: Set<string>; seed?: string;
}): T[] {
  const seed = opts.seed ?? "";
  const prio = (q: T) => 0.7 * (1 - (opts.mastery[q.conceptId] ?? 0.35)) + 0.3 * (opts.emphasis?.[q.conceptId] ?? 0);
  const ranked = [...pool].sort((a, b) => prio(b) - prio(a) || hash32(seed + a.id) - hash32(seed + b.id));
  const fresh = ranked.filter(q => !opts.recent?.has(q.id));
  const stale = ranked.filter(q => opts.recent?.has(q.id));
  const picked: T[] = [];
  const usedConcepts = new Set<string>();
  const roundRobin = (items: T[], allowRepeatConcept: boolean) => {
    const groups = new Map<string, T[]>();
    for (const q of items) { const k = q.lectureId ?? "book"; (groups.get(k) ?? groups.set(k, []).get(k)!).push(q); }
    const order = [...groups.keys()];
    let progress = true;
    while (picked.length < opts.n && progress) {
      progress = false;
      for (const k of order) {
        if (picked.length >= opts.n) break;
        const g = groups.get(k)!;
        const i = g.findIndex(q => allowRepeatConcept || !usedConcepts.has(q.conceptId));
        if (i < 0) continue;
        const [q] = g.splice(i, 1);
        picked.push(q!); usedConcepts.add(q!.conceptId); progress = true;
      }
    }
  };
  roundRobin(fresh, false);
  if (picked.length < opts.n) roundRobin(fresh.filter(q => !picked.includes(q)), true);
  if (picked.length < opts.n) roundRobin(stale, true);
  return picked.slice(0, opts.n);
}

// ---------- DB ----------

export async function saveQuestions(classId: string, lectureId: string | null, qs: GeneratedQuestion[], ids: Map<string, string>): Promise<number> {
  const rows = qs.flatMap(q => {
    const conceptId = ids.get(q.conceptSlug);
    if (!conceptId) return [];
    return [{ classId, lectureId, conceptId, kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer,
      explanation: q.explanation, styleSource: q.styleSource, relateToId: q.relateToSlug ? ids.get(q.relateToSlug) ?? null : null }];
  });
  if (!rows.length) return 0;
  const { db, schema } = await getDb();
  await db.insert(schema.questions).values(rows);
  return rows.length;
}

type QuestionRow = typeof import("../db/schema.ts").questions.$inferSelect;
export function toQuestionDto(q: QuestionRow): Question {
  return { id: q.id, conceptId: q.conceptId, kind: q.kind, prompt: q.prompt, options: (q.options as string[] | null) ?? null, styleSource: q.styleSource, relateTo: q.relateToId };
}

/** Practice set for a user; with `focusConceptId`, that concept's questions come first (weakest-first order for the rest). */
export async function pickPractice(userId: string, classId: string, n = 5, mastery?: Record<string, number>, focusConceptId?: string): Promise<Question[]> {
  const { db, schema } = await getDb();
  const { questions, attempts, concepts } = schema;
  const since = new Date(Date.now() - 12 * 3600_000);
  const [pool, recentRows, emph, m] = await Promise.all([
    db.select().from(questions).where(eq(questions.classId, classId)),
    db.select({ id: attempts.questionId }).from(attempts).innerJoin(questions, eq(questions.id, attempts.questionId))
      .where(and(eq(attempts.userId, userId), eq(questions.classId, classId), gt(attempts.createdAt, since))),
    db.select({ id: concepts.id, emphasis: concepts.emphasis }).from(concepts).where(eq(concepts.classId, classId)),
    mastery ? Promise.resolve(mastery) : getMastery(userId, classId),
  ]);
  const opts = {
    n: Math.max(1, Math.min(50, n)), mastery: m, emphasis: Object.fromEntries(emph.map(e => [e.id, e.emphasis])),
    recent: new Set(recentRows.map(r => r.id)), seed: userId + isoDate(new Date()),
  };
  const focus = focusConceptId ? selectPractice(pool.filter(q => q.conceptId === focusConceptId), opts) : [];
  const rest = selectPractice(pool.filter(q => !focus.includes(q)), { ...opts, n: opts.n - focus.length });
  return [...focus, ...rest].map(toQuestionDto);
}

/** Grades one answer without touching the DB. */
export async function gradeAnswer(q: Pick<QuestionRow, "kind" | "prompt" | "options" | "answer" | "explanation">, answer: string): Promise<{ correct: boolean; feedback: string }> {
  if (q.kind === "mcq") {
    const opts = (q.options as string[] | null) ?? [];
    const a = answer.trim();
    const chosen = /^[A-Da-d]$/.test(a) ? opts["abcd".indexOf(a.toLowerCase())] ?? a : /^[0-3]$/.test(a) ? opts[Number(a)] ?? a : a;
    const correct = norm(chosen) === norm(q.answer);
    return { correct, feedback: correct ? `Correct. ${q.explanation}`.trim() : `Not quite: the answer is "${q.answer}". ${q.explanation}`.trim() };
  }
  if (!answer.trim()) return { correct: false, feedback: `No answer given. Model answer: ${q.answer}` };
  const out = await completeJson("grade", gradePrompt({ kind: q.kind, question: q.prompt, modelAnswer: q.answer, explanation: q.explanation, answer: answer.slice(0, 4000) }),
    GradeOut, { maxTokens: 400 });
  return { correct: out.correct, feedback: out.feedback.split("\n")[0]!.slice(0, 300) };
}

export async function grade(userId: string, questionId: string, answer: string): Promise<Attempt | null> {
  const { db, schema } = await getDb();
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.id, questionId));
  if (!q) return null;
  const g = await gradeAnswer(q, answer);
  await db.insert(schema.attempts).values({ userId, questionId, answer: answer.slice(0, 4000), correct: g.correct, feedback: g.feedback });
  if (!g.correct) await scheduleConceptCard(userId, q.conceptId);
  return { questionId, answer, correct: g.correct, feedback: g.feedback };
}

/** Question ids for a set of concepts (plan helper). */
export async function questionIdsByConcept(classId: string, conceptIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!conceptIds.length) return out;
  const { db, schema } = await getDb();
  const rows = await db.select({ id: schema.questions.id, conceptId: schema.questions.conceptId }).from(schema.questions)
    .where(and(eq(schema.questions.classId, classId), inArray(schema.questions.conceptId, conceptIds))).orderBy(desc(schema.questions.id));
  for (const r of rows) (out.get(r.conceptId) ?? out.set(r.conceptId, []).get(r.conceptId)!).push(r.id);
  return out;
}
