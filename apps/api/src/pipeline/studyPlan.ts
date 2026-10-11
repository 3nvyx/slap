/**
 * Study plan written by the model (PLAN "Study plan principles", the LLM version of plan.ts):
 * `gatherStudyPlanInput` collects the syllabus dates (exams, deadlines), the lecturer's dated
 * announcements, every lecture's outline (the notes), the concept notes with the student's
 * mastery, and the class's pace (`computePace`, pure: lectures a week, the syllabus week the
 * class is in, per-week topic coverage); `generateStudyPlan` asks the model for key dates and a
 * day-by-day plan back-scheduled from the next exam and matched to that pace; `getStudyPlan`
 * keeps one plan per student, class and day, in memory and in the `study_plans` table so a
 * restart does not throw it away (regenerated on `fresh`, when a lecture lands or the dates
 * change). Concept names in the reply are mapped back to concept ids.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { StudyPlan, StudyPlanDayDetail, StudyPlanKeyDate, StudyPlanPace } from "@slap/contracts";
import { completeJson } from "./llm.ts";
import { StudyPlanOut } from "./schemas.ts";
import { SYSTEM_TUTOR, studyPlanPrompt, type StudyPlanPayload } from "./tasks.ts";
import { getSyllabus, upcomingExams, type Syllabus } from "./syllabus.ts";
import { matchesTopics } from "./examTopics.ts";
import { getMastery } from "./mastery.ts";
import { dueForecast } from "./cards.ts";
import { unpackAnnouncements } from "./outline.ts";
import { addDays, isoDate, slugify } from "./util.ts";
import { getDb } from "./db.ts";

export const MIN_PLAN_DAYS = 7;
export const MAX_PLAN_DAYS = 21;
export const DEFAULT_PLAN_DAYS = 14;
const MAX_CONCEPTS = 40;
const MAX_LECTURES = 30;

/** Days to plan: through the next exam (7..21), else two weeks. */
export function planHorizon(exam: { daysLeft: number } | null): number {
  if (!exam) return DEFAULT_PLAN_DAYS;
  return Math.max(MIN_PLAN_DAYS, Math.min(MAX_PLAN_DAYS, exam.daysLeft + 1));
}

/** How fast the class moves: lectures a week from the lecture dates, the syllabus week it is in
 *  (dated weeks: the last one started; undated: one week per lecture held) and per-week topic coverage. */
export function computePace(lectureDates: string[], syllabus: Pick<Syllabus, "weeks"> | null | undefined, conceptNames: string[], today = new Date()): StudyPlanPayload["pace"] {
  const dates = [...lectureDates].sort();
  const held = dates.length;
  const first = dates[0] ?? null;
  const last = dates.at(-1) ?? null;
  let lecturesPerWeek: number | null = null;
  if (first && last && held >= 2) {
    const spanDays = (Date.parse(last + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86_400_000;
    lecturesPerWeek = Math.round((held / Math.max(1, (spanDays + 1) / 7)) * 10) / 10;
  }
  const weeks = [...(syllabus?.weeks ?? [])].filter(w => w.topics.length).sort((a, b) => a.week - b.week);
  const day = isoDate(today);
  const dated = weeks.filter(w => w.date);
  let currentWeek: number | null = null;
  if (dated.length) currentWeek = dated.filter(w => w.date! <= day).at(-1)?.week ?? null;
  else if (weeks.length && held) currentWeek = Math.min(held, weeks.at(-1)!.week);
  return {
    lecturesHeld: held,
    lecturesPerWeek,
    firstLectureDate: first,
    lastLectureDate: last,
    currentWeek,
    totalWeeks: weeks.length,
    weeks: weeks.map(w => ({
      week: w.week, date: w.date ?? null, topics: w.topics,
      covered: w.topics.filter(t => conceptNames.some(n => matchesTopics(n, [t]))).length,
    })),
  };
}

export interface GatheredInput { payload: StudyPlanPayload; conceptIds: Map<string, string>; nextExam: StudyPlan["nextExam"]; fingerprint: string }

export async function gatherStudyPlanInput(userId: string, classId: string, now = new Date()): Promise<GatheredInput> {
  const { db, schema } = await getDb();
  const today = isoDate(now);
  const [syllabus, mastery, lectureRows, conceptRows] = await Promise.all([
    getSyllabus(classId),
    getMastery(userId, classId),
    db.select({ id: schema.lectures.id, title: schema.lectures.title, date: schema.lectures.date, status: schema.lectures.status, summary: schema.outlines.summary, sections: schema.outlines.sections, announcements: schema.outlines.announcements })
      .from(schema.lectures).leftJoin(schema.outlines, eq(schema.outlines.lectureId, schema.lectures.id))
      .where(eq(schema.lectures.classId, classId)).orderBy(asc(schema.lectures.date), asc(schema.lectures.startedAt)),
    db.select().from(schema.concepts).where(eq(schema.concepts.classId, classId)).orderBy(desc(schema.concepts.emphasis)).limit(MAX_CONCEPTS),
  ]);
  const exams = upcomingExams(syllabus, now);
  const nextExam = exams[0] ? { name: exams[0].name, date: exams[0].date, daysLeft: exams[0].daysLeft } : null;
  const horizonDays = planHorizon(nextExam);
  const dueByDay = await dueForecast(userId, classId, horizonDays, now);
  const daysLeft = (date: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);

  const lectures = lectureRows.filter(l => l.status !== "live");
  const conceptIds = new Map<string, string>();
  for (const c of conceptRows) { conceptIds.set(c.name.toLowerCase(), c.id); conceptIds.set(c.slug, c.id); }
  const payload: StudyPlanPayload = {
    today,
    horizonDays,
    exams: exams.slice(0, 4).map(e => ({ name: e.name, date: e.date, daysLeft: e.daysLeft, topics: e.topics.slice(0, 12) })),
    deadlines: (syllabus?.deadlines ?? []).filter(d => d.date >= today).slice(0, 8).map(d => ({ name: d.name, date: d.date, daysLeft: daysLeft(d.date) })),
    announcements: lectures.flatMap(l => unpackAnnouncements(l.announcements).announcements
      .filter(a => a.when)
      .map(a => ({ lecture: l.title, lectureDate: l.date, kind: a.kind, text: a.text.slice(0, 200), when: a.when ?? null }))).slice(0, 12),
    lectures: lectures.slice(-MAX_LECTURES).map(l => ({
      title: l.title, date: l.date, summary: (l.summary ?? "").slice(0, 400),
      sections: ((l.sections ?? []) as Array<{ title: string }>).map(s => s.title).slice(0, 10),
    })),
    concepts: conceptRows.map(c => ({
      name: c.name, definition: c.definition.slice(0, 240), emphasis: Math.round(c.emphasis * 100) / 100, examFlag: c.examFlag,
      mastery: mastery[c.id] === undefined ? null : Math.round(mastery[c.id]! * 100) / 100,
    })),
    pace: computePace(lectures.map(l => l.date), syllabus, conceptRows.map(c => c.name), now),
    cardsDueByDay: dueByDay,
  };
  const fingerprint = [today, lectures.length, conceptRows.length, exams.map(e => `${e.date} ${e.name}`).join(","), (syllabus?.deadlines ?? []).map(d => `${d.date} ${d.name}`).join(",")].join("|");
  return { payload, conceptIds, nextExam, fingerprint };
}

/** Asks the model and normalises the reply: consecutive dates inside the window (missing days become light
 *  review days), concept names mapped to ids, key dates deduplicated with days-left. */
export async function generateStudyPlan(input: GatheredInput, now = new Date()): Promise<StudyPlan> {
  const { payload, conceptIds, nextExam } = input;
  const out = await completeJson("studyplan", studyPlanPrompt(payload), StudyPlanOut, { system: SYSTEM_TUTOR, maxTokens: 6000 });
  const today = payload.today;
  const end = isoDate(addDays(new Date(today + "T00:00:00Z"), payload.horizonDays - 1));
  const daysLeft = (date: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  const nameOf = new Map<string, string>();
  for (const c of payload.concepts) nameOf.set(c.name.toLowerCase(), c.name);

  const byDate = new Map<string, StudyPlanOut["days"][number]>();
  for (const d of out.days) if (d.date >= today && d.date <= end && !byDate.has(d.date)) byDate.set(d.date, d);
  const days: StudyPlanDayDetail[] = [];
  for (let i = 0; i < payload.horizonDays; i++) {
    const date = isoDate(addDays(new Date(today + "T00:00:00Z"), i));
    const cardsDue = payload.cardsDueByDay[i] ?? 0;
    const d = byDate.get(date);
    if (!d) {
      days.push({ date, focus: "Review", concepts: [], tasks: cardsDue ? [`Review ${cardsDue} card${cardsDue === 1 ? "" : "s"}`] : ["Light review"], minutes: cardsDue ? 20 : 10, cardsDue, reason: "Light day: nothing new scheduled." });
      continue;
    }
    const seen = new Set<string>();
    const concepts = d.concepts.flatMap(raw => {
      const key = raw.toLowerCase();
      const id = conceptIds.get(key) ?? conceptIds.get(slugify(raw)) ?? null;
      const name = nameOf.get(key) ?? raw;
      const dedupe = id ?? name.toLowerCase();
      if (seen.has(dedupe)) return [];
      seen.add(dedupe);
      return [{ id, name }];
    });
    days.push({ date, focus: d.focus || concepts[0]?.name || "Review", concepts, tasks: d.tasks.slice(0, 6), minutes: Math.round(d.minutes), cardsDue, reason: d.reason });
  }

  const seenKeys = new Set<string>();
  const keyDates: StudyPlanKeyDate[] = out.keyDates
    .filter(k => k.date >= today)
    .map(k => ({ date: k.date, daysLeft: daysLeft(k.date), name: k.name, kind: k.kind, note: k.note }))
    .filter(k => { const key = `${k.date}|${k.name.toLowerCase()}`; if (seenKeys.has(key)) return false; seenKeys.add(key); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (nextExam && !keyDates.some(k => k.kind === "exam" && k.date === nextExam.date)) {
    keyDates.push({ date: nextExam.date, daysLeft: nextExam.daysLeft, name: nextExam.name, kind: "exam", note: "" });
    keyDates.sort((a, b) => a.date.localeCompare(b.date));
  }

  const paceData: StudyPlanPace = {
    lecturesHeld: payload.pace.lecturesHeld, lecturesPerWeek: payload.pace.lecturesPerWeek, currentWeek: payload.pace.currentWeek,
    totalWeeks: payload.pace.totalWeeks, lastLectureDate: payload.pace.lastLectureDate,
  };
  return { date: today, generatedAt: now.toISOString(), horizonDays: payload.horizonDays, overview: out.overview, pace: out.pace, paceData, nextExam, keyDates, days };
}

interface Cached { fingerprint: string; plan: StudyPlan }
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<StudyPlan>>();

/** The student's plan for today in this class; written once per day (or when lectures, concepts or the syllabus change). */
export async function getStudyPlan(userId: string, classId: string, opts: { fresh?: boolean; now?: Date } = {}): Promise<StudyPlan> {
  const now = opts.now ?? new Date();
  const key = `${userId}|${classId}`;
  const input = await gatherStudyPlanInput(userId, classId, now);
  const hit = cache.get(key);
  if (hit && hit.fingerprint === input.fingerprint && !opts.fresh) return hit.plan;
  const running = inflight.get(key);
  if (running && !opts.fresh) return running;
  const { db, schema } = await getDb();
  const t = schema.studyPlans;
  if (!hit && !opts.fresh) {
    const [saved] = await db.select({ plan: t.plan, fingerprint: t.fingerprint }).from(t).where(and(eq(t.userId, userId), eq(t.classId, classId))).limit(1);
    if (saved?.fingerprint === input.fingerprint) {
      const plan = saved.plan as StudyPlan;
      cache.set(key, { fingerprint: input.fingerprint, plan });
      return plan;
    }
  }
  const p = generateStudyPlan(input, now).then(async plan => {
    cache.set(key, { fingerprint: input.fingerprint, plan });
    const row = { plan, fingerprint: input.fingerprint, generatedAt: now };
    await db.insert(t).values({ userId, classId, ...row }).onConflictDoUpdate({ target: [t.userId, t.classId], set: row })
      .catch(e => console.error("[studyplan] save:", (e as Error).message));   // the plan is still returned
    return plan;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Test hook. */
export function clearStudyPlanCache() { cache.clear(); }
