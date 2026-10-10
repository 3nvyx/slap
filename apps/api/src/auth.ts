// Neon Auth JWT verification (EdDSA, JWKS) and class access checks.
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db, schema } from "./db/index.ts";
import { settings } from "./settings.ts";

export interface AuthUser { id: string; email: string | null }
export type UserEnv = { Variables: { user: AuthUser } };
export type MaybeUserEnv = { Variables: { user: AuthUser | null } };
export type ClassRole = "owner" | "student";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Accepted issuers: the auth base URL, and its origin in case the issuer is set without the path. */
function issuers(): string[] {
  const base = settings.auth.baseUrl;
  if (!base) return [];
  const trimmed = base.replace(/\/+$/, "");
  return [...new Set([trimmed, `${trimmed}/`, new URL(trimmed).origin])];
}

/** Verifies a Neon Auth JWT (signature, expiry, issuer) and returns the user it names. */
export async function verifyToken(token: string): Promise<AuthUser> {
  if (!settings.auth.jwksUrl || !settings.auth.baseUrl) throw new Error("NEON_AUTH_JWKS_URL / NEON_AUTH_BASE_URL not set");
  jwks ??= createRemoteJWKSet(new URL(settings.auth.jwksUrl), { cacheMaxAge: 10 * 60_000 });
  // Audience is not pinned: the issuer + this project's JWKS already scope the token to our auth server.
  const { payload } = await jwtVerify(token, jwks, { issuer: issuers(), clockTolerance: 30 });
  // Neon Auth JWTs carry the user id in `id`; standard tokens use `sub`.
  const userId = payload.sub ?? (payload as { id?: string }).id;
  if (!userId) throw new Error("token has no subject");
  const email = typeof payload.email === "string" ? payload.email : null;
  return { id: userId, email };
}

function bearer(header: string | undefined): string | null {
  const m = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
  return m ? m[1]!.trim() : null;
}

export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const token = bearer(c.req.header("authorization"));
  if (!token) return c.json({ error: "sign-in required" }, 401);
  try {
    c.set("user", await verifyToken(token));
  } catch (e) {
    return c.json({ error: `invalid token: ${(e as { code?: string }).code ?? (e as Error).message}` }, 401);
  }
  await next();
});

/** Sets `user` when a valid token is present, null otherwise; never rejects. */
export const optionalUser = createMiddleware<MaybeUserEnv>(async (c, next) => {
  const token = bearer(c.req.header("authorization"));
  let user: AuthUser | null = null;
  if (token) { try { user = await verifyToken(token); } catch { user = null; } }
  c.set("user", user);
  await next();
});

async function lookupRole(userId: string, classId: string): Promise<{ found: boolean; role: ClassRole | null }> {
  const [cls] = await db.select({ owner: schema.classes.ownerUserId }).from(schema.classes).where(eq(schema.classes.id, classId)).limit(1);
  if (!cls) return { found: false, role: null };
  if (cls.owner === userId) return { found: true, role: "owner" };
  const [en] = await db.select({ role: schema.enrollments.role }).from(schema.enrollments)
    .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.classId, classId))).limit(1);
  return { found: true, role: en?.role ?? null };
}

/** The caller's role in a class: owner (creator or owner enrollment), student, or null. */
export async function classRole(userId: string, classId: string): Promise<ClassRole | null> {
  return (await lookupRole(userId, classId)).role;
}

/** Throws 404 for an unknown class, 403 for a non-member, or for a non-owner when `need` is owner. */
export async function requireClassRole(userId: string, classId: string, need: "member" | "owner"): Promise<ClassRole> {
  const { found, role } = await lookupRole(userId, classId);
  if (!found) throw new HTTPException(404, { message: "class not found" });
  if (!role) throw new HTTPException(403, { message: "not a member of this class" });
  if (need === "owner" && role !== "owner") throw new HTTPException(403, { message: "only the class owner can do this" });
  return role;
}
