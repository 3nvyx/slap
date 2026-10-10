/**
 * Per-student mastery per concept (0..1), cheap SQL and arithmetic, no LLM.
 * `computeMastery` combines up to three signals, re-weighted over the ones present:
 *   cards    0.4  mean over reviewed cards of (1 - e^(-stability/10)) / (1 + 0.15 lapses), x0.7 while relearning
 *   attempts 0.4  recency-weighted correctness of the last 5 attempts (weights 1, .7, .49, ...)
 *   recall   0.2  latest recall check: got = 0.7 (recalling is not mastering), missed = 0
 * Concepts with no signal are absent from the record (the UI shows "not studied yet").
 * `getMastery` loads the inputs for one user and class.
 */
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "./db.ts";

export interface MasteryInputs {
  cards: Array<{ conceptId: string; stability: number; reps: number; lapses: number; state: number }>;
  attempts: Array<{ conceptId: string; correct: boolean; at: Date }>;
  recalls: Array<{ conceptId: string; got: boolean; at: Date }>;
}

const W = { cards: 0.4, attempts: 0.4, recall: 0.2 };
const RECALL_GOT = 0.7;

export function cardScore(c: { stability: number; reps: number; lapses: number; state: number }): number {
  if (c.reps <= 0) return 0;
  const s = (1 - Math.exp(-Math.max(0, c.stability) / 10)) / (1 + 0.15 * c.lapses);
  return c.state === 3 ? s * 0.7 : s;
}

export function computeMastery(inp: MasteryInputs): Record<string, number> {
  const comps = new Map<string, { cards?: number[]; attempts?: Array<{ correct: boolean; at: Date }>; recall?: { got: boolean; at: Date } }>();
  const get = (id: string) => { let v = comps.get(id); if (!v) comps.set(id, v = {}); return v; };
  for (const c of inp.cards) if (c.reps > 0) (get(c.conceptId).cards ??= []).push(cardScore(c));
  for (const a of inp.attempts) (get(a.conceptId).attempts ??= []).push(a);
  for (const r of inp.recalls) { const v = get(r.conceptId); if (!v.recall || r.at > v.recall.at) v.recall = r; }

  const out: Record<string, number> = {};
  for (const [id, v] of comps) {
    let sum = 0, wsum = 0;
    if (v.cards?.length) { sum += W.cards * (v.cards.reduce((a, b) => a + b, 0) / v.cards.length); wsum += W.cards; }
    if (v.attempts?.length) {
      const recent = [...v.attempts].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 5);
      let s = 0, w = 0;
      recent.forEach((a, k) => { const wk = 0.7 ** k; w += wk; if (a.correct) s += wk; });
      sum += W.attempts * (s / w); wsum += W.attempts;
    }
    if (v.recall) { sum += W.recall * (v.recall.got ? RECALL_GOT : 0); wsum += W.recall; }
    if (wsum > 0) out[id] = Math.round((sum / wsum) * 1000) / 1000;
  }
  return out;
}

/** Shape stored in recall_checks.result (RecallResult plus concept ids). */
export interface StoredRecall { got: string[]; missed: string[]; wrong: string[]; score: number; gotIds?: string[]; missedIds?: string[] }

export async function getMastery(userId: string, classId: string): Promise<Record<string, number>> {
  const { db, schema } = await getDb();
  const { cards, cardState, attempts, questions, recallChecks, lectures } = schema;
  const [cardRows, attemptRows, recallRows] = await Promise.all([
    db.select({ conceptId: cards.conceptId, stability: cardState.stability, reps: cardState.reps, lapses: cardState.lapses, state: cardState.state })
      .from(cardState).innerJoin(cards, eq(cards.id, cardState.cardId))
      .where(and(eq(cardState.userId, userId), eq(cards.classId, classId), gt(cardState.reps, 0))),
    db.select({ conceptId: questions.conceptId, correct: attempts.correct, at: attempts.createdAt })
      .from(attempts).innerJoin(questions, eq(questions.id, attempts.questionId))
      .where(and(eq(attempts.userId, userId), eq(questions.classId, classId)))
      .orderBy(desc(attempts.createdAt)).limit(1000),
    db.select({ result: recallChecks.result, at: recallChecks.createdAt })
      .from(recallChecks).innerJoin(lectures, eq(lectures.id, recallChecks.lectureId))
      .where(and(eq(recallChecks.userId, userId), eq(lectures.classId, classId)))
      .orderBy(desc(recallChecks.createdAt)).limit(50),
  ]);
  const recalls: MasteryInputs["recalls"] = [];
  for (const r of recallRows) {
    const res = (r.result ?? {}) as StoredRecall;
    for (const id of res.gotIds ?? []) recalls.push({ conceptId: id, got: true, at: r.at });
    for (const id of res.missedIds ?? []) recalls.push({ conceptId: id, got: false, at: r.at });
  }
  return computeMastery({ cards: cardRows, attempts: attemptRows, recalls });
}
