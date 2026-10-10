/**
 * Uploaded course documents (one book chapter, one syllabus per class).
 * `createDocument` stores the row, keeps the PDF bytes temporarily under
 * apps/api/.uploads/<id>.pdf (git-ignored via a generated .gitignore), saves a
 * locally extracted text copy in documents.text, and queues a document_parse job.
 * `ingestDocument` parses it once (book.ts / syllabus.ts), persists documents.parsed
 * and deletes the temporary PDF; with no PDF left it re-parses from documents.text.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { enqueueJob, registerJobKind } from "./jobs.ts";
import { extractPdfText } from "./pdfText.ts";
import { ingestBook } from "./book.ts";
import { parseSyllabus } from "./syllabus.ts";
import { getDb } from "./db.ts";

export const UPLOAD_DIR = fileURLToPath(new URL("../../.uploads/", import.meta.url));
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function uploadPath(documentId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("bad document id");
  return `${UPLOAD_DIR}${documentId}.pdf`;
}

export async function createDocument(classId: string, kind: "book" | "syllabus", title: string, pdf: Buffer): Promise<{ id: string; jobId: string }> {
  if (pdf.length > MAX_UPLOAD_BYTES) throw new Error("file too large");
  const { db, schema } = await getDb();
  let text: string | null = null;
  try { text = extractPdfText(pdf) || null; } catch { text = null; }
  const [row] = await db.insert(schema.documents).values({ classId, kind, title: title.slice(0, 200), text }).returning({ id: schema.documents.id });
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(`${UPLOAD_DIR}.gitignore`, "*\n");
  await writeFile(uploadPath(row!.id), pdf);
  const jobId = await enqueueJob("document_parse", row!.id, ["parse"]);
  return { id: row!.id, jobId };
}

export async function ingestDocument(documentId: string): Promise<void> {
  const { db, schema } = await getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new Error(`document ${documentId} not found`);
  const pdf = await readFile(uploadPath(documentId)).catch(() => null);
  const input = pdf ? { pdf } : doc.text ? { text: doc.text } : null;
  if (!input) throw new Error("the uploaded PDF is gone and no text was extracted; upload it again");
  let parsed: unknown;
  let title = doc.title;
  if (doc.kind === "book") {
    const r = await ingestBook(doc.classId, input);
    parsed = { ...r.parsed, counts: { concepts: r.concepts, cards: r.cards, questions: r.questions } };
    if (r.parsed.title && /^(upload|document|untitled)/i.test(title)) title = r.parsed.title;
  } else {
    const s = await parseSyllabus(input);
    parsed = s;
    if (s.title && /^(upload|document|untitled)/i.test(title)) title = s.title;
  }
  await db.update(schema.documents).set({ parsed, title }).where(eq(schema.documents.id, documentId));
  if (pdf) await rm(uploadPath(documentId), { force: true });
}

export async function getDocument(documentId: string) {
  const { db, schema } = await getDb();
  const [doc] = await db.select({ id: schema.documents.id, classId: schema.documents.classId, kind: schema.documents.kind, title: schema.documents.title, parsed: schema.documents.parsed })
    .from(schema.documents).where(eq(schema.documents.id, documentId));
  return doc ?? null;
}

registerJobKind("document_parse", async ctx => {
  await ctx.step("parse", "running");
  await ingestDocument(ctx.refId);
  await ctx.step("parse", "done");
});
