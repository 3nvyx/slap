// Class, lecture, concept and device routes from docs/api.md (the Study section lives in study.ts).
// Nothing is access-checked (there is no sign-in); per-student state is keyed by the caller's id from user.ts.
// Paths are relative to /api (mounted by routes/index.ts).
import type { ClassSummary, Concept, ConceptLink, ConceptMention, LectureSummary, OutlineSection, Segment, CaptionWord, Card } from "@slap/contracts";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db/index.ts";
import { getMastery } from "../pipeline/mastery.ts";
import { unpackAnnouncements } from "../pipeline/outline.ts";
import { isSourceLang, normalizeLang } from "../pipeline/translate.ts";
import { buildVault, noteName } from "../pipeline/vault.ts";
import { zipStore } from "../pipeline/zip.ts";
import { classOr404, type UserEnv } from "../user.ts";
import {
  captionMode, connectedDeviceForClass, DeviceBusyError, deviceForWebStart, findLiveLecture, getLecture, importLecture, isUuid,
  listDevices, liveLectureInMemory, ReplayError, setActiveClass, setCaptionMode, startReplay, startSession, stopSession, toSummary, viewerLanguages,
} from "../sessions.ts";

const { classes, lectures, segments, translations, concepts, conceptLinks, conceptMentions, outlines, documents, cards, cardState, questions, assessments } = schema;

// `user` is set by withUser in routes/index.ts.
export const coreRoutes = new Hono<UserEnv>();

// ---------- helpers ----------

async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw new HTTPException(400, { message: "body must be JSON" }); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HTTPException(400, { message: r.error.issues.map(i => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
  return r.data;
}

function uuidParam(c: Context, name: string): string {
  const v = c.req.param(name) ?? "";
  if (!isUuid(v)) throw new HTTPException(404, { message: "not found" });
  return v;
}

type LectureRow = typeof lectures.$inferSelect;
type ConceptRow = typeof concepts.$inferSelect;

function lectureSummary(row: LectureRow, durationS?: number | null): LectureSummary {
  const mem = getLecture(row.id);
  if (mem?.status === "live") return toSummary(mem);   // ended lectures: the DB row is authoritative (the bundle updates it)
  const wall = row.endedAt ? (row.endedAt.getTime() - row.startedAt.getTime()) / 1000 : undefined;
  const d = durationS ?? wall;
  return { id: row.id, classId: row.classId, title: row.title, date: row.date, status: row.status, ...(d != null ? { durationS: Math.round(d) } : {}) };
}

function toConcept(r: ConceptRow, mastery?: Record<string, number>): Concept {
  return {
    id: r.id, classId: r.classId, slug: r.slug, name: r.name, definition: r.definition, emphasis: r.emphasis,
    examFlag: r.examFlag, examQuote: r.examQuote, mentionCount: r.mentionCount, source: r.source,
    ...(mastery ? { mastery: mastery[r.id] ?? null } : {}),
  };
}

async function lectureOr404(id: string): Promise<LectureRow> {
  const [row] = await db.select().from(lectures).where(eq(lectures.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: "lecture not found" });
  return row;
}

/** Earliest exam on or after today from parsed syllabus documents (`parsed.exams[{name,date}]`) and the
 *  exams and quizzes entered by hand (`entered`). */
function earliestExam(parsedDocs: unknown[], entered: Array<{ name: string; date: string }> = []): { name: string; date: string } | null {
  const now = new Date().toISOString().slice(0, 10);
  let best: { name: string; date: string } | null = null;
  const all = [...entered, ...parsedDocs.flatMap(p => (p as { exams?: Array<{ name?: string; date?: string }> } | null)?.exams ?? [])];
  for (const e of all) {
    if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date < now) continue;
    if (!best || e.date < best.date) best = { name: e.name ?? "Exam", date: e.date };
  }
  return best;
}

/** Hand-entered exams and quizzes of these classes (assignments are deadlines, not exams). */
function enteredExams(classIds: string[]) {
  return db.select({ classId: assessments.classId, name: assessments.name, date: assessments.date }).from(assessments)
    .where(and(inArray(assessments.classId, classIds), inArray(assessments.kind, ["exam", "quiz"])));
}

/** Next exam per class. */
async function nextExams(classIds: string[]): Promise<Map<string, { name: string; date: string }>> {
  const out = new Map<string, { name: string; date: string }>();
  if (!classIds.length) return out;
  const [rows, entered] = await Promise.all([
    db.select({ classId: documents.classId, parsed: documents.parsed }).from(documents)
      .where(and(inArray(documents.classId, classIds), eq(documents.kind, "syllabus"))),
    enteredExams(classIds),
  ]);
  for (const id of classIds) {
    const e = earliestExam(rows.filter(r => r.classId === id).map(r => r.parsed), entered.filter(r => r.classId === id));
    if (e) out.set(id, e);
  }
  return out;
}

/** Every class (or the given ones), by name. */
async function classSummaries(classIds?: string[]): Promise<ClassSummary[]> {
  const rows = await db.select({ id: classes.id, name: classes.name, code: classes.code, description: classes.description, instructor: classes.instructor, term: classes.term }).from(classes)
    .where(classIds ? inArray(classes.id, classIds) : undefined).orderBy(asc(classes.name));
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const counts = await db.select({ classId: lectures.classId, n: count() }).from(lectures).where(inArray(lectures.classId, ids)).groupBy(lectures.classId);
  const n = new Map(counts.map(r => [r.classId, r.n]));
  const exams = await nextExams(ids);
  return rows.map(r => ({ ...r, lectureCount: n.get(r.id) ?? 0, nextExam: exams.get(r.id)?.date ?? null }));
}

async function oneSummary(classId: string): Promise<ClassSummary> {
  const [s] = await classSummaries([classId]);
  if (!s) throw new HTTPException(404, { message: "class not found" });
  return s;
}

// ---------- join and captions ----------

coreRoutes.get("/join/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  const [cls] = await db.select().from(classes).where(sql`upper(${classes.code}) = ${code}`).limit(1);
  if (!cls) return c.json({ error: "no class with that code" }, 404);
  const live = await findLiveLecture(cls.id);
  return c.json({ classId: cls.id, className: cls.name, lectureId: live?.id ?? null, live: !!live });
});

coreRoutes.get("/lectures/:id/public", async (c) => {
  const id = uuidParam(c, "id");
  const lang = normalizeLang(c.req.query("lang"));
  // A replay has no database row: answer from memory.
  const mem = getLecture(id);
  if (mem && !mem.persistent) {
    const [cls] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, mem.classId)).limit(1);
    return c.json({
      title: mem.title, className: cls?.name ?? "", classId: mem.classId, status: mem.status, replay: !!mem.replay,
      finals: mem.finals.map(f => {
        const tr = lang && !isSourceLang(lang) ? f.tr.get(lang)?.text : undefined;
        return { segmentId: f.segmentId, text: f.text, start: f.start, end: f.end, ...(tr !== undefined ? { translation: tr } : {}) };
      }),
    });
  }
  const [row] = await db.select({ l: lectures, className: classes.name }).from(lectures)
    .innerJoin(classes, eq(classes.id, lectures.classId)).where(eq(lectures.id, id)).limit(1);
  if (!row) return c.json({ error: "lecture not found" }, 404);
  const segs = await db.select({ id: segments.id, text: segments.text, start: segments.startS, end: segments.endS })
    .from(segments).where(eq(segments.lectureId, id)).orderBy(asc(segments.idx));
  const tr = new Map<number, string>();
  if (lang && !isSourceLang(lang) && segs.length) {
    const rows = await db.select({ segmentId: translations.segmentId, text: translations.text }).from(translations)
      .innerJoin(segments, eq(segments.id, translations.segmentId))
      .where(and(eq(segments.lectureId, id), eq(translations.lang, lang)));
    for (const r of rows) tr.set(r.segmentId, r.text);
  }
  return c.json({
    title: row.l.title, className: row.className, classId: row.l.classId, status: row.l.status,
    finals: segs.map(s => ({ segmentId: s.id, text: s.text, start: s.start, end: s.end, ...(tr.has(s.id) ? { translation: tr.get(s.id) } : {}) })),
  });
});

// ---------- device ----------
// No pairing: a device that is online is listed for everyone and records into its active class (devices.classId).

/** 409 for a change that would cut a recording short. */
async function busy409(c: Context, fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (e) {
    if (e instanceof DeviceBusyError) return c.json({ error: e.message }, 409);
    throw e;
  }
}

coreRoutes.get("/devices", (c) => c.json(listDevices()));

coreRoutes.post("/devices/:id/active-class", async (c) => {
  const id = uuidParam(c, "id");
  const b = await body(c, z.object({ classId: z.uuid() }));
  await classOr404(b.classId);
  return busy409(c, async () => {
    const d = await setActiveClass(id, b.classId);
    return d ? c.json(d) : c.json({ error: "device is not online" }, 404);
  });
});

// ---------- caption mode ----------

coreRoutes.get("/captions/mode", (c) => c.json(captionMode()));

coreRoutes.put("/captions/mode", async (c) => {
  const b = await body(c, z.object({ mode: z.enum(["standard", "fast", "accurate"]) }));
  if (!captionMode().available.includes(b.mode)) return c.json({ error: `${b.mode} mode needs its API key in the server's environment` }, 409);
  return c.json(setCaptionMode(b.mode));
});

// ---------- classes ----------

coreRoutes.get("/classes", async (c) => c.json(await classSummaries()));

const CODE = z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-]+$/, "letters, digits and dashes only").transform(s => s.toUpperCase());
/** Optional course details; an empty string clears one. */
const detail = (max: number) => z.string().trim().max(max).transform(s => s || null).nullish();
const courseDetails = { description: detail(600), instructor: detail(120), term: detail(60) };

coreRoutes.post("/classes", async (c) => {
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(120), code: CODE, ...courseDetails }));
  const [dup] = await db.select({ id: classes.id }).from(classes).where(sql`upper(${classes.code}) = ${b.code}`).limit(1);
  if (dup) return c.json({ error: "that class code is taken" }, 409);
  const id = crypto.randomUUID();
  await db.insert(classes).values({ id, name: b.name, code: b.code, ownerUserId: c.var.user.id, description: b.description, instructor: b.instructor, term: b.term });
  return c.json(await oneSummary(id), 201);
});

coreRoutes.patch("/classes/:classId", async (c) => {
  const classId = uuidParam(c, "classId");
  await classOr404(classId);
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(120).optional(), ...courseDetails }));
  const set = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length) await db.update(classes).set(set).where(eq(classes.id, classId));
  return c.json(await oneSummary(classId));
});

// Polled by the web app every ~8 s for the device chip: keep it to a few parallel queries.
coreRoutes.get("/classes/:classId", async (c) => {
  const classId = uuidParam(c, "classId");
  const [[cls], lectureRows, docRows, entered] = await Promise.all([
    db.select({ name: classes.name, code: classes.code, description: classes.description, instructor: classes.instructor, term: classes.term }).from(classes).where(eq(classes.id, classId)).limit(1),
    db.select().from(lectures).where(eq(lectures.classId, classId)).orderBy(desc(lectures.date), desc(lectures.startedAt)),
    db.select({ id: documents.id, kind: documents.kind, title: documents.title, parsed: documents.parsed }).from(documents)
      .where(eq(documents.classId, classId)).orderBy(desc(documents.createdAt)),
    enteredExams([classId]),
  ]);
  if (!cls) return c.json({ error: "class not found" }, 404);
  const nextExam = earliestExam(docRows.filter(d => d.kind === "syllabus").map(d => d.parsed), entered);
  // "The device" of a class: an online one whose active class is this class.
  const dev = connectedDeviceForClass(classId);
  const summary: ClassSummary = { id: classId, ...cls, lectureCount: lectureRows.length, nextExam: nextExam?.date ?? null };
  // Who is watching right now (in-memory only; absent when nothing is live in this process).
  const liveMem = liveLectureInMemory(classId);
  return c.json({
    class: summary,
    lectures: lectureRows.map(r => lectureSummary(r)),
    device: dev ? { id: dev.id, name: dev.name, state: dev.state } : null,
    live: liveMem ? { lectureId: liveMem.id, title: liveMem.title, replay: !!liveMem.replay, viewers: liveMem.viewers.size, languages: viewerLanguages(liveMem) } : null,
    nextExam,
    documents: docRows.map(d => ({ id: d.id, kind: d.kind, title: d.title })),
  });
});

// Obsidian vault: every concept note and lecture note as markdown with [[links]], zipped (store-only).
coreRoutes.get("/classes/:classId/export", async (c) => {
  const classId = uuidParam(c, "classId");
  const [[cls], conceptRows, linkRows, mentionRows, lectureRows, mastery] = await Promise.all([
    db.select({ name: classes.name, code: classes.code }).from(classes).where(eq(classes.id, classId)).limit(1),
    db.select().from(concepts).where(eq(concepts.classId, classId)),
    db.select().from(conceptLinks).innerJoin(concepts, eq(concepts.id, conceptLinks.fromId)).where(eq(concepts.classId, classId)),
    db.select({ conceptId: conceptMentions.conceptId, lectureId: conceptMentions.lectureId, start: segments.startS, excerpt: conceptMentions.excerpt })
      .from(conceptMentions).innerJoin(lectures, eq(lectures.id, conceptMentions.lectureId)).leftJoin(segments, eq(segments.id, conceptMentions.segmentId))
      .where(eq(lectures.classId, classId)).orderBy(asc(lectures.date), asc(segments.startS)),
    db.select({ l: lectures, o: outlines }).from(lectures).leftJoin(outlines, eq(outlines.lectureId, lectures.id))
      .where(and(eq(lectures.classId, classId), inArray(lectures.status, ["ready", "ended"]))).orderBy(asc(lectures.date)),
    getMastery(c.var.user.id, classId),
  ]);
  if (!cls) return c.json({ error: "class not found" }, 404);
  const files = buildVault({
    className: cls.name, classCode: cls.code,
    concepts: conceptRows.map(r => toConcept(r, mastery)),
    links: linkRows.map(r => ({ from: r.concept_links.fromId, to: r.concept_links.toId, relation: r.concept_links.relation })),
    mentions: mentionRows,
    lectures: lectureRows.map(({ l, o }) => ({
      id: l.id, title: l.title, date: l.date, summary: o?.summary ?? "", sections: (o?.sections ?? []) as OutlineSection[],
      announcements: unpackAnnouncements(o?.announcements).announcements,
    })),
  });
  const zip = zipStore(files);
  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="${noteName(cls.code).replace(/"/g, "")}-vault.zip"`);
  c.header("Content-Length", String(zip.length));
  return c.body(new Uint8Array(zip));
});

// Announcements across the class's lectures (from each study bundle's outline), dated ones first.
coreRoutes.get("/classes/:classId/announcements", async (c) => {
  const classId = uuidParam(c, "classId");
  await classOr404(classId);
  const rows = await db.select({ lectureId: lectures.id, lectureTitle: lectures.title, lectureDate: lectures.date, raw: outlines.announcements })
    .from(outlines).innerJoin(lectures, eq(lectures.id, outlines.lectureId)).where(eq(lectures.classId, classId));
  const out = rows.flatMap(r => unpackAnnouncements(r.raw).announcements.map(a => ({ ...a, lectureId: r.lectureId, lectureTitle: r.lectureTitle, lectureDate: r.lectureDate })));
  out.sort((a, b) => (a.when && b.when ? a.when.localeCompare(b.when) : a.when ? -1 : b.when ? 1 : b.lectureDate.localeCompare(a.lectureDate)));
  return c.json(out);
});

// Records with an online device: one pointed at this class, else a device is switched here first.
coreRoutes.post("/classes/:classId/sessions/start", async (c) => {
  const classId = uuidParam(c, "classId");
  await classOr404(classId);
  let title: string | undefined;
  if (c.req.header("content-type")?.includes("json")) title = (await body(c, z.object({ title: z.string().trim().max(200).optional() }))).title;
  return busy409(c, async () => {
    const deviceId = await deviceForWebStart(classId);
    return c.json(await startSession(classId, { title, source: "browser", deviceId }));
  });
});

coreRoutes.post("/lectures/:id/stop", async (c) => {
  const id = uuidParam(c, "id");
  const mem = getLecture(id);
  if (mem && !mem.persistent) return c.json(await stopSession(id));   // a replay: in memory only
  const row = await lectureOr404(id);
  const s = await stopSession(row.id);
  return s ? c.json(s) : c.json({ error: "lecture not found" }, 404);
});

// Demo replay: plays a saved lecture's captions back through the live path as a new, in-memory lecture of the class.
// Viewers join it like any live lecture (/j/:code finds it); status events and the public lecture say `replay`.
coreRoutes.post("/lectures/:id/replay", async (c) => {
  const row = await lectureOr404(uuidParam(c, "id"));
  const opts = c.req.header("content-type")?.includes("json")
    ? await body(c, z.object({ from: z.number().min(0).optional(), to: z.number().min(0).optional(), speed: z.number().min(0.25).max(10).optional() }))
    : {};
  return busy409(c, async () => {
    try {
      const s = await startReplay(row.id, opts);
      return s ? c.json(s, 201) : c.json({ error: "lecture not found" }, 404);
    } catch (e) {
      if (e instanceof ReplayError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });
});

coreRoutes.post("/classes/:classId/lectures/import", async (c) => {
  const classId = uuidParam(c, "classId");
  await classOr404(classId);
  const b = await body(c, z.object({
    title: z.string().trim().min(1).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    transcript: z.string().min(1).max(2_000_000),
  }));
  try {
    return c.json(await importLecture({ classId, ...b }), 201);
  } catch (e) {
    if ((e as Error).message === "transcript has no text") return c.json({ error: "transcript has no text" }, 400);
    throw e;
  }
});

coreRoutes.get("/lectures/:id", async (c) => {
  const row = await lectureOr404(uuidParam(c, "id"));
  const [segRows, [outline], mentionRows, mastery] = await Promise.all([
    db.select().from(segments).where(eq(segments.lectureId, row.id)).orderBy(asc(segments.idx)),
    db.select().from(outlines).where(eq(outlines.lectureId, row.id)).limit(1),
    db.select().from(conceptMentions).where(eq(conceptMentions.lectureId, row.id)),
    getMastery(c.var.user.id, row.classId),
  ]);
  const conceptIds = [...new Set(mentionRows.map(m => m.conceptId))];
  const conceptRows = conceptIds.length ? await db.select().from(concepts).where(inArray(concepts.id, conceptIds)) : [];
  const segs: Segment[] = segRows.map(s => ({ id: s.id, idx: s.idx, start: s.startS, end: s.endS, text: s.text, ...(s.words ? { words: s.words as CaptionWord[] } : {}), speaker: s.speaker }));
  const mentions: ConceptMention[] = mentionRows.filter(m => m.segmentId != null)
    .map(m => ({ conceptId: m.conceptId, lectureId: m.lectureId, segmentId: m.segmentId!, excerpt: m.excerpt }));
  // Student questions found by the diarization pass are stored inside the announcements jsonb (pipeline/outline.ts).
  const { announcements, questionsAsked } = unpackAnnouncements(outline?.announcements);
  return c.json({
    lecture: lectureSummary(row, segs.at(-1)?.end),
    segments: segs,
    outline: (outline?.sections ?? []) as OutlineSection[],
    summary: outline?.summary ?? "",
    announcements,
    questionsAsked,
    concepts: conceptRows.map(r => toConcept(r, mastery)),
    mentions,
  });
});

coreRoutes.get("/lectures/:id/translations", async (c) => {
  const row = await lectureOr404(uuidParam(c, "id"));
  const lang = normalizeLang(c.req.query("lang"));
  if (!lang) return c.json({ error: "lang is required, e.g. ?lang=es" }, 400);
  const rows = await db.select({ segmentId: translations.segmentId, text: translations.text }).from(translations)
    .innerJoin(segments, eq(segments.id, translations.segmentId))
    .where(and(eq(segments.lectureId, row.id), eq(translations.lang, lang)));
  return c.json(Object.fromEntries(rows.map(r => [String(r.segmentId), r.text])) as Record<string, string>);
});

coreRoutes.get("/classes/:classId/concepts", async (c) => {
  const classId = uuidParam(c, "classId");
  await classOr404(classId);
  const [rows, mastery] = await Promise.all([
    db.select().from(concepts).where(eq(concepts.classId, classId)).orderBy(desc(concepts.emphasis), asc(concepts.name)),
    getMastery(c.var.user.id, classId),
  ]);
  return c.json(rows.map(r => toConcept(r, mastery)));
});

coreRoutes.get("/classes/:classId/graph", async (c) => {
  const classId = uuidParam(c, "classId");
  await classOr404(classId);
  const [rows, mastery] = await Promise.all([
    db.select().from(concepts).where(eq(concepts.classId, classId)),
    getMastery(c.var.user.id, classId),
  ]);
  const ids = rows.map(r => r.id);
  const linkRows = ids.length ? await db.select().from(conceptLinks).where(inArray(conceptLinks.fromId, ids)) : [];
  const known = new Set(ids);
  const links: ConceptLink[] = linkRows.filter(l => known.has(l.toId)).map(l => ({ from: l.fromId, to: l.toId, relation: l.relation }));
  return c.json({ nodes: rows.map(r => toConcept(r, mastery)), links });
});

coreRoutes.get("/concepts/:id", async (c) => {
  const id = uuidParam(c, "id");
  const [row] = await db.select().from(concepts).where(eq(concepts.id, id)).limit(1);
  if (!row) return c.json({ error: "concept not found" }, 404);
  const u = c.var.user;
  const [linkRows, mentionRows, cardRows, [qc], mastery] = await Promise.all([
    db.select().from(conceptLinks).where(or(eq(conceptLinks.fromId, id), eq(conceptLinks.toId, id))),
    db.select({ lectureId: conceptMentions.lectureId, lectureTitle: lectures.title, segmentId: conceptMentions.segmentId, excerpt: conceptMentions.excerpt, start: segments.startS })
      .from(conceptMentions).innerJoin(lectures, eq(lectures.id, conceptMentions.lectureId))
      .leftJoin(segments, eq(segments.id, conceptMentions.segmentId))
      .where(eq(conceptMentions.conceptId, id)).orderBy(desc(lectures.date), asc(segments.startS)),
    db.select({ id: cards.id, conceptId: cards.conceptId, front: cards.front, back: cards.back, due: cardState.due, state: cardState.state })
      .from(cards).leftJoin(cardState, and(eq(cardState.cardId, cards.id), eq(cardState.userId, u.id)))
      .where(eq(cards.conceptId, id)),
    db.select({ n: count() }).from(questions).where(eq(questions.conceptId, id)),
    getMastery(u.id, row.classId),
  ]);
  const relatedIds = [...new Set(linkRows.map(l => (l.fromId === id ? l.toId : l.fromId)))];
  const related = relatedIds.length ? await db.select().from(concepts).where(inArray(concepts.id, relatedIds)) : [];
  const cardDtos: Card[] = cardRows.map(r => ({ id: r.id, conceptId: r.conceptId, front: r.front, back: r.back, due: r.due?.toISOString() ?? null, ...(r.state != null ? { state: r.state } : {}) }));
  return c.json({
    concept: toConcept(row, mastery),
    related: related.map(r => toConcept(r, mastery)),
    mentions: mentionRows.map(m => ({ lectureId: m.lectureId, lectureTitle: m.lectureTitle, segmentId: m.segmentId, excerpt: m.excerpt, start: m.start })),
    cards: cardDtos,
    questionCount: qc?.n ?? 0,
  });
});

