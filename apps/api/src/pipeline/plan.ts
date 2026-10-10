/**
 * "Today" page and the 7-day study plan (PLAN "Study plan principles"): FSRS cards
 * due, the weakest high-emphasis concepts, an interleaved practice set, and a plan
 * back-scheduled from the next exam in the syllabus.
 * `buildPlan` (pure) spreads ranked topics over the days before the exam round-robin
 * (interleaving: each day mixes high and lower priority topics), finishing two days
 * early when the exam is further out, keeps the last day before the exam for the
 * weakest topics, makes exam day light review, then resumes mixed practice toward
 * the following exam. Without a syllabus exam it is a
 * steady 3-topics-a-day plan. Every day has a one-line reason. Day.concepts are
 * concept ids; Today.nextExam is { name, date } or null (web contract).
 */
import { eq, inArray } from "drizzle-orm";
import type { Card, Concept, ExamTopic, Question, StudyPlanDay } from "@slap/contracts";
import { addDays, isoDate } from "./util.ts";
import { getMastery } from "./mastery.ts";
import { getExamTopics } from "./examTopics.ts";
import { dueForecast, getDueCards } from "./cards.ts";
import { pickPractice, questionIdsByConcept } from "./practice.ts";
import { getSyllabus, upcomingExams, type NextExam } from "./syllabus.ts";
import { getDb } from "./db.ts";

export const PLAN_DAYS = 7;

export interface PlanInput {
  today: Date;
  exam: NextExam | null;
  followingExam?: NextExam | null;           // the exam after `exam`, for days after it
  topics: ExamTopic[];                       // ranked, best first
  dueByDay: number[];                        // cards due per day, index 0 = today
  questionsByConcept: Map<string, string[]>;
}

export function buildPlan(p: PlanInput): StudyPlanDay[] {
  const days: StudyPlanDay[] = [];
  const topics = p.topics.filter(t => t.emphasis > 0 || t.examFlag || t.mastery !== null);
  const exam = p.exam && p.exam.daysLeft >= 0 ? p.exam : null;
  const examIn = exam && exam.daysLeft < PLAN_DAYS ? exam.daysLeft : null;     // exam day index inside the window

  // How many study days the topic list is spread over, and topics per day.
  let spreadDays: number;
  let perDay: number;
  if (exam && examIn !== null) {
    spreadDays = Math.max(1, examIn - 1);                                       // last day before the exam is for weak spots
    perDay = Math.min(4, Math.max(1, Math.ceil(Math.min(topics.length, 4 * spreadDays) / spreadDays)));
  } else if (exam) {
    const usable = Math.max(1, exam.daysLeft - 2);
    perDay = Math.min(4, Math.max(2, Math.ceil(topics.length / usable)));
    spreadDays = PLAN_DAYS;
  } else {
    perDay = 3;
    spreadDays = PLAN_DAYS;
  }
  const slots: ExamTopic[][] = Array.from({ length: PLAN_DAYS }, () => []);
  const pool = topics.slice(0, perDay * spreadDays);
  pool.forEach((t, k) => slots[k % spreadDays]!.push(t));
  // If there are fewer topics than slots, cycle so no study day is empty.
  if (topics.length) for (let d = 0; d < spreadDays; d++) if (!slots[d]!.length) slots[d]!.push(topics[d % topics.length]!);

  const weakest = [...topics].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0) || b.score - a.score).slice(0, 3);
  for (let d = 0; d < PLAN_DAYS; d++) {
    const date = isoDate(addDays(p.today, d));
    const due = p.dueByDay[d] ?? 0;
    let chosen: ExamTopic[];
    let reason: string;
    if (exam && examIn !== null && d === examIn) {
      chosen = topics.filter(t => t.examFlag).slice(0, 2);
      reason = `${exam.name} today: light review of flagged topics only, no new material.`;
    } else if (exam && examIn !== null && d > examIn) {
      const k = d - examIn - 1;
      chosen = topics.length ? [0, 1, 2].map(j => topics[(k * 3 + j) % topics.length]!).filter((t, j, a) => a.indexOf(t) === j) : [];
      const next = p.followingExam;
      reason = next
        ? `After ${exam.name}: ${next.daysLeft - d} days to ${next.name}, back to steady mixed practice.`
        : `After ${exam.name}: steady mixed practice so it sticks.`;
    } else if (exam && examIn !== null && d === examIn - 1) {
      chosen = weakest;
      reason = `Day before ${exam.name}: retrieval practice on your weakest high-emphasis topics.`;
    } else {
      chosen = slots[d] ?? [];
      if (exam) {
        const left = exam.daysLeft - d;
        reason = examIn !== null
          ? `${left} day${left === 1 ? "" : "s"} to ${exam.name}: cover ${chosen.length} topic${chosen.length === 1 ? "" : "s"}, mixed across lectures.`
          : `${left} days to ${exam.name} (${exam.date}): ${perDay} topics a day finishes the list 2 days early.`;
      } else {
        reason = chosen.length
          ? `No exam date in a syllabus yet: steady practice on the highest-priority topics, mixed across lectures.`
          : `Nothing new to study yet: review due cards.`;
      }
    }
    if (due > 0 && !reason.includes("cards")) reason = `${reason} Plus ${due} card${due === 1 ? "" : "s"} due.`;
    const questions = chosen.flatMap(t => (p.questionsByConcept.get(t.conceptId) ?? []).slice(0, 1)).slice(0, 3);
    days.push({ date, cardsDue: due, concepts: chosen.map(t => t.conceptId), questions, reason });
  }
  return days;
}

type ConceptRow = typeof import("../db/schema.ts").concepts.$inferSelect;
export function toConceptDto(c: ConceptRow, mastery?: number | null): Concept {
  return {
    id: c.id, classId: c.classId, slug: c.slug, name: c.name, definition: c.definition, emphasis: c.emphasis,
    examFlag: c.examFlag, examQuote: c.examQuote, mentionCount: c.mentionCount, source: c.source, mastery: mastery ?? null,
  };
}

export interface Today {
  date: string;
  cardsDue: Card[];
  weakConcepts: Concept[];
  practice: Question[];
  plan: StudyPlanDay[];
  nextExam: { name: string; date: string } | null;
}

export async function getToday(userId: string, classId: string, now = new Date()): Promise<Today> {
  const [mastery, syllabus] = await Promise.all([getMastery(userId, classId), getSyllabus(classId)]);
  const [exam = null, followingExam = null] = upcomingExams(syllabus, now);
  const topics = await getExamTopics(userId, classId, { mastery, syllabusTopics: exam?.topics ?? [] });
  const [cardsDue, practice, dueByDay] = await Promise.all([
    getDueCards(userId, classId, 20, now),
    pickPractice(userId, classId, 5, mastery),
    dueForecast(userId, classId, PLAN_DAYS, now),
  ]);
  const planTopics = topics.slice(0, 4 * PLAN_DAYS);
  const questionsByConcept = await questionIdsByConcept(classId, planTopics.map(t => t.conceptId));
  const plan = buildPlan({ today: now, exam, followingExam, topics: planTopics, dueByDay, questionsByConcept });

  const weak = topics.filter(t => (t.mastery ?? 0) < 0.7).slice(0, 5);
  const { db, schema } = await getDb();
  const rows = weak.length ? await db.select().from(schema.concepts).where(inArray(schema.concepts.id, weak.map(w => w.conceptId))) : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const weakConcepts = weak.flatMap(w => { const r = byId.get(w.conceptId); return r ? [toConceptDto(r, mastery[r.id])] : []; });
  return { date: isoDate(now), cardsDue, weakConcepts, practice, plan, nextExam: exam ? { name: exam.name, date: exam.date } : null };
}

/** Class concepts with the caller's mastery (for routes that need Concept[]). */
export async function classConcepts(userId: string, classId: string): Promise<Concept[]> {
  const { db, schema } = await getDb();
  const [rows, mastery] = await Promise.all([
    db.select().from(schema.concepts).where(eq(schema.concepts.classId, classId)),
    getMastery(userId, classId),
  ]);
  return rows.map(r => toConceptDto(r, mastery[r.id]));
}
