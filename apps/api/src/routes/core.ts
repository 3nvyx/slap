// Public, device and signed-in routes from docs/api.md (the Study section lives in study.ts).
// Paths are relative to /api (mounted by routes/index.ts).
import type { ClassSummary, Concept, ConceptLink, ConceptMention, LectureSummary, OutlineSection, Segment, CaptionWord, Card } from "@slap/contracts";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { optionalUser, requireClassRole, requireUser, type ClassRole } from "../auth.ts";
import { db, schema } from "../db/index.ts";
import { getMastery } from "../pipeline/mastery.ts";
import { unpackAnnouncements } from "../pipeline/outline.ts";
import { isSourceLang, normalizeLang } from "../pipeline/translate.ts";
import {
  DeviceBusyError, deviceForWebStart, effectiveOwner, findLiveLecture, getDevice, getDeviceRow, getLecture, importLecture, isUuid,
  listUserDevices, liveLectureInMemory, pairDevice, ReplayError, setActiveClass, startReplay, startSession, stopSession, toSummary, unpairDevice, viewerLanguages,
} from "../sessions.ts";

const { classes, enrollments, lectures, segments, translations, concepts, conceptLinks, conceptMentions, outlines, documents, cards, cardState, questions, devices } = schema;

export const coreRoutes = new Hono();

/** Mastery for the caller: members get theirs, guests none (read-only, nothing is tracked for them). */
function masteryFor(role: ClassRole, userId: string | undefined, classId: string): Promise<Record<string, number>> {
  return role === "guest" || !userId ? Promise.resolve({}) : getMastery(userId, classId);
}

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

/** Earliest exam on or after today from parsed syllabus documents (`parsed.exams[{name,date}]`). */
function earliestExam(parsedDocs: unknown[]): { name: string; date: string } | null {
  const now = new Date().toISOString().slice(0, 10);
  let best: { name: string; date: string } | null = null;
  for (const p of parsedDocs) {
    const exams = (p as { exams?: Array<{ name?: string; date?: string }> } | null)?.exams ?? [];
    for (const e of exams) {
      if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date < now) continue;
      if (!best || e.date < best.date) best = { name: e.name ?? "Exam", date: e.date };
    }
  }
  return best;
}

/** Next exam per class. */
async function nextExams(classIds: string[]): Promise<Map<string, { name: string; date: string }>> {
  const out = new Map<string, { name: string; date: string }>();
  if (!classIds.length) return out;
  const rows = await db.select({ classId: documents.classId, parsed: documents.parsed }).from(documents)
    .where(and(inArray(documents.classId, classIds), eq(documents.kind, "syllabus")));
  for (const id of classIds) {
    const e = earliestExam(rows.filter(r => r.classId === id).map(r => r.parsed));
    if (e) out.set(id, e);
  }
  return out;
}

async function classSummaries(userId: string, classIds?: string[]): Promise<ClassSummary[]> {
  const rows = await db.selectDistinct({ id: classes.id, name: classes.name, code: classes.code, owner: classes.ownerUserId, guestAccess: classes.guestAccess, role: enrollments.role })
    .from(classes).leftJoin(enrollments, and(eq(enrollments.classId, classes.id), eq(enrollments.userId, userId)))
    .where(and(or(eq(classes.ownerUserId, userId), eq(enrollments.userId, userId)), classIds ? inArray(classes.id, classIds) : undefined))
    .orderBy(asc(classes.name));
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const counts = await db.select({ classId: lectures.classId, n: count() }).from(lectures).where(inArray(lectures.classId, ids)).groupBy(lectures.classId);
  const n = new Map(counts.map(r => [r.classId, r.n]));
  const exams = await nextExams(ids);
  return rows.map(r => ({
    id: r.id, name: r.name, code: r.code,
    role: r.owner === userId || r.role === "owner" ? "owner" : "student",
    lectureCount: n.get(r.id) ?? 0, nextExam: exams.get(r.id)?.date ?? null, guestAccess: r.guestAccess,
  }));
}

async function oneSummary(userId: string, classId: string): Promise<ClassSummary> {
  const [s] = await classSummaries(userId, [classId]);
  if (!s) throw new HTTPException(404, { message: "class not found" });
  return s;
}

// ---------- public ----------

coreRoutes.get("/join/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  const [cls] = await db.select().from(classes).where(sql`upper(${classes.code}) = ${code}`).limit(1);
  if (!cls) return c.json({ error: "no class with that code" }, 404);
  const live = await findLiveLecture(cls.id);
  return c.json({ classId: cls.id, className: cls.name, lectureId: live?.id ?? null, live: !!live, guestAccess: cls.guestAccess });
});

coreRoutes.get("/lectures/:id/public", async (c) => {
  const id = uuidParam(c, "id");
  const lang = normalizeLang(c.req.query("lang"));
  // A replay has no database row: answer from memory.
  const mem = getLecture(id);
  if (mem && !mem.persistent) {
    const [cls] = await db.select({ name: classes.name, guestAccess: classes.guestAccess }).from(classes).where(eq(classes.id, mem.classId)).limit(1);
    return c.json({
      title: mem.title, className: cls?.name ?? "", classId: mem.classId, guestAccess: cls?.guestAccess ?? false, status: mem.status, replay: !!mem.replay,
      finals: mem.finals.map(f => {
        const tr = lang && !isSourceLang(lang) ? f.tr.get(lang)?.text : undefined;
        return { segmentId: f.segmentId, text: f.text, start: f.start, end: f.end, ...(tr !== undefined ? { translation: tr } : {}) };
      }),
    });
  }
  const [row] = await db.select({ l: lectures, className: classes.name, guestAccess: classes.guestAccess }).from(lectures)
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
    title: row.l.title, className: row.className, classId: row.l.classId, guestAccess: row.guestAccess, status: row.l.status,
    finals: segs.map(s => ({ segmentId: s.id, text: s.text, start: s.start, end: s.end, ...(tr.has(s.id) ? { translation: tr.get(s.id) } : {}) })),
  });
});

// ---------- device ----------
// A device belongs to a user (devices.ownerUserId) and records into its active class (devices.classId).

/** 409 for a change that would cut a recording short. */
async function busy409(c: Context, fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (e) {
    if (e instanceof DeviceBusyError) return c.json({ error: e.message }, 409);
    throw e;
  }
}

/** The device if the caller owns it (404 otherwise, so ids of other users' devices are not confirmed). */
async function ownDevice(c: Context, userId: string) {
  const id = uuidParam(c, "id");
  const r = await getDeviceRow(id);
  if (!r || r.owner !== userId) throw new HTTPException(404, { message: "device not found" });
  return r.row;
}

coreRoutes.post("/devices/pair", requireUser, async (c) => {
  const b = await body(c, z.object({ pairCode: z.string().trim().min(4).max(12), classId: z.uuid().optional() }));
  const u = c.var.user;
  let classId = b.classId ?? null;
  if (classId) await requireClassRole(u.id, classId, "member");
  else {
    const mine = await classSummaries(u.id);
    if (mine.length === 1) classId = mine[0]!.id;
  }
  const r = await pairDevice(b.pairCode, u.id, classId);
  if (!r) return c.json({ error: "no device is showing that code" }, 404);
  return c.json(r);
});

coreRoutes.get("/devices", requireUser, async (c) => c.json(await listUserDevices(c.var.user.id)));

coreRoutes.post("/devices/:id/active-class", requireUser, async (c) => {
  const u = c.var.user;
  const row = await ownDevice(c, u.id);
  const b = await body(c, z.object({ classId: z.uuid() }));
  await requireClassRole(u.id, b.classId, "member");
  return busy409(c, async () => c.json(await setActiveClass(row.id, u.id, b.classId)));
});

coreRoutes.delete("/devices/:id", requireUser, async (c) => {
  const row = await ownDevice(c, c.var.user.id);
  return busy409(c, async () => { await unpairDevice(row.id); return c.json({ ok: true }); });
});

// ---------- signed in ----------

coreRoutes.get("/me", requireUser, async (c) => {
  const u = c.var.user;
  return c.json({ userId: u.id, email: u.email, classes: await classSummaries(u.id) });
});

const CODE = z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-]+$/, "letters, digits and dashes only").transform(s => s.toUpperCase());

coreRoutes.post("/classes", requireUser, async (c) => {
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(120), code: CODE }));
  const u = c.var.user;
  const [dup] = await db.select({ id: classes.id }).from(classes).where(sql`upper(${classes.code}) = ${b.code}`).limit(1);
  if (dup) return c.json({ error: "that class code is taken" }, 409);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(classes).values({ id, name: b.name, code: b.code, ownerUserId: u.id }),
    db.insert(enrollments).values({ userId: u.id, classId: id, role: "owner" }),
  ]);
  return c.json(await oneSummary(u.id, id), 201);
});

coreRoutes.post("/classes/join", requireUser, async (c) => {
  const b = await body(c, z.object({ code: CODE }));
  const u = c.var.user;
  const [cls] = await db.select().from(classes).where(sql`upper(${classes.code}) = ${b.code}`).limit(1);
  if (!cls) return c.json({ error: "no class with that code" }, 404);
  await db.insert(enrollments).values({ userId: u.id, classId: cls.id, role: cls.ownerUserId === u.id ? "owner" : "student" }).onConflictDoNothing();
  return c.json(await oneSummary(u.id, cls.id));
});

// Polled by the web app every ~8 s for the device chip: keep it to a role check plus three parallel queries.
// Guests of a guest-access class may read it (role "guest").
coreRoutes.get("/classes/:classId", optionalUser, async (c) => {
  const classId = uuidParam(c, "classId");
  const u = c.var.user;
  const role = await requireClassRole(u?.id ?? null, classId, "read");
  const [[cls], lectureRows, deviceRows, docRows] = await Promise.all([
    db.select({ name: classes.name, code: classes.code, owner: classes.ownerUserId, guestAccess: classes.guestAccess }).from(classes).where(eq(classes.id, classId)).limit(1),
    db.select().from(lectures).where(eq(lectures.classId, classId)).orderBy(desc(lectures.date), desc(lectures.startedAt)),
    db.select({ id: devices.id, name: devices.name, ownerUserId: devices.ownerUserId }).from(devices).where(eq(devices.classId, classId)).orderBy(asc(devices.name), asc(devices.id)),
    db.select({ id: documents.id, kind: documents.kind, title: documents.title, parsed: documents.parsed }).from(documents)
      .where(eq(documents.classId, classId)).orderBy(desc(documents.createdAt)),
  ]);
  if (!cls) return c.json({ error: "class not found" }, 404);
  const nextExam = earliestExam(docRows.filter(d => d.kind === "syllabus").map(d => d.parsed));
  // "The device" of a class: one whose active class is this class; the caller's own first, then a connected one.
  const dev = deviceRows.find(d => u && effectiveOwner(d, cls.owner) === u.id) ?? deviceRows.find(d => getDevice(d.id)) ?? deviceRows[0];
  const link = dev ? getDevice(dev.id) : undefined;
  const summary: ClassSummary = { id: classId, name: cls.name, code: cls.code, role, lectureCount: lectureRows.length, nextExam: nextExam?.date ?? null, guestAccess: cls.guestAccess };
  // Who is watching right now (in-memory only; absent when nothing is live in this process).
  const liveMem = liveLectureInMemory(classId);
  return c.json({
    class: summary,
    lectures: lectureRows.map(r => lectureSummary(r)),
    device: { paired: !!dev, state: link ? link.state : "offline", name: dev?.name ?? null },
    live: liveMem ? { lectureId: liveMem.id, title: liveMem.title, replay: !!liveMem.replay, viewers: liveMem.viewers.size, languages: viewerLanguages(liveMem) } : null,
    nextExam,
    documents: docRows.map(d => ({ id: d.id, kind: d.kind, title: d.title })),
  });
});

// Owner switch: lets anyone read the class's notes, graph and exam topics without signing in (the demo class for judges).
coreRoutes.post("/classes/:classId/guest-access", requireUser, async (c) => {
  const classId = uuidParam(c, "classId");
  const u = c.var.user;
  await requireClassRole(u.id, classId, "owner");
  const b = await body(c, z.object({ enabled: z.boolean() }));
  await db.update(classes).set({ guestAccess: b.enabled }).where(eq(classes.id, classId));
  return c.json(await oneSummary(u.id, classId));
});

// Announcements across the class's lectures (from each study bundle's outline), dated ones first.
coreRoutes.get("/classes/:classId/announcements", optionalUser, async (c) => {
  const classId = uuidParam(c, "classId");
  await requireClassRole(c.var.user?.id ?? null, classId, "read");
  const rows = await db.select({ lectureId: lectures.id, lectureTitle: lectures.title, lectureDate: lectures.date, raw: outlines.announcements })
    .from(outlines).innerJoin(lectures, eq(lectures.id, outlines.lectureId)).where(eq(lectures.classId, classId));
  const out = rows.flatMap(r => unpackAnnouncements(r.raw).announcements.map(a => ({ ...a, lectureId: r.lectureId, lectureTitle: r.lectureTitle, lectureDate: r.lectureDate })));
  out.sort((a, b) => (a.when && b.when ? a.when.localeCompare(b.when) : a.when ? -1 : b.when ? 1 : b.lectureDate.localeCompare(a.lectureDate)));
  return c.json(out);
});

// Records with the caller's device: one pointed at this class, else the caller's device is switched here first.
coreRoutes.post("/classes/:classId/sessions/start", requireUser, async (c) => {
  const classId = uuidParam(c, "classId");
  const u = c.var.user;
  await requireClassRole(u.id, classId, "owner");
  let title: string | undefined;
  if (c.req.header("content-type")?.includes("json")) title = (await body(c, z.object({ title: z.string().trim().max(200).optional() }))).title;
  return busy409(c, async () => {
    const deviceId = await deviceForWebStart(u.id, classId);
    return c.json(await startSession(classId, { title, source: "browser", deviceId }));
  });
});

coreRoutes.post("/lectures/:id/stop", requireUser, async (c) => {
  const id = uuidParam(c, "id");
  const mem = getLecture(id);
  if (mem && !mem.persistent) {   // a replay: in memory only
    await requireClassRole(c.var.user.id, mem.classId, "owner");
    return c.json(await stopSession(id));
  }
  const row = await lectureOr404(id);
  await requireClassRole(c.var.user.id, row.classId, "owner");
  const s = await stopSession(row.id);
  return s ? c.json(s) : c.json({ error: "lecture not found" }, 404);
});

// Demo replay: plays a saved lecture's captions back through the live path as a new, in-memory lecture of the class.
// Viewers join it like any live lecture (/j/:code finds it); status events and the public lecture say `replay`.
coreRoutes.post("/lectures/:id/replay", requireUser, async (c) => {
  const row = await lectureOr404(uuidParam(c, "id"));
  await requireClassRole(c.var.user.id, row.classId, "owner");
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

coreRoutes.post("/classes/:classId/lectures/import", requireUser, async (c) => {
  const classId = uuidParam(c, "classId");
  await requireClassRole(c.var.user.id, classId, "owner");
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

coreRoutes.get("/lectures/:id", optionalUser, async (c) => {
  const row = await lectureOr404(uuidParam(c, "id"));
  const role = await requireClassRole(c.var.user?.id ?? null, row.classId, "read");
  const [segRows, [outline], mentionRows, mastery] = await Promise.all([
    db.select().from(segments).where(eq(segments.lectureId, row.id)).orderBy(asc(segments.idx)),
    db.select().from(outlines).where(eq(outlines.lectureId, row.id)).limit(1),
    db.select().from(conceptMentions).where(eq(conceptMentions.lectureId, row.id)),
    masteryFor(role, c.var.user?.id, row.classId),
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

coreRoutes.get("/lectures/:id/translations", optionalUser, async (c) => {
  const row = await lectureOr404(uuidParam(c, "id"));
  await requireClassRole(c.var.user?.id ?? null, row.classId, "read");
  const lang = normalizeLang(c.req.query("lang"));
  if (!lang) return c.json({ error: "lang is required, e.g. ?lang=es" }, 400);
  const rows = await db.select({ segmentId: translations.segmentId, text: translations.text }).from(translations)
    .innerJoin(segments, eq(segments.id, translations.segmentId))
    .where(and(eq(segments.lectureId, row.id), eq(translations.lang, lang)));
  return c.json(Object.fromEntries(rows.map(r => [String(r.segmentId), r.text])) as Record<string, string>);
});

coreRoutes.get("/classes/:classId/concepts", optionalUser, async (c) => {
  const classId = uuidParam(c, "classId");
  const u = c.var.user;
  const role = await requireClassRole(u?.id ?? null, classId, "read");
  const [rows, mastery] = await Promise.all([
    db.select().from(concepts).where(eq(concepts.classId, classId)).orderBy(desc(concepts.emphasis), asc(concepts.name)),
    masteryFor(role, u?.id, classId),
  ]);
  return c.json(rows.map(r => toConcept(r, mastery)));
});

coreRoutes.get("/classes/:classId/graph", optionalUser, async (c) => {
  const classId = uuidParam(c, "classId");
  const u = c.var.user;
  const role = await requireClassRole(u?.id ?? null, classId, "read");
  const [rows, mastery] = await Promise.all([
    db.select().from(concepts).where(eq(concepts.classId, classId)),
    masteryFor(role, u?.id, classId),
  ]);
  const ids = rows.map(r => r.id);
  const linkRows = ids.length ? await db.select().from(conceptLinks).where(inArray(conceptLinks.fromId, ids)) : [];
  const known = new Set(ids);
  const links: ConceptLink[] = linkRows.filter(l => known.has(l.toId)).map(l => ({ from: l.fromId, to: l.toId, relation: l.relation }));
  return c.json({ nodes: rows.map(r => toConcept(r, mastery)), links });
});

coreRoutes.get("/concepts/:id", optionalUser, async (c) => {
  const id = uuidParam(c, "id");
  const [row] = await db.select().from(concepts).where(eq(concepts.id, id)).limit(1);
  if (!row) return c.json({ error: "concept not found" }, 404);
  const role = await requireClassRole(c.var.user?.id ?? null, row.classId, "read");
  // Guests have no card state; an empty user id matches no rows.
  const u = { id: role === "guest" ? "" : c.var.user?.id ?? "" };
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
    masteryFor(role, u.id, row.classId),
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

