/**
 * Minimal persistent job runner: each job is a `jobs` row (status, per-step
 * statuses, error) executed by an in-memory queue in this process, one job at a
 * time. Rows survive restarts; `resumePendingJobs` re-queues anything left queued or
 * running (call once at server start). Handlers are registered per job kind.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { JobStatus } from "@slap/contracts";
import { getDb } from "./db.ts";

export interface JobContext {
  jobId: string;
  refId: string;
  step: (name: string, status: JobStatus) => Promise<void>;
}
type Handler = (ctx: JobContext) => Promise<void>;

const handlers = new Map<string, Handler>();
const queue: Array<{ jobId: string; kind: string; refId: string }> = [];
const waiters = new Map<string, Array<() => void>>();
const inMemory = new Set<string>();
let pumping = false;

export function registerJobKind(kind: string, h: Handler) { handlers.set(kind, h); }

/** Inserts a job row and queues it. */
export async function enqueueJob(kind: string, refId: string, steps: string[]): Promise<string> {
  const { db, schema } = await getDb();
  const [row] = await db.insert(schema.jobs).values({
    kind, refId, status: "queued", steps: Object.fromEntries(steps.map(s => [s, "queued"])),
  }).returning({ id: schema.jobs.id });
  push(row!.id, kind, refId);
  return row!.id;
}

/** Id of a job for this ref that is queued or running in this process, if any. */
export async function activeJob(kind: string, refId: string): Promise<string | null> {
  const { db, schema } = await getDb();
  const rows = await db.select({ id: schema.jobs.id }).from(schema.jobs)
    .where(and(eq(schema.jobs.kind, kind), eq(schema.jobs.refId, refId), inArray(schema.jobs.status, ["queued", "running"])));
  return rows.find(r => inMemory.has(r.id))?.id ?? null;
}

/** Resolves when the job has finished (done or failed) in this process. */
export function waitForJob(jobId: string): Promise<void> {
  if (!inMemory.has(jobId)) return Promise.resolve();
  return new Promise(res => (waiters.get(jobId) ?? waiters.set(jobId, []).get(jobId)!).push(res));
}

export async function resumePendingJobs(): Promise<number> {
  const { db, schema } = await getDb();
  const rows = await db.select().from(schema.jobs).where(inArray(schema.jobs.status, ["queued", "running"]));
  for (const r of rows) if (!inMemory.has(r.id)) push(r.id, r.kind, r.refId);
  return rows.length;
}

function push(jobId: string, kind: string, refId: string) {
  inMemory.add(jobId);
  queue.push({ jobId, kind, refId });
  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const j = queue.shift()!;
      await runOne(j.jobId, j.kind, j.refId);
      inMemory.delete(j.jobId);
      for (const w of waiters.get(j.jobId) ?? []) w();
      waiters.delete(j.jobId);
    }
  } finally {
    pumping = false;
  }
}

async function runOne(jobId: string, kind: string, refId: string) {
  const { db, schema } = await getDb();
  const { jobs } = schema;
  const steps: Record<string, JobStatus> = {};
  try {
    const [row] = await db.select({ steps: jobs.steps }).from(jobs).where(eq(jobs.id, jobId));
    Object.assign(steps, (row?.steps ?? {}) as Record<string, JobStatus>);
    for (const k of Object.keys(steps)) steps[k] = "queued";              // handlers are idempotent; a resumed job re-runs every step
    await db.update(jobs).set({ status: "running", error: null, steps, updatedAt: new Date() }).where(eq(jobs.id, jobId));
    const handler = handlers.get(kind);
    if (!handler) throw new Error(`no handler for job kind ${kind}`);
    await handler({
      jobId, refId,
      step: async (name, status) => {
        steps[name] = status;
        await db.update(jobs).set({ steps: { ...steps }, updatedAt: new Date() }).where(eq(jobs.id, jobId));
      },
    });
    await db.update(jobs).set({ status: "done", steps, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[jobs] ${kind} ${jobId} failed:`, msg);
    for (const k of Object.keys(steps)) if (steps[k] === "running") steps[k] = "failed";
    await db.update(jobs).set({ status: "failed", error: msg.slice(0, 2000), steps, updatedAt: new Date() }).where(eq(jobs.id, jobId))
      .catch(err => console.error("[jobs] could not record failure:", err));
  }
}
