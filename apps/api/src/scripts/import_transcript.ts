// Seeds a lecture from a transcript file (plain text or WebVTT/SRT), same path as the import route.
//   node --env-file-if-exists=../../.env.local --env-file-if-exists=../../../.env.local src/scripts/import_transcript.ts \
//     --class CS229 --title "Lecture 3" --date 2026-04-07 [--owner <neon auth user id>] [--name "Machine Learning"] file.vtt|.txt
// A missing class is created when --owner is given.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { importLecture, parseTranscript, today } from "../sessions.ts";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    class: { type: "string" },
    title: { type: "string" },
    date: { type: "string", default: today() },
    owner: { type: "string" },
    name: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const file = positionals[0];
if (!opt.class || !opt.title || !file) {
  console.error('usage: import_transcript.ts --class CODE --title "Lecture 3" [--date YYYY-MM-DD] [--owner USER_ID] [--name NAME] [--dry-run] file');
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(opt.date!)) { console.error("--date must be YYYY-MM-DD"); process.exit(2); }

const transcript = readFileSync(file, "utf8");
const segs = parseTranscript(transcript);
console.log(`${file}: ${segs.length} segments, ${Math.round(segs.at(-1)?.end ?? 0)} s`);
if (opt["dry-run"]) { for (const s of segs.slice(0, 5)) console.log(`  [${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`); process.exit(0); }

const code = opt.class.toUpperCase();
let [cls] = await db.select().from(schema.classes).where(sql`upper(${schema.classes.code}) = ${code}`).limit(1);
if (!cls) {
  if (!opt.owner) { console.error(`no class ${code}; pass --owner <user id> to create it`); process.exit(1); }
  [cls] = await db.insert(schema.classes).values({ name: opt.name ?? code, code, ownerUserId: opt.owner }).returning();
  await db.insert(schema.enrollments).values({ userId: opt.owner, classId: cls!.id, role: "owner" }).onConflictDoNothing();
  console.log(`created class ${code} (${cls!.id})`);
}
const lecture = await importLecture({ classId: cls!.id, title: opt.title, date: opt.date!, transcript });
console.log(JSON.stringify(lecture));
