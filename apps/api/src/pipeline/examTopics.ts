/**
 * Exam topics: concepts ranked by what the lecturer emphasised and what the student
 * has not mastered yet. A heuristic (the UI says so):
 *   score = (emphasis + 0.5 if exam-flagged) x (1 - 0.9 x mastery) x 1.3 if the next exam's syllabus topics name it
 * Unknown mastery counts as 0. `getExamTopics` loads concepts + mastery for a user.
 */
import { eq } from "drizzle-orm";
import type { ExamTopic } from "@slap/contracts";
import { contentWords } from "./util.ts";
import { getMastery } from "./mastery.ts";
import { getDb } from "./db.ts";

export interface TopicConcept { id: string; name: string; emphasis: number; examFlag: boolean }

export function examTopicScore(c: TopicConcept, mastery: number | null, syllabusBoost = false): number {
  const base = c.emphasis + (c.examFlag ? 0.5 : 0);
  return Math.round(base * (1 - 0.9 * (mastery ?? 0)) * (syllabusBoost ? 1.3 : 1) * 1000) / 1000;
}

/** True when every content word of the concept name appears in one of the syllabus topics. */
export function matchesTopics(name: string, topics: string[]): boolean {
  const words = contentWords(name);
  if (!words.length) return false;
  return topics.some(t => { const have = new Set(contentWords(t)); return words.every(w => have.has(w)); });
}

export function rankExamTopics(concepts: TopicConcept[], mastery: Record<string, number>, syllabusTopics: string[] = []): ExamTopic[] {
  return concepts
    .map(c => {
      const m = mastery[c.id] ?? null;
      return { conceptId: c.id, name: c.name, emphasis: c.emphasis, examFlag: c.examFlag, mastery: m, score: examTopicScore(c, m, matchesTopics(c.name, syllabusTopics)) };
    })
    .sort((a, b) => b.score - a.score || b.emphasis - a.emphasis || a.name.localeCompare(b.name));
}

export async function getExamTopics(userId: string, classId: string, opts: { mastery?: Record<string, number>; syllabusTopics?: string[] } = {}): Promise<ExamTopic[]> {
  const { db, schema } = await getDb();
  const c = schema.concepts;
  const [rows, mastery] = await Promise.all([
    db.select({ id: c.id, name: c.name, emphasis: c.emphasis, examFlag: c.examFlag }).from(c).where(eq(c.classId, classId)),
    opts.mastery ? Promise.resolve(opts.mastery) : getMastery(userId, classId),
  ]);
  return rankExamTopics(rows, mastery, opts.syllabusTopics ?? []);
}
