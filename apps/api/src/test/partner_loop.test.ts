// Learning partner loop and diarization pass against the real database with the mock LLM and
// mock Fish (no network besides the database). Seeds a throwaway class from
// fixtures/lecture_sample.txt, runs the study bundle, drives a session, then deletes everything.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";

const hasDb = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test:test@localhost");
const skip = hasDb ? false : "DATABASE_URL not set";

const user = { id: "partner-test-user", email: null };
let classId = "", lectureId = "";
let mods: {
  db: typeof import("../db/index.ts"); drizzle: typeof import("drizzle-orm");
  partner: typeof import("../pipeline/partner.ts"); fish: typeof import("../pipeline/fishAudio.ts");
  diarize: typeof import("../pipeline/diarize.ts"); outline: typeof import("../pipeline/outline.ts");
};

before(async () => {
  if (!hasDb) return;
  const [db, drizzle, partner, fish, diarize, outline, llm, util, bundle] = await Promise.all([
    import("../db/index.ts"), import("drizzle-orm"), import("../pipeline/partner.ts"), import("../pipeline/fishAudio.ts"),
    import("../pipeline/diarize.ts"), import("../pipeline/outline.ts"), import("../pipeline/llm.ts"), import("../pipeline/util.ts"), import("../pipeline/bundle.ts"),
  ]);
  mods = { db, drizzle, partner, fish, diarize, outline };
  llm.setLlmBackend("mock");
  fish.setFishMock(true);
  const { schema } = db;
  const [cls] = await db.db.insert(schema.classes).values({ name: "Partner test (throwaway)", code: `PT${Date.now().toString(36).toUpperCase()}`, ownerUserId: user.id }).returning();
  classId = cls!.id;
  const [lec] = await db.db.insert(schema.lectures).values({ classId, title: "CS229: Gaussians", date: "2026-10-06", status: "ended", source: "import" }).returning();
  lectureId = lec!.id;
  const segs = util.segmentsFromText(readFileSync(new URL("../../fixtures/lecture_sample.txt", import.meta.url), "utf8"), 300);
  await db.db.insert(schema.segments).values(segs.map(s => ({ lectureId, idx: s.idx, startS: s.start, endS: s.end, text: s.text })));
  const run = await bundle.runStudyBundle(lectureId);
  assert.equal(run.status?.status, "done");
});

after(async () => {
  if (!hasDb || !classId) return;
  const { db, schema } = mods.db;
  const { eq } = mods.drizzle;
  await db.delete(schema.classes).where(eq(schema.classes.id, classId));
  await db.delete(schema.jobs).where(eq(schema.jobs.refId, lectureId));
  mods.fish.setFishMock(null);
  mods.diarize.setDiarizeEnabled(null);
});

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

test("partner loop: opening question, skip, explain, graded answer, audio turn", { skip }, async () => {
  const { partner: p, fish: f, db: { db, schema }, drizzle: { eq, and, count } } = mods;
  const ses = await p.startSession(user, classId, { lectureId, voiceId: f.defaultVoiceId(), lang: "en" });
  assert.equal(ses.classId, classId);
  assert.equal(ses.opening.intent, "question");
  assert.ok(ses.opening.questionId && ses.opening.conceptId);
  assert.match(ses.opening.audioUrl ?? "", /^\/api\/partner\/audio\/[0-9a-f-]{36}$/);
  const clipOf = (url: string | null | undefined) => p.getClip(url!.split("/").pop()!)!;
  await p.clipDone(clipOf(ses.opening.audioUrl));
  assert.equal(p.getAudio(ses.opening.audioUrl!.split("/").pop()!)?.length, f.SILENT_MP3.length);
  assert.ok(ses.opening.feedbackAudioUrl, "the greeting is its own short clip");
  assert.ok(ses.opening.text.endsWith(p.speakQuestion(p.getSession(ses.sessionId)!.openQuestion!)));
  assert.ok(!/[*#`$]/.test(ses.opening.text), ses.opening.text);
  const s = p.getSession(ses.sessionId)!;
  assert.ok(s.lectureQuestionIds.has(ses.opening.questionId!), "opening question comes from the given lecture");

  const skipped = await p.turn(s, { text: "skip" });
  assert.equal(skipped.transcript, "skip");
  assert.equal(skipped.reply.intent, "question");
  assert.notEqual(skipped.reply.questionId, ses.opening.questionId);

  const open = s.openQuestion!;
  const concept = s.concepts.find(c => c.id === open.conceptId)!;
  const ex = await p.turn(s, { text: `Explain ${concept.name}` });
  assert.equal(ex.reply.intent, "explanation");
  assert.equal(ex.reply.conceptId, concept.id);
  assert.equal(ex.reply.questionId, open.id, "the open question is re-asked, not replaced");
  assert.ok(ex.reply.text.includes("Back to the question"), ex.reply.text);

  const attempts = async () => (await db.select({ n: count() }).from(schema.attempts).where(and(eq(schema.attempts.userId, user.id), eq(schema.attempts.questionId, open.id))))[0]!.n;
  const before = await attempts();
  const ans = await p.turn(s, { text: open.kind === "mcq" ? "B" : "I am not sure, something about the variance" });
  assert.equal(ans.reply.intent, "feedback");
  assert.ok(ans.reply.grade && typeof ans.reply.grade.correct === "boolean");
  assert.equal(await attempts(), before + 1, "grading wrote an attempt");
  assert.notEqual(ans.reply.questionId, open.id, "the reply asks the next question");
  const nextQ = s.openQuestion ? p.speakQuestion(s.openQuestion) : "";
  assert.ok(ans.reply.feedbackAudioUrl && ans.reply.audioUrl && ans.reply.feedbackAudioUrl !== ans.reply.audioUrl);
  const lead = ans.reply.text.slice(0, ans.reply.text.length - nextQ.length);
  assert.ok(words(lead) <= 40, `lead ${words(lead)} words: ${lead}`);
  assert.ok(words(ans.reply.text) <= Math.max(60, words(nextQ) + 22), `${words(ans.reply.text)} words: ${ans.reply.text}`);
  assert.ok(ans.reply.text.includes(nextQ), "next question is spoken whole");
  if (!ans.reply.grade!.correct) {
    const [cs] = await db.select({ due: schema.cardState.due }).from(schema.cardState).innerJoin(schema.cards, eq(schema.cards.id, schema.cardState.cardId))
      .where(and(eq(schema.cardState.userId, user.id), eq(schema.cards.conceptId, open.conceptId)));
    assert.ok(!cs || cs.due.getTime() <= Date.now() + 1000, "a wrong answer makes the concept's card due");
  }

  f.setFishMock({ transcript: "Next question please." });
  const spoken = await p.turn(s, { audio: { data: f.pcmToWav(Buffer.alloc(32000)), mime: "audio/wav" } });
  assert.equal(spoken.transcript, "Next question please.");
  assert.equal(spoken.reply.intent, "question");
  assert.ok(spoken.reply.audioUrl);
  f.setFishMock(true);

  assert.equal(s.history.filter(h => h.role === "student").length, 4);
  assert.ok(p.endSession(ses.sessionId));
  assert.equal(p.getSession(ses.sessionId), undefined);
});

test("diarization pass: 5 minutes of PCM triggers a pass, turns map onto segments, questionsAsked refreshed", { skip }, async () => {
  const { diarize: d, fish: f, outline: o, db: { db, schema }, drizzle: { eq, asc } } = mods;
  // Raw speaker 2 talks most (lecturer); speaker 5 asks something between 100 s and 112 s.
  f.setFishMock({ speakerTurns: [{ speaker: 2, text: "", start: 0, end: 100 }, { speaker: 5, text: "", start: 100, end: 112 }, { speaker: 2, text: "", start: 112, end: 300 }] });
  d.setDiarizeEnabled(true, { graceMs: 0 });
  try {
    const frame = Buffer.alloc(3200);
    for (let i = 0; i < 3000; i++) d.feedPcm(lectureId, frame, i * 0.1);   // exactly 300 s -> pass enqueued, ring emptied
    assert.equal(d.bufferedSeconds(lectureId), 0);
    const stats = await d.flushLecture(lectureId);
    assert.equal(stats.length, 1);
    assert.equal(stats[0]!.speakers, 2);
    const rows = await db.select().from(schema.segments).where(eq(schema.segments.lectureId, lectureId)).orderBy(asc(schema.segments.idx));
    const student = rows.filter(r => r.speaker === 1);
    assert.ok(student.length >= 1, "some segment labelled as the student");
    for (const r of student) assert.ok(r.endS > 100 && r.startS < 112, `student segment at ${r.startS}-${r.endS}`);
    assert.ok(rows.filter(r => r.speaker === 0).length > rows.length / 2, "most segments are the lecturer");
    const [ol] = await db.select().from(schema.outlines).where(eq(schema.outlines.lectureId, lectureId));
    const { questionsAsked, announcements } = o.unpackAnnouncements(ol!.announcements);
    assert.deepEqual(questionsAsked, o.questionsAskedFrom(rows.map(r => ({ id: r.id, text: r.text, start: r.startS, speaker: r.speaker }))));
    assert.ok(announcements.every(a => (a.kind as string) !== "question"));
  } finally {
    d.setDiarizeEnabled(null);
    f.setFishMock(true);
  }
});
