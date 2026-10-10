/**
 * Lazy access to the database for pipeline modules. Importing a pipeline module
 * never opens a connection or requires DATABASE_URL, so the pure functions can be
 * tested on their own; only the DB-layer functions call `getDb()`.
 */
type DbModule = typeof import("../db/index.ts");

let mod: Promise<DbModule> | null = null;
export function getDb(): Promise<DbModule> {
  mod ??= import("../db/index.ts");
  return mod;
}
