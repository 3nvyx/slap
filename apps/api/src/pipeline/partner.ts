/**
 * Spoken learning partner (docs/api.md "Learning partner"). One loop: the partner asks a
 * practice question, the student answers by voice (or text), the answer is graded through
 * the practice pipeline (attempt row + card rescheduled when wrong), and the reply gives
 * feedback, a one-sentence explanation from the concept note and a lecture excerpt, then
 * asks the next question in the same breath so the loop keeps moving.
 * Intent: cheap rules first (`classifyIntent`): skip/next/another -> new question;
 * explain/what is/tell me about X -> explanation of concept X; else an answer. When the
 * rules are unsure and the LLM backend is live, `llm.complete` breaks the tie.
 * Each reply is two clips rendered in parallel with streaming Fish TTS: a short lead
 * (acknowledgement or grade + one line of explanation, `feedbackAudioUrl`) and the main part
 * (the next question, `audioUrl`). Turns return as soon as the text exists; the clip ids are
 * allocated up front and GET /api/partner/audio/:id streams bytes as Fish sends them.
 * Sessions and audio live in memory only: sessions expire 60 minutes after their last turn,
 * clips 10 minutes after they start (ids are random UUIDs; 100 MB cap, oldest dropped).
 * Non-English sessions: the student's words are translated to English for intent and
 * grading, and the reply is translated before TTS (Fish voices are multilingual).
 */
import { and, eq } from "drizzle-orm";
import type { PartnerIntent, PartnerReply, PartnerSession, PartnerTurn, Question } from "@slap/contracts";
import { complete, llmBackend } from "./llm.ts";
import { grade, pickPractice } from "./practice.ts";
import { isSourceLang, translate, translateMany } from "./translate.ts";
import { asr, ttsStream } from "./fishAudio.ts";
import { contentWords, firstSentence, slugify, stem } from "./util.ts";
import { getDb } from "./db.ts";

export const SESSION_TTL_MS = 60 * 60_000;
export const AUDIO_TTL_MS = 10 * 60_000;
const MAX_REPLY_WORDS = 60;
const MAX_HISTORY = 50;
const MAX_SESSIONS_PER_USER = 3;
const AUDIO_CACHE_MAX_BYTES = 100 * 1024 * 1024;
const PICK_POOL = 20;
export const MAX_TURN_AUDIO_S = 60;

/** Bad turn input found only after transcription (e.g. compressed audio longer than 60 s). */
export class PartnerInputError extends Error {
  readonly status: 400 | 413;
  constructor(message: string, status: 400 | 413) { super(message); this.name = "PartnerInputError"; this.status = status; }
}

export interface ConceptInfo { id: string; name: string; slug: string; definition: string }
export interface HistoryEntry { role: "student" | "partner"; text: string; intent?: PartnerIntent | "answer" | "explain" | "skip"; at: number }

export interface PartnerState {
  id: string;
  userId: string;
  classId: string;
  lectureId: string | null;
  voiceId: string;
  lang: string;
  openQuestion?: Question;
  asked: string[];                       // question ids asked this session, oldest first
  history: HistoryEntry[];
  createdAt: number;
  lastActive: number;
  concepts: ConceptInfo[];
  lectureQuestionIds: Set<string>;
  busy: Promise<unknown>;                // turns on one session run one at a time
}

/** Turn timings; TTS is not included because audio renders after the reply is returned (see AudioClip.firstByteAt). */
export interface TurnTimings { asrMs: number; llmMs: number; translateMs: number; totalMs: number }
export type TurnResult = PartnerTurn & { timings: TurnTimings };

const sessions = new Map<string, PartnerState>();

// ---------- audio cache (streamed) ----------

/**
 * A clip being rendered or already rendered. Bytes are appended as Fish streams them, so a
 * listener can start playing before rendering ends, and a later replay gets the whole clip.
 */
export interface AudioClip {
  chunks: Buffer[];
  bytes: number;
  done: boolean;
  error: Error | null;
  expires: number;
  startedAt: number;             // performance.now() when the TTS request started
  firstByteAt: number | null;
  doneAt: number | null;
  wake: Set<() => void>;
}

const audioCache = new Map<string, AudioClip>();
let audioBytes = 0;

function dropAudio(id: string) {
  const e = audioCache.get(id);
  if (e) { audioBytes -= e.bytes; audioCache.delete(id); }
}

function newClip(now: number): AudioClip {
  return { chunks: [], bytes: 0, done: false, error: null, expires: now + AUDIO_TTL_MS, startedAt: performance.now(), firstByteAt: null, doneAt: null, wake: new Set() };
}

function register(clip: AudioClip): string {
  const id = crypto.randomUUID();
  audioCache.set(id, clip);
  return id;
}

function append(clip: AudioClip, chunk: Uint8Array) {
  const b = Buffer.from(chunk);
  clip.chunks.push(b);
  clip.bytes += b.length;
  audioBytes += b.length;
  clip.firstByteAt ??= performance.now();
  for (const w of clip.wake) w();
  while (audioBytes > AUDIO_CACHE_MAX_BYTES && audioCache.size > 1) dropAudio(audioCache.keys().next().value!);
}

function settle(clip: AudioClip, error: Error | null) {
  clip.done = true;
  clip.error = error;
  clip.doneAt = performance.now();
  for (const w of clip.wake) w();
}

/** Stores a finished clip; returns its unguessable id. */
export function storeAudio(buf: Buffer, now = Date.now()): string {
  const clip = newClip(now);
  const id = register(clip);
  append(clip, buf);
  settle(clip, null);
  return id;
}

/** Allocates an id at once and pipes `source` into the cache in the background. */
export function streamAudio(source: AsyncIterable<Uint8Array>, now = Date.now()): string {
  const clip = newClip(now);
  const id = register(clip);
  void (async () => {
    try { for await (const c of source) append(clip, c); settle(clip, null); }
    catch (e) { console.warn("[partner] tts failed:", (e as Error).message); settle(clip, e as Error); }
  })();
  return id;
}

/** The clip record (rendering or finished), or undefined if unknown or expired. */
export function getClip(id: string, now = Date.now()): AudioClip | undefined {
  const e = audioCache.get(id);
  if (!e) return undefined;
  if (e.expires <= now) { dropAudio(id); return undefined; }
  return e;
}

/** A finished clip's bytes (undefined while rendering, after a failure, or when unknown). */
export function getAudio(id: string, now = Date.now()): Buffer | undefined {
  const e = getClip(id, now);
  return e?.done && !e.error ? Buffer.concat(e.chunks, e.bytes) : undefined;
}

function changed(clip: AudioClip): Promise<void> {
  return new Promise(resolve => { const w = () => { clip.wake.delete(w); resolve(); }; clip.wake.add(w); });
}

/** Resolves once the clip has its first bytes or has ended. */
export async function clipReady(clip: AudioClip): Promise<void> {
  while (!clip.bytes && !clip.done) await changed(clip);
}

/** All of the clip's bytes in order, waiting for new ones until rendering ends. Throws if rendering fails midway. */
export async function* clipBytes(clip: AudioClip): AsyncGenerator<Buffer> {
  let i = 0;
  for (;;) {
    while (i < clip.chunks.length) yield clip.chunks[i++]!;
    if (clip.done) { if (clip.error) throw clip.error; return; }
    await changed(clip);
  }
}

/** Waits for a clip to finish (verification scripts and tests). */
export async function clipDone(clip: AudioClip): Promise<void> { while (!clip.done) await changed(clip); }

export const audioUrl = (id: string) => `/api/partner/audio/${id}`;

function sweep(now = Date.now()) {
  for (const [id, e] of audioCache) if (e.expires <= now) dropAudio(id);
  for (const [id, s] of sessions) if (s.lastActive + SESSION_TTL_MS <= now) sessions.delete(id);
}
setInterval(() => sweep(), 60_000).unref();

// ---------- sessions ----------

/** The live session, or undefined if unknown or expired. */
export function getSession(id: string, now = Date.now()): PartnerState | undefined {
  const s = sessions.get(id);
  if (s && s.lastActive + SESSION_TTL_MS <= now) { sessions.delete(id); return undefined; }
  return s;
}

export function endSession(id: string): boolean { return sessions.delete(id); }

// ---------- text helpers (pure) ----------

/** Markdown / LaTeX residue removed so TTS reads plain speech. */
export function speechText(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, " ")
    .replace(/\^\{?2\}?/g, " squared").replace(/\^\{?(-?\w+)\}?/g, " to the $1")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/[*_#`$>|~^{}]/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
export const wordCount = (s: string) => words(s).length;

/** At most `n` words: whole sentences when they fit, else a cut ending in "...". */
export function trimWords(s: string, n: number): string {
  const t = s.trim();
  if (n <= 0) return "";
  if (wordCount(t) <= n) return t;
  const sentences = t.split(/(?<=[.!?])\s+/);
  let out = "";
  for (const sen of sentences) {
    const next = out ? `${out} ${sen}` : sen;
    if (wordCount(next) > n) break;
    out = next;
  }
  if (out) return out;
  return words(t).slice(0, n).join(" ").replace(/[,;:]$/, "") + "...";
}

/** Joins reply parts under the word budget. Required parts are kept whole; optional ones are trimmed, lowest priority first. */
export function fitReply(parts: Array<{ text: string; required?: boolean }>, max = MAX_REPLY_WORDS): string {
  const clean = parts.map(p => ({ ...p, text: p.text.trim() })).filter(p => p.text);
  let budget = max - clean.filter(p => p.required).reduce((n, p) => n + wordCount(p.text), 0);
  const out = clean.map(p => {
    if (p.required) return p.text;
    const t = trimWords(p.text, budget);
    budget -= wordCount(t);
    return t;
  });
  return out.filter(Boolean).join(" ");
}

const LETTERS = ["A", "B", "C", "D"];
const MAX_OPTION_WORDS = 15;
const FEEDBACK_MAX_WORDS = 35;

/** A question phrased for speech (options read out as A-D). */
export function speakQuestion(q: Pick<Question, "kind" | "prompt" | "options">): string {
  let p = speechText(q.prompt);
  if (!/[.?!]$/.test(p)) p += "?";
  if (q.kind === "mcq" && q.options?.length) {
    // "A: ... . B: ... ." gives each option its own pause; long options are cut at ~15 words.
    const opts = q.options.map((o, i) => {
      const w = words(speechText(o).replace(/;/g, ",").replace(/[.?!,]+$/, ""));
      return `${LETTERS[i]}: ${w.slice(0, MAX_OPTION_WORDS).join(" ").replace(/[,;:]$/, "")}.`;
    });
    p += ` ${opts.join(" ")}`;
  }
  return p;
}

const ORDINALS: Record<string, number> = { first: 0, one: 0, "1": 0, second: 1, two: 1, "2": 1, third: 2, three: 2, "3": 2, fourth: 3, four: 3, "4": 3, last: 3 };

/** Maps a spoken multiple-choice answer ("B", "option c", "the second one", the option's words) to the option text. */
export function resolveMcqAnswer(answer: string, options: string[]): string {
  const a = answer.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(?:(?:i think|i'd say|i guess|it's|it is|its|the answer is|answer|option|letter|maybe|probably|um|uh)\s+)*([abcd])(?:\s+(?:i think|maybe))?$/.exec(a);
  if (m) return options["abcd".indexOf(m[1]!)] ?? answer;
  const ord = /\b(?:the\s+)?(first|second|third|fourth|last|one|two|three|four|[1-4])(?:\s+one|\s+option)?$/.exec(a);
  if (ord && wordCount(a) <= 5) return options[ORDINALS[ord[1]!]!] ?? answer;
  const given = new Set(contentWords(a).map(stem));
  if (!given.size) return answer;
  const scores = options.map(o => {
    const ws = [...new Set(contentWords(o).map(stem))];
    return ws.length ? ws.filter(w => given.has(w)).length / ws.length : 0;
  });
  const best = Math.max(...scores);
  if (best >= 0.5 && scores.filter(s => s === best).length === 1) return options[scores.indexOf(best)]!;
  return answer;
}

// ---------- intent ----------

export type TurnIntent = "answer" | "explain" | "skip";
export interface IntentResult { intent: TurnIntent; conceptId: string | null; topic?: string; ambiguous: boolean }

const SKIP_WORD = /\b(skip|next|another)\b/;
const SKIP_PHRASE = /\b(skip (it|this|that)|next (one|question)|another (one|question)|give me another|different question|pass)\b/;
const EXPLAIN = /^(?:(?:okay|ok|so|um|uh|hmm|please|hey|wait)\s+)*(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(explain|what is|what's|whats|what are|tell me about|tell me more about|remind me what)\b\s*(.*)$/;
const DEICTIC = /^(that|this|it|that one|this one|that again|this concept|that concept)?$/;

function normUtterance(s: string): string {
  return s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Best concept for a spoken phrase: exact slug, then containment, then word overlap (>= 0.5). */
export function matchConcept<T extends { name: string; slug: string }>(phrase: string, concepts: T[]): T | null {
  const p = normUtterance(phrase).replace(/^(a|an|the)\s+/, "").replace(/\s+(again|please|mean|means|exactly)$/, "");
  if (!p) return null;
  const slug = slugify(p);
  const exact = concepts.find(c => c.slug === slug || slugify(c.name) === slug);
  if (exact) return exact;
  const contained = concepts
    .filter(c => { const n = normUtterance(c.name); return n.length >= 3 && (p.includes(n) || n.includes(p)); })
    .sort((a, b) => b.name.length - a.name.length);
  if (contained[0]) return contained[0];
  const pw = new Set(contentWords(p).map(stem));
  if (!pw.size) return null;
  let best: T | null = null, bestScore = 0;
  for (const c of concepts) {
    const cw = [...new Set(contentWords(c.name).map(stem))];
    if (!cw.length) continue;
    const score = cw.filter(w => pw.has(w)).length / Math.max(cw.length, pw.size);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Rule-based intent. `ambiguous` marks utterances worth an LLM tiebreak. */
export function classifyIntent(text: string, concepts: Array<{ id: string; name: string; slug: string }>): IntentResult {
  const t = normUtterance(text);
  const n = wordCount(t);
  const ex = EXPLAIN.exec(t);
  const hasSkip = SKIP_WORD.test(t);
  if (hasSkip && !ex && (n <= 6 || SKIP_PHRASE.test(t))) return { intent: "skip", conceptId: null, ambiguous: false };
  if (ex) {
    const topic = (ex[2] ?? "").replace(/\b(mean|means|again|exactly|please)\b/g, " ").replace(/\s+/g, " ").trim();
    const c = DEICTIC.test(topic) ? null : matchConcept(topic, concepts);
    // "what is the answer / what is next" style phrases name no concept: let the tiebreaker look.
    return { intent: "explain", conceptId: c?.id ?? null, topic, ambiguous: !c && !DEICTIC.test(topic) || hasSkip };
  }
  // Long utterance that merely contains "next"/"another", or an utterance phrased as a question: probably an answer, but check.
  const questiony = /\?\s*$/.test(text.trim()) || /\b(explain|what does|how does|why does)\b/.test(t);
  return { intent: "answer", conceptId: null, ambiguous: hasSkip || questiony };
}

async function llmTiebreak(text: string, open: Question | undefined, rule: IntentResult): Promise<TurnIntent> {
  const prompt = [
    "A student is practising out loud with a study partner.",
    `The partner's open question: ${open ? JSON.stringify(open.prompt) : "(none)"}`,
    `The student said: ${JSON.stringify(text.slice(0, 600))}`,
    "Classify the student's intent with exactly one word:",
    "answer = an attempt to answer the open question (including \"I don't know\"),",
    "explain = asking for an explanation of a concept,",
    "skip = wants a different question.",
    "Reply with the single word only.",
  ].join("\n");
  try {
    const out = (await complete("partner_intent", prompt, { maxTokens: 5 })).toLowerCase();
    const m = /\b(answer|explain|skip)\b/.exec(out);
    return (m?.[1] as TurnIntent | undefined) ?? rule.intent;
  } catch (e) {
    console.warn("[partner] intent tiebreak failed:", (e as Error).message);
    return rule.intent;
  }
}

// ---------- DB helpers ----------

async function loadConcepts(classId: string): Promise<ConceptInfo[]> {
  const { db, schema } = await getDb();
  const c = schema.concepts;
  return db.select({ id: c.id, name: c.name, slug: c.slug, definition: c.definition }).from(c).where(eq(c.classId, classId));
}

async function lectureQuestionIds(lectureId: string | null): Promise<Set<string>> {
  if (!lectureId) return new Set();
  const { db, schema } = await getDb();
  const rows = await db.select({ id: schema.questions.id }).from(schema.questions).where(eq(schema.questions.lectureId, lectureId));
  return new Set(rows.map(r => r.id));
}

/** A lecture excerpt for a concept, preferring the session's lecture. */
async function mentionExcerpt(conceptId: string, lectureId: string | null): Promise<string | null> {
  const { db, schema } = await getDb();
  const m = schema.conceptMentions;
  if (lectureId) {
    const [r] = await db.select({ excerpt: m.excerpt }).from(m).where(and(eq(m.conceptId, conceptId), eq(m.lectureId, lectureId))).limit(1);
    if (r?.excerpt) return r.excerpt;
  }
  const [r] = await db.select({ excerpt: m.excerpt }).from(m).where(eq(m.conceptId, conceptId)).limit(1);
  return r?.excerpt ?? null;
}

/** Weak-first practice question not yet asked this session, preferring the session's lecture. */
async function nextQuestion(s: PartnerState): Promise<Question | null> {
  const picks = await pickPractice(s.userId, s.classId, PICK_POOL);
  if (!picks.length) return null;
  const fresh = picks.filter(q => !s.asked.includes(q.id));
  let pool = fresh.length ? fresh : picks.filter(q => q.id !== s.openQuestion?.id);
  if (!pool.length) pool = picks;
  const inLecture = pool.filter(q => s.lectureQuestionIds.has(q.id));
  if (inLecture.length) pool = inLecture;
  // Avoid asking the same concept twice in a row when there is a choice.
  const other = pool.filter(q => q.conceptId !== s.openQuestion?.conceptId);
  return (other[0] ?? pool[0])!;
}

// ---------- reply pieces ----------

function conceptOf(s: PartnerState, id: string | null | undefined): ConceptInfo | undefined {
  return id ? s.concepts.find(c => c.id === id) : undefined;
}

/** "<Name>: <first sentence of the definition>" plus "In the lecture: '<excerpt>'" for speech. */
async function explanationParts(s: PartnerState, c: ConceptInfo): Promise<{ def: string; excerpt: string }> {
  const defn = speechText(firstSentence(c.definition || "", 260));
  const def = defn ? (defn.toLowerCase().startsWith(c.name.toLowerCase()) ? defn : `${c.name}: ${defn}`) : "";
  const ex = await mentionExcerpt(c.id, s.lectureId).catch(() => null);
  const quote = ex ? trimWords(speechText(ex), 18).replace(/[,;:\s]+$/, "") : "";
  const excerpt = quote ? `In the lecture: "${/[.?!]$/.test(quote) ? quote : `${quote}.`}"` : "";
  return { def: /[.?!]$/.test(def) || !def ? def : `${def}.`, excerpt };
}

function remember(s: PartnerState, e: Omit<HistoryEntry, "at">) {
  s.history.push({ ...e, at: Date.now() });
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
}

function setOpen(s: PartnerState, q: Question | null) {
  s.openQuestion = q ?? undefined;
  if (q && !s.asked.includes(q.id)) s.asked.push(q.id);
}

/**
 * A reply before translation and TTS: `lead` is the short first clip (acknowledgement, grade,
 * one-line explanation), `main` the clip that matters next (the question). Each becomes its
 * own audio stream so the student hears the lead within about a second.
 */
interface Draft {
  lead: Array<{ text: string }>;
  main: string;
  intent: PartnerIntent; conceptId: string | null; questionId: string | null; grade: { correct: boolean; feedback: string } | null;
}

const NO_QUESTIONS = "I don't have practice questions for this class yet. Once a lecture's study material is ready, I can quiz you on it.";

/** Lead and main text under the word budget: the lead gets what the main part leaves, at most FEEDBACK_MAX_WORDS. */
export function composeReply(lead: Array<{ text: string }>, main: string, max = MAX_REPLY_WORDS): { feedback: string; main: string } {
  const budget = Math.min(FEEDBACK_MAX_WORDS, Math.max(18, max - wordCount(main)));
  const feedback = fitReply(lead, budget);
  return main.trim() ? { feedback, main: main.trim() } : { feedback: "", main: feedback };
}

/** Translate (non-English sessions) and start both TTS streams in parallel; returns without waiting for audio. */
async function finish(s: PartnerState, d: Draft, t: { translateMs: number }): Promise<PartnerReply> {
  let { feedback, main } = composeReply(d.lead, d.main);
  if (!isSourceLang(s.lang)) {
    const t0 = performance.now();
    try {
      const parts = [feedback, main].filter(Boolean);
      const out = await translateMany(parts, s.lang);
      if (feedback) [feedback, main] = [out[0]!, out[1] ?? ""]; else main = out[0]!;
    } catch (e) { console.warn("[partner] translate failed:", (e as Error).message); }
    t.translateMs += performance.now() - t0;
  }
  const voice = { voiceId: s.voiceId, format: "mp3" as const };
  const feedbackId = feedback ? streamAudio(ttsStream(feedback, voice)) : null;
  const mainId = main ? streamAudio(ttsStream(main, voice)) : null;
  const text = [feedback, main].filter(Boolean).join(" ");
  remember(s, { role: "partner", text, intent: d.intent });
  return {
    text, intent: d.intent, conceptId: d.conceptId, questionId: d.questionId, grade: d.grade,
    audioUrl: mainId ? audioUrl(mainId) : null, feedbackAudioUrl: feedbackId ? audioUrl(feedbackId) : null,
  };
}

// ---------- public API ----------

export interface StartOpts { lectureId?: string | null; voiceId: string; lang?: string | null }

/** Creates a session, picks the opening question (weak-first, preferring `lectureId`) and renders it. */
export async function startSession(user: { id: string }, classId: string, opts: StartOpts): Promise<PartnerSession> {
  const now = Date.now();
  const [concepts, lectureQs] = await Promise.all([loadConcepts(classId), lectureQuestionIds(opts.lectureId ?? null)]);
  const s: PartnerState = {
    id: crypto.randomUUID(), userId: user.id, classId, lectureId: opts.lectureId ?? null, voiceId: opts.voiceId,
    lang: opts.lang || "en", asked: [], history: [], createdAt: now, lastActive: now, concepts, lectureQuestionIds: lectureQs,
    busy: Promise.resolve(),
  };
  const mine = [...sessions.values()].filter(x => x.userId === user.id).sort((a, b) => a.lastActive - b.lastActive);
  for (const old of mine.slice(0, Math.max(0, mine.length - MAX_SESSIONS_PER_USER + 1))) sessions.delete(old.id);
  sessions.set(s.id, s);

  const q = await nextQuestion(s);
  setOpen(s, q);
  const c = conceptOf(s, q?.conceptId);
  const draft: Draft = q
    ? { lead: [{ text: c ? `Let's practise ${c.name}.` : "Let's practise." }], main: speakQuestion(q),
        intent: "question", conceptId: q.conceptId, questionId: q.id, grade: null }
    : { lead: [], main: NO_QUESTIONS, intent: "chat", conceptId: null, questionId: null, grade: null };
  const opening = await finish(s, draft, { translateMs: 0 });
  return { sessionId: s.id, classId, lectureId: s.lectureId, voiceId: s.voiceId, lang: s.lang, opening };
}

export interface TurnInput { audio?: { data: Buffer; mime: string } | null; text?: string | null }

/** One student turn: transcribe, decide the intent, grade/explain/skip, reply with the next question, render audio. */
export function turn(s: PartnerState, input: TurnInput): Promise<TurnResult> {
  const run = s.busy.then(() => doTurn(s, input), () => doTurn(s, input));
  s.busy = run.catch(() => {});
  return run;
}

async function doTurn(s: PartnerState, input: TurnInput): Promise<TurnResult> {
  const t0 = performance.now();
  const tm = { asrMs: 0, llmMs: 0, translateMs: 0 };
  s.lastActive = Date.now();

  let transcript = (input.text ?? "").trim();
  if (input.audio) {
    const a0 = performance.now();
    const r = await asr(input.audio.data, { mime: input.audio.mime, language: s.lang });
    tm.asrMs = performance.now() - a0;
    if (r.duration > MAX_TURN_AUDIO_S + 1) throw new PartnerInputError(`audio too long (max ${MAX_TURN_AUDIO_S} s)`, 413);
    transcript = r.text.trim();
  }
  remember(s, { role: "student", text: transcript });

  let english = transcript;
  if (transcript && !isSourceLang(s.lang)) {
    const x0 = performance.now();
    try { english = await translate(transcript, "en", s.lang); } catch (e) { console.warn("[partner] translate in failed:", (e as Error).message); }
    tm.translateMs += performance.now() - x0;
  }

  const open = s.openQuestion;
  let draft: Draft;
  if (!english) {
    draft = { lead: [{ text: "Sorry, I didn't catch that." }], main: open ? speakQuestion(open) : "Say skip for a new question.",
      intent: "chat", conceptId: open?.conceptId ?? null, questionId: open?.id ?? null, grade: null };
  } else {
    const rule = classifyIntent(english, s.concepts);
    let intent = rule.intent;
    if (rule.ambiguous && llmBackend() !== "mock") {
      const l0 = performance.now();
      intent = await llmTiebreak(english, open, rule);
      tm.llmMs += performance.now() - l0;
    }
    if (intent === "skip" || (!open && intent === "answer")) {
      const q = await nextQuestion(s);
      setOpen(s, q);
      const c = conceptOf(s, q?.conceptId);
      draft = q
        ? { lead: [{ text: open ? "Sure, here's a different one." : "Let's do a question." }, { text: c && !open ? `This one is about ${c.name}.` : "" }], main: speakQuestion(q),
            intent: "question", conceptId: q.conceptId, questionId: q.id, grade: null }
        : { lead: [], main: NO_QUESTIONS, intent: "chat", conceptId: null, questionId: null, grade: null };
    } else if (intent === "explain") {
      const c = conceptOf(s, rule.conceptId) ?? (rule.topic && !DEICTIC.test(rule.topic) ? matchConcept(rule.topic, s.concepts) ?? undefined : undefined)
        ?? conceptOf(s, open?.conceptId);
      if (c) {
        const { def, excerpt } = await explanationParts(s, c);
        draft = { lead: [{ text: def || `${c.name} came up in the lecture.` }, { text: excerpt }], main: open ? `Back to the question: ${speakQuestion(open)}` : "",
          intent: "explanation", conceptId: c.id, questionId: open?.id ?? null, grade: null };
      } else {
        draft = { lead: [{ text: `I couldn't find ${rule.topic ? `"${rule.topic}"` : "that"} in this class's notes.` }], main: open ? `Back to the question: ${speakQuestion(open)}` : "",
          intent: "chat", conceptId: null, questionId: open?.id ?? null, grade: null };
      }
    } else {
      const q = open!;
      const answer = q.kind === "mcq" && q.options?.length ? resolveMcqAnswer(english, q.options) : english;
      const g0 = performance.now();
      const att = await grade(s.userId, q.id, answer);
      tm.llmMs += performance.now() - g0;
      const c = conceptOf(s, q.conceptId);
      const expl = c ? await explanationParts(s, c) : { def: "", excerpt: "" };
      const next = await nextQuestion(s);
      setOpen(s, next);
      const feedback = att ? speechText(att.feedback) : "I couldn't grade that one.";
      const lead = att?.correct ? (/^(correct|right|yes|exactly|great|nice)\b/i.test(feedback) ? "" : "That's right.") : "";
      // Lead clip: the grade plus one line of explanation (the definition, else a lecture excerpt).
      draft = {
        lead: [{ text: lead }, { text: trimWords(feedback, 20) }, { text: trimWords(expl.def || expl.excerpt, 20) }],
        main: next ? `Next question: ${speakQuestion(next)}` : "That's all the questions I have for now.",
        intent: "feedback", conceptId: q.conceptId, questionId: next?.id ?? null,
        grade: att ? { correct: att.correct, feedback: att.feedback } : null,
      };
    }
  }
  const reply = await finish(s, draft, tm);
  s.lastActive = Date.now();
  const timings: TurnTimings = { asrMs: Math.round(tm.asrMs), llmMs: Math.round(tm.llmMs), translateMs: Math.round(tm.translateMs), totalMs: Math.round(performance.now() - t0) };
  return { transcript, reply, timings };
}
