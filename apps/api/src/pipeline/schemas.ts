/**
 * Zod schemas for every LLM boundary in the study pipeline, plus `parseModelJson`
 * which strips code fences / prose around the JSON and validates it. Every model
 * reply goes through one of these before it touches the database.
 * Schemas are lenient on input (coerce numbers, default optional arrays) and strict
 * on meaning (enums, required strings).
 */
import { z } from "zod";

const str = z.string().trim();
const nonEmpty = str.min(1);
const idx = z.coerce.number().int().min(0);
const names = z.array(nonEmpty).default([]);

export const AnnouncementKind = z.enum(["deadline", "exam", "schedule", "opportunity", "other"]);

export const OutlineOut = z.object({
  summary: str.default(""),
  sections: z.array(z.object({
    title: nonEmpty,
    startIdx: idx,
    endIdx: idx,
    summary: str.default(""),
    concepts: names,
  })).default([]),
  announcements: z.array(z.object({
    kind: AnnouncementKind.catch("other"),
    text: nonEmpty,
    when: str.nullish(),
    segmentIdx: idx.nullish(),
  })).default([]),
});
export type OutlineOut = z.infer<typeof OutlineOut>;

export const ConceptsOut = z.object({
  concepts: z.array(z.object({
    name: nonEmpty.max(120),
    definition: str.default(""),
    related: names,
    examFlag: z.coerce.boolean().default(false),
    examQuote: str.nullish(),
    mentions: z.array(z.object({ segmentIdx: idx, excerpt: str.default("") })).default([]),
  })).default([]),
});
export type ConceptsOut = z.infer<typeof ConceptsOut>;

export const CardsOut = z.object({
  cards: z.array(z.object({ concept: nonEmpty, front: nonEmpty, back: nonEmpty })).default([]),
});
export type CardsOut = z.infer<typeof CardsOut>;

export const QuestionKind = z.enum(["mcq", "short", "relate"]);
export const QuestionsOut = z.object({
  questions: z.array(z.object({
    concept: nonEmpty,
    kind: QuestionKind,
    prompt: nonEmpty,
    options: z.array(nonEmpty).nullish(),
    answer: nonEmpty,
    explanation: str.default(""),
    relateTo: str.nullish(),
    styleSource: z.enum(["lecture", "book"]).default("lecture"),
  })).default([]),
});
export type QuestionsOut = z.infer<typeof QuestionsOut>;

export const GradeOut = z.object({ correct: z.coerce.boolean(), feedback: str.default("") });
export type GradeOut = z.infer<typeof GradeOut>;

export const RecallOut = z.object({ got: names, missed: names, wrong: names });
export type RecallOut = z.infer<typeof RecallOut>;

export const BookOut = z.object({
  title: str.nullish(),
  concepts: z.array(z.object({
    name: nonEmpty.max(120),
    definition: str.default(""),
    related: names,
    excerpt: str.nullish(),
  })).default([]),
  exercises: z.array(z.object({
    concept: nonEmpty,
    kind: QuestionKind.default("short"),
    prompt: nonEmpty,
    options: z.array(nonEmpty).nullish(),
    answer: nonEmpty,
    explanation: str.default(""),
  })).default([]),
});
export type BookOut = z.infer<typeof BookOut>;

const isoDay = str.regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
export const SyllabusOut = z.object({
  title: str.nullish(),
  exams: z.array(z.object({ name: nonEmpty, date: isoDay, topics: names })).default([]),
  weeks: z.array(z.object({ week: z.coerce.number().int().min(0), topics: names, date: isoDay.nullish() })).default([]),
  deadlines: z.array(z.object({ name: nonEmpty, date: isoDay })).default([]),
});
export type SyllabusOut = z.infer<typeof SyllabusOut>;

/** Removes ``` fences and any prose before the first `{` / after the last `}`. */
export function stripToJson(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1]!.trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return t;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Parses and validates model output. Never throws. */
export function parseModelJson<T>(schema: z.ZodType<T>, text: string): ParseResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(stripToJson(text));
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${(e as Error).message}` };
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 5).map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, error: `schema mismatch: ${issues}` };
  }
  return { ok: true, value: r.data };
}
