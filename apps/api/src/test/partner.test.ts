// Learning partner pure parts: intent rules, spoken MCQ answers, speech phrasing, reply budget,
// Fish ASR parsing, voice list, WAV helpers, audio cache, and the routes that need no session.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";   // never connected by these tests
const p = await import("../pipeline/partner.ts");
const f = await import("../pipeline/fishAudio.ts");

const concepts = [
  { id: "c1", name: "Gaussian Distribution", slug: "gaussian-distribution" },
  { id: "c2", name: "Maximum Likelihood Estimation", slug: "maximum-likelihood-estimation" },
  { id: "c3", name: "Least Squares", slug: "least-squares" },
  { id: "c4", name: "Central Limit Theorem", slug: "central-limit-theorem" },
];

test("intent: skip / next / another ask for a new question", () => {
  for (const t of ["skip", "Skip.", "next", "Next question please", "another one", "Can I get another question?", "um, skip this"]) {
    assert.equal(p.classifyIntent(t, concepts).intent, "skip", t);
  }
});

test("intent: explain / what is / tell me about name a concept, matched by name", () => {
  const cases: Array<[string, string | null]> = [
    ["Explain the central limit theorem", "c4"],
    ["What is least squares?", "c3"],
    ["what's a gaussian distribution", "c1"],
    ["Tell me about maximum likelihood", "c2"],
    ["Can you explain maximum likelihood estimation again?", "c2"],
    ["Explain that", null],
  ];
  for (const [t, id] of cases) {
    const r = p.classifyIntent(t, concepts);
    assert.equal(r.intent, "explain", t);
    assert.equal(r.conceptId, id, t);
  }
  assert.equal(p.classifyIntent("Explain that", concepts).ambiguous, false, "deictic explain refers to the open question");
  assert.equal(p.classifyIntent("What is the weather like", concepts).ambiguous, true, "no concept named: tiebreak");
});

test("intent: everything else is an answer; long answers that mention 'next' are flagged ambiguous", () => {
  const a = p.classifyIntent("It's the sum of squared errors between predictions and labels", concepts);
  assert.deepEqual([a.intent, a.ambiguous], ["answer", false]);
  const b = p.classifyIntent("you update theta and then the next value moves against the gradient by alpha", concepts);
  assert.deepEqual([b.intent, b.ambiguous], ["answer", true]);
  assert.equal(p.classifyIntent("I don't know", concepts).intent, "answer");
});

test("intent: a bare greeting is not an answer; a greeting followed by an answer or a request still is", () => {
  for (const t of ["Hi", "Hello there!", "Hi Elon, how are you?", "hey, what's up", "Good morning", "Nice to meet you"]) {
    const r = p.classifyIntent(t, concepts);
    assert.deepEqual([r.intent, r.ambiguous], ["greet", false], t);
  }
  assert.equal(p.classifyIntent("hey, B", concepts).intent, "answer");
  assert.equal(p.classifyIntent("Hi, true", concepts).intent, "answer");
  assert.equal(p.classifyIntent("Hello, it's the sum of squared errors", concepts).intent, "answer");
  assert.equal(p.classifyIntent("hey explain that", concepts).intent, "explain");
  assert.equal(p.classifyIntent("Hey, what is least squares?", concepts).intent, "explain");
  assert.equal(p.classifyIntent("hi, next question please", concepts).intent, "skip");
});

test("matchConcept: exact, containment, word overlap, or nothing", () => {
  assert.equal(p.matchConcept("the least squares", concepts)?.id, "c3");
  assert.equal(p.matchConcept("likelihood estimation", concepts)?.id, "c2");
  assert.equal(p.matchConcept("gaussian", concepts)?.id, "c1");
  assert.equal(p.matchConcept("photosynthesis", concepts), null);
});

test("spoken MCQ answers resolve to the option text", () => {
  const opts = ["The mean squared error", "The log likelihood", "The prior", "The learning rate"];
  assert.equal(p.resolveMcqAnswer("B", opts), opts[1]);
  assert.equal(p.resolveMcqAnswer("Option c.", opts), opts[2]);
  assert.equal(p.resolveMcqAnswer("I think it's a", opts), opts[0]);
  assert.equal(p.resolveMcqAnswer("the second one", opts), opts[1]);
  assert.equal(p.resolveMcqAnswer("the learning rate", opts), opts[3]);
  assert.equal(p.resolveMcqAnswer("no idea", opts), "no idea");
});

test("questions are phrased for speech: no markdown, options read as A-D", () => {
  const s = p.speakQuestion({ kind: "mcq", prompt: "Which loss does **least squares** minimise", options: ["`MSE`", "MAE", "Hinge", "Log loss"] });
  assert.equal(s, "Which loss does least squares minimise? A: MSE. B: MAE. C: Hinge. D: Log loss.");
  const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  const capped = p.speakQuestion({ kind: "mcq", prompt: "Pick one", options: [long, "b; c", "x", "y"] });
  assert.ok(capped.includes(`A: ${Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ")}. B: b, c.`), capped);
  assert.equal(p.speechText("# Title\n- item with $x^2$ and $e^{-x}$"), "Title item with x squared and e to the -x");
});

test("replies stay under the word budget and keep the next question whole", () => {
  const q = "Why does the normalizing constant of the Gaussian not change the maximum likelihood estimate of theta?";
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") + ".";
  const r = p.fitReply([{ text: "Not quite." }, { text: long }, { text: `Next question: ${q}`, required: true }], 60);
  assert.ok(p.wordCount(r) <= 60, `${p.wordCount(r)} words`);
  assert.ok(r.endsWith(q));
  assert.ok(r.startsWith("Not quite."));
  assert.equal(p.trimWords("One two three. Four five six.", 4), "One two three.");
});

test("composeReply: short lead clip, main clip whole; lead becomes main when there is no main", () => {
  const q = Array.from({ length: 50 }, (_, i) => `q${i}`).join(" ") + "?";
  const r = p.composeReply([{ text: "Not quite: the answer is B." }, { text: Array.from({ length: 40 }, (_, i) => `d${i}`).join(" ") + "." }], q);
  assert.equal(r.main, q);
  assert.ok(p.wordCount(r.feedback) <= 18 && r.feedback.startsWith("Not quite"), r.feedback);
  assert.deepEqual(p.composeReply([{ text: "Hello there." }], ""), { feedback: "", main: "Hello there." });
});

test("Fish ASR parsing strips speaker markers and [tags], numbers speakers, converts ms", () => {
  const r = f.parseAsr({
    text: "<|speaker:0|> So the error is Gaussian. [crowd talking noise] <|speaker:1|> Is it because the error is y minus theta x?",
    duration: 12,
    segments: [{ text: "<|speaker:0|> So the error is Gaussian.", start: 0, end: 5000, speaker: "SPEAKER_0" }, { text: "Is it because?", start: 6000, end: 12000, speaker: "SPEAKER_1" }],
    speaker_turns: [{ speaker: "SPEAKER_0", text: "So the error is Gaussian.", start: 0, end: 5000 }, { speaker: "SPEAKER_1", text: "Is it because", start: 6000, end: 12000 }],
  });
  assert.equal(r.text, "So the error is Gaussian. Is it because the error is y minus theta x?");
  assert.deepEqual(r.events, ["crowd talking noise"]);
  assert.deepEqual(r.speakerTurns.map(t => [t.speaker, t.start, t.end]), [[0, 0, 5], [1, 6, 12]]);
  assert.equal(r.segments[0]!.text, "So the error is Gaussian.");
  assert.equal(f.cleanAsrText("a [laughs] b <|speaker:2|> c ."), "a b c.");
});

test("voices: presets, default first", () => {
  assert.ok(f.PARTNER_VOICES.length > 1);
  assert.deepEqual(f.PARTNER_VOICES.map(v => !!v.default), f.PARTNER_VOICES.map((_, i) => i === 0));
  assert.equal(new Set(f.PARTNER_VOICES.map(v => v.id)).size, f.PARTNER_VOICES.length);
  assert.ok(f.isKnownVoice(f.defaultVoiceId()));
  assert.ok(!f.isKnownVoice("03397b4c4be74759b72533b663fbd001"));
});

test("WAV header round-trips and readWav walks LIST chunks", () => {
  const pcm = Buffer.alloc(32000 * 2);   // 2 s
  const wav = f.pcmToWav(pcm);
  assert.equal(wav.length, 44 + pcm.length);
  const w = f.readWav(wav)!;
  assert.deepEqual([w.sampleRate, w.channels, w.bits, w.durationS], [16000, 1, 16, 2]);
  const list = Buffer.concat([Buffer.from("LIST"), Buffer.from([4, 0, 0, 0]), Buffer.from("INFO")]);
  const withList = Buffer.concat([wav.subarray(0, 36), list, wav.subarray(36)]);
  assert.equal(f.readWav(withList)!.pcm.length, pcm.length);
  assert.equal(f.readWav(Buffer.from("not a wav")), null);
});

test("mock TTS is a playable silent mp3; mock ASR returns the canned transcript", async () => {
  f.setFishMock({ transcript: "B" });
  try {
    const mp3 = await f.tts("hello");
    assert.equal(mp3[0], 0xff);
    assert.equal(mp3.length, 28 * 144);
    const r = await f.asr(f.pcmToWav(Buffer.alloc(32000)), { mime: "audio/wav", diarize: true });
    assert.equal(r.text, "B");
    assert.equal(r.duration, 1);
    assert.equal(r.speakerTurns.length, 1);
  } finally { f.setFishMock(null); }
});

test("audio cache: random ids, expiry after 10 minutes", () => {
  const t = Date.now();
  const id = p.storeAudio(Buffer.from("x"), t);
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.ok(p.getAudio(id, t + 60_000));
  assert.equal(p.getAudio(id, t + p.AUDIO_TTL_MS + 1), undefined);
});

test("streamed clips: id at once, bytes as they arrive, replay whole once done, failures surface", async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  async function* src() { yield new Uint8Array([1, 2]); await gate; yield new Uint8Array([3]); }
  const id = p.streamAudio(src());
  const clip = p.getClip(id)!;
  await p.clipReady(clip);
  assert.equal(clip.bytes, 2);
  assert.equal(p.getAudio(id), undefined, "not finished yet");
  const got: number[] = [];
  const reading = (async () => { for await (const b of p.clipBytes(clip)) got.push(...b); })();
  release();
  await reading;
  assert.deepEqual(got, [1, 2, 3]);
  assert.deepEqual([...p.getAudio(id)!], [1, 2, 3]);
  assert.ok(clip.firstByteAt! >= clip.startedAt && clip.doneAt! >= clip.firstByteAt!);

  async function* bad(): AsyncGenerator<Uint8Array> { throw new Error("boom"); }
  const bid = p.streamAudio(bad());
  const bclip = p.getClip(bid)!;
  await p.clipDone(bclip);
  assert.equal(bclip.error?.message, "boom");
  assert.equal(p.getAudio(bid), undefined);
});

test("routes: audio (404 when unknown), voices, unknown session; mime sniffing", async () => {
  const { partnerRoutes, audioMime } = await import("../routes/partner.ts");
  const id = p.storeAudio(f.SILENT_MP3);
  const ok = await partnerRoutes.request(`/partner/audio/${id}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "audio/mpeg");
  assert.equal((await ok.arrayBuffer()).byteLength, f.SILENT_MP3.length);
  assert.equal(ok.headers.get("content-length"), String(f.SILENT_MP3.length));
  assert.equal((await partnerRoutes.request(`/partner/audio/${crypto.randomUUID()}`)).status, 404);
  // Still rendering: streamed without Content-Length, bytes arrive as the source yields them.
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  async function* src() { yield new Uint8Array([7, 7]); await gate; yield new Uint8Array([8]); }
  const sid = p.streamAudio(src());
  const res = await partnerRoutes.request(`/partner/audio/${sid}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-length"), null);
  const reader = res.body!.getReader();
  assert.deepEqual([...(await reader.read()).value!], [7, 7]);
  release();
  assert.deepEqual([...(await reader.read()).value!], [8]);
  assert.equal((await reader.read()).done, true);
  async function* bad(): AsyncGenerator<Uint8Array> { throw new Error("401"); }
  assert.equal((await partnerRoutes.request(`/partner/audio/${p.streamAudio(bad())}`)).status, 502);
  assert.equal((await partnerRoutes.request("/partner/voices")).status, 200);
  assert.equal((await partnerRoutes.request(`/partner/${crypto.randomUUID()}/turn`, { method: "POST" })).status, 404);
  assert.equal(audioMime("audio/webm;codecs=opus", Buffer.alloc(4)), "audio/webm");
  assert.equal(audioMime("", f.pcmToWav(Buffer.alloc(2))), "audio/wav");
  assert.equal(audioMime(undefined, f.SILENT_MP3), "audio/mpeg");
  assert.equal(audioMime("audio/mp4;codecs=mp4a.40.2", Buffer.alloc(8)), "audio/mp4");
  assert.equal(audioMime("application/pdf", Buffer.from("%PDF")), null);
});
