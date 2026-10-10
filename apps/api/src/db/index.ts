import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (run `neon env pull` at the repo root)");
export const sql = neon(url);
export const db = drizzle({ client: sql, schema });
export { schema };
