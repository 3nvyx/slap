// Neon Postgres from Node: cold start, then warm round trips.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
const t = async (label: string, f: () => Promise<unknown>) => { const s = performance.now(); await f(); console.log(`${label}: ${(performance.now() - s).toFixed(0)} ms`); };
await t("cold select now()", () => sql`select now()`);
await t("warm select now()", () => sql`select now()`);
await t("create temp table", () => sql`create table if not exists smoke_segments (id serial primary key, lecture text, t double precision, text text)`);
await t("insert 1 row", () => sql`insert into smoke_segments (lecture, t, text) values ('smoke', 1.0, 'hello')`);
await t("select rows", () => sql`select count(*) from smoke_segments`);
await t("drop table", () => sql`drop table smoke_segments`);
