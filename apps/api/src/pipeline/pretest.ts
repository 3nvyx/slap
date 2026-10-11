/**
 * Pretest before the next lecture: a few questions on what the syllabus says is coming next.
 * `pickUpcomingWeek` (pure) finds the next week from the syllabus; `generatePretest` asks the
 * model (mock: heuristics) with the class's known concepts for context; questions are kept in
 * memory per class and day (they are not tied to concept notes, so nothing is persisted) and
 * graded with the practice grader. Answers are formative only and not stored.
 */
import type { Pretest, PretestAttempt, PretestQuestion } from "@slap/contracts";
import { desc, eq } from "drizzle-orm";
import { completeJson } from "./llm.ts";
import { gradeAnswer } from "./practice.ts";
import { PretestOut } from "./schemas.ts";
import { getSyllabus, type Syllabus } from "./syllabus.ts";
import { SYSTEM_TUTOR, pretestPrompt, type PretestPayload } from "./tasks.ts";
import { isoDate } from "./util.ts";
import { getDb } from "./db.ts";

export const PRETEST_COUNT = 3;

export interface UpcomingWeek { week: number; topics: string[]; date: string | null }

/** The syllabus week the next lecture falls in. With dated weeks: the first one starting in the last 6 days or later
 *  (this week, else next), but a week that has already had its usual number of lectures (`lectureDates`; the most any
 *  earlier week had, at least 1) is done, so the one after it is picked. Without dates: the week after the lectures
 *  held so far. Null when nothing is left. */
export function pickUpcomingWeek(s: Pick<Syllabus, "weeks"> | null | undefined, lectureCount: number, today = new Date(), lectureDates: string[] = []): UpcomingWeek | null {
  const weeks = (s?.weeks ?? []).filter(w => w.topics.length);
  if (!weeks.length) return null;
  const dated = weeks.filter(w => w.date).sort((a, b) => a.date!.localeCompare(b.date!));
  if (dated.length) {
    const floor = isoDate(new Date(today.getTime() - 6 * 86_400_000));
    let i = dated.findIndex(w => w.date! >= floor);
    if (i < 0) return null;
    const heldIn = (k: number) => lectureDates.filter(d => d >= dated[k]!.date! && (k + 1 >= dated.length || d < dated[k + 1]!.date!)).length;
    const next = dated[i + 1];
    if (next && dated[i]!.date! <= isoDate(today)) {
      const usual = Math.max(1, ...dated.slice(0, i).map((_, k) => heldIn(k)));
      if (heldIn(i) >= usual) i++;
    }
    const w = dated[i]!;
    return { week: w.week, topics: w.topics, date: w.date ?? null };
  }
  const ordered = [...weeks].sort((a, b) => a.week - b.week);
  const w = ordered.find(w => w.week === lectureCount + 1) ?? ordered.find(w => w.week > lectureCount);
  return w ? { week: w.week, topics: w.topics, date: null } : null;
}

interface StoredQuestion extends PretestQuestion { options: string[] | null; answer: string; explanation: string }
interface Cached { key: string; week: UpcomingWeek; questions: StoredQuestion[] }
const cache = new Map<string, Cached>();

export async function generatePretest(week: UpcomingWeek, knownConcepts: PretestPayload["knownConcepts"], count = PRETEST_COUNT): Promise<StoredQuestion[]> {
  const payload: PretestPayload = { count, week: week.week, topics: week.topics.slice(0, 8), knownConcepts: knownConcepts.slice(0, 20).map(c => ({ name: c.name, definition: c.definition.slice(0, 300) })) };
  const out = await completeJson("pretest", pretestPrompt(payload), PretestOut, { system: SYSTEM_TUTOR, maxTokens: 2500 });
  const qs: StoredQuestion[] = [];
  for (const q of out.questions) {
    let kind = q.kind;
    let options: string[] | null = null;
    let answer = q.answer;
    if (kind === "mcq") {
      const opts = [...new Set((q.options ?? []).map(o => o.trim()).filter(Boolean))];
      const match = opts.find(o => o.toLowerCase() === answer.trim().toLowerCase());
      if (opts.length === 4 && match) { options = opts; answer = match; } else kind = "short";
    }
    qs.push({ id: crypto.randomUUID(), topic: q.topic, kind, prompt: q.prompt, options, answer, explanation: q.explanation });
  }
  return qs.slice(0, count);
}

const toDto = (q: StoredQuestion): PretestQuestion => ({ id: q.id, topic: q.topic, kind: q.kind, prompt: q.prompt, options: q.options ?? null });

/** The class's pretest for today (generated once per class per day and upcoming week). `fresh` regenerates. */
export async function getPretest(classId: string, opts: { fresh?: boolean; now?: Date } = {}): Promise<Pretest> {
  const now = opts.now ?? new Date();
  const { db, schema } = await getDb();
  const [syllabus, lectureRows] = await Promise.all([
    getSyllabus(classId),
    db.select({ date: schema.lectures.date }).from(schema.lectures).where(eq(schema.lectures.classId, classId)),
  ]);
  const week = pickUpcomingWeek(syllabus, lectureRows.length, now, lectureRows.map(r => r.date));
  if (!week) { cache.delete(classId); return { week: null, questions: [] }; }
  const key = `${isoDate(now)}|${week.week}|${week.topics.join("|")}`;
  const hit = cache.get(classId);
  if (hit && hit.key === key && !opts.fresh) return { week, questions: hit.questions.map(toDto) };
  const known = await db.select({ name: schema.concepts.name, definition: schema.concepts.definition }).from(schema.concepts)
    .where(eq(schema.concepts.classId, classId)).orderBy(desc(schema.concepts.emphasis)).limit(20);
  const questions = await generatePretest(week, known);
  cache.set(classId, { key, week, questions });
  return { week, questions: questions.map(toDto) };
}

/** Grades one pretest answer; null when the question is not (or no longer) the class's current pretest. */
export async function gradePretest(classId: string, questionId: string, answer: string): Promise<PretestAttempt | null> {
  const q = cache.get(classId)?.questions.find(q => q.id === questionId);
  if (!q) return null;
  const g = await gradeAnswer({ kind: q.kind, prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation }, answer);
  return { questionId, answer, correct: g.correct, feedback: g.feedback };
}

/** Test hook. */
export function clearPretestCache() { cache.clear(); }
