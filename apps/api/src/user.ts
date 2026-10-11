// There is no sign-in. A browser keeps a random id in localStorage and sends it as the X-Slap-User header;
// per-student study state (card schedules, attempts, recall checks) is keyed by it. The id is not a credential:
// nothing verifies it, and every caller may read and change every class and device.
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "./db/index.ts";

export interface User { id: string }
export type UserEnv = { Variables: { user: User } };

export const USER_HEADER = "x-slap-user";
/** Callers that send no id (curl, scripts) share this one. */
export const SHARED_USER = "shared";

const ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The id a request names, or the shared one when it is missing or malformed. */
export function userIdFrom(header: string | undefined | null): string {
  const v = header?.trim();
  return v && ID.test(v) ? v : SHARED_USER;
}

/** Sets `user` on every request; never rejects. */
export const withUser = createMiddleware<UserEnv>(async (c, next) => {
  c.set("user", { id: userIdFrom(c.req.header(USER_HEADER)) });
  await next();
});

/** Throws 404 for an unknown class. */
export async function classOr404(classId: string): Promise<void> {
  const [cls] = await db.select({ id: schema.classes.id }).from(schema.classes).where(eq(schema.classes.id, classId)).limit(1);
  if (!cls) throw new HTTPException(404, { message: "class not found" });
}
