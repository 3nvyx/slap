/**
 * Syllabus parsing: PDF -> { exams: [{name, date, topics}], weeks: [{week, topics, date}],
 * deadlines: [{name, date}] }, stored once in documents.parsed. `nextExam` picks the
 * first exam on or after today; the study plan back-schedules from it.
 */
import { and, desc, eq } from "drizzle-orm";
import { completeJson } from "./llm.ts";
import { SyllabusOut } from "./schemas.ts";
import { SYSTEM_TUTOR, syllabusPrompt } from "./tasks.ts";
import { isoDate } from "./util.ts";
import { getDb } from "./db.ts";

export type Syllabus = SyllabusOut;
export interface NextExam { name: string; date: string; topics: string[]; daysLeft: number }

export async function parseSyllabus(doc: { pdf: Buffer } | { text: string }, today = new Date()): Promise<Syllabus> {
  const out = await completeJson("syllabus", syllabusPrompt({ today: isoDate(today) }), SyllabusOut,
    { system: SYSTEM_TUTOR, maxTokens: 4000, ...("pdf" in doc ? { pdf: doc.pdf } : { docText: doc.text }) });
  return {
    ...out,
    exams: [...out.exams].sort((a, b) => a.date.localeCompare(b.date)),
    weeks: [...out.weeks].sort((a, b) => a.week - b.week),
    deadlines: [...out.deadlines].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function nextExam(s: Pick<Syllabus, "exams"> | null | undefined, today = new Date()): NextExam | null {
  return upcomingExams(s, today)[0] ?? null;
}

/** Exams on or after today, soonest first. */
export function upcomingExams(s: Pick<Syllabus, "exams"> | null | undefined, today = new Date()): NextExam[] {
  const day = isoDate(today);
  return (s?.exams ?? []).filter(x => x.date >= day).sort((a, b) => a.date.localeCompare(b.date)).map(e => ({
    name: e.name, date: e.date, topics: e.topics,
    daysLeft: Math.round((Date.parse(e.date + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86_400_000),
  }));
}

/** The class's most recent parsed syllabus, if any. */
export async function getSyllabus(classId: string): Promise<Syllabus | null> {
  const { db, schema } = await getDb();
  const d = schema.documents;
  const rows = await db.select({ parsed: d.parsed }).from(d).where(and(eq(d.classId, classId), eq(d.kind, "syllabus"))).orderBy(desc(d.createdAt)).limit(5);
  for (const r of rows) {
    const p = SyllabusOut.safeParse(r.parsed);
    if (p.success) return p.data;
  }
  return null;
}
