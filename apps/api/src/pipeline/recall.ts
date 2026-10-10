/**
 * Recall check: right after a lecture the student types everything they remember;
 * it is compared against the lecture's concepts and outline into got / missed /
 * wrong. `classifyRecall` (pure, LLM; mock = concept-name matching) maps the model's
 * names back to concept ids and guarantees got + missed covers every concept.
 * `recallCheck` stores the result (with concept ids) in recall_checks, which lowers
 * mastery for missed concepts (mastery.ts), and makes a card due now for each miss.
 */
import { desc, eq } from "drizzle-orm";
import type { OutlineSection, RecallResult } from "@slap/contracts";
import { completeJson } from "./llm.ts";
import { RecallOut } from "./schemas.ts";
import { SYSTEM_TUTOR, recallPrompt } from "./tasks.ts";
import { slugify } from "./util.ts";
import { scheduleConceptCard } from "./cards.ts";
import type { StoredRecall } from "./mastery.ts";
import { getDb } from "./db.ts";

export interface RecallConcept { id: string; name: string; definition: string }

const MAX_CONCEPTS = 40;
const MAX_TEXT = 8000;

export async function classifyRecall(lectureTitle: string, concepts: RecallConcept[], outline: string[], text: string): Promise<StoredRecall> {
  const list = concepts.slice(0, MAX_CONCEPTS);
  if (!list.length) return { got: [], missed: [], wrong: [], score: 0, gotIds: [], missedIds: [] };
  const out = await completeJson("recall", recallPrompt({
    lectureTitle, outline: outline.slice(0, 20),
    concepts: list.map(c => ({ name: c.name, definition: c.definition.slice(0, 300) })),
    text: text.slice(0, MAX_TEXT),
  }), RecallOut, { system: SYSTEM_TUTOR, maxTokens: 2000 });
  const find = (name: string) => {
    const s = slugify(name);
    return list.find(c => slugify(c.name) === s) ?? list.find(c => c.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.name.toLowerCase()));
  };
  const got = new Map<string, RecallConcept>();
  for (const n of out.got) { const c = find(n); if (c) got.set(c.id, c); }
  const missed = list.filter(c => !got.has(c.id));
  const gotList = list.filter(c => got.has(c.id));
  return {
    got: gotList.map(c => c.name),
    missed: missed.map(c => c.name),
    wrong: out.wrong.slice(0, 10),
    score: Math.round((gotList.length / list.length) * 100) / 100,
    gotIds: gotList.map(c => c.id),
    missedIds: missed.map(c => c.id),
  };
}

export async function recallCheck(userId: string, lectureId: string, text: string): Promise<RecallResult | null> {
  const { db, schema } = await getDb();
  const { lectures, concepts, conceptMentions, outlines } = schema;
  const [lecture] = await db.select().from(lectures).where(eq(lectures.id, lectureId));
  if (!lecture) return null;
  const rows = await db.selectDistinct({ id: concepts.id, name: concepts.name, definition: concepts.definition, emphasis: concepts.emphasis })
    .from(conceptMentions).innerJoin(concepts, eq(concepts.id, conceptMentions.conceptId))
    .where(eq(conceptMentions.lectureId, lectureId)).orderBy(desc(concepts.emphasis)).limit(MAX_CONCEPTS);
  const [o] = await db.select().from(outlines).where(eq(outlines.lectureId, lectureId));
  const sections = ((o?.sections ?? []) as OutlineSection[]).map(s => s.title);
  const stored = await classifyRecall(lecture.title, rows, sections, text);
  await db.insert(schema.recallChecks).values({ userId, lectureId, text: text.slice(0, 20_000), result: stored });
  for (const id of (stored.missedIds ?? []).slice(0, 10)) await scheduleConceptCard(userId, id);
  return { got: stored.got, missed: stored.missed, wrong: stored.wrong, score: stored.score };
}
