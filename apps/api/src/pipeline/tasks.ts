/**
 * The pipeline's LLM tasks: one payload type and one prompt builder per task.
 * Every prompt = instructions + the exact JSON shape wanted + an `<input>` block
 * with the data. Real models and the mock backend read the same prompt.
 * Keep payloads small: callers cap transcript text at util.MAX_PROMPT_CHARS.
 */
import { inputBlock } from "./util.ts";

export type Task = "outline" | "concepts" | "cards" | "questions" | "grade" | "recall" | "book" | "syllabus" | "pretest";

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

/** Segments as sent to the model (times rounded to 0.1 s to keep prompts small). */
export function toPromptSegs(segs: Array<{ idx: number; start: number; end: number; text: string }>): PromptSeg[] {
  return segs.map(s => ({ i: s.idx, start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, text: s.text.trim() }));
}
