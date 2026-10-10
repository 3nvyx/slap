// Caption translation: one request per (segment batch, target language), never per viewer.
// Backends: Google Cloud Translation REST v2, or a mock that tags the text.
import { settings } from "../settings.ts";

const GOOGLE_URL = "https://translation.googleapis.com/language/translate/v2";
const MAX_BATCH = 100;          // Google v2 accepts up to 128 q per request
const CACHE_MAX = 2000;

const cache = new Map<string, string>();   // insertion-ordered: oldest first (LRU)

function cacheGet(key: string): string | undefined {
  const v = cache.get(key);
  if (v !== undefined) { cache.delete(key); cache.set(key, v); }
  return v;
}

function cacheSet(key: string, v: string): void {
  cache.set(key, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/** Normalises a client language code ("es", "zh-CN"); null if malformed. */
export function normalizeLang(lang: string | null | undefined): string | null {
  if (!lang) return null;
  const m = /^([a-zA-Z]{2,3})(?:[-_]([a-zA-Z0-9]{2,8}))?$/.exec(lang.trim());
  if (!m) return null;
  return m[2] ? `${m[1]!.toLowerCase()}-${m[2].length === 2 ? m[2].toUpperCase() : m[2]}` : m[1]!.toLowerCase();
}

/** True when `lang` is the caption source language, so no translation is needed. */
export function isSourceLang(lang: string, sourceLang = "en"): boolean {
  return lang.split("-")[0] === sourceLang.split("-")[0];
}

async function googleTranslate(texts: string[], target: string, source: string): Promise<string[]> {
  const key = settings.translate.googleKey;
  if (!key) throw new Error("GOOGLE_TRANSLATE_API_KEY is not set");
  const res = await fetch(`${GOOGLE_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: texts, target, source, format: "text" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`google translate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: { translations?: Array<{ translatedText: string }> } };
  const out = body.data?.translations?.map(t => t.translatedText);
  if (!out || out.length !== texts.length) throw new Error("google translate: unexpected response shape");
  return out;
}

async function backendTranslate(texts: string[], target: string, source: string): Promise<string[]> {
  if (settings.translate.backend === "google") return googleTranslate(texts, target, source);
  return texts.map(t => `[${target}] ${t}`);
}

/** Translates many texts to one language, using the cache and batching misses. */
export async function translateMany(texts: string[], targetLang: string, sourceLang = "en"): Promise<string[]> {
  if (isSourceLang(targetLang, sourceLang)) return texts.slice();
  const out: Array<string | undefined> = texts.map(t => cacheGet(`${sourceLang}|${targetLang}|${t}`));
  const missing = [...new Set(texts.filter((_, i) => out[i] === undefined))];
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const chunk = missing.slice(i, i + MAX_BATCH);
    const done = await backendTranslate(chunk, targetLang, sourceLang);
    chunk.forEach((t, j) => cacheSet(`${sourceLang}|${targetLang}|${t}`, done[j]!));
  }
  return texts.map((t, i) => out[i] ?? cacheGet(`${sourceLang}|${targetLang}|${t}`) ?? t);
}

export async function translate(text: string, targetLang: string, sourceLang = "en"): Promise<string> {
  const [out] = await translateMany([text], targetLang, sourceLang);
  return out!;
}
