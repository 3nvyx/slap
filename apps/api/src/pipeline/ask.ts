/**
 * "Ask the lecture": a student's question answered from the transcript only, with the segments
 * the answer rests on. `selectRelevantSegments` (pure) keeps the prompt small by ranking lines by
 * content-word overlap with the question and sending those plus their neighbours, in order;
 * `answerQuestion` (pure, LLM; mock = quoting the best lines) returns the answer and citations;
 * `askLecture` is the DB layer. Nothing is stored.
 */
import type { LectureAnswer } from "@slap/contracts";
import { asc, desc, eq } from "drizzle-orm";
import { completeJson } from "./llm.ts";
import { AskOut } from "./schemas.ts";
import { SYSTEM_TUTOR, askPrompt, toPromptSegs } from "./tasks.ts";
import { MAX_PROMPT_CHARS, keywordOverlap, type Seg } from "./util.ts";
import { getDb } from "./db.ts";

export type AskSeg = Seg & { id: number };

/** Up to `max` characters of transcript: every line when it fits, else the best-matching lines with one neighbour each side. */
export function selectRelevantSegments<T extends Seg>(segs: T[], question: string, max = MAX_PROMPT_CHARS): T[] {
  const total = segs.reduce((n, s) => n + s.text.length + 16, 0);
  if (total <= max) return segs;
  const scored = segs.map((s, i) => ({ i, score: keywordOverlap(question, s.text).shared }));
  const keep = new Set<number>();
  let used = 0;
  const add = (j: number) => {
    if (j < 0 || j >= segs.length || keep.has(j)) return;
    const cost = segs[j]!.text.length + 16;
    if (used + cost > max) return;
    keep.add(j);
    used += cost;
  };
  // Matching lines first (best first; with no match at all, the opening lines), then their neighbours for context.
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.i - b.i);
  for (const { i, score } of ranked) { if (score === 0 && keep.size) break; add(i); }
  for (const i of [...keep]) { add(i - 1); add(i + 1); }
  return segs.filter((_, i) => keep.has(i));
}

export async function answerQuestion(lectureTitle: string, question: string, segs: AskSeg[], concepts: Array<{ name: string; definition: string }>): Promise<LectureAnswer> {
  const chosen = selectRelevantSegments(segs, question);
  const out = await completeJson("ask", askPrompt({
    lectureTitle, question: question.slice(0, 500), segments: toPromptSegs(chosen),
    concepts: concepts.slice(0, 15).map(c => ({ name: c.name, definition: c.definition.slice(0, 200) })),
  }), AskOut, { system: SYSTEM_TUTOR, maxTokens: 800 });
  const byIdx = new Map(segs.map(s => [s.idx, s]));
  const citations = [...new Set(out.cites)].flatMap(i => { const s = byIdx.get(i); return s ? [{ segmentId: s.id, start: s.start, excerpt: s.text.trim().slice(0, 160) }] : []; })
    .sort((a, b) => a.start - b.start).slice(0, 4);
  return { answer: out.answer, citations, notInLecture: out.notInLecture && citations.length === 0 };
}

/** Null when the lecture is unknown. A lecture with no transcript yet answers "nothing to go on". */
export async function askLecture(lectureId: string, question: string): Promise<LectureAnswer | null> {
  const { db, schema } = await getDb();
  const { lectures, segments, concepts, conceptMentions } = schema;
  const [lecture] = await db.select({ title: lectures.title }).from(lectures).where(eq(lectures.id, lectureId));
  if (!lecture) return null;
  const [segRows, conceptRows] = await Promise.all([
    db.select({ id: segments.id, idx: segments.idx, start: segments.startS, end: segments.endS, text: segments.text }).from(segments)
      .where(eq(segments.lectureId, lectureId)).orderBy(asc(segments.idx)),
    db.selectDistinct({ name: concepts.name, definition: concepts.definition, emphasis: concepts.emphasis })
      .from(conceptMentions).innerJoin(concepts, eq(concepts.id, conceptMentions.conceptId))
      .where(eq(conceptMentions.lectureId, lectureId)).orderBy(desc(concepts.emphasis)).limit(15),
  ]);
  if (!segRows.length) return { answer: "There is no transcript for this lecture yet.", citations: [], notInLecture: true };
  return answerQuestion(lecture.title, question, segRows, conceptRows);
}
