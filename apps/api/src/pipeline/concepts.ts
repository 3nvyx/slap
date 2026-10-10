/**
 * Concept notes, the one data model everything hangs off (PLAN "Concept notes are
 * the one data model"). Pure part: `extractConcepts` walks the transcript in
 * ~30-segment batches, passing the running list of known concept names to each call
 * so names are reused and notes merge; results are merged by slug. `computeEmphasis`
 * scores lecturer emphasis = 0.5 x normalised mentions + 0.3 x normalised time share
 * + 0.2 if the lecturer flagged it for the exam.
 * DB layer: `mergeConceptsIntoClass` upserts into `concepts` by (class, slug), bumps
 * mention_count, sets source lecture/book/both, inserts concept_links (stored once,
 * from < to by slug) and concept_mentions. `resetLectureConcepts` undoes a lecture's
 * mentions so a bundle re-run does not double count.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { completeJson } from "./llm.ts";
import { ConceptsOut } from "./schemas.ts";
import { SYSTEM_TUTOR, conceptsPrompt, toPromptSegs } from "./tasks.ts";
import { chunkSegments, clamp01, slugify, type Seg } from "./util.ts";
import { getDb } from "./db.ts";

export interface ExtractedConcept {
  slug: string;
  name: string;
  definition: string;
  related: string[];            // slugs
  examFlag: boolean;
  examQuote?: string | null;
  mentions: Array<{ segmentIdx: number; excerpt: string }>;
}

export const BATCH_SEGMENTS = 30;
const BATCH_CHARS = 10_000;

export async function extractConcepts(segs: Seg[], knownNames: string[] = []): Promise<{ concepts: ExtractedConcept[] }> {
  const sorted = [...segs].sort((a, b) => a.idx - b.idx);
  const bySlug = new Map<string, ExtractedConcept>();
  const relatedNames = new Map<string, Set<string>>();
  const known = new Map(knownNames.map(n => [slugify(n), n]));
  for (const batch of chunkSegments(sorted, BATCH_SEGMENTS, BATCH_CHARS)) {
    const valid = new Set(batch.map(s => s.idx));
    const out = await completeJson("concepts",
      conceptsPrompt({ segments: toPromptSegs(batch), knownConcepts: [...known.values()].slice(0, 200) }),
      ConceptsOut, { system: SYSTEM_TUTOR, maxTokens: 6000 });
    for (const c of out.concepts) {
      const slug = slugify(c.name);
      const name = known.get(slug) ?? c.name;
      const cur = bySlug.get(slug) ?? { slug, name, definition: "", related: [], examFlag: false, examQuote: null, mentions: [] };
      if (c.definition.length > cur.definition.length && (!cur.definition || cur.definition.startsWith("From the lecture"))) cur.definition = c.definition;
      if (c.examFlag) { cur.examFlag = true; cur.examQuote ??= c.examQuote ?? null; }
      for (const m of c.mentions) {
        if (valid.has(m.segmentIdx) && !cur.mentions.some(x => x.segmentIdx === m.segmentIdx)) cur.mentions.push({ segmentIdx: m.segmentIdx, excerpt: m.excerpt.slice(0, 300) });
      }
      if (cur.mentions.length === 0) {
        const hit = batch.find(s => s.text.toLowerCase().includes(name.toLowerCase()));
        if (hit) cur.mentions.push({ segmentIdx: hit.idx, excerpt: hit.text.slice(0, 300) });
      }
      const rel = relatedNames.get(slug) ?? new Set<string>();
      c.related.forEach(r => rel.add(slugify(r)));
      relatedNames.set(slug, rel);
      bySlug.set(slug, cur);
      known.set(slug, name);
    }
  }
  const knownSlugs = new Set(known.keys());
  for (const [slug, c] of bySlug) {
    c.related = [...(relatedNames.get(slug) ?? [])].filter(r => r !== slug && knownSlugs.has(r)).slice(0, 8);
    if (!c.definition) c.definition = c.mentions[0]?.excerpt ?? "";
  }
  return { concepts: [...bySlug.values()] };
}

/** Lecturer emphasis per concept slug (0..1) from mentions, time spent and exam flags. */
export function computeEmphasis(concepts: Array<Pick<ExtractedConcept, "slug" | "examFlag" | "mentions">>, segs: Seg[]): Map<string, number> {
  const dur = new Map(segs.map(s => [s.idx, Math.max(0, s.end - s.start)]));
  const total = segs.reduce((n, s) => n + Math.max(0, s.end - s.start), 0) || 1;
  const stats = concepts.map(c => {
    const idxs = [...new Set(c.mentions.map(m => m.segmentIdx))];
    return { slug: c.slug, exam: c.examFlag, n: idxs.length, time: idxs.reduce((t, i) => t + (dur.get(i) ?? 0), 0) / total };
  });
  const maxN = Math.max(1, ...stats.map(s => s.n));
  const maxT = Math.max(1e-9, ...stats.map(s => s.time));
  return new Map(stats.map(s => [s.slug, round3(clamp01(0.5 * (s.n / maxN) + 0.3 * (s.time / maxT) + (s.exam ? 0.2 : 0)))]));
}

function round3(x: number) { return Math.round(x * 1000) / 1000; }

export interface MergeInput {
  classId: string;
  lectureId: string | null;
  source: "lecture" | "book";
  concepts: ExtractedConcept[];
  emphasis?: Map<string, number>;
  segs?: Seg[];                 // to map mention segmentIdx -> segment id
}

/** Upserts concepts, links and mentions. Returns slug -> concept id for every concept of the class. */
export async function mergeConceptsIntoClass(input: MergeInput): Promise<Map<string, string>> {
  const { db, schema } = await getDb();
  const c = schema.concepts;
  const ids = new Map<string, string>();
  if (input.concepts.length) {
    const rows = input.concepts.map(x => ({
      classId: input.classId, slug: x.slug, name: x.name.slice(0, 120), definition: x.definition,
      emphasis: input.emphasis?.get(x.slug) ?? 0, examFlag: x.examFlag, examQuote: x.examQuote ?? null,
      mentionCount: input.source === "lecture" ? x.mentions.length : 0, source: input.source, updatedAt: new Date(),
    }));
    const other = input.source === "lecture" ? "book" : "lecture";
    const upserted = await db.insert(c).values(rows).onConflictDoUpdate({
      target: [c.classId, c.slug],
      set: {
        definition: sql`case when ${c.definition} = '' or ${c.definition} like 'From the lecture%' then excluded.definition else ${c.definition} end`,
        emphasis: sql`greatest(${c.emphasis}, excluded.emphasis)`,
        examFlag: sql`${c.examFlag} or excluded.exam_flag`,
        examQuote: sql`coalesce(${c.examQuote}, excluded.exam_quote)`,
        mentionCount: sql`${c.mentionCount} + excluded.mention_count`,
        source: sql`case when ${c.source} = ${other} then 'both' else ${c.source} end`,
        updatedAt: sql`now()`,
      },
    }).returning({ id: c.id, slug: c.slug });
    for (const r of upserted) ids.set(r.slug, r.id);
  }
  const all = await db.select({ id: c.id, slug: c.slug }).from(c).where(eq(c.classId, input.classId));
  for (const r of all) ids.set(r.slug, r.id);

  const links = new Map<string, { fromId: string; toId: string; relation: string }>();
  for (const x of input.concepts) for (const r of x.related) {
    const [a, b] = [x.slug, r].sort();
    const fromId = ids.get(a!), toId = ids.get(b!);
    if (fromId && toId && fromId !== toId) links.set(`${fromId}:${toId}`, { fromId, toId, relation: "related" });
  }
  if (links.size) await db.insert(schema.conceptLinks).values([...links.values()]).onConflictDoNothing();

  if (input.lectureId) {
    const segId = new Map((input.segs ?? []).map(s => [s.idx, s.id ?? null]));
    const mentions = input.concepts.flatMap(x => x.mentions.map(m => ({
      conceptId: ids.get(x.slug)!, lectureId: input.lectureId!, segmentId: segId.get(m.segmentIdx) ?? null, excerpt: m.excerpt,
    }))).filter(m => m.conceptId);
    for (let i = 0; i < mentions.length; i += 500) await db.insert(schema.conceptMentions).values(mentions.slice(i, i + 500));
  }
  return ids;
}

/**
 * Removes a lecture's previous extraction before a re-run: subtracts its mentions from
 * mention_count, deletes the mentions, the lecture's cards and questions, and
 * lecture-only concepts that no longer have any mention.
 */
export async function resetLectureConcepts(classId: string, lectureId: string): Promise<void> {
  const { db, schema } = await getDb();
  const touched = await db.selectDistinct({ id: schema.conceptMentions.conceptId }).from(schema.conceptMentions)
    .where(eq(schema.conceptMentions.lectureId, lectureId));
  await db.execute(sql`
    update concepts c set mention_count = greatest(0, c.mention_count - m.n)
    from (select concept_id, count(*)::int as n from concept_mentions where lecture_id = ${lectureId} group by concept_id) m
    where c.id = m.concept_id`);
  await db.delete(schema.conceptMentions).where(eq(schema.conceptMentions.lectureId, lectureId));
  await db.delete(schema.cards).where(eq(schema.cards.lectureId, lectureId));
  await db.delete(schema.questions).where(eq(schema.questions.lectureId, lectureId));
  if (touched.length) await db.delete(schema.concepts).where(and(
    eq(schema.concepts.classId, classId), eq(schema.concepts.source, "lecture"), eq(schema.concepts.mentionCount, 0),
    inArray(schema.concepts.id, touched.map(t => t.id)),
    sql`not exists (select 1 from concept_mentions cm where cm.concept_id = ${schema.concepts.id})`));
}

/** Concept names already in the class (for name reuse across lectures). */
export async function classConceptNames(classId: string): Promise<string[]> {
  const { db, schema } = await getDb();
  const rows = await db.select({ name: schema.concepts.name }).from(schema.concepts).where(eq(schema.concepts.classId, classId));
  return rows.map(r => r.name);
}

/** Loads concept rows by id (helper for other modules). */
export async function conceptsByIds(ids: string[]) {
  if (!ids.length) return [];
  const { db, schema } = await getDb();
  return db.select().from(schema.concepts).where(inArray(schema.concepts.id, ids));
}
