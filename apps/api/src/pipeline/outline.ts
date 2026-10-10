/**
 * Lecture outline: transcript segments -> { summary, sections, announcements }.
 * Sections carry start/end times taken from the segments the model pointed at, so
 * the lecture page can jump into the transcript. Long transcripts are outlined in
 * <= ~10k-char windows and the sections concatenated.
 * `linkSectionsToConcepts` (run after concept extraction) sets each section's
 * conceptSlugs from where concepts were actually mentioned.
 * DB layer: `saveOutline` upserts the `outlines` row.
 * Student questions (`questionsAsked`): segments the diarization pass labelled speaker >= 1
 * that read as a question. They are stored in the `announcements` jsonb array as entries
 * with `kind: "question"` (no schema change); `unpackAnnouncements` splits them back out.
 * `saveOutline` recomputes them from the segments, and `refreshQuestionsAsked` updates an
 * existing outline after a diarization pass.
 */
import type { Announcement, OutlineSection } from "@slap/contracts";
import { completeJson } from "./llm.ts";
import { OutlineOut } from "./schemas.ts";
import { SYSTEM_TUTOR, outlinePrompt, toPromptSegs } from "./tasks.ts";
import { and, asc, eq, gte } from "drizzle-orm";
import { chunkSegments, slugify, type Seg } from "./util.ts";
import { getDb } from "./db.ts";

export interface QuestionAsked { segmentId: number; text: string; start: number }
export interface OutlineResult { summary: string; sections: OutlineSection[]; announcements: Announcement[]; questionsAsked?: QuestionAsked[] }

const WINDOW_CHARS = 10_000;

export async function buildOutline(segs: Seg[]): Promise<OutlineResult> {
  const sorted = [...segs].sort((a, b) => a.idx - b.idx);
  if (sorted.length === 0) return { summary: "", sections: [], announcements: [] };
  const windows = chunkSegments(sorted, 400, WINDOW_CHARS);
  const summaries: string[] = [];
  const sections: OutlineSection[] = [];
  const announcements: Announcement[] = [];
  for (const win of windows) {
    const out = await completeJson("outline", outlinePrompt({ segments: toPromptSegs(win) }), OutlineOut, { system: SYSTEM_TUTOR, maxTokens: 4000 });
    if (out.summary) summaries.push(out.summary);
    sections.push(...mapSections(out.sections, win));
    for (const a of out.announcements) {
      const seg = a.segmentIdx != null ? win.find(s => s.idx === a.segmentIdx) : undefined;
      announcements.push({ kind: a.kind, text: a.text, when: a.when ?? null, ...(seg?.id != null ? { segmentId: seg.id } : {}) });
    }
  }
  return { summary: summaries.slice(0, 2).join(" "), sections, announcements };
}

/** Converts model sections (segment indices) to timed OutlineSections, clamped to the window and ordered. */
export function mapSections(raw: OutlineOut["sections"], win: Seg[]): OutlineSection[] {
  const first = win[0]!, last = win[win.length - 1]!;
  const nearest = (idx: number) => win.reduce((best, s) => Math.abs(s.idx - idx) < Math.abs(best.idx - idx) ? s : best, first);
  return raw
    .map(r => {
      const a = nearest(Math.max(first.idx, Math.min(last.idx, r.startIdx)));
      const b = nearest(Math.max(first.idx, Math.min(last.idx, Math.max(r.startIdx, r.endIdx))));
      return { title: r.title, start: a.start, end: Math.max(a.end, b.end), summary: r.summary, conceptSlugs: [...new Set(r.concepts.map(slugify))] };
    })
    .sort((x, y) => x.start - y.start);
}

/** Sets each section's conceptSlugs to known concepts mentioned inside it (keeps model picks that are known). */
export function linkSectionsToConcepts(sections: OutlineSection[], concepts: Array<{ slug: string; mentions: Array<{ segmentIdx: number }> }>, segs: Seg[]): OutlineSection[] {
  const startOf = new Map(segs.map(s => [s.idx, s.start]));
  const known = new Set(concepts.map(c => c.slug));
  return sections.map(sec => {
    const inside = concepts.filter(c => c.mentions.some(m => {
      const t = startOf.get(m.segmentIdx);
      return t !== undefined && t >= sec.start && t < sec.end + 0.01;
    })).map(c => c.slug);
    return { ...sec, conceptSlugs: [...new Set([...sec.conceptSlugs.filter(s => known.has(s)), ...inside])] };
  });
}

// ---------- student questions (diarization) ----------

const QUESTION_START = /^(?:(?:so|and|but|um|uh|okay|ok|sorry|wait|professor|excuse me)[,\s]+)*(what|why|how|when|where|who|whom|whose|which|is|are|am|was|were|can|could|would|should|shall|will|do|does|did|isn't|aren't|wasn't|doesn't|don't|didn't|won't|wouldn't|couldn't|shouldn't|have|has|may|might)\b/i;

/** Ends with "?" or starts with a question word (after a filler like "so" or "um"). */
export function isQuestionText(text: string): boolean {
  const t = text.trim();
  return /\?["')\]]*$/.test(t) || QUESTION_START.test(t);
}

/** Student (speaker >= 1) segments that read as questions, in time order. */
export function questionsAskedFrom(segs: Array<{ id: number; text: string; start: number; speaker: number | null }>): QuestionAsked[] {
  return segs.filter(s => (s.speaker ?? 0) >= 1 && isQuestionText(s.text))
    .sort((a, b) => a.start - b.start)
    .map(s => ({ segmentId: s.id, text: s.text.trim(), start: s.start }));
}

type StoredQuestion = QuestionAsked & { kind: "question" };

/** Announcements + questionsAsked -> the stored `announcements` jsonb array. */
export function packAnnouncements(announcements: Announcement[], questions: QuestionAsked[]): Array<Announcement | StoredQuestion> {
  return [...announcements.filter(a => (a.kind as string) !== "question"), ...questions.map(q => ({ kind: "question" as const, ...q }))];
}

/** The stored `announcements` jsonb array -> { announcements, questionsAsked }. */
export function unpackAnnouncements(raw: unknown): { announcements: Announcement[]; questionsAsked: QuestionAsked[] } {
  const items = Array.isArray(raw) ? raw as Array<Record<string, unknown>> : [];
  const questionsAsked = items.filter(a => a?.kind === "question")
    .map(a => ({ segmentId: Number(a.segmentId), text: String(a.text ?? ""), start: Number(a.start ?? 0) }));
  return { announcements: items.filter(a => a && a.kind !== "question") as unknown as Announcement[], questionsAsked };
}

async function loadQuestionsAsked(lectureId: string): Promise<QuestionAsked[]> {
  const { db, schema } = await getDb();
  const s = schema.segments;
  const rows = await db.select({ id: s.id, text: s.text, start: s.startS, speaker: s.speaker }).from(s)
    .where(and(eq(s.lectureId, lectureId), gte(s.speaker, 1))).orderBy(asc(s.idx));
  return questionsAskedFrom(rows);
}

/** Recomputes questionsAsked on an existing outline (after a diarization pass). No-op when there is no outline yet. */
export async function refreshQuestionsAsked(lectureId: string): Promise<QuestionAsked[] | null> {
  const { db, schema } = await getDb();
  const [row] = await db.select({ announcements: schema.outlines.announcements }).from(schema.outlines).where(eq(schema.outlines.lectureId, lectureId)).limit(1);
  if (!row) return null;
  const qs = await loadQuestionsAsked(lectureId);
  const { announcements } = unpackAnnouncements(row.announcements);
  await db.update(schema.outlines).set({ announcements: packAnnouncements(announcements, qs), updatedAt: new Date() })
    .where(eq(schema.outlines.lectureId, lectureId));
  return qs;
}

export async function saveOutline(lectureId: string, o: OutlineResult): Promise<void> {
  const { db, schema } = await getDb();
  const questions = o.questionsAsked ?? await loadQuestionsAsked(lectureId);
  const row = { lectureId, summary: o.summary, sections: o.sections, announcements: packAnnouncements(o.announcements, questions), updatedAt: new Date() };
  await db.insert(schema.outlines).values(row)
    .onConflictDoUpdate({ target: schema.outlines.lectureId, set: { summary: row.summary, sections: row.sections, announcements: row.announcements, updatedAt: row.updatedAt } });
}
