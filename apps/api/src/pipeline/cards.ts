/**
 * Flashcards and FSRS scheduling.
 * Pure part: `generateCards` asks for 1-3 cards per concept (batches of 12 concepts,
 * every concept guaranteed at least a definition card); `newSchedule` /
 * `applyReview` wrap ts-fsrs (`createEmptyCard`, `fsrs().next`) over the
 * card_state column shape.
 * DB layer: `saveCards`; `getDueCards` lazily creates card_state rows (due now) for
 * cards the user has never seen, then returns what is due; `reviewCard` applies a
 * rating, stores the new state and the ts-fsrs ReviewLog; `scheduleConceptCard`
 * makes a concept's card due now (or creates one) after a wrong answer or a recall miss.
 * All timestamps are UTC Date objects.
 */
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { createEmptyCard, fsrs, type Card as FsrsCard, type Grade, type ReviewLog } from "ts-fsrs";
import type { Card, Rating } from "@slap/contracts";
import { completeJson } from "./llm.ts";
import { CardsOut } from "./schemas.ts";
import { SYSTEM_TUTOR, cardsPrompt, type CardsPayload } from "./tasks.ts";
import { getDb } from "./db.ts";

export type CardSource = CardsPayload["concepts"][number];
export interface GeneratedCard { conceptSlug: string; front: string; back: string }

const BATCH = 12;
const MAX_PER_CONCEPT = 3;

export async function generateCards(concepts: CardSource[]): Promise<GeneratedCard[]> {
  const out: GeneratedCard[] = [];
  for (let i = 0; i < concepts.length; i += BATCH) {
    const batch = concepts.slice(i, i + BATCH).map(c => ({ ...c, definition: c.definition.slice(0, 600), excerpts: c.excerpts.slice(0, 2).map(e => e.slice(0, 300)) }));
    const res = await completeJson("cards", cardsPrompt({ concepts: batch }), CardsOut, { system: SYSTEM_TUTOR, maxTokens: 6000 });
    const per = new Map<string, number>();
    for (const c of res.cards) {
      const n = per.get(c.concept) ?? 0;
      if (!batch.some(b => b.slug === c.concept) || n >= MAX_PER_CONCEPT) continue;
      per.set(c.concept, n + 1);
      out.push({ conceptSlug: c.concept, front: c.front, back: c.back });
    }
    for (const b of batch) if (!per.get(b.slug) && b.definition) out.push({ conceptSlug: b.slug, front: `What is ${b.name}?`, back: b.definition });
  }
  return out;
}

// ---------- FSRS ----------

const scheduler = fsrs();

/** card_state columns (camelCase, as Drizzle returns them). */
export interface ScheduleState {
  due: Date; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number;
  learningSteps: number; reps: number; lapses: number; state: number; lastReview: Date | null;
}

export function newSchedule(now = new Date()): ScheduleState {
  return fromFsrs(createEmptyCard(now));
}

export function toFsrs(s: ScheduleState): FsrsCard {
  return {
    due: s.due, stability: s.stability, difficulty: s.difficulty, elapsed_days: s.elapsedDays, scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps, reps: s.reps, lapses: s.lapses, state: s.state, ...(s.lastReview ? { last_review: s.lastReview } : {}),
  };
}

export function fromFsrs(c: FsrsCard): ScheduleState {
  return {
    due: c.due, stability: c.stability, difficulty: c.difficulty, elapsedDays: c.elapsed_days, scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps, reps: c.reps, lapses: c.lapses, state: c.state, lastReview: c.last_review ?? null,
  };
}

export function applyReview(s: ScheduleState, rating: Rating, now = new Date()): { next: ScheduleState; log: ReviewLog } {
  const r = scheduler.next(toFsrs(s), now, rating as Grade);
  return { next: fromFsrs(r.card), log: r.log };
}

// ---------- DB ----------

export async function saveCards(classId: string, lectureId: string | null, cards: GeneratedCard[], ids: Map<string, string>): Promise<number> {
  const rows = cards.flatMap(c => {
    const conceptId = ids.get(c.conceptSlug);
    return conceptId ? [{ classId, lectureId, conceptId, front: c.front, back: c.back }] : [];
  });
  if (!rows.length) return 0;
  const { db, schema } = await getDb();
  for (let i = 0; i < rows.length; i += 500) await db.insert(schema.cards).values(rows.slice(i, i + 500));
  return rows.length;
}

/** Cards due for the user in a class (oldest due first). Creates missing card_state rows (due now) first. */
export async function getDueCards(userId: string, classId: string, limit = 20, now = new Date()): Promise<Card[]> {
  const { db, schema } = await getDb();
  await db.execute(sql`
    insert into card_state (user_id, card_id, due)
    select ${userId}, c.id, ${now.toISOString()}::timestamptz from cards c
    where c.class_id = ${classId}
      and not exists (select 1 from card_state s where s.user_id = ${userId} and s.card_id = c.id)
    on conflict do nothing`);
  const { cards, cardState } = schema;
  const rows = await db.select({ id: cards.id, conceptId: cards.conceptId, front: cards.front, back: cards.back, due: cardState.due, state: cardState.state })
    .from(cardState).innerJoin(cards, eq(cards.id, cardState.cardId))
    .where(and(eq(cardState.userId, userId), eq(cards.classId, classId), lte(cardState.due, now)))
    .orderBy(asc(cardState.due), asc(cards.id))
    .limit(Math.max(1, Math.min(200, limit)));
  return rows.map(r => ({ id: r.id, conceptId: r.conceptId, front: r.front, back: r.back, due: r.due.toISOString(), state: r.state }));
}

export async function reviewCard(userId: string, cardId: string, rating: Rating, now = new Date()): Promise<{ due: string; state: number }> {
  const { db, schema } = await getDb();
  const { cardState } = schema;
  const [row] = await db.select().from(cardState).where(and(eq(cardState.userId, userId), eq(cardState.cardId, cardId)));
  const cur: ScheduleState = row ?? newSchedule(now);
  const { next, log } = applyReview(cur, rating, now);
  await db.insert(cardState).values({ userId, cardId, ...next })
    .onConflictDoUpdate({ target: [cardState.userId, cardState.cardId], set: { ...next } });
  await db.insert(schema.reviewLogs).values({ userId, cardId, rating, reviewedAt: now, log });
  return { due: next.due.toISOString(), state: next.state };
}

/** Makes one of the concept's cards due now for the user, creating a definition card if the concept has none. */
export async function scheduleConceptCard(userId: string, conceptId: string, now = new Date()): Promise<string | null> {
  const { db, schema } = await getDb();
  const { cards, cardState, concepts } = schema;
  let [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.conceptId, conceptId)).orderBy(asc(cards.id)).limit(1);
  if (!card) {
    const [c] = await db.select().from(concepts).where(eq(concepts.id, conceptId));
    if (!c) return null;
    [card] = await db.insert(cards).values({ classId: c.classId, conceptId, front: `What is ${c.name}?`, back: c.definition || c.name }).returning({ id: cards.id });
  }
  const fresh = newSchedule(now);
  await db.insert(cardState).values({ userId, cardId: card!.id, ...fresh })
    .onConflictDoUpdate({ target: [cardState.userId, cardState.cardId], set: { due: now } });
  return card!.id;
}

/** Number of the user's cards due on each of the next `days` days (day 0 includes overdue and never-seen cards). */
export async function dueForecast(userId: string, classId: string, days: number, now = new Date()): Promise<number[]> {
  const { db } = await getDb();
  const res = await db.execute(sql`
    select greatest(0, floor(extract(epoch from (coalesce(s.due, ${now.toISOString()}::timestamptz) - date_trunc('day', ${now.toISOString()}::timestamptz))) / 86400))::int as d,
           count(*)::int as n
    from cards c left join card_state s on s.card_id = c.id and s.user_id = ${userId}
    where c.class_id = ${classId}
    group by 1`);
  const out = Array.from({ length: days }, () => 0);
  for (const r of res.rows as Array<{ d: number; n: number }>) if (r.d < days) out[r.d]! += r.n;
  return out;
}
