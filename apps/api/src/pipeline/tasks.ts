/**
 * The pipeline's LLM tasks: one payload type and one prompt builder per task.
 * Every prompt = instructions + the exact JSON shape wanted + an `<input>` block
 * with the data. Real models and the mock backend read the same prompt.
 * Keep payloads small: callers cap transcript text at util.MAX_PROMPT_CHARS.
 */
import { inputBlock } from "./util.ts";

export type Task = "outline" | "concepts" | "cards" | "questions" | "grade" | "recall" | "book" | "syllabus" | "pretest" | "ask" | "studyplan";

export interface PromptSeg { i: number; start: number; end: number; text: string }

export interface OutlinePayload { segments: PromptSeg[] }
export interface ConceptsPayload { segments: PromptSeg[]; knownConcepts: string[] }
export interface CardsPayload { concepts: Array<{ slug: string; name: string; definition: string; excerpts: string[]; related: string[] }> }
export interface QuestionsPayload {
  lectureTitle: string;
  count: number;
  concepts: Array<{ slug: string; name: string; definition: string; related: Array<{ slug: string; name: string }> }>;
  lectureExamples: string[];
  bookExercises: string[];
}
export interface GradePayload { kind: "short" | "relate"; question: string; modelAnswer: string; explanation: string; answer: string }
export interface RecallPayload { lectureTitle: string; concepts: Array<{ name: string; definition: string }>; outline: string[]; text: string }
export interface BookPayload { knownConcepts: string[] }
export interface SyllabusPayload { today: string }
export interface AskPayload {
  lectureTitle: string;
  question: string;
  /** The transcript lines most relevant to the question (callers cap the size). */
  segments: PromptSeg[];
  concepts: Array<{ name: string; definition: string }>;
}
/** Everything the study plan is written from: the dates with what each exam covers, what each lecture taught, the
 *  uploaded materials, the concept notes and the class's pace. Lectures and materials carry short keys ("L3", "M1")
 *  the model uses to point a task at them. */
export interface StudyPlanPayload {
  today: string;
  horizonDays: number;
  /** Minutes of study a day the plan should fill: normally, and in the 7 days before an exam. */
  budget: { normal: number; examWeek: number };
  /** Upcoming exams and quizzes, soonest first, each with the concepts it covers and the lectures that taught them. */
  exams: Array<{ name: string; date: string; daysLeft: number; kind: "exam" | "quiz"; topics: string[]; concepts: string[]; lectures: string[] }>;
  deadlines: Array<{ name: string; date: string; daysLeft: number }>;
  /** Dated announcements the lecturer made (from the lecture outlines). */
  announcements: Array<{ lecture: string; lectureDate: string; kind: string; text: string; when: string | null }>;
  /** Lectures held so far, oldest first: the outline summary and section titles (the notes) and the concepts taught. */
  lectures: Array<{ key: string; title: string; date: string; daysAgo: number; summary: string; sections: string[]; concepts: string[] }>;
  /** Uploaded documents: a book chapter with the concepts it explains and how many exercises it has, or the syllabus. */
  materials: Array<{ key: string; kind: "book" | "syllabus"; title: string; concepts: string[]; exercises: number }>;
  /** Concept notes: definition, lecturer emphasis (0..1), exam flag, the student's mastery (0..1, null = never practised)
   *  and the lectures that taught it. */
  concepts: Array<{ name: string; definition: string; emphasis: number; examFlag: boolean; mastery: number | null; lectures: string[] }>;
  pace: {
    lecturesHeld: number;
    lecturesPerWeek: number | null;
    firstLectureDate: string | null;
    lastLectureDate: string | null;
    /** Syllabus week the class is in now (by date, else by lectures held), and how many weeks the syllabus lists. */
    currentWeek: number | null;
    totalWeeks: number;
    /** Per syllabus week: its topics and how many of them already have a concept note. */
    weeks: Array<{ week: number; date: string | null; topics: string[]; covered: number }>;
  };
  /** Flashcards due per day, index 0 = today. */
  cardsDueByDay: number[];
}

export interface PretestPayload {
  count: number;
  week: number;
  topics: string[];
  /** What the class has covered so far, so questions can build on it. */
  knownConcepts: Array<{ name: string; definition: string }>;
}

export const SYSTEM_TUTOR =
  "You turn university lecture transcripts and course documents into accurate study material. " +
  "Stay faithful to the source: never invent facts the lecturer or book did not state, and keep the lecturer's terminology. " +
  "Transcripts come from live speech recognition, so fix obvious mis-hearings of technical terms silently.";

export function outlinePrompt(p: OutlinePayload): string {
  return `Split this lecture transcript into 3-8 titled sections in order, covering every segment.
Segments are given as {i: segmentIdx, start, end (seconds), text}.
Also write a 2-3 sentence summary of the whole lecture, and list announcements the lecturer made
(deadlines, exams, schedule changes, opportunities); return [] if there are none.

JSON shape:
{"summary": string,
 "sections": [{"title": string (<= 8 words), "startIdx": number, "endIdx": number, "summary": string (1-2 sentences), "concepts": [string (concept names covered)]}],
 "announcements": [{"kind": "deadline"|"exam"|"schedule"|"opportunity"|"other", "text": string, "when": string|null, "segmentIdx": number|null}]}

${inputBlock(p)}`;
}

export function conceptsPrompt(p: ConceptsPayload): string {
  return `Extract the course concepts taught in this part of a lecture transcript (segments: i = segmentIdx, start in seconds).
A concept is a technical idea, method, quantity or result a student must learn: not filler, not people.
Reuse a name from knownConcepts exactly when the transcript talks about the same idea, so notes merge.
For each concept: a precise 1-2 sentence definition in the lecturer's terms; related concept names (from this
excerpt or knownConcepts); examFlag true only if the lecturer says it will be on an exam/test or stresses it must
be known, with examQuote as their exact words; and mentions: the segmentIdx values where it is discussed with a
short verbatim excerpt (<= 25 words). Return 2-10 concepts, most important first.

JSON shape:
{"concepts": [{"name": string, "definition": string, "related": [string], "examFlag": boolean, "examQuote": string|null,
  "mentions": [{"segmentIdx": number, "excerpt": string}]}]}

${inputBlock(p)}`;
}

export function cardsPrompt(p: CardsPayload): string {
  return `Write spaced-repetition flashcards: 1-3 per concept (more only for rich concepts).
Fronts ask one atomic thing (definition, why/when it is used, a contrast with a related concept, a key formula in words).
Backs are short and self-contained. Use the excerpts for the lecturer's framing. "concept" must be the concept slug.

JSON shape: {"cards": [{"concept": string (slug), "front": string, "back": string}]}

${inputBlock(p)}`;
}

export function questionsPrompt(p: QuestionsPayload): string {
  return `Write about ${p.count} exam-style practice questions for the lecture "${p.lectureTitle}".
Match two style sources: lectureExamples (the lecturer's worked examples and questions from the transcript; styleSource "lecture")
and bookExercises (the textbook's exercises; styleSource "book"; only if any are given).
Mix kinds:
- "mcq": exactly 4 options, one correct; "answer" must equal the correct option's text exactly; plausible distractors.
- "short": a question answerable in 1-3 sentences; "answer" is a model answer.
- "relate": "How are X and Y related?" for two related concepts; set "relateTo" to Y's slug; "answer" states the relation.
"concept" is the main concept's slug. "explanation" is one line on why the answer is right.

JSON shape:
{"questions": [{"concept": string, "kind": "mcq"|"short"|"relate", "prompt": string, "options": [string]|null,
  "answer": string, "explanation": string, "relateTo": string|null, "styleSource": "lecture"|"book"}]}

${inputBlock(p)}`;
}

export function gradePrompt(p: GradePayload): string {
  return `Grade a student's answer as formative feedback (not a mark). Mark it correct if it captures the key idea of the
model answer, even if worded differently or incomplete in minor details. Feedback is one line: what was right or what is missing.

JSON shape: {"correct": boolean, "feedback": string}

${inputBlock(p)}`;
}

export function recallPrompt(p: RecallPayload): string {
  return `A student wrote everything they remember from the lecture "${p.lectureTitle}" without notes.
Compare it against the lecture's concepts. "got": concept names the student recalled correctly (even roughly);
"missed": concept names not mentioned; "wrong": short statements of anything the student got factually wrong.
Use the concept names exactly as given.

JSON shape: {"got": [string], "missed": [string], "wrong": [string]}

${inputBlock(p)}`;
}

export function bookPrompt(p: BookPayload): string {
  return `The attached PDF is a textbook chapter. Extract its concepts (reuse knownConcepts names exactly for the same idea)
with 1-2 sentence definitions, related concept names and a short verbatim excerpt; and its end-of-chapter or in-text
exercises as practice questions (kind "short" unless it is naturally multiple choice; "answer" is a concise model answer
you can justify from the chapter; "concept" is the concept name it tests).

JSON shape:
{"title": string|null, "concepts": [{"name": string, "definition": string, "related": [string], "excerpt": string|null}],
 "exercises": [{"concept": string, "kind": "short"|"mcq", "prompt": string, "options": [string]|null, "answer": string, "explanation": string}]}

${inputBlock(p)}`;
}

export function syllabusPrompt(p: SyllabusPayload): string {
  return `The attached PDF is a course syllabus. Extract exams (name, date, topics), the weekly topic schedule and deadlines
(assignments, projects). Dates as YYYY-MM-DD; today is ${p.today}, use it to infer missing years. Omit anything without a date
except weeks, which may have a null date.

JSON shape:
{"title": string|null, "exams": [{"name": string, "date": "YYYY-MM-DD", "topics": [string]}],
 "weeks": [{"week": number, "topics": [string], "date": "YYYY-MM-DD"|null}], "deadlines": [{"name": string, "date": "YYYY-MM-DD"}]}

${inputBlock(p)}`;
}

export function askPrompt(p: AskPayload): string {
  return `A student asks a question about the lecture "${p.lectureTitle}". Answer it in 2-5 sentences using only what the
transcript lines in "segments" say (each line is "[i @ m:ss] text"; "concepts" are the lecture's concept notes for context).
Quote or paraphrase the lecturer. "cites" lists the i of every line the answer rests on (1-4 lines). If the transcript does
not cover the question, say so in one sentence, set "notInLecture" true and leave "cites" empty; do not answer from outside
knowledge.

JSON shape: {"answer": string, "cites": [number], "notInLecture": boolean}

${inputBlock(p)}`;
}

export function pretestPrompt(p: PretestPayload): string {
  return `Write exactly ${p.count} short pre-lecture questions for a student about to attend week ${p.week}, whose syllabus topics are listed
in "topics". The student has NOT had that lecture yet: ask about the prerequisite ideas, intuitions and definitions a prepared
student should bring, drawing on "knownConcepts" (what the course has covered so far) where they connect. One question per topic
where possible. Kinds: "mcq" (exactly 4 options, one correct; "answer" equals the correct option's text) or "short" (answerable
in 1-2 sentences; "answer" is a model answer). "topic" is the syllabus topic the question is about. "explanation" is one line.

JSON shape:
{"questions": [{"topic": string, "kind": "mcq"|"short", "prompt": string, "options": [string]|null, "answer": string, "explanation": string}]}

${inputBlock(p)}`;
}

// The rules follow reports/"Evidence based study plans.md": retrieval over re-reading, each lecture recalled on
// several separate days, gaps that widen toward the exam, quizzes kept small.
export function studyPlanPrompt(p: StudyPlanPayload): string {
  return `Write a personal study plan for a student in this course, from today (${p.today}) for ${p.horizonDays} days, as tasks the study app can open.
Use only the input: "exams" (upcoming exams and quizzes, each with the "concepts" it covers and the "lectures" that taught them),
"deadlines", "announcements" the lecturer made, "lectures" held so far (key, date, notes and the concepts each taught), "materials"
(uploaded book chapters and the syllabus, with the concepts a chapter explains), "concepts" (definition, lecturer emphasis, examFlag,
the student's mastery from 0 to 1 where null means never practised, and its lectures), "pace" (how fast the class moves and the
syllabus week it is in), "cardsDueByDay" and "budget" (minutes a day).

Task kinds (use only these):
- "recall": write down everything remembered from one lecture, then check what was missed. Needs "lecture".
- "practice": answer practice questions on the task's concepts, or on one lecture. This is the main kind.
- "cards": review the flashcards due that day.
- "notes": go through one lecture's notes, only to repair what recall or practice showed was missing. Needs "lecture".
- "material": work from one uploaded document, e.g. a book chapter's explanation or exercises. Needs "material".
- "pretest": three questions on what the next lecture will cover.

Plan rules:
- Retrieval first: most minutes go to recall, practice and cards. At most one notes or material task a day, never a day of only reading.
- Spread every lecture out. Its first task is a "recall" (today for a lecture from the last 2 days or one whose concepts were never
  practised); then "practice" on its concepts about 2, 5 and 9 days later, then about weekly until the exam that covers it.
  Never put all of one lecture on one day.
- Exams: every concept an exam covers is in at least two practice tasks on different days before it, lowest mastery and examFlag
  first. In the 3 days before an exam, one practice task mixes all its concepts as a rehearsal; the day before is for the weakest;
  exam day is one short task. Set "exam" on the tasks that prepare for it.
- Quizzes are small: practise a quiz's concepts on the 1-2 days before it and do not reshape the other days around it.
- Mix: from the second week of a lecture on, a practice task takes 2-4 concepts from different lectures.
- Use the materials: where a book chapter explains a concept with low mastery, give it a "material" task; put a "pretest" on the
  day before the syllabus topics of the coming week are lectured.
- Size: 2-4 tasks a day adding up to about ${p.budget.normal} minutes, up to ${p.budget.examWeek} in the 7 days before an exam. A "cards" task on every
  day with cards due (about 1 minute per 3 cards, at least 5). One or two tasks on the day before a deadline.
- A task: "title" is a short instruction (at most 9 words) that names the lecture or concepts; "minutes" 3-45; "concepts" are 0-4
  names copied exactly from the input; "lecture" is a lecture key or null; "material" a material key or null; "exam" the exact
  name of the exam or quiz it prepares for, or null.
- A day: "focus" (at most 6 words) and "reason", one line tied to the student's situation (days left, weakest topic, what was just taught).
- "exams": one entry per input exam with a one-sentence "strategy" for it. "keyDates": every exam, deadline and dated announcement
  in the window plus the next exam even if outside it, soonest first, each with a one-line note. "overview" is 2-3 sentences on
  the strategy. "pace" is 1-2 sentences on how the class is moving and whether the student is keeping up, from the data.
- Exactly ${p.horizonDays} days, consecutive from today, dates as YYYY-MM-DD.

JSON shape:
{"overview": string, "pace": string,
 "exams": [{"name": string, "strategy": string}],
 "keyDates": [{"date": "YYYY-MM-DD", "name": string, "kind": "exam"|"deadline"|"lecture"|"other", "note": string}],
 "days": [{"date": "YYYY-MM-DD", "focus": string, "reason": string,
   "tasks": [{"kind": "recall"|"practice"|"cards"|"notes"|"material"|"pretest", "title": string, "minutes": number,
              "lecture": string|null, "concepts": [string], "material": string|null, "exam": string|null}]}]}

${inputBlock(p)}`;
}

/** Segments as sent to the model (times rounded to 0.1 s to keep prompts small). */
export function toPromptSegs(segs: Array<{ idx: number; start: number; end: number; text: string }>): PromptSeg[] {
  return segs.map(s => ({ i: s.idx, start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, text: s.text.trim() }));
}
