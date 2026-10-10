/**
 * Study bundle: one job per lecture that turns the transcript into study material,
 * in order outline -> concepts -> cards -> questions (PLAN "Study bundle first").
 * Each step's status is persisted in the `jobs` row; the lecture goes to
 * "processing" when queued and "ready" when done ("ended" if the job fails, so it can
 * be re-run). Re-running is allowed and idempotent: the lecture's previous mentions,
 * cards and questions are replaced (per-student progress on the replaced cards is lost).
 * Import this module (or call its re-exported `resumePendingJobs` at server start)
 * so both job kinds, study_bundle and document_parse, are registered.
 */
import { asc, desc, eq, and } from "drizzle-orm";
import type { StudyBundleStatus, JobStatus } from "@slap/contracts";
import { activeJob, enqueueJob, registerJobKind, waitForJob, type JobContext } from "./jobs.ts";
export { resumePendingJobs, waitForJob } from "./jobs.ts";
import { buildOutline, linkSectionsToConcepts, saveOutline } from "./outline.ts";
import { classConceptNames, computeEmphasis, extractConcepts, mergeConceptsIntoClass, resetLectureConcepts } from "./concepts.ts";
import { generateCards, saveCards } from "./cards.ts";
import { generateQuestions, lectureExamples, saveQuestions } from "./practice.ts";
import { bookExercisePrompts } from "./book.ts";
import "./documents.ts";                       // registers the document_parse job kind
import type { Seg } from "./util.ts";
import { getDb } from "./db.ts";

export const BUNDLE_STEPS = ["outline", "concepts", "cards", "questions"] as const;
const KIND = "study_bundle";

export interface BundleCounts { segments: number; sections: number; concepts: number; cards: number; questions: number }
const lastCounts = new Map<string, BundleCounts>();

/** Queues (or returns the already-active) study bundle job for a lecture. */
export async function enqueueStudyBundle(lectureId: string): Promise<{ jobId: string }> {
  const active = await activeJob(KIND, lectureId);
  if (active) return { jobId: active };
  const { db, schema } = await getDb();
  await db.update(schema.lectures).set({ status: "processing" }).where(eq(schema.lectures.id, lectureId));
  const jobId = await enqueueJob(KIND, lectureId, [...BUNDLE_STEPS]);
  return { jobId };
}

/** Enqueues and waits; used by scripts and tests. */
export async function runStudyBundle(lectureId: string): Promise<{ jobId: string; status: StudyBundleStatus | null; counts?: BundleCounts }> {
  const { jobId } = await enqueueStudyBundle(lectureId);
  await waitForJob(jobId);
  return { jobId, status: await getBundleStatus(lectureId), counts: lastCounts.get(lectureId) };
}

export async function getBundleStatus(lectureId: string): Promise<StudyBundleStatus | null> {
  const { db, schema } = await getDb();
  const j = schema.jobs;
  const [row] = await db.select().from(j).where(and(eq(j.kind, KIND), eq(j.refId, lectureId))).orderBy(desc(j.createdAt)).limit(1);
  if (!row) return null;
  return { lectureId, status: row.status, steps: row.steps as Record<string, JobStatus>, error: row.error };
}

async function runBundle(ctx: JobContext): Promise<void> {
  const lectureId = ctx.refId;
  const { db, schema } = await getDb();
  const [lecture] = await db.select().from(schema.lectures).where(eq(schema.lectures.id, lectureId));
  if (!lecture) throw new Error(`lecture ${lectureId} not found`);
  try {
    const rows = await db.select().from(schema.segments).where(eq(schema.segments.lectureId, lectureId)).orderBy(asc(schema.segments.idx));
    const segs: Seg[] = rows.map(r => ({ id: r.id, idx: r.idx, start: r.startS, end: r.endS, text: r.text }));
    const counts: BundleCounts = { segments: segs.length, sections: 0, concepts: 0, cards: 0, questions: 0 };

    await ctx.step("outline", "running");
    let outline = await buildOutline(segs);
    await saveOutline(lectureId, outline);
    counts.sections = outline.sections.length;
    await ctx.step("outline", "done");

    await ctx.step("concepts", "running");
    await resetLectureConcepts(lecture.classId, lectureId);
    const known = await classConceptNames(lecture.classId);
    const { concepts } = await extractConcepts(segs, known);
    const emphasis = computeEmphasis(concepts, segs);
    const ids = await mergeConceptsIntoClass({ classId: lecture.classId, lectureId, source: "lecture", concepts, emphasis, segs });
    outline = { ...outline, sections: linkSectionsToConcepts(outline.sections, concepts, segs) };
    await saveOutline(lectureId, outline);
    counts.concepts = concepts.length;
    await ctx.step("concepts", "done");

    const nameOf = new Map<string, string>();
    for (const c of concepts) nameOf.set(c.slug, c.name);
    const knownBySlug = new Map((await db.select({ slug: schema.concepts.slug, name: schema.concepts.name }).from(schema.concepts)
      .where(eq(schema.concepts.classId, lecture.classId))).map(r => [r.slug, r.name]));

    await ctx.step("cards", "running");
    const ranked = [...concepts].sort((a, b) => (emphasis.get(b.slug) ?? 0) - (emphasis.get(a.slug) ?? 0));
    const cards = await generateCards(ranked.map(c => ({
      slug: c.slug, name: c.name, definition: c.definition, excerpts: c.mentions.slice(0, 2).map(m => m.excerpt),
      related: c.related.map(r => knownBySlug.get(r) ?? r).slice(0, 3),
    })));
    counts.cards = await saveCards(lecture.classId, lectureId, cards, ids);
    await ctx.step("cards", "done");

    await ctx.step("questions", "running");
    const qs = await generateQuestions({
      lectureTitle: lecture.title,
      count: Math.max(6, Math.min(20, Math.round(concepts.length * 1.5))),
      concepts: ranked.slice(0, 30).map(c => ({
        slug: c.slug, name: c.name, definition: c.definition,
        related: c.related.filter(r => knownBySlug.has(r)).map(r => ({ slug: r, name: knownBySlug.get(r)! })),
      })),
      lectureExamples: lectureExamples(segs),
      bookExercises: await bookExercisePrompts(lecture.classId),
    });
    counts.questions = await saveQuestions(lecture.classId, lectureId, qs, ids);
    await ctx.step("questions", "done");

    await db.update(schema.lectures).set({ status: "ready" }).where(eq(schema.lectures.id, lectureId));
    lastCounts.set(lectureId, counts);
    console.info(`[bundle] lecture ${lectureId}: ${JSON.stringify(counts)}`);
  } catch (e) {
    await db.update(schema.lectures).set({ status: "ended" }).where(eq(schema.lectures.id, lectureId)).catch(() => {});
    throw e;
  }
}

registerJobKind(KIND, runBundle);
