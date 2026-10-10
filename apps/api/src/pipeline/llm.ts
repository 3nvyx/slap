/**
 * LLM provider switch for the study pipeline (settings.llm.backend):
 *   claude  Anthropic Messages API via @anthropic-ai/sdk, model settings.llm.anthropicModel
 *   gemini  Gemini REST generateContent (GEMINI_API_KEY via settings)
 *   mock    deterministic heuristics in mock.ts, so the product works with no keys
 *
 * `complete` returns raw text. `completeJson` adds the JSON instruction, validates
 * the reply with a zod schema from schemas.ts and retries once with the validation
 * error on failure. `completeWithDocument` sends a PDF (Claude document block,
 * Gemini inline data); when the backend cannot take the PDF it falls back to locally
 * extracted text with a note saying so.
 * Prompts carry their data in an `<input>` JSON block (util.inputBlock) so the mock
 * backend can read the same prompt a real model gets.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { settings } from "../settings.ts";
import { parseModelJson } from "./schemas.ts";
import { mockComplete } from "./mock.ts";
import { extractPdfText } from "./pdfText.ts";
import { capText } from "./util.ts";

export interface CompleteOpts { system?: string; json?: true; maxTokens?: number }
export type LlmBackend = "claude" | "gemini" | "mock";

/** Gemini model id; settings.ts has no knob for it yet. */
const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_TOKENS = 8000;
const JSON_INSTRUCTION =
  "Reply with a single JSON object only: no prose, no markdown fences. Follow the requested shape exactly.";
/** PDF text sent in the text fallback is capped (about 40 pages of prose). */
const MAX_DOC_TEXT = 120_000;

let backendOverride: LlmBackend | null = null;
/** Tests can force a backend without touching the environment. */
export function setLlmBackend(b: LlmBackend | null) { backendOverride = b; }
export function llmBackend(): LlmBackend { return backendOverride ?? settings.llm.backend; }

let anthropic: Anthropic | null = null;
function claudeClient(): Anthropic {
  if (!anthropic) {
    if (!settings.llm.anthropicKey) throw new Error("LLM_BACKEND=claude but ANTHROPIC_API_KEY is not set");
    anthropic = new Anthropic({ apiKey: settings.llm.anthropicKey });
  }
  return anthropic;
}

type DocInput = { pdf: Buffer; text?: undefined } | { pdf?: undefined; text: string } | undefined;

export async function complete(task: string, prompt: string, opts: CompleteOpts = {}): Promise<string> {
  return run(task, prompt, opts, undefined);
}

/** Like `complete`, with a PDF attached (book chapter, syllabus). */
export async function completeWithDocument(task: string, prompt: string, pdf: Buffer, opts: CompleteOpts = {}): Promise<string> {
  return run(task, prompt, opts, { pdf });
}

/** complete + parse + zod-validate, retrying once with the validation error. */
export async function completeJson<T>(task: string, prompt: string, schema: z.ZodType<T>,
  opts: Omit<CompleteOpts, "json"> & { pdf?: Buffer; docText?: string } = {}): Promise<T> {
  const { pdf, docText, ...rest } = opts;
  const doc: DocInput = pdf ? { pdf } : docText !== undefined ? { text: docText } : undefined;
  const call = (p: string) => run(task, p, { ...rest, json: true }, doc);
  const first = await call(prompt);
  const r1 = parseModelJson(schema, first);
  if (r1.ok) return r1.value;
  console.warn(`[llm] ${task}: invalid JSON (${r1.error}); retrying once`);
  const retryPrompt = `${prompt}\n\nYour previous reply was rejected (${r1.error}). Reply again with only the corrected JSON object.`;
  const second = await call(retryPrompt);
  const r2 = parseModelJson(schema, second);
  if (r2.ok) return r2.value;
  throw new Error(`LLM task ${task} returned invalid JSON twice: ${r2.error}`);
}

async function run(task: string, prompt: string, opts: CompleteOpts, doc: DocInput): Promise<string> {
  const backend = llmBackend();
  const system = [opts.system, opts.json ? JSON_INSTRUCTION : null].filter(Boolean).join("\n\n") || undefined;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const t0 = Date.now();
  try {
    if (backend === "mock") {
      const docText = doc?.pdf ? extractPdfText(doc.pdf) : doc?.text;
      return mockComplete(task, prompt, docText);
    }
    if (backend === "claude") return await claude(prompt, system, maxTokens, doc);
    return await gemini(prompt, system, maxTokens, doc, opts.json === true);
  } finally {
    if (backend !== "mock") console.info(`[llm] ${task} via ${backend} in ${Date.now() - t0} ms`);
  }
}

function withDocText(prompt: string, text: string): string {
  return `${prompt}\n\nThe document could not be attached directly; its text was extracted locally (layout, figures and equations may be lost):\n<document>\n${capText(text, MAX_DOC_TEXT)}\n</document>`;
}

async function claude(prompt: string, system: string | undefined, maxTokens: number, doc: DocInput): Promise<string> {
  const client = claudeClient();
  const send = async (content: Anthropic.ContentBlockParam[]) => {
    const res = await client.messages.create({
      model: settings.llm.anthropicModel,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") throw new Error("model declined the request (refusal)");
    const text = res.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("");
    if (res.stop_reason === "max_tokens") console.warn(`[llm] reply hit max_tokens (${maxTokens}); output may be truncated`);
    return text;
  };
  if (doc?.pdf) {
    try {
      return await send([
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.pdf.toString("base64") } },
        { type: "text", text: prompt },
      ]);
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      console.warn(`[llm] Claude rejected the PDF (${e.message}); falling back to extracted text`);
      return send([{ type: "text", text: withDocText(prompt, extractPdfText(doc.pdf)) }]);
    }
  }
  const text = doc?.text !== undefined ? withDocText(prompt, doc.text) : prompt;
  return send([{ type: "text", text }]);
}

interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; error?: { message?: string } }

async function gemini(prompt: string, system: string | undefined, maxTokens: number, doc: DocInput, json: boolean): Promise<string> {
  const key = settings.llm.geminiKey;
  if (!key) throw new Error("LLM_BACKEND=gemini but GEMINI_API_KEY is not set");
  const parts: Array<Record<string, unknown>> = [];
  if (doc?.pdf) parts.push({ inline_data: { mime_type: "application/pdf", data: doc.pdf.toString("base64") } });
  parts.push({ text: doc?.text !== undefined ? withDocText(prompt, doc.text) : prompt });
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message ?? res.statusText}`);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini returned no text (finishReason ${data.candidates?.[0]?.finishReason ?? "unknown"})`);
  return text;
}
