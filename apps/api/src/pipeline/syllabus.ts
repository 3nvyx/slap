/**
 * Syllabus parsing: PDF -> { exams: [{name, date, topics}], weeks: [{week, topics, date}],
 * deadlines: [{name, date}] }, stored once in documents.parsed. `nextExam` picks the
 * first exam on or after today; the study plan back-schedules from it. `getSyllabus` also
 * folds in the dates entered by hand (the `assessments` table): exams and quizzes as exams,
 * assignments as deadlines, so a class needs no syllabus PDF to get a plan.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { completeJson } from "./llm.ts";
import { SyllabusOut } from "./schemas.ts";
import { SYSTEM_TUTOR, syllabusPrompt } from "./tasks.ts";
import { isoDate } from "./util.ts";
import { getDb } from "./db.ts";

/** A parsed syllabus; hand-entered dates added by `withAssessments` carry their `kind` (a syllabus's own exams have none). */
export type Syllabus = Omit<SyllabusOut, "exams"> & { exams: Array<SyllabusOut["exams"][number] & { kind?: "exam" | "quiz" }> };
export interface NextExam { name: string; date: string; topics: string[]; daysLeft: number; kind: "exam" | "quiz" }

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
    name: e.name, date: e.date, topics: e.topics, kind: e.kind ?? "exam",
    daysLeft: Math.round((Date.parse(e.date + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86_400_000),
  }));
}

export interface AssessmentDate { kind: "exam" | "quiz" | "assignment"; name: string; date: string; topics: string[] }

/** The syllabus with hand-entered dates added (same name and date twice counts once). Null when there is neither. */
export function withAssessments(syllabus: Syllabus | null, rows: AssessmentDate[]): Syllabus | null {
  if (!rows.length) return syllabus;
  const exams = [...(syllabus?.exams ?? [])];
  const deadlines = [...(syllabus?.deadlines ?? [])];
  const has = (list: Array<{ name: string; date: string }>, r: AssessmentDate) => list.some(x => x.date === r.date && x.name.toLowerCase() === r.name.toLowerCase());
  for (const r of rows) {
    if (r.kind === "assignment") { if (!has(deadlines, r)) deadlines.push({ name: r.name, date: r.date }); }
    else if (!has(exams, r)) exams.push({ name: r.name, date: r.date, topics: r.topics, kind: r.kind });
  }
  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  return { title: syllabus?.title ?? null, weeks: syllabus?.weeks ?? [], exams: exams.sort(byDate), deadlines: deadlines.sort(byDate) };
}

/** The class's dates and weekly topics: its most recent parsed syllabus, plus the dates entered by hand. Null when there is neither. */
export async function getSyllabus(classId: string): Promise<Syllabus | null> {
  const { db, schema } = await getDb();
  const d = schema.documents, a = schema.assessments;
  const [rows, dates] = await Promise.all([
    db.select({ parsed: d.parsed }).from(d).where(and(eq(d.classId, classId), eq(d.kind, "syllabus"))).orderBy(desc(d.createdAt)).limit(5),
    db.select({ kind: a.kind, name: a.name, date: a.date, topics: a.topics }).from(a).where(eq(a.classId, classId)).orderBy(asc(a.date)),
  ]);
  let syllabus: Syllabus | null = null;
  for (const r of rows) {
    const p = SyllabusOut.safeParse(r.parsed);
    if (p.success) { syllabus = p.data; break; }
  }
  return withAssessments(syllabus, dates.map(r => ({ ...r, topics: Array.isArray(r.topics) ? (r.topics as string[]) : [] })));
}
