/**
 * Learning partner routes (docs/api.md "Learning partner"), mounted under /api.
 *   GET    /partner/voices                    curated Fish voices, default first
 *   POST   /classes/:classId/partner/session  { lectureId?, voiceId?, lang? } -> PartnerSession
 *   POST   /partner/:sessionId/turn           multipart { audio?, text? } (JSON { text } also accepted) -> PartnerTurn
 *   GET    /partner/audio/:id                 mp3 from the in-memory cache (unguessable id, ~10 min)
 *   DELETE /partner/:sessionId
 * Nothing is access-checked (there is no sign-in). A session grades for the caller that started it (user.ts).
 * Turn and session responses return as soon as the reply text exists: each reply carries up to
 * two clip ids (feedbackAudioUrl = short lead, audioUrl = the next question) whose TTS streams
 * render in parallel in the background; GET /partner/audio/:id streams the bytes as they arrive.
 * Audio: webm/opus, ogg, wav, mp3 (or mp4/aac from Safari), at most 10 MB and 60 s (WAV checked from its header,
 * other formats from the transcription's duration). Turn timings go out as Server-Timing.
 */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { classOr404, type UserEnv } from "../user.ts";
import { FishError, PARTNER_VOICES, defaultVoiceId, isKnownVoice, readWav } from "../pipeline/fishAudio.ts";
import { MAX_TURN_AUDIO_S, PartnerInputError, clipBytes, clipReady, endSession, getClip, getSession, startSession, turn, type PartnerState } from "../pipeline/partner.ts";
import { normalizeLang } from "../pipeline/translate.ts";
import { getDb } from "../pipeline/db.ts";

type C = Context<UserEnv>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_S = MAX_TURN_AUDIO_S;
const MAX_TEXT = 2000;

const SessionBody = z.object({
  lectureId: z.string().regex(UUID, "must be a lecture id").nullish(),
  voiceId: z.string().min(1).max(64).nullish(),
  lang: z.string().min(2).max(16).nullish(),
}).strict();

function idParam(c: C, name: string, what: string): string {
  const v = c.req.param(name) ?? "";
  if (!UUID.test(v)) throw new HTTPException(404, { message: `${what} not found` });
  return v;
}

/** Normalised audio mime from the declared type, else sniffed from magic bytes. Null if unsupported. */
export function audioMime(declared: string | undefined, buf: Buffer): string | null {
  const t = (declared ?? "").split(";")[0]!.trim().toLowerCase();
  const known: Record<string, string> = {
    "audio/webm": "audio/webm", "video/webm": "audio/webm", "audio/ogg": "audio/ogg", "audio/opus": "audio/ogg",
    "audio/wav": "audio/wav", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav",
    "audio/mpeg": "audio/mpeg", "audio/mp3": "audio/mpeg",
    "audio/mp4": "audio/mp4", "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "audio/aac": "audio/mp4",   // Safari MediaRecorder
  };
  if (known[t]) return known[t]!;
  const head = buf.subarray(0, 4);
  if (head.toString("latin1") === "RIFF") return "audio/wav";
  if (head.toString("latin1") === "OggS") return "audio/ogg";
  if (buf.toString("latin1", 4, 8) === "ftyp") return "audio/mp4";
  if (head.equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  if (head.subarray(0, 3).toString("latin1") === "ID3" || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

function sessionParam(c: C): PartnerState {
  const id = idParam(c, "sessionId", "partner session");
  const s = getSession(id);
  if (!s) throw new HTTPException(404, { message: "partner session not found or expired" });
  return s;
}

export const partnerRoutes = new Hono<UserEnv>();

partnerRoutes.get("/partner/voices", c => c.json(PARTNER_VOICES));

partnerRoutes.post("/classes/:classId/partner/session", async c => {
  const classId = idParam(c, "classId", "class");
  await classOr404(classId);
  const raw = await c.req.json().catch(() => ({}));
  const r = SessionBody.safeParse(raw ?? {});
  if (!r.success) throw new HTTPException(400, { message: r.error.issues.map(i => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
  const b = r.data;
  if (b.lectureId) {
    const { db, schema } = await getDb();
    const [l] = await db.select({ classId: schema.lectures.classId }).from(schema.lectures).where(eq(schema.lectures.id, b.lectureId)).limit(1);
    if (!l || l.classId !== classId) throw new HTTPException(404, { message: "lecture not found in this class" });
  }
  const voiceId = b.voiceId ?? defaultVoiceId();
  if (!isKnownVoice(voiceId)) throw new HTTPException(400, { message: "voiceId: unknown voice (see GET /api/partner/voices)" });
  const lang = b.lang ? normalizeLang(b.lang) : "en";
  if (!lang) throw new HTTPException(400, { message: "lang: expected a language code such as en or es" });
  const session = await startSession(c.var.user, classId, { lectureId: b.lectureId ?? null, voiceId, lang });
  return c.json(session, 201);
});

partnerRoutes.post("/partner/:sessionId/turn",
  bodyLimit({ maxSize: MAX_AUDIO_BYTES + 64 * 1024, onError: c => c.json({ error: "audio too large (max 10 MB)" }, 413) }),
  async c => {
    const s = sessionParam(c);
    let text: string | null = null;
    let audio: { data: Buffer; mime: string } | null = null;
    const ctype = c.req.header("content-type") ?? "";
    if (ctype.includes("application/json")) {
      const j = await c.req.json().catch(() => { throw new HTTPException(400, { message: "body must be JSON or multipart" }); }) as { text?: unknown };
      if (typeof j?.text === "string") text = j.text;
    } else if (ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded")) {
      const form = await c.req.parseBody().catch(() => { throw new HTTPException(400, { message: "malformed multipart body" }); });
      if (typeof form.text === "string") text = form.text;
      const f = form.audio;
      if (f instanceof File) {
        if (f.size > MAX_AUDIO_BYTES) throw new HTTPException(413, { message: "audio too large (max 10 MB)" });
        const data = Buffer.from(await f.arrayBuffer());
        const mime = audioMime(f.type, data);
        if (!mime) throw new HTTPException(415, { message: "audio must be webm/opus, ogg, wav, mp3 or mp4" });
        if (mime === "audio/wav") {
          const w = readWav(data);
          if (!w) throw new HTTPException(400, { message: "audio: not a PCM WAV file" });
          if (w.durationS > MAX_AUDIO_S + 0.5) throw new HTTPException(413, { message: `audio too long (max ${MAX_AUDIO_S} s)` });
        }
        if (data.length) audio = { data, mime };
      } else if (typeof f === "string" && f) {
        throw new HTTPException(400, { message: "audio must be a file part" });
      }
    } else {
      throw new HTTPException(415, { message: "send multipart/form-data with audio and/or text" });
    }
    if (text && text.length > MAX_TEXT) throw new HTTPException(400, { message: `text: at most ${MAX_TEXT} characters` });
    if (!audio && !text?.trim()) throw new HTTPException(400, { message: "send audio or text" });
    const out = await turn(s, { audio, text }).catch((e: unknown) => {
      if (e instanceof PartnerInputError) throw new HTTPException(e.status, { message: e.message });
      if (e instanceof FishError) throw new HTTPException(502, { message: `transcription failed (speech service ${e.status || "unreachable"})` });
      throw e;
    });
    const { timings, ...body } = out;
    c.header("Server-Timing", `asr;dur=${timings.asrMs}, llm;dur=${timings.llmMs}, translate;dur=${timings.translateMs}, total;dur=${timings.totalMs}`);
    return c.json(body);
  });

// Streams while Fish is still rendering (chunked, no Content-Length); a finished clip is sent whole.
partnerRoutes.get("/partner/audio/:id", async c => {
  const id = c.req.param("id");
  const clip = UUID.test(id) ? getClip(id) : undefined;
  if (!clip) return c.json({ error: "audio not found or expired" }, 404);
  await clipReady(clip);
  if (!clip.bytes) return c.json({ error: "speech rendering failed" }, 502);
  const headers: Record<string, string> = { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=600" };
  if (clip.done && !clip.error) {
    return c.body(new Uint8Array(Buffer.concat(clip.chunks, clip.bytes)), 200, { ...headers, "Content-Length": String(clip.bytes) });
  }
  const it = clipBytes(clip);
  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const r = await it.next();
        if (r.done) ctrl.close(); else ctrl.enqueue(new Uint8Array(r.value));
      } catch (e) { ctrl.error(e); }
    },
    async cancel() { await it.return(undefined); },
  });
  return c.body(stream, 200, headers);
});

partnerRoutes.delete("/partner/:sessionId", c => {
  const s = sessionParam(c);
  endSession(s.id);
  return c.json({ ok: true });
});
