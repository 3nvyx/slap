// Shared message and data contracts for Slap: device <-> api <-> web.
// Plain TypeScript types only (no runtime deps) so firmware docs, api and web agree.

// ---------- Device protocol (/ws/device) ----------
// Transport: one WebSocket. Text frames are JSON (DeviceToServer / ServerToDevice).
// Binary frames from the device are raw PCM: 16 kHz, 16-bit signed little-endian, mono,
// 3,200 bytes = 100 ms per frame. Binary frames to the device are OLED bitmaps (see OledFrame).

export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_FRAME_BYTES = 3200;            // 100 ms of 16-bit mono
export const OLED_WIDTH = 128;
export const OLED_HEIGHT = 64;
export const OLED_FRAME_BYTES = (OLED_WIDTH * OLED_HEIGHT) / 8;   // 1024

/** OLED bitmap wire format: XBM layout. Row-major, 16 bytes per row, 64 rows,
 *  LSB of each byte is the leftmost pixel, bit = 1 means lit. Device draws with u8g2.drawXBM. */
export type OledFrame = Uint8Array;   // length OLED_FRAME_BYTES

export type DeviceButton = "boot" | "slap";

export type DeviceToServer =
  | { type: "hello"; deviceId: string; fw: string; pairCode?: string; mac?: string }
  | { type: "button"; button: DeviceButton }
  | { type: "level"; rms: number }                 // optional mic level 0..1, ~2 Hz
  | { type: "pong"; t: number };

export type DeviceState = "unpaired" | "idle" | "recording" | "error";

export type ServerToDevice =
  | { type: "state"; state: DeviceState; sessionId?: string; classCode?: string; message?: string }
  | { type: "ping"; t: number };
// (binary frame of OLED_FRAME_BYTES = new display content; device replaces the whole screen)

// ---------- Live captions (/ws/live/:sessionId?lang=xx) ----------
export interface CaptionWord {
  word: string;
  punctuated?: string;
  start: number;   // seconds from session start
  end: number;
  confidence?: number;
}

export type CaptionEvent =
  | { type: "interim"; seq: number; text: string; words: CaptionWord[]; start: number; end: number }
  | { type: "final";   seq: number; segmentId: number; text: string; words: CaptionWord[]; start: number; end: number; speaker?: number }
  | { type: "translation"; seq: number; segmentId: number; lang: string; text: string }
  | { type: "status"; state: DeviceState | "ended"; viewers: number; languages: string[]; latencyMs?: number; message?: string }
  | { type: "snapshot"; seq: number; finals: Array<{ segmentId: number; text: string; start: number; end: number; translation?: string }> };

export type LiveClientMessage =
  | { type: "subscribe"; lang: string; since?: number }   // since = last seq seen, for reconnect
  | { type: "ping" };

// ---------- API DTOs ----------
export interface ClassSummary { id: string; name: string; code: string; role: "owner" | "student" | "guest"; lectureCount: number; nextExam?: string | null }
export interface LectureSummary { id: string; classId: string; title: string; date: string; status: "live" | "ended" | "processing" | "ready"; durationS?: number }

export interface Segment { id: number; idx: number; start: number; end: number; text: string; words?: CaptionWord[]; speaker?: number | null }
export interface OutlineSection { title: string; start: number; end: number; summary: string; conceptSlugs: string[] }
export interface Announcement { kind: "deadline" | "exam" | "schedule" | "opportunity" | "other"; text: string; when?: string | null; segmentId?: number }

export interface Concept {
  id: string; classId: string; slug: string; name: string; definition: string;
  emphasis: number; examFlag: boolean; examQuote?: string | null; mentionCount: number;
  source: "lecture" | "book" | "both"; mastery?: number | null;
}
export interface ConceptLink { from: string; to: string; relation: string }
export interface ConceptMention { conceptId: string; lectureId: string; segmentId: number; excerpt: string }

export interface Card { id: string; conceptId: string; front: string; back: string; due?: string | null; state?: number }
export type Rating = 1 | 2 | 3 | 4;   // FSRS: again, hard, good, easy

export type QuestionKind = "mcq" | "short" | "relate";
export interface Question { id: string; conceptId: string; kind: QuestionKind; prompt: string; options?: string[] | null; styleSource: "lecture" | "book"; relateTo?: string | null }
export interface Attempt { questionId: string; answer: string; correct: boolean; feedback: string }

export interface RecallResult { got: string[]; missed: string[]; wrong: string[]; score: number }
export interface ExamTopic { conceptId: string; name: string; emphasis: number; examFlag: boolean; mastery: number | null; score: number }
export interface StudyPlanDay { date: string; cardsDue: number; concepts: string[]; questions: string[]; reason: string }

export type JobStatus = "queued" | "running" | "done" | "failed";
export interface StudyBundleStatus { lectureId: string; status: JobStatus; steps: Record<string, JobStatus>; error?: string | null }

// ---------- Health ----------
export interface Health { ok: boolean; mode: "demo" | "local" | "cloud"; backends: Record<string, "live" | "mock" | "down"> }

// ---------- Learning partner (spoken practice) ----------
export interface PartnerVoice { id: string; name: string; style: string; default?: boolean }
export type PartnerIntent = "question" | "feedback" | "explanation" | "chat";
export interface PartnerReply {
  text: string;
  intent: PartnerIntent;
  conceptId?: string | null;
  questionId?: string | null;
  grade?: { correct: boolean; feedback: string } | null;
  audioUrl?: string | null;          // GET /api/partner/audio/:id (mp3, streamed), the next thing to play (usually the question)
  feedbackAudioUrl?: string | null;  // short grade/explanation clip to play first, when present
}
export interface PartnerSession { sessionId: string; classId: string; lectureId?: string | null; voiceId: string; lang: string; opening: PartnerReply }
export interface PartnerTurn { transcript: string; reply: PartnerReply }
