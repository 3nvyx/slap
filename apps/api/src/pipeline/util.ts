/**
 * Small pure helpers shared by the study pipeline: the segment shape the pipeline
 * works on, slugs, prompt sizing, tokenising, keyword overlap and deterministic
 * hashing. No I/O here.
 */

/** A transcript segment as the pipeline sees it (DB `segments` row without words). */
export interface Seg { id?: number; idx: number; start: number; end: number; text: string }

/** Hard cap on transcript text sent to the model in one call (PLAN: no unbounded prompts). */
export const MAX_PROMPT_CHARS = 12_000;

export function slugify(s: string): string {
  return s
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "concept";
}

export function capText(s: string, max = MAX_PROMPT_CHARS): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

/** Wraps a JSON payload so both a real model and the mock backend can read it. */
export function inputBlock(payload: unknown): string {
  return `<input>\n${JSON.stringify(payload)}\n</input>`;
}

/** Reads the payload written by `inputBlock` back out of a prompt (used by the mock). */
export function readInputBlock<T = unknown>(prompt: string): T | null {
  const m = prompt.match(/<input>\n([\s\S]*)\n<\/input>/);
  if (!m) return null;
  try { return JSON.parse(m[1]!) as T; } catch { return null; }
}

/** Formats segments as `[idx @ m:ss] text` lines, stopping before `max` chars. */
export function segmentLines(segs: Seg[], max = MAX_PROMPT_CHARS): { text: string; used: Seg[] } {
  const out: string[] = [];
  const used: Seg[] = [];
  let len = 0;
  for (const s of segs) {
    const line = `[${s.idx} @ ${fmtTime(s.start)}] ${s.text.trim()}`;
    if (len + line.length + 1 > max && used.length > 0) break;
    out.push(line);
    used.push(s);
    len += line.length + 1;
  }
  return { text: out.join("\n"), used };
}

/** Splits segments into consecutive chunks whose formatted text fits `max` and has at most `maxSegs` items. */
export function chunkSegments(segs: Seg[], maxSegs = 30, max = MAX_PROMPT_CHARS): Seg[][] {
  const chunks: Seg[][] = [];
  let rest = segs;
  while (rest.length > 0) {
    const { used } = segmentLines(rest.slice(0, maxSegs), max);
    chunks.push(used);
    rest = rest.slice(used.length);
  }
  return chunks;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Turns plain transcript text (one utterance per line) into segments. Times are
 * spread proportionally to text length over `durationS` (default: ~14 chars/s of speech).
 */
export function segmentsFromText(text: string, durationS?: number): Seg[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  const dur = durationS ?? total / 14;
  let t = 0;
  return lines.map((l, idx) => {
    const d = (l.length / total) * dur;
    const seg = { idx, start: round2(t), end: round2(t + d), text: l };
    t += d;
    return seg;
  });
}

function round2(x: number) { return Math.round(x * 100) / 100; }

export const STOPWORDS = new Set((
  "a about above after again against all also am an and any are aren't as at be because been before being below between both but by " +
  "can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't " +
  "have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't " +
  "it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own " +
  "same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's " +
  "these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were " +
  "weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're " +
  "you've your yours yourself yourselves " +
  // spoken-lecture filler and generic words that are never concepts
  "okay ok alright yeah yes yep um uh oh like just really actually basically exactly pretty kind sort gonna wanna gotta right well " +
  "great awesome wonderful perfect fantastic phenomenal beautiful nice good bad thing things stuff something anything everything nothing " +
  "way ways lot lots bit little second seconds minute minutes question questions answer slide slides today now going go goes went get gets " +
  "got make makes made see look looks say says said saying talk talked talking think know mean means want wants use used using call called " +
  "come comes put take takes give gives turn turns start one two three first last next another many much even still back sure " +
  "part parts piece pieces case point please let us also may might must will shall can could would maybe probably obviously " +
  "away intuitively roughly certain amount unit units form whole entire course class lecture lectures time times reason sense " +
  "relatively simple important least hopefully deep happens happen tell told walk move moving remind understand understood " +
  "write writing written work works working day days people person student students everybody anybody somebody someone"
).split(/\s+/));

/** Lowercase word tokens (letters, digits, apostrophes). */
export function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9][a-z0-9']*/g) ?? [];
}

/** Content words: tokens that are not stopwords and have >= 3 chars. Crude plural stripping. */
export function contentWords(s: string): string[] {
  return tokenize(s).filter(w => w.length >= 3 && !STOPWORDS.has(w)).map(stem);
}

export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

/** Share of `expected`'s content words that also appear in `given` (0..1). */
export function keywordOverlap(given: string, expected: string): { ratio: number; shared: number } {
  const exp = new Set(contentWords(expected));
  if (exp.size === 0) return { ratio: 0, shared: 0 };
  const got = new Set(contentWords(given));
  let shared = 0;
  for (const w of exp) if (got.has(w)) shared++;
  return { ratio: shared / exp.size, shared };
}

/** FNV-1a 32-bit hash; deterministic tie-breaking and shuffles. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Deterministic shuffle keyed by `seed`. */
export function seededShuffle<T>(items: readonly T[], seed: string, key: (t: T) => string = String): T[] {
  return [...items].sort((a, b) => hash32(seed + key(a)) - hash32(seed + key(b)));
}

export function titleCase(s: string): string {
  return s.split(/\s+/).map(w => {
    if (/^[A-Z0-9]{2,}s?$/.test(w)) return w;                 // acronyms: GLMs, MLE
    if (["of", "and", "the", "in", "for", "to", "a"].includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ").replace(/^./, c => c.toUpperCase());
}

export function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** First sentence (or up to `max` chars) of a text. */
export function firstSentence(s: string, max = 220): string {
  const t = s.trim().replace(/\s+/g, " ");
  const m = t.match(/^(.{20,}?[.?!])(\s|$)/);
  const out = m ? m[1]! : t;
  return out.length > max ? out.slice(0, max - 1).trimEnd() + "…" : out;
}
