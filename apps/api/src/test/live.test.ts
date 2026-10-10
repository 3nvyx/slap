// Live caption logic with the mock STT and no database: seq numbering, snapshot/since, translations.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaptionEvent } from "@slap/contracts";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
process.env.TRANSLATE_BACKEND = "mock";
const s = await import("../sessions.ts");

function loudPcm(ms: number): Buffer {
  const n = (16000 * ms) / 1000;
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 5) * 8000), i * 2);
  return b;
}

function viewer(lang: string) {
  const got: CaptionEvent[] = [];
  return { got, v: { lang, ready: true, send: (ev: CaptionEvent) => { got.push(ev); } } satisfies import("../sessions.ts").Viewer };
}

const settle = () => new Promise(r => setTimeout(r, 20));

test("mock STT drives interim + final events with increasing seq, snapshot honours since", async () => {
  const l = s.createEphemeralLecture({ sttBackend: "mock" });
  const en = viewer("en");
  s.addViewer(l, en.v);
  for (let i = 0; i < 90; i++) s.pushAudio(l.id, loudPcm(100));   // 9 s of loud audio = 2 sentences
  await settle();

  const finals = en.got.filter(e => e.type === "final");
  const interims = en.got.filter(e => e.type === "interim");
  assert.equal(finals.length, 2);
  assert.ok(interims.length >= 4);
  const seqs = en.got.filter(e => "seq" in e).map(e => (e as { seq: number }).seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "seq increases");
  assert.ok(finals.every(f => f.type === "final" && f.segmentId < 0), "ephemeral ids are negative");

  const all = s.snapshot(l, 0, "en");
  assert.equal(all.type, "snapshot");
  if (all.type !== "snapshot") return;
  assert.equal(all.finals.length, 2);
  assert.equal(all.seq, l.seq);

  const firstFinalSeq = (finals[0] as { seq: number }).seq;
  const after = s.snapshot(l, firstFinalSeq, "en");
  assert.ok(after.type === "snapshot" && after.finals.length === 1 && after.finals[0]!.segmentId === (finals[1] as { segmentId: number }).segmentId);

  const ahead = s.snapshot(l, l.seq + 1000, "en");   // client from before a server restart
  assert.ok(ahead.type === "snapshot" && ahead.finals.length === 2);
});

test("a new language backfills recent finals; later finals are translated once per language", async () => {
  const l = s.createEphemeralLecture({ sttBackend: "mock" });
  for (let i = 0; i < 45; i++) s.pushAudio(l.id, loudPcm(100));   // one final before any Spanish viewer
  await settle();
  assert.equal(l.finals.length, 1);

  const es1 = viewer("en"), es2 = viewer("en"), en = viewer("en");
  for (const x of [es1, es2, en]) s.addViewer(l, x.v);
  s.setViewerLang(l, es1.v, "es");
  s.setViewerLang(l, es2.v, "es");
  await settle();
  const backfilled = es1.got.filter(e => e.type === "translation");
  assert.equal(backfilled.length, 1);
  assert.ok(backfilled[0]!.type === "translation" && backfilled[0]!.text.startsWith("[es] "));

  for (let i = 0; i < 45; i++) s.pushAudio(l.id, loudPcm(100));
  await settle();
  const tr = es1.got.filter(e => e.type === "translation");
  assert.equal(tr.length, 2);
  assert.equal(en.got.filter(e => e.type === "translation").length, 0, "English viewers get no translations");
  assert.equal(l.finals.at(-1)!.tr.size, 1, "translated once for es, not per viewer");

  // A reconnecting Spanish viewer that saw the final but not its translation gets it via snapshot.
  const lastFinal = l.finals.at(-1)!;
  const snap = s.snapshot(l, lastFinal.seq, "es");
  assert.ok(snap.type === "snapshot" && snap.finals.length === 1 && snap.finals[0]!.translation?.startsWith("[es] "));
  const snapEn = s.snapshot(l, 0, "en");
  assert.ok(snapEn.type === "snapshot" && snapEn.finals.every(f => f.translation === undefined));
});

test("status events report viewers and languages; interims are never translated", async () => {
  const l = s.createEphemeralLecture({ sttBackend: "mock" });
  const a = viewer("fr");
  s.addViewer(l, a.v);
  const b = viewer("en");
  s.addViewer(l, b.v);
  const st = a.got.filter(e => e.type === "status").at(-1);
  assert.ok(st?.type === "status" && st.viewers === 2);
  assert.deepEqual(st.type === "status" ? st.languages : [], ["en", "fr"]);
  for (let i = 0; i < 20; i++) s.pushAudio(l.id, loudPcm(100));   // 2 s: interims only
  await settle();
  assert.ok(a.got.some(e => e.type === "interim"));
  assert.equal(a.got.filter(e => e.type === "translation").length, 0);
  s.removeViewer(l, b.v);
  const st2 = a.got.filter(e => e.type === "status").at(-1);
  assert.ok(st2?.type === "status" && st2.viewers === 1);
  await s.stopSession(l.id);
  const end = a.got.filter(e => e.type === "status").at(-1);
  assert.ok(end?.type === "status" && end.state === "ended");
  assert.ok(a.got.some(e => e.type === "final"), "stop flushes the pending sentence as a final");
});

test("/ws/live accepts same-origin, public URL and local dev origins only", async () => {
  const { originAllowed } = await import("../ws/live.ts");
  assert.equal(originAllowed(undefined, "x"), true);
  assert.equal(originAllowed("https://slap.example:443", "slap.example"), true);
  assert.equal(originAllowed("http://localhost:5173", "localhost:8787"), true);   // vite proxy rewrites Host
  assert.equal(originAllowed("https://evil.example", "slap.example"), false);
});
