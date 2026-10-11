/**
 * Study plan written by the model as typed tasks the app can open (the rules are in tasks.ts `studyPlanPrompt`,
 * from reports/"Evidence based study plans.md"). `gatherStudyPlanInput` collects what it is written from: the
 * upcoming exams and quizzes with what each covers (`examScope`), deadlines, the lecturer's dated announcements,
 * every lecture's outline and the concepts it taught, the uploaded materials (book chapters with their concepts,
 * the syllabus), the concept notes with the student's mastery, and the class's pace (`computePace`, pure).
 * `generateStudyPlan` asks the model and normalises the reply: consecutive days, lecture and material keys and
 * concept names mapped back to ids, task kinds repaired when they point at nothing, due cards always scheduled.
 * `getStudyPlan` keeps one plan per student, class and day, in memory and in the `study_plans` table so a
 * restart does not throw it away (regenerated on `fresh`, when a lecture or an upload lands or the dates change).
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { StudyPlan, StudyPlanDayDetail, StudyPlanExam, StudyPlanKeyDate, StudyPlanPace, StudyPlanTask } from "@slap/contracts";
import { completeJson } from "./llm.ts";
import { BookOut, StudyPlanOut, type StudyTaskOut } from "./schemas.ts";
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
const MAX_MATERIALS = 6;
const MAX_EXAM_CONCEPTS = 12;
const MAX_DAY_TASKS = 5;
/** Minutes a day the plan fills: about what students report spending per course, and more in the week before an exam. */
export const PLAN_BUDGET = { normal: 30, examWeek: 75 };

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

type Material = StudyPlan["materials"][number];
type LectureRef = { id: string; title: string };

/** The concepts an exam covers: those its topics name; with no topics (or none matching), those taught in the
 *  lectures held after the previous exam, up to this one (every lecture when that window is empty). */
export function examScope<C extends { name: string; lectures: string[] }>(
  exam: { date: string; topics: string[] }, examDates: string[], lectures: Array<{ key: string; date: string }>, concepts: C[],
): C[] {
  const byTopic = exam.topics.length ? concepts.filter(c => matchesTopics(c.name, exam.topics)) : [];
  if (byTopic.length) return byTopic;
  const prev = examDates.filter(d => d < exam.date).sort().at(-1) ?? "";
  const window = lectures.filter(l => l.date > prev && l.date <= exam.date);
  const keys = new Set((window.length ? window : lectures).map(l => l.key));
  return concepts.filter(c => c.lectures.some(k => keys.has(k)));
}

/** What the model's reply is resolved against: concept names, lecture keys and material keys to the real rows. */
export interface GatheredInput {
  payload: StudyPlanPayload;
  conceptIds: Map<string, string>;          // lower-case name and slug -> concept id
  lectures: Map<string, LectureRef>;        // lower-case key and title -> lecture
  materials: Map<string, Material>;         // lower-case key and title -> document
  exams: StudyPlanExam[];                   // what each upcoming exam covers (strategy filled from the reply)
  nextExam: StudyPlan["nextExam"];
  fingerprint: string;
}

export async function gatherStudyPlanInput(userId: string, classId: string, now = new Date()): Promise<GatheredInput> {
  const { db, schema } = await getDb();
  const today = isoDate(now);
  const [syllabus, mastery, lectureRows, conceptRows, mentionRows, docRows] = await Promise.all([
    getSyllabus(classId),
    getMastery(userId, classId),
    db.select({ id: schema.lectures.id, title: schema.lectures.title, date: schema.lectures.date, status: schema.lectures.status, summary: schema.outlines.summary, sections: schema.outlines.sections, announcements: schema.outlines.announcements })
      .from(schema.lectures).leftJoin(schema.outlines, eq(schema.outlines.lectureId, schema.lectures.id))
      .where(eq(schema.lectures.classId, classId)).orderBy(asc(schema.lectures.date), asc(schema.lectures.startedAt)),
    db.select().from(schema.concepts).where(eq(schema.concepts.classId, classId)).orderBy(desc(schema.concepts.emphasis)).limit(MAX_CONCEPTS),
    db.select({ conceptId: schema.conceptMentions.conceptId, lectureId: schema.conceptMentions.lectureId })
      .from(schema.conceptMentions).innerJoin(schema.lectures, eq(schema.lectures.id, schema.conceptMentions.lectureId))
      .where(eq(schema.lectures.classId, classId)).groupBy(schema.conceptMentions.conceptId, schema.conceptMentions.lectureId),
    db.select({ id: schema.documents.id, kind: schema.documents.kind, title: schema.documents.title, parsed: schema.documents.parsed })
      .from(schema.documents).where(eq(schema.documents.classId, classId)).orderBy(desc(schema.documents.createdAt)).limit(MAX_MATERIALS),
  ]);
  const upcoming = upcomingExams(syllabus, now).slice(0, 4);
  const nextExam = upcoming[0] ? { name: upcoming[0].name, date: upcoming[0].date, daysLeft: upcoming[0].daysLeft } : null;
  // The window runs to the next real exam; a quiz on the way does not cut it short.
  const horizonDays = planHorizon(upcoming.find(e => e.kind === "exam") ?? upcoming[0] ?? null);
  const dueByDay = await dueForecast(userId, classId, horizonDays, now);
  const daysLeft = (date: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  const m2 = (x: number | undefined) => (x === undefined ? null : Math.round(x * 100) / 100);

  // Lectures get the keys the model points at: "L1" is the first lecture held.
  const held = lectureRows.filter(l => l.status !== "live").map((l, i) => ({ ...l, key: `L${i + 1}` }));
  const keyOf = new Map(held.map(l => [l.id, l.key]));
  const taughtIn = new Map<string, string[]>();   // concept id -> lecture keys, oldest first
  for (const m of mentionRows) { const k = keyOf.get(m.lectureId); if (k) taughtIn.set(m.conceptId, [...(taughtIn.get(m.conceptId) ?? []), k]); }
  for (const keys of taughtIn.values()) keys.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const concepts = conceptRows.map(c => ({ id: c.id, name: c.name, lectures: taughtIn.get(c.id) ?? [], mastery: m2(mastery[c.id]), row: c }));
  const conceptIds = new Map<string, string>();
  for (const c of conceptRows) { conceptIds.set(c.name.toLowerCase(), c.id); conceptIds.set(c.slug, c.id); }
  const lectures = new Map<string, LectureRef>();
  for (const l of held) { lectures.set(l.title.toLowerCase(), { id: l.id, title: l.title }); lectures.set(l.key.toLowerCase(), { id: l.id, title: l.title }); }

  const materialList = docRows.map((d, i) => {
    const book = d.kind === "book" ? BookOut.safeParse(d.parsed) : null;
    return { key: `M${i + 1}`, ref: { id: d.id, kind: d.kind, title: d.title } satisfies Material, concepts: book?.success ? book.data.concepts.map(c => c.name).slice(0, 12) : [], exercises: book?.success ? book.data.exercises.length : 0 };
  });
  const materials = new Map<string, Material>();
  for (const m of materialList) { materials.set(m.ref.title.toLowerCase(), m.ref); materials.set(m.key.toLowerCase(), m.ref); }

  const examDates = (syllabus?.exams ?? []).map(e => e.date);
  const scoped = upcoming.map(e => ({ e, covers: examScope(e, examDates, held, concepts).slice(0, MAX_EXAM_CONCEPTS) }));
  const exams: StudyPlanExam[] = scoped.map(({ e, covers }) => {
    const keys = new Set(covers.flatMap(c => c.lectures));
    return {
      name: e.name, date: e.date, daysLeft: e.daysLeft, kind: e.kind,
      concepts: covers.map(c => ({ id: c.id, name: c.name, mastery: c.mastery })),
      lectures: held.filter(l => keys.has(l.key)).map(l => ({ id: l.id, title: l.title })),
      readiness: covers.length ? Math.round((covers.reduce((n, c) => n + (c.mastery ?? 0), 0) / covers.length) * 100) / 100 : null,
      strategy: "",
    };
  });

  const sent = held.slice(-MAX_LECTURES);
  const payload: StudyPlanPayload = {
    today,
    horizonDays,
    budget: PLAN_BUDGET,
    exams: scoped.map(({ e, covers }) => ({
      name: e.name, date: e.date, daysLeft: e.daysLeft, kind: e.kind, topics: e.topics.slice(0, 12),
      concepts: covers.map(c => c.name), lectures: [...new Set(covers.flatMap(c => c.lectures))],
    })),
    deadlines: (syllabus?.deadlines ?? []).filter(d => d.date >= today).slice(0, 8).map(d => ({ name: d.name, date: d.date, daysLeft: daysLeft(d.date) })),
    announcements: sent.flatMap(l => unpackAnnouncements(l.announcements).announcements
      .filter(a => a.when)
      .map(a => ({ lecture: l.title, lectureDate: l.date, kind: a.kind, text: a.text.slice(0, 200), when: a.when ?? null }))).slice(0, 12),
    lectures: sent.map(l => ({
      key: l.key, title: l.title, date: l.date, daysAgo: -daysLeft(l.date), summary: (l.summary ?? "").slice(0, 400),
      sections: ((l.sections ?? []) as Array<{ title: string }>).map(s => s.title).slice(0, 10),
      concepts: concepts.filter(c => c.lectures.includes(l.key)).map(c => c.name).slice(0, 10),
    })),
    materials: materialList.map(m => ({ key: m.key, kind: m.ref.kind, title: m.ref.title, concepts: m.concepts, exercises: m.exercises })),
    concepts: concepts.map(({ row: c, mastery: m, lectures: ls }) => ({
      name: c.name, definition: c.definition.slice(0, 240), emphasis: Math.round(c.emphasis * 100) / 100, examFlag: c.examFlag, mastery: m, lectures: ls,
    })),
    pace: computePace(held.map(l => l.date), syllabus, conceptRows.map(c => c.name), now),
    cardsDueByDay: dueByDay,
  };
  // "v2": plans saved in the older free-text shape are never served.
  const fingerprint = ["v2", today, held.length, conceptRows.length, upcoming.map(e => `${e.date} ${e.name}`).join(","),
    (syllabus?.deadlines ?? []).map(d => `${d.date} ${d.name}`).join(","), docRows.map(d => d.id).join(",")].join("|");
  return { payload, conceptIds, lectures, materials, exams, nextExam, fingerprint };
}

const clampMinutes = (n: number, cardsDue: number, kind: string) => Math.max(3, Math.min(60, Math.round(n) || (kind === "cards" ? cardsMinutes(cardsDue) : 10)));
/** About a minute per three cards, five at least. */
const cardsMinutes = (n: number) => Math.max(5, Math.min(20, Math.ceil(n / 3)));
const cardsTask = (n: number): StudyPlanTask =>
  ({ kind: "cards", title: `Review ${n} due card${n === 1 ? "" : "s"}`, minutes: cardsMinutes(n), lecture: null, concepts: [], material: null, exam: null });

/** Asks the model for the plan and normalises its reply (`buildStudyPlan`). */
export async function generateStudyPlan(input: GatheredInput, now = new Date()): Promise<StudyPlan> {
  const out = await completeJson("studyplan", studyPlanPrompt(input.payload), StudyPlanOut, { system: SYSTEM_TUTOR, maxTokens: 12000 });
  return buildStudyPlan(out, input, now);
}

/** The model's reply made safe to show: consecutive dates inside the window (missing days become light review
 *  days), keys and names mapped to rows, a task kind that points at nothing turned into one that works, the due
 *  cards on every day that has them, key dates deduplicated with days-left. Pure. */
export function buildStudyPlan(out: StudyPlanOut, input: GatheredInput, now = new Date()): StudyPlan {
  const { payload, conceptIds, nextExam } = input;
  const today = payload.today;
  const end = isoDate(addDays(new Date(today + "T00:00:00Z"), payload.horizonDays - 1));
  const daysLeft = (date: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  const nameOf = new Map<string, string>();
  for (const c of payload.concepts) nameOf.set(c.name.toLowerCase(), c.name);
  const examNames = new Map(payload.exams.map(e => [e.name.toLowerCase(), e.name]));

  const toConcepts = (raw: string[], max: number) => {
    const seen = new Set<string>();
    return raw.flatMap(r => {
      const key = r.toLowerCase();
      const id = conceptIds.get(key) ?? conceptIds.get(slugify(r)) ?? null;
      const name = nameOf.get(key) ?? r;
      const dedupe = id ?? name.toLowerCase();
      if (seen.has(dedupe)) return [];
      seen.add(dedupe);
      return [{ id, name }];
    }).slice(0, max);
  };
  const toTask = (t: StudyTaskOut, cardsDue: number): StudyPlanTask => {
    const lecture = (t.lecture && input.lectures.get(t.lecture.trim().toLowerCase())) || null;
    const material = (t.material && input.materials.get(t.material.trim().toLowerCase())) || null;
    let kind = t.kind;
    if (kind === "material" && !material) kind = lecture ? "notes" : "practice";
    if ((kind === "recall" || kind === "notes") && !lecture) kind = "practice";
    return {
      kind, title: t.title.slice(0, 120), minutes: clampMinutes(t.minutes, cardsDue, kind), lecture, concepts: toConcepts(t.concepts, 4),
      material: kind === "material" ? material : null, exam: (t.exam && examNames.get(t.exam.trim().toLowerCase())) || null,
    };
  };

  const byDate = new Map<string, StudyPlanOut["days"][number]>();
  for (const d of out.days) if (d.date >= today && d.date <= end && !byDate.has(d.date)) byDate.set(d.date, d);
  const days: StudyPlanDayDetail[] = [];
  for (let i = 0; i < payload.horizonDays; i++) {
    const date = isoDate(addDays(new Date(today + "T00:00:00Z"), i));
    const cardsDue = payload.cardsDueByDay[i] ?? 0;
    const d = byDate.get(date);
    let tasks = (d?.tasks ?? []).map(t => toTask(t, cardsDue));
    if (cardsDue && !tasks.some(t => t.kind === "cards")) tasks.unshift(cardsTask(cardsDue));
    tasks = tasks.slice(0, MAX_DAY_TASKS);
    if (!tasks.length) tasks = [{ kind: "practice", title: "Three mixed practice questions", minutes: 10, lecture: null, concepts: [], material: null, exam: null }];
    const concepts = toConcepts(tasks.flatMap(t => t.concepts.map(c => c.name)), 6);
    days.push({
      date, focus: d?.focus || concepts[0]?.name || "Review", concepts, tasks, minutes: tasks.reduce((n, t) => n + t.minutes, 0), cardsDue,
      reason: d?.reason || "Light day: nothing new scheduled.",
    });
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

  const strategies = new Map(out.exams.map(e => [e.name.toLowerCase(), e.strategy]));
  const paceData: StudyPlanPace = {
    lecturesHeld: payload.pace.lecturesHeld, lecturesPerWeek: payload.pace.lecturesPerWeek, currentWeek: payload.pace.currentWeek,
    totalWeeks: payload.pace.totalWeeks, lastLectureDate: payload.pace.lastLectureDate,
  };
  return {
    date: today, generatedAt: now.toISOString(), horizonDays: payload.horizonDays, overview: out.overview, pace: out.pace, paceData, nextExam,
    exams: input.exams.map(e => ({ ...e, strategy: strategies.get(e.name.toLowerCase()) ?? "" })),
    materials: [...new Set(input.materials.values())],
    keyDates, days,
  };
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
