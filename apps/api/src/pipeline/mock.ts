/**
 * Mock LLM backend (LLM_BACKEND=mock): deterministic heuristics per task so the
 * whole product, from outline to grading, works and demos with no API keys.
 * Each function reads the `<input>` payload of the real prompt (tasks.ts) and
 * returns JSON text in the same shape a model would. Quality is "plausible":
 * concepts are frequent noun phrases, definitions are lecture quotes, grading is
 * keyword overlap.
 */
import type { AskPayload, BookPayload, CardsPayload, ConceptsPayload, GradePayload, OutlinePayload, PretestPayload, PromptSeg, QuestionsPayload, RecallPayload, StudyPlanPayload, SyllabusPayload } from "./tasks.ts";
import type { AskOut, BookOut, CardsOut, ConceptsOut, GradeOut, OutlineOut, PretestOut, QuestionsOut, RecallOut, StudyPlanOut, SyllabusOut } from "./schemas.ts";
import { GLOSSARY } from "./mockGlossary.ts";
import { STOPWORDS, contentWords, firstSentence, keywordOverlap, readInputBlock, seededShuffle, slugify, stem, titleCase, tokenize } from "./util.ts";

export function mockComplete(task: string, prompt: string, docText?: string): string {
  const input = readInputBlock<Record<string, unknown>>(prompt) ?? {};
  const out = (() => {
    switch (task) {
      case "outline": return mockOutline(input as unknown as OutlinePayload);
      case "concepts": return mockConcepts(input as unknown as ConceptsPayload);
      case "cards": return mockCards(input as unknown as CardsPayload);
      case "questions": return mockQuestions(input as unknown as QuestionsPayload);
      case "grade": return mockGrade(input as unknown as GradePayload);
      case "recall": return mockRecall(input as unknown as RecallPayload);
      case "book": return mockBook(input as unknown as BookPayload, docText ?? "");
      case "syllabus": return mockSyllabus(input as unknown as SyllabusPayload, docText ?? "");
      case "pretest": return mockPretest(input as unknown as PretestPayload);
      case "ask": return mockAsk(input as unknown as AskPayload);
      case "studyplan": return mockStudyPlan(input as unknown as StudyPlanPayload);
      default: return { text: `mock reply for ${task}` };
    }
  })();
  return JSON.stringify(out);
}

// ---------- keyphrases ----------

interface Phrase { key: string; surface: string; n: number; count: number; score: number; segs: number[]; def?: string }

const EXAM_RE = /\b(on the (exam|midterm|final|test|quiz)|will be (tested|on the)|exam question|you (need|have) to know|make sure you (know|understand))\b/i;
const DEF_RE = /\b(is called|are called|we call|is defined|means|is just|is the|refers to|known as)\b/i;
const TECH_SUFFIX = /(tion|sion|ance|ence|ity|ism|ment|ian|ood|ics|ization|ivity|ogy|ure|ant|ial|ator)s?$/;

const GLOSSARY_RE = GLOSSARY.map(g => ({ g, re: new RegExp(`\\b(${g.aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi") }));

/** Glossary terms (mockGlossary.ts) found in the segments, most frequent first. */
function glossaryHits(segs: Array<{ i: number; text: string }>, known: string[]): Array<Phrase & { aliasWords: Set<string>; strong: boolean }> {
  const out: Array<Phrase & { aliasWords: Set<string>; strong: boolean }> = [];
  for (const { g, re } of GLOSSARY_RE) {
    let count = 0;
    const hitSegs: number[] = [];
    const aliasWords = new Set<string>();
    for (const s of segs) {
      const m = s.text.match(re);
      if (!m) continue;
      count += m.length;
      hitSegs.push(s.i);
      for (const a of m) for (const w of tokenize(a)) aliasWords.add(stem(w));
    }
    const multiWord = g.aliases.some(a => a.includes(" ") && new RegExp(`\\b${a}\\b`, "i").test(segs.map(s => s.text).join(" ")));
    if (count >= 1) {
      const strong = count >= 2 || multiWord || known.includes(g.name);
      out.push({ key: contentWords(g.name).join(" "), surface: g.name, n: g.name.split(/\s+/).length, count, score: 10 + 2 * count, segs: hitSegs, def: g.def, aliasWords, strong });
    }
  }
  return out.sort((a, b) => b.count - a.count || a.surface.localeCompare(b.surface));
}

/**
 * Concept-like phrases: glossary terms first, then frequent noun-ish phrases (1-3 words)
 * with boosts for "called X", capitalised and technical-looking terms.
 */
export function keyphrases(segs: Array<{ i: number; text: string }>, limit: number, known: string[] = []): Phrase[] {
  const allGloss = glossaryHits(segs, known);
  const gloss = allGloss.filter(g => g.strong);
  const glossWords = new Set(allGloss.flatMap(g => [...g.aliasWords]));
  const map = new Map<string, Phrase>();
  const bump = (words: string[], seg: number, extra = 0) => {
    const key = words.map(w => stem(w.toLowerCase())).join(" ");
    const p = map.get(key) ?? { key, surface: words.join(" "), n: words.length, count: 0, score: 0, segs: [] };
    p.count++;
    p.score += 1 + extra;
    if (!p.segs.includes(seg)) p.segs.push(seg);
    map.set(key, p);
  };
  for (const s of segs) {
    const raw = s.text.match(/[A-Za-z][A-Za-z']*/g) ?? [];
    // runs of non-stopwords ("of" allowed inside a run)
    let run: string[] = [];
    const flush = () => {
      while (run.length && run[run.length - 1]!.toLowerCase() === "of") run.pop();
      for (let n = 1; n <= 3; n++) for (let a = 0; a + n <= run.length; a++) {
        const w = run.slice(a, a + n);
        if (w[0]!.toLowerCase() === "of") continue;
        bump(w, s.i);
      }
      run = [];
    };
    raw.forEach((w, k) => {
      const lw = w.toLowerCase();
      if (lw === "of" && run.length) { run.push(w); return; }
      if (STOPWORDS.has(lw) || lw.length < 3 || /'/.test(lw) || /ly$/.test(lw)) { flush(); return; }
      run.push(w);
      if (k === raw.length - 1) flush();
    });
    flush();
    // "called X" / "known as X": strong signal
    for (const m of s.text.matchAll(/\b(?:called|known as|we call)\s+([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*){0,3})/gi)) {
      const words = m[1]!.split(/\s+/).filter(w => !STOPWORDS.has(w.toLowerCase()));
      if (words.length) bump(words.slice(0, 3), s.i, 3);
    }
    // Capitalised mid-sentence words (Gaussian, Theta, GLMs)
    for (const m of s.text.matchAll(/(?<=[a-z,;]\s)([A-Z][A-Za-z]+)/g)) {
      const w = m[1]!;
      if (!STOPWORDS.has(w.toLowerCase()) && w.length > 2) { const p = map.get(stem(w.toLowerCase())); if (p) p.score += 1; }
    }
  }
  const knownKeys = new Set(known.map(k => contentWords(k).join(" ")));
  const cands = [...map.values()].filter(p => {
    const lw = p.key;
    if (knownKeys.has(lw)) { p.score += 3; return true; }
    if (p.n === 1) return p.score >= 3 && lw.length >= 4 && !/ing$/.test(lw);
    return p.score >= 2;
  });
  for (const p of cands) {
    p.score *= 1 + 0.6 * (p.n - 1);
    if (TECH_SUFFIX.test(p.key)) p.score += 0.5;
  }
  cands.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const chosen: Phrase[] = gloss.slice(0, Math.max(1, limit - 1)).map(({ aliasWords, strong, ...p }) => p);
  const has = (big: string, small: string) => (" " + big + " ").includes(" " + small + " ");
  for (const c of cands) {
    if (chosen.length >= limit) break;
    if (c.key.split(" ").every(w => glossWords.has(w))) continue;               // part of a glossary term already picked
    if (chosen.some(x => has(x.key, c.key))) continue;                          // already covered by a longer pick
    if (chosen.some(x => has(c.key, x.key) && c.count < x.count)) continue;     // longer but rarer than its picked head
    chosen.push(c);
  }
  return chosen;
}

function phraseName(p: Phrase): string {
  return p.def ? p.surface : titleCase(p.surface);
}

function containsPhrase(text: string, name: string): boolean {
  const words = contentWords(name);
  if (!words.length) return false;
  const have = new Set(contentWords(text));
  return words.every(w => have.has(w));
}

// ---------- outline ----------

function mockOutline(p: OutlinePayload): OutlineOut {
  const segs = p.segments ?? [];
  if (!segs.length) return { summary: "", sections: [], announcements: [] };
  const total = segs[segs.length - 1]!.end - segs[0]!.start;
  const target = Math.max(45, total / 6);
  const groups: PromptSeg[][] = [];
  let cur: PromptSeg[] = [];
  for (const s of segs) {
    cur.push(s);
    if (s.end - cur[0]!.start >= target && cur.length >= 3) { groups.push(cur); cur = []; }
  }
  if (cur.length) { if (groups.length && cur.length < 3) groups[groups.length - 1]!.push(...cur); else groups.push(cur); }
  const sections = groups.map((g, k) => {
    const kp = keyphrases(g, 3);
    const names = kp.map(phraseName);
    const title = names.length ? names.slice(0, 2).join(" and ") : `Part ${k + 1}`;
    const lead = g.find(s => tokenize(s.text).length >= 8 && kp.some(x => containsPhrase(s.text, x.surface))) ?? g[0]!;
    return {
      title,
      startIdx: g[0]!.i,
      endIdx: g[g.length - 1]!.i,
      summary: names.length ? `Covers ${listJoin(names)}. ${firstSentence(lead.text, 160)}` : firstSentence(lead.text, 160),
      concepts: names,
    };
  });
  const top = keyphrases(segs, 4).map(phraseName);
  const announcements: OutlineOut["announcements"] = [];
  for (const s of segs) {
    const t = s.text;
    const kind = /\b(midterm|final exam|exam|quiz)\b/i.test(t) ? "exam"
      : /\b(due|deadline|homework|problem set|assignment)\b/i.test(t) ? "deadline"
      : /\b(office hours|next week|no class|moved to|rescheduled)\b/i.test(t) ? "schedule"
      : /\b(internship|scholarship|hiring|research position|opportunit)/i.test(t) ? "opportunity" : null;
    if (kind && !/\bexam(ple)?s?\b.*\bexample\b/i.test(t)) announcements.push({ kind, text: firstSentence(t, 200), when: null, segmentIdx: s.i });
  }
  return {
    summary: top.length ? `This lecture covered ${listJoin(top)}. ${sections.length} sections over ${Math.round(total / 60)} minutes.` : "Lecture transcript.",
    sections,
    announcements: announcements.slice(0, 5),
  };
}

function listJoin(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

// ---------- concepts ----------

function mockConcepts(p: ConceptsPayload): ConceptsOut {
  const segs = p.segments ?? [];
  const known = p.knownConcepts ?? [];
  const limit = Math.min(8, Math.max(3, Math.ceil(segs.length / 5)));
  const phrases = keyphrases(segs, limit, known);
  const byIdx = new Map(segs.map(s => [s.i, s]));
  // Reuse a known name when the phrase matches it.
  const nameFor = (ph: Phrase) => known.find(k => contentWords(k).join(" ") === ph.key) ?? phraseName(ph);
  const concepts = phrases.map(ph => {
    const segsFor = ph.segs.map(i => byIdx.get(i)!).filter(Boolean);
    const defSeg = segsFor.find(s => DEF_RE.test(s.text)) ?? segsFor[0]!;
    const examSeg = segsFor.find(s => EXAM_RE.test(s.text));
    return {
      name: nameFor(ph),
      definition: ph.def ?? `From the lecture: "${firstSentence(defSeg.text, 200)}"`,
      related: [] as string[],
      examFlag: Boolean(examSeg),
      examQuote: examSeg ? firstSentence(examSeg.text, 200) : null,
      mentions: segsFor.slice(0, 6).map(s => ({ segmentIdx: s.i, excerpt: firstSentence(s.text, 180) })),
      _segs: ph.segs,
    };
  });
  // related = co-occurrence within +-1 segment
  for (const c of concepts) {
    const near = new Set(c._segs.flatMap(i => [i - 1, i, i + 1]));
    c.related = concepts
      .filter(o => o !== c)
      .map(o => ({ o, n: o._segs.filter(i => near.has(i)).length }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map(x => x.o.name);
  }
  return { concepts: concepts.map(({ _segs, ...c }) => c) };
}

// ---------- cards ----------

function mockCards(p: CardsPayload): CardsOut {
  const cards: CardsOut["cards"] = [];
  for (const c of p.concepts ?? []) {
    cards.push({ concept: c.slug, front: `What is ${c.name}?`, back: c.definition || c.name });
    const ex = c.excerpts.find(e => new RegExp(escapeRe(c.name), "i").test(e));
    if (ex) cards.push({ concept: c.slug, front: `Fill in the blank: "${ex.replace(new RegExp(escapeRe(c.name), "ig"), "_____")}"`, back: c.name });
    if (c.related[0]) cards.push({ concept: c.slug, front: `How does ${c.name} connect to ${c.related[0]}?`, back: `They were discussed together in lecture. ${c.definition}` });
  }
  return { cards };
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ---------- questions ----------

function mockQuestions(p: QuestionsPayload): QuestionsOut {
  const concepts = p.concepts ?? [];
  const qs: QuestionsOut["questions"] = [];
  const count = Math.max(1, p.count ?? 6);
  concepts.forEach((c, k) => {
    const others = concepts.filter(o => o.slug !== c.slug && o.definition);
    const kind = k % 3 === 0 && others.length >= 3 ? "mcq" : k % 3 === 2 && c.related.length ? "relate" : "short";
    if (kind === "mcq") {
      const distractors = seededShuffle(others, c.slug, o => o.slug).slice(0, 3).map(o => o.definition);
      const options = seededShuffle([c.definition, ...distractors], c.slug + "opts");
      qs.push({ concept: c.slug, kind, prompt: `Which statement best describes ${c.name}?`, options, answer: c.definition,
        explanation: `${c.name} was described this way in lecture.`, relateTo: null, styleSource: "lecture" });
    } else if (kind === "relate") {
      const r = c.related[0]!;
      qs.push({ concept: c.slug, kind, prompt: `How are ${c.name} and ${r.name} related?`,
        answer: `${c.name} and ${r.name} come up together: ${c.definition}`, explanation: "Both appear in the same part of the lecture.",
        relateTo: r.slug, styleSource: "lecture" });
    } else {
      qs.push({ concept: c.slug, kind: "short", prompt: `Explain ${c.name} in your own words.`, answer: c.definition,
        explanation: `Key idea of ${c.name} from the lecture.`, relateTo: null, styleSource: "lecture" });
    }
  });
  // Questions the lecturer or students asked aloud become lecture-style short questions.
  for (const ex of p.lectureExamples ?? []) {
    const c = concepts.find(c => containsPhrase(ex, c.name));
    if (!c || !ex.trim().endsWith("?") || contentWords(ex).length < 3) continue;
    qs.push({ concept: c.slug, kind: "short", prompt: `From lecture: "${firstSentence(ex, 200)}" Answer it using ${c.name}.`,
      answer: c.definition, explanation: "Asked during the lecture.", relateTo: null, styleSource: "lecture" });
  }
  for (const ex of p.bookExercises ?? []) {
    const c = [...concepts].sort((a, b) => keywordOverlap(ex, b.name + " " + b.definition).shared - keywordOverlap(ex, a.name + " " + a.definition).shared)[0];
    if (!c) break;
    qs.push({ concept: c.slug, kind: "short", prompt: ex, answer: c.definition, explanation: "Book exercise.", relateTo: null, styleSource: "book" });
  }
  return { questions: qs.slice(0, Math.max(count, Math.min(qs.length, count + 3))) };
}

/** Pre-lecture questions: one per upcoming topic, mcq when there are enough known concepts to make distractors. */
function mockPretest(p: PretestPayload): PretestOut {
  const topics = (p.topics ?? []).filter(Boolean);
  const known = (p.knownConcepts ?? []).filter(c => c.definition);
  const count = Math.max(1, p.count ?? 3);
  const qs: PretestOut["questions"] = [];
  for (let k = 0; k < count && topics.length; k++) {
    const topic = topics[k % topics.length]!;
    const near = [...known].sort((a, b) => keywordOverlap(topic, b.name + " " + b.definition).shared - keywordOverlap(topic, a.name + " " + a.definition).shared);
    const anchor = near[0];
    if (k % 2 === 0 && near.length >= 4) {
      const options = seededShuffle(near.slice(0, 4).map(c => c.name), topic);
      qs.push({ topic, kind: "mcq", prompt: `Week ${p.week} covers ${topic}. Which idea from the course so far is it most closely built on?`,
        options, answer: anchor!.name, explanation: `${anchor!.name} is the closest prerequisite the course has covered.` });
    } else {
      qs.push({ topic, kind: "short", prompt: `Before the lecture on ${topic}: what do you already know about it, and how might it connect to ${anchor?.name ?? "what you have covered so far"}?`,
        answer: anchor ? `${topic} builds on ${anchor.name}: ${anchor.definition}` : `${topic} is the next topic on the syllabus.`, explanation: "A prepared student can state the connection in a sentence." });
    }
  }
  return { questions: qs };
}

/** Ask the lecture: the transcript lines that share the most content words with the question, quoted back. */
function mockAsk(p: AskPayload): AskOut {
  const ranked = (p.segments ?? [])
    .map(s => ({ s, shared: keywordOverlap(p.question ?? "", s.text).shared }))
    .filter(x => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.s.i - b.s.i)
    .slice(0, 3)
    .sort((a, b) => a.s.i - b.s.i);
  if (!ranked.length) return { answer: "The lecture does not seem to cover that; nothing in the transcript matches the question.", cites: [], notInLecture: true };
  const quotes = ranked.map(x => `“${firstSentence(x.s.text, 220)}”`);
  return { answer: `From the lecture: ${quotes.join(" … ")}`, cites: ranked.map(x => x.s.i), notInLecture: false };
}

// ---------- grading ----------

function mockGrade(p: GradePayload): GradeOut {
  const { ratio, shared } = keywordOverlap(p.answer ?? "", p.modelAnswer ?? "");
  const words = contentWords(p.answer ?? "").length;
  const correct = words >= 2 && (ratio >= 0.25 || shared >= 3);
  const missing = [...new Set(contentWords(p.modelAnswer ?? ""))].filter(w => !contentWords(p.answer ?? "").includes(w)).slice(0, 4);
  return {
    correct,
    feedback: correct
      ? `Good: your answer covers the key idea (${Math.round(ratio * 100)}% of the key terms).`
      : `Not quite: try to mention ${missing.join(", ") || "the key idea from the lecture"}.`,
  };
}

// ---------- recall ----------

function mockRecall(p: RecallPayload): RecallOut {
  const got: string[] = [];
  const missed: string[] = [];
  const text = p.text ?? "";
  const have = new Set(contentWords(text));
  for (const c of p.concepts ?? []) {
    const words = [...new Set(contentWords(c.name))];
    const hit = words.filter(w => have.has(w)).length;
    (words.length && hit / words.length >= (words.length >= 3 ? 0.67 : 1) ? got : missed).push(c.name);
  }
  // "wrong": sentences that negate a recalled concept ("X is not ...") are flagged for review.
  const wrong = text.split(/(?<=[.!?])\s+/).filter(s => /\b(is not|isn't|never|doesn't)\b/i.test(s) && got.some(g => containsPhrase(s, g))).map(s => s.trim());
  return { got, missed, wrong };
}

// ---------- documents ----------

function mockBook(p: BookPayload, doc: string): BookOut {
  const lines = doc.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const title = lines[0] ?? null;
  const concepts: BookOut["concepts"] = [];
  const seen = new Set<string>();
  const sentences = doc.split(/\n+/).flatMap(l => l.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/));
  for (const s of sentences) {
    const m = s.match(/^(?:Definition[:.]?\s*)?(?:An?\s+|The\s+)?([A-Z][A-Za-z-]*(?:\s+[a-zA-Z-]+){0,3}?)\s+(?:is|are|refers to|describes|measures)\s+(.{10,})$/);
    if (!m) continue;
    const name = titleCase(m[1]!);
    if (seen.has(slugify(name)) || contentWords(name).length === 0) continue;
    seen.add(slugify(name));
    const knownName = (p.knownConcepts ?? []).find(k => slugify(k) === slugify(name));
    concepts.push({ name: knownName ?? name, definition: s.trim(), related: [], excerpt: s.trim().slice(0, 200) });
  }
  const exercises: BookOut["exercises"] = [];
  for (const l of lines) {
    if (!/^(exercise|problem|q\d|\d+[.)])/i.test(l) && !(l.endsWith("?") && contentWords(l).length >= 4)) continue;
    const prompt = l.replace(/^(exercise|problem)\s*[\d.]*[:.)]?\s*/i, "").replace(/^\d+[.)]\s*/, "");
    if (contentWords(prompt).length < 3) continue;
    const c = [...concepts].sort((a, b) => keywordOverlap(prompt, b.name + " " + b.definition).shared - keywordOverlap(prompt, a.name + " " + a.definition).shared)[0];
    exercises.push({ concept: c?.name ?? title ?? "Chapter", kind: "short", prompt, answer: c?.definition ?? "See the chapter.", explanation: "From the chapter's exercises." });
  }
  return { title, concepts: concepts.slice(0, 20), exercises: exercises.slice(0, 20) };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Finds the first date in a line: 2026-10-20, 10/20/2026, "October 20, 2026", "Oct 20". */
export function findDate(line: string, today: string): string | null {
  const iso = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const us = line.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  const yearNow = Number(today.slice(0, 4));
  const pick = (m: number, d: number, y?: number) => {
    let year = y ?? yearNow;
    if (!y && `${year}-${pad(m)}-${pad(d)}` < addMonths(today, -6)) year++;
    return `${year}-${pad(m)}-${pad(d)}`;
  };
  if (us) return pick(Number(us[1]), Number(us[2]), us[3] ? Number(us[3].length === 2 ? "20" + us[3] : us[3]) : undefined);
  const named = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (named) return pick(MONTHS.indexOf(named[1]!.toLowerCase().slice(0, 3)) + 1, Number(named[2]), named[3] ? Number(named[3]) : undefined);
  return null;
}
function pad(n: number) { return String(n).padStart(2, "0"); }
function addMonths(day: string, n: number) { const d = new Date(day + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }

function mockSyllabus(p: SyllabusPayload, doc: string): SyllabusOut {
  const today = p.today ?? new Date().toISOString().slice(0, 10);
  const lines = doc.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const out: SyllabusOut = { title: lines[0] ?? null, exams: [], weeks: [], deadlines: [] };
  const topicsOf = (s: string) => s.split(/[,;]| and /).map(t => t.trim().replace(/\.$/, "")).filter(t => t.length > 2);
  for (const l of lines) {
    const date = findDate(l, today);
    const week = l.match(/^week\s*(\d+)\s*[:.\-–]?\s*(.*)$/i);
    if (week) {
      const rest = week[2]!.replace(/\(?\b\d{4}-\d{2}-\d{2}\b\)?/, "").replace(/^[:\-–\s]+/, "");
      out.weeks.push({ week: Number(week[1]), topics: topicsOf(rest), date });
      continue;
    }
    if (!date) continue;
    const exam = l.match(/\b(midterm|final|exam|quiz)\b/i);
    if (exam) {
      const name = l.split(/[:(–—-]/)[0]!.trim() || exam[0];
      const covers = l.match(/(?:covers|topics?)[:\s]+(.+)$/i);
      out.exams.push({ name: titleCase(name), date, topics: covers ? topicsOf(covers[1]!) : [] });
    } else if (/\b(due|deadline|homework|problem set|assignment|project|report)\b/i.test(l)) {
      out.deadlines.push({ name: l.split(/[:(]/)[0]!.trim().slice(0, 80), date });
    }
  }
  return out;
}

// ---------- study plan ----------

/** Deterministic plan: key dates straight from the input; days interleave the weakest high-emphasis concepts,
 *  exam day is light review, the day before it is the weakest three, deadlines make lighter days. */
export function mockStudyPlan(p: StudyPlanPayload): StudyPlanOut {
  const day = (n: number) => { const d = new Date(p.today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const end = day(p.horizonDays - 1);
  const keyDates: StudyPlanOut["keyDates"] = [
    ...p.exams.map(e => ({ date: e.date, name: e.name, kind: "exam" as const, note: e.topics.length ? `Covers ${e.topics.slice(0, 4).join(", ")}: finish new material 2 days before.` : "Finish new material 2 days before; review flagged concepts on the day." })),
    ...p.deadlines.map(d => ({ date: d.date, name: d.name, kind: "deadline" as const, note: "Keep the day before light and get it in early." })),
    ...p.announcements.filter(a => a.when && /^\d{4}-\d{2}-\d{2}$/.test(a.when)).map(a => ({ date: a.when!, name: a.text.slice(0, 80), kind: (a.kind === "exam" || a.kind === "deadline" ? a.kind : "other") as "exam" | "deadline" | "other", note: `Said in ${a.lecture}.` })),
  ].filter(k => k.date >= p.today && (k.date <= end || k.kind === "exam")).sort((a, b) => a.date.localeCompare(b.date));
  const exam = p.exams.find(e => e.daysLeft >= 0) ?? null;
  const ranked = [...p.concepts].sort((a, b) => Number(b.examFlag) - Number(a.examFlag) || (a.mastery ?? 0) - (b.mastery ?? 0) || b.emphasis - a.emphasis);
  const weakest = ranked.slice(0, 3);
  const deadlineDays = new Set(p.deadlines.map(d => d.date));
  const days: StudyPlanOut["days"] = [];
  for (let i = 0; i < p.horizonDays; i++) {
    const date = day(i);
    const due = p.cardsDueByDay[i] ?? 0;
    const beforeDeadline = deadlineDays.has(day(i + 1));
    let chosen: typeof ranked;
    let reason: string;
    if (exam && i === exam.daysLeft) { chosen = ranked.filter(c => c.examFlag).slice(0, 2); reason = `${exam.name} today: light review only.`; }
    else if (exam && i === exam.daysLeft - 1) { chosen = weakest; reason = `Day before ${exam.name}: retrieval practice on the weakest flagged concepts.`; }
    else if (beforeDeadline) { chosen = ranked.slice((i * 2) % Math.max(1, ranked.length)).slice(0, 1); reason = "A deadline tomorrow: one concept and the due cards, nothing more."; }
    else { chosen = ranked.length ? [0, 1, 2].map(j => ranked[(i * 3 + j) % ranked.length]!).filter((c, j, a) => a.indexOf(c) === j) : []; reason = exam ? `${exam.daysLeft - i} days to ${exam.name}: three concepts mixed across lectures.` : "No exam date yet: steady practice on the highest-emphasis concepts."; }
    const tasks = [
      ...(due ? [`Review ${due} card${due === 1 ? "" : "s"}`] : []),
      ...chosen.slice(0, 2).map(c => `Practice: 3 questions on ${c.name}`),
      ...(chosen[2] ? [`Re-read the notes on ${chosen[2].name}`] : []),
    ];
    days.push({ date, focus: chosen[0]?.name ?? "Review", concepts: chosen.map(c => c.name), tasks, minutes: 20 + 15 * chosen.length + Math.min(30, due), reason });
  }
  const pace = p.pace.lecturesHeld
    ? `${p.pace.lecturesHeld} lecture${p.pace.lecturesHeld === 1 ? "" : "s"} so far${p.pace.lecturesPerWeek ? `, about ${p.pace.lecturesPerWeek} a week` : ""}${p.pace.currentWeek ? `; the syllabus is in week ${p.pace.currentWeek} of ${p.pace.totalWeeks}` : ""}.`
    : "No lectures recorded yet: the plan follows the syllabus only.";
  const overview = exam
    ? `${exam.daysLeft} days to ${exam.name}: cover its topics first, interleaved across lectures, and finish new material 2 days early.`
    : "Steady interleaved practice on the highest-emphasis concepts, previewing each week's syllabus topics before the lecture.";
  return { overview, pace, keyDates, days };
}
