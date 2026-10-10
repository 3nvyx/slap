/**
 * Book chapter ingestion: the PDF goes to the model once and returns concepts (same
 * shape as lecture concepts) plus the chapter's exercises. Concepts merge into the
 * class's notes with source "book" (or "both" when the lecture already had them);
 * book-only concepts get flashcards; exercises become practice questions with
 * styleSource "book". documents.parsed keeps { title, concepts, exercises } so later
 * lecture bundles can write questions in the book's style.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { completeJson } from "./llm.ts";
import { BookOut } from "./schemas.ts";
import { SYSTEM_TUTOR, bookPrompt } from "./tasks.ts";
import { keywordOverlap, slugify } from "./util.ts";
import { classConceptNames, mergeConceptsIntoClass, type ExtractedConcept } from "./concepts.ts";
import { generateCards, saveCards } from "./cards.ts";
import { saveQuestions, type GeneratedQuestion } from "./practice.ts";
import { getDb } from "./db.ts";

export interface BookParsed { title: string | null; concepts: string[]; exercises: Array<{ prompt: string; concept: string }> }

export async function parseBook(doc: { pdf: Buffer } | { text: string }, knownConcepts: string[]): Promise<BookOut> {
  return completeJson("book", bookPrompt({ knownConcepts: knownConcepts.slice(0, 200) }), BookOut,
    { system: SYSTEM_TUTOR, maxTokens: 12_000, ...("pdf" in doc ? { pdf: doc.pdf } : { docText: doc.text }) });
}

/** Book output -> concept list in the lecture shape (deduplicated by slug). */
export function bookConcepts(out: BookOut): ExtractedConcept[] {
  const by = new Map<string, ExtractedConcept>();
  for (const c of out.concepts) {
    const slug = slugify(c.name);
    if (by.has(slug)) continue;
    by.set(slug, { slug, name: c.name, definition: c.definition, related: [], examFlag: false, examQuote: null, mentions: [] });
  }
  for (const c of out.concepts) {
    const cur = by.get(slugify(c.name))!;
    cur.related = [...new Set(c.related.map(slugify))].filter(r => r !== cur.slug && by.has(r));
  }
  return [...by.values()];
}

/** Book exercises -> questions; the tested concept is resolved by slug, else by keyword overlap. */
export function bookExerciseQuestions(out: BookOut, conceptNames: Map<string, string>): GeneratedQuestion[] {
  const slugs = [...conceptNames.keys()];
  return out.exercises.flatMap(e => {
    let slug = slugify(e.concept);
    if (!conceptNames.has(slug)) {
      slug = [...slugs].sort((a, b) => keywordOverlap(e.prompt + " " + e.concept, conceptNames.get(b)!).shared - keywordOverlap(e.prompt + " " + e.concept, conceptNames.get(a)!).shared)[0] ?? "";
    }
    if (!slug) return [];
    const mcqOk = e.kind === "mcq" && e.options?.length === 4 && e.options.includes(e.answer);
    return [{ conceptSlug: slug, kind: mcqOk ? "mcq" as const : "short" as const, prompt: e.prompt, options: mcqOk ? e.options! : null,
      answer: e.answer, explanation: e.explanation, relateToSlug: null, styleSource: "book" as const }];
  });
}

export async function ingestBook(classId: string, doc: { pdf: Buffer } | { text: string }): Promise<{ parsed: BookParsed; concepts: number; cards: number; questions: number }> {
  const known = await classConceptNames(classId);
  const out = await parseBook(doc, known);
  const extracted = bookConcepts(out);
  const ids = await mergeConceptsIntoClass({ classId, lectureId: null, source: "book", concepts: extracted });

  // Flashcards only for concepts that have none yet (book-only concepts).
  const { db, schema } = await getDb();
  const conceptIds = extracted.map(c => ids.get(c.slug)!).filter(Boolean);
  const withCards = conceptIds.length
    ? new Set((await db.selectDistinct({ id: schema.cards.conceptId }).from(schema.cards).where(inArray(schema.cards.conceptId, conceptIds))).map(r => r.id))
    : new Set<string>();
  const needCards = extracted.filter(c => !withCards.has(ids.get(c.slug)!));
  const cards = needCards.length
    ? await saveCards(classId, null, await generateCards(needCards.map(c => ({ slug: c.slug, name: c.name, definition: c.definition, excerpts: [], related: [] }))), ids)
    : 0;

  const all = await db.select({ slug: schema.concepts.slug, name: schema.concepts.name }).from(schema.concepts).where(eq(schema.concepts.classId, classId));
  const qs = bookExerciseQuestions(out, new Map(all.map(r => [r.slug, r.name])));
  const questions = await saveQuestions(classId, null, qs, ids);
  return {
    parsed: { title: out.title ?? null, concepts: extracted.map(c => c.name), exercises: qs.map(q => ({ prompt: q.prompt, concept: q.conceptSlug })) },
    concepts: extracted.length, cards, questions,
  };
}

/** Exercise prompts from the class's books (style source for lecture question generation). */
export async function bookExercisePrompts(classId: string, max = 15): Promise<string[]> {
  const { db, schema } = await getDb();
  const d = schema.documents;
  const rows = await db.select({ parsed: d.parsed }).from(d).where(and(eq(d.classId, classId), eq(d.kind, "book"))).orderBy(desc(d.createdAt)).limit(3);
  return rows.flatMap(r => ((r.parsed as BookParsed | null)?.exercises ?? []).map(e => e.prompt)).slice(0, max);
}
