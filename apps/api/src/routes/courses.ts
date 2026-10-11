// Course dates entered by hand (docs/api.md "Course dates"): the exams, quizzes and assignments of a class.
// They count next to the dates read from a syllabus (pipeline/syllabus.ts), so the next exam, Today and the
// study plan follow them. Paths are relative to /api (mounted by routes/index.ts); nothing is access-checked.
import type { Assessment } from "@slap/contracts";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db/index.ts";
import { isUuid } from "../sessions.ts";
import { classOr404, type UserEnv } from "../user.ts";

const { assessments } = schema;

export const courseRoutes = new Hono<UserEnv>();

const toAssessment = (r: typeof assessments.$inferSelect): Assessment =>
  ({ id: r.id, classId: r.classId, kind: r.kind, name: r.name, date: r.date, topics: Array.isArray(r.topics) ? (r.topics as string[]) : [] });

const NewAssessment = z.object({
  kind: z.enum(["exam", "quiz", "assignment"]),
  name: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").refine(d => !Number.isNaN(Date.parse(d + "T00:00:00Z")), "not a real date"),
  topics: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

async function classParam(id: string | undefined): Promise<string> {
  if (!id || !isUuid(id)) throw new HTTPException(404, { message: "class not found" });
  await classOr404(id);
  return id;
}

courseRoutes.get("/classes/:classId/assessments", async (c) => {
  const classId = await classParam(c.req.param("classId"));
  const rows = await db.select().from(assessments).where(eq(assessments.classId, classId)).orderBy(asc(assessments.date), asc(assessments.createdAt));
  return c.json(rows.map(toAssessment));
});

courseRoutes.post("/classes/:classId/assessments", async (c) => {
  const classId = await classParam(c.req.param("classId"));
  const raw = await c.req.json().catch(() => { throw new HTTPException(400, { message: "body must be JSON" }); });
  const r = NewAssessment.safeParse(raw);
  if (!r.success) throw new HTTPException(400, { message: r.error.issues.map(i => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
  const [row] = await db.insert(assessments).values({ classId, ...r.data }).returning();
  return c.json(toAssessment(row!), 201);
});

courseRoutes.delete("/assessments/:id", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) throw new HTTPException(404, { message: "not found" });
  const [row] = await db.delete(assessments).where(eq(assessments.id, id)).returning({ id: assessments.id });
  if (!row) throw new HTTPException(404, { message: "not found" });
  return c.json({ ok: true });
});
