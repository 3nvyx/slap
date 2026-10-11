/**
 * Obsidian vault export (pure): the class's concept notes and lecture notes as markdown files
 * with [[wikilinks]], plus an index note. `buildVault(input)` → files for `zipStore`.
 * One note per concept (definition, the lecturer's exam quote, related concepts, where it came
 * up), one per lecture (summary, outline, announcements, concepts), and `<Class>.md` as the map.
 */
import type { Announcement, Concept, ConceptLink, OutlineSection } from "@slap/contracts";
import { fmtTime as fmtClock } from "./util.ts";

export interface VaultLecture { id: string; title: string; date: string; summary: string; sections: OutlineSection[]; announcements: Announcement[] }
export interface VaultMention { conceptId: string; lectureId: string; start: number | null; excerpt: string }
export interface VaultInput {
  className: string;
  classCode: string;
  concepts: Concept[];
  links: ConceptLink[];
  mentions: VaultMention[];
  lectures: VaultLecture[];
  exportedAt?: Date;
}
export interface VaultFile { path: string; data: string }

/** A file name Obsidian accepts and a [[link]] can target: no path or wikilink characters. */
export function noteName(s: string): string {
  const n = s.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  return n || "Untitled";
}

const esc = (s: string) => s.replace(/\r?\n/g, " ").trim();

function conceptNote(c: Concept, byId: Map<string, Concept>, related: string[], mentions: VaultMention[], lectures: Map<string, VaultLecture>): string {
  const lines = [
    "---",
    `slug: ${c.slug}`,
    `source: ${c.source}`,
    `emphasis: ${c.emphasis.toFixed(2)}`,
    `exam: ${c.examFlag}`,
    ...(c.mastery != null ? [`mastery: ${c.mastery.toFixed(2)}`] : []),
    `mentions: ${c.mentionCount}`,
    "---",
    "",
    `# ${c.name}`,
    "",
    esc(c.definition),
    "",
  ];
  if (c.examQuote) lines.push("## The lecturer said", "", `> ${esc(c.examQuote)}`, "");
  if (related.length) {
    lines.push("## Related", "");
    for (const id of related) { const r = byId.get(id); if (r) lines.push(`- [[${noteName(r.name)}]]`); }
    lines.push("");
  }
  const mine = mentions.filter(m => m.conceptId === c.id);
  if (mine.length) {
    lines.push("## Where it came up", "");
    for (const m of mine) {
      const l = lectures.get(m.lectureId);
      const where = l ? `[[${lectureNoteName(l)}]]${m.start != null ? ` at ${fmtClock(m.start)}` : ""}` : "a lecture";
      lines.push(`- ${where}: …${esc(m.excerpt)}…`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function lectureNoteName(l: Pick<VaultLecture, "date" | "title">): string {
  return noteName(`${l.date} ${l.title}`);
}

function lectureNote(l: VaultLecture, concepts: Concept[], mentions: VaultMention[]): string {
  const lines = ["---", `date: ${l.date}`, "---", "", `# ${l.title}`, ""];
  if (l.summary) lines.push(esc(l.summary), "");
  if (l.sections.length) {
    lines.push("## Outline", "");
    for (const s of l.sections) {
      lines.push(`### ${fmtClock(s.start)} ${esc(s.title)}`, "");
      if (s.summary) lines.push(esc(s.summary), "");
    }
  }
  if (l.announcements.length) {
    lines.push("## Announcements", "");
    for (const a of l.announcements) lines.push(`- **${a.kind}**${a.when ? ` (${a.when})` : ""}: ${esc(a.text)}`);
    lines.push("");
  }
  const ids = new Set(mentions.filter(m => m.lectureId === l.id).map(m => m.conceptId));
  const here = concepts.filter(c => ids.has(c.id));
  if (here.length) {
    lines.push("## Concepts", "");
    for (const c of here) lines.push(`- [[${noteName(c.name)}]]${c.examFlag ? " (exam)" : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function buildVault(v: VaultInput): VaultFile[] {
  const byId = new Map(v.concepts.map(c => [c.id, c]));
  const lectures = new Map(v.lectures.map(l => [l.id, l]));
  const neighbours = new Map<string, Set<string>>();
  for (const l of v.links) {
    if (!byId.has(l.from) || !byId.has(l.to)) continue;
    (neighbours.get(l.from) ?? neighbours.set(l.from, new Set()).get(l.from)!).add(l.to);
    (neighbours.get(l.to) ?? neighbours.set(l.to, new Set()).get(l.to)!).add(l.from);
  }
  // Duplicate note names (two concepts that sanitise to the same name) get a numeric suffix.
  const used = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const c of [...v.concepts].sort((a, b) => a.name.localeCompare(b.name))) {
    const base = noteName(c.name);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    nameOf.set(c.id, n === 1 ? base : `${base} ${n}`);
  }

  const files: VaultFile[] = [];
  for (const c of v.concepts) {
    const related = [...(neighbours.get(c.id) ?? [])].sort((a, b) => (byId.get(a)?.name ?? "").localeCompare(byId.get(b)?.name ?? ""));
    files.push({ path: `Concepts/${nameOf.get(c.id)}.md`, data: conceptNote(c, byId, related, v.mentions, lectures) });
  }
  for (const l of v.lectures) files.push({ path: `Lectures/${lectureNoteName(l)}.md`, data: lectureNote(l, v.concepts, v.mentions) });

  const byEmphasis = [...v.concepts].sort((a, b) => b.emphasis - a.emphasis || a.name.localeCompare(b.name));
  const index = [
    `# ${v.className}`,
    "",
    `Exported from Slap (${v.classCode}) on ${(v.exportedAt ?? new Date()).toISOString().slice(0, 10)}. ${v.concepts.length} concepts, ${v.lectures.length} lectures.`,
    "",
    "## Lectures",
    "",
    ...[...v.lectures].sort((a, b) => a.date.localeCompare(b.date)).map(l => `- [[${lectureNoteName(l)}]]`),
    "",
    "## Concepts by emphasis",
    "",
    ...byEmphasis.map(c => `- [[${nameOf.get(c.id)}]]${c.examFlag ? " (exam)" : ""}`),
    "",
  ].join("\n");
  files.push({ path: `${noteName(v.className)}.md`, data: index });
  return files;
}
