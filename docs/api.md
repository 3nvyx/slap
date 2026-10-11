# Slap REST + WebSocket API (v1)

Base: same origin as the web app. JSON bodies. Types in `packages/contracts`.

**No sign-in.** There are no accounts, tokens or roles: every route is open, and any caller can read and change any class or device. Do not put a deployment where untrusted people can reach it.

**Caller id.** The web app keeps a random id per browser (`localStorage`, `apps/web/src/lib/user.ts`) and sends it as the `X-Slap-User` header (8–64 characters of `A-Z a-z 0-9 _ -`). Per-student state (card schedules, attempts, recall checks, mastery, partner grading) is keyed by it. It is not a credential and nothing verifies it. Requests without the header, or with a malformed one, share the id `shared`.

## Health, join and captions
- `GET /api/health` liveness `{ ok }`; `GET /api/health/ready` → `Health` (checks DB and reports backends live/mock/down; never calls paid APIs).
- `GET /api/join/:code` → `{ classId, className, lectureId | null, live: boolean }` (code = class code, e.g. `CS229`).
- `GET /api/lectures/:id/public?lang=xx` → `{ title, className, classId, status, finals: [{segmentId,text,start,end,translation?}] }` for the caption page.
- `WS /ws/live/:lectureId?lang=xx` → `CaptionEvent` stream; client sends `LiveClientMessage` (`subscribe` with `since` for reconnect; server replies `snapshot` then live events). Viewers of another language also get `interimTranslation`: the sentence still being spoken, translated about once a second, superseded by the `translation` of its final.

## Device
- `WS /ws/device?key=<DEVICE_KEY>` → protocol in contracts (`DeviceToServer` / `ServerToDevice`, binary PCM up, binary OLED frames down).
- A device is paired or unpaired, and a paired device records into its **active class** (`devices.classId`, nullable). Paired devices are shared: every caller sees and controls all of them. `devices.ownerUserId` holds the caller id that paired it and only marks the device as paired (null = unpaired). A start from the device (either button) records into the active class; with none, the start is ignored and the screen says "Pick a course in the app". Unpaired devices show their pair code. Rows that have an active class but no owner count as paired (the class's creator is recorded as owner on the next hello).
- `POST /api/devices/pair` `{ pairCode, classId? }` → `{ deviceId, ownerUserId, activeClassId: string | null, connected: boolean, state: DeviceState | "offline" }`. Pairs the device showing that code. `classId` becomes the active class (404 if it does not exist); if omitted and exactly one class exists, that one; otherwise none. 404 if no device shows that code.
- `GET /api/devices` → every paired device `[{ id, name, pairCode, activeClass: { id, name, code } | null, connected, state: DeviceState | "offline", lastSeenAt }]`.
- `POST /api/devices/:id/active-class` `{ classId }` → the device (same shape). The device gets a `state` message and an idle frame with the new class code at once. 409 while it records another class's live lecture; 404 for an unknown or unpaired device, or an unknown class.
- `DELETE /api/devices/:id` → `{ ok: true }`. Unpairs (no owner, no active class); a connected device shows a pair code again. 409 while it records.
- `WS /ws/lecture/:lectureId/audio` (lecture must be `live`): browser-microphone fallback. Binary frames as the device sends them (16 kHz int16 LE mono, 3,200 bytes = 100 ms) feed the lecture's STT stream. One audio source per lecture. Close codes: 4404 unknown lecture, 4410 not live, 4009 another source (device or browser) is streaming; 1000 when the lecture stops.

## Classes and lectures
- `GET /api/classes` → `ClassSummary[]` `{ id, name, code, lectureCount, nextExam }`: every class, by name. The list is the same for every caller.
- `POST /api/classes` `{ name, code }` → 201 `ClassSummary`. 409 if the code is taken.
- `GET /api/classes/:classId` → `{ class, lectures: LectureSummary[], device: { paired: boolean, state: DeviceState | "offline", name: string | null }, live: { lectureId, viewers, languages } | null, nextExam: { name, date } | null, documents: [{id,kind,title}] }`. `device` is a device whose active class is this class (a connected one first); `paired: false` if none. `live` is who is watching the live lecture right now (in-memory; null when nothing is live).
- `GET /api/classes/:classId/export` → `application/zip` (`<code>-vault.zip`): an Obsidian vault of the class — `Concepts/<name>.md` per concept (frontmatter, definition, exam quote, `## Related` as `[[links]]`, `## Where it came up` linking lecture notes), `Lectures/<date> <title>.md` per ready/ended lecture (summary, outline, announcements, concepts), and `<class name>.md` as the index. Store-only zip, no dependencies. The caller's mastery is in the frontmatter.
- `GET /api/classes/:classId/announcements` → `[{ kind, text, when?, segmentId?, lectureId, lectureTitle, lectureDate }]`: the announcements from every lecture's outline, dated ones first by date, then undated by lecture date descending.
- `POST /api/classes/:classId/sessions/start` `{ title? }` → `LectureSummary` (status live). Records with a paired device: one whose active class is this class, else a connected device that is not recording is switched here first (as `active-class` would). Offline devices are never switched; with no usable device the lecture starts for the browser microphone. 409 if every connected device is recording another class.
- `POST /api/lectures/:id/stop` → `LectureSummary` (status processing; study bundle job enqueued). With a replay's id: stops the replay.
- `POST /api/lectures/:id/replay` `{ from?, to?, speed? }` (`from`/`to` in lecture seconds, `speed` 0.25–10, default the whole transcript at 1×) → 201 `LectureSummary` of a **new in-memory lecture** (status live, title `Replay · <title>`) that plays the saved captions back through `/ws/live/:id`: interims grow word by word, finals fire at their original times with stored translations (other languages are translated as usual), and it stops itself at the end. Nothing is persisted and no study bundle runs. `GET /api/join/:code` finds it like a live lecture; its status events and `GET /api/lectures/:id/public` carry `replay: true` so the caption page labels it. 409 while the class has a live lecture or replay, 400 when there is nothing to replay in the window.
- `POST /api/classes/:classId/lectures/import` `{ title, date, transcript }` (plain text or WebVTT) → `LectureSummary` (segments created, bundle enqueued)
- `GET /api/lectures/:id` → `{ lecture, segments: Segment[], outline: OutlineSection[], summary, announcements: Announcement[], concepts: Concept[], mentions: ConceptMention[] }` (`concepts[].mastery` is the caller's)
- `GET /api/lectures/:id/translations?lang=xx` → `Record<segmentId, string>`
- `GET /api/classes/:classId/concepts` → `Concept[]` (mastery filled for the caller)
- `GET /api/classes/:classId/graph` → `{ nodes: Concept[], links: ConceptLink[] }`
- `GET /api/concepts/:id` → `{ concept, related: Concept[], mentions: [{lectureId, lectureTitle, segmentId, excerpt, start}], cards: Card[], questionCount }`

## Study (pipeline)
- `GET /api/lectures/:id/bundle` → `StudyBundleStatus`; `POST /api/lectures/:id/bundle` re-runs.
- `GET /api/classes/:classId/review/due?limit=20` → `Card[]` (card_state created lazily per caller id)
- `POST /api/cards/:id/review` `{ rating: 1|2|3|4 }` → `{ due, state }`
- `GET /api/classes/:classId/practice?n=5&conceptId=&lectureId=` → `Question[]` (interleaved across lectures, weak concepts first; `conceptId` puts that concept's questions first, then `lectureId` that lecture's, then the usual pick fills up)
- `POST /api/questions/:id/attempt` `{ answer }` → `Attempt`
- `POST /api/lectures/:id/recall` `{ text }` → `RecallResult`
- `POST /api/lectures/:id/ask` `{ question }` → `LectureAnswer` `{ answer, citations: [{ segmentId, start, excerpt }], notInLecture }`: answered from the transcript only (the lines most relevant to the question plus neighbours are sent to the model; mock quotes the best-matching lines), with up to 4 cited segments in transcript order. Works during a live lecture on the finals persisted so far. Nothing is stored.
- `GET /api/classes/:classId/pretest` → `Pretest` `{ week: { week, topics, date? } | null, questions: PretestQuestion[] }`: three questions on the syllabus week the next lecture falls in (dated weeks: this week if it started in the last 6 days, else the next, and a week that has already had its usual number of lectures counts as done so the one after is used; undated: the week after the lectures held). Generated once per class per day and kept in memory (not tied to concept notes, nothing persisted); `week: null` with no syllabus or nothing left on it. `POST /api/classes/:classId/pretest` regenerates. `POST /api/classes/:classId/pretest/:questionId/attempt` `{ answer }` → `PretestAttempt` (graded like practice, not stored; 404 once the pretest has been regenerated or the server restarted).
- `GET /api/classes/:classId/exam-topics` → `ExamTopic[]`
- `GET /api/classes/:classId/today` → `{ date, cardsDue: Card[], weakConcepts: Concept[], practice: Question[], plan: StudyPlanDay[], nextExam }`
- `GET /api/classes/:classId/study-plan` → `StudyPlan` `{ date, generatedAt, horizonDays, overview, pace, paceData, nextExam, keyDates: [{ date, daysLeft, name, kind, note }], days: [{ date, focus, concepts: [{ id, name }], tasks, minutes, cardsDue, reason }] }`: the plan the model writes from the syllabus (exams, deadlines), the lecturer's dated announcements, every lecture's outline, the concept notes with the caller's mastery, and the class pace (`paceData`: lectures held, lectures a week, syllabus week, per-week topic coverage). Back-scheduled from the next exam over 7-21 days (through the exam; 14 days without one); `concepts[].id` is null when a name did not match a note. Written once per student, class and day and kept in memory; regenerated when a lecture, concept or syllabus date changes. `POST /api/classes/:classId/study-plan` regenerates now.
- `GET /api/classes/:classId/mastery` → `Record<conceptId, number>` (0..1)
- `POST /api/classes/:classId/documents` multipart `{ kind: book|syllabus, file }` → `{ id, jobId }`; `GET /api/documents/:id` → `{ id, kind, title, parsed }`

## Errors
`{ error: string }` with 400/404/409 (413 and 415 on uploads and partner audio, 502 when Fish fails). No route answers 401 or 403.

## Learning partner (spoken practice, Fish Audio)
- `GET /api/partner/voices` → `PartnerVoice[]` (curated list; the env default first).
- `POST /api/classes/:classId/partner/session` `{ lectureId?, voiceId?, lang? }` → `PartnerSession` with an opening question already rendered to audio.
- `POST /api/partner/:sessionId/turn` multipart `{ audio? (webm/opus, wav or mp3 ≤ 60 s), text? }` → `PartnerTurn`. The server transcribes with Fish ASR (`transcribe-1-pro`), decides the intent (answer to the open question → grade via the practice pipeline and reschedule the card; "explain X" → explanation from the concept note and its lecture excerpts; "skip"/"next" → new question; a bare greeting such as "hi, how are you?" → a short hello and the open question again, ungraded), and renders the reply with Fish TTS (`s2.1-pro`, the session's voice).
- `GET /api/partner/audio/:id` (unguessable id) → `audio/mpeg`, cached in memory for ~10 minutes.
- `DELETE /api/partner/:sessionId` ends the session.
- Sessions live in memory (one process); a session grades for the caller id that started it, in its class and optional lecture; questions are picked weak-concepts-first and interleaved across lectures (same picker as `/practice`).

## Diarization pass (Fish Audio, post-lecture)
- While a lecture is live the server keeps at most the last 6 minutes of PCM in memory (never on disk). Every 5 minutes and at stop it sends that chunk to Fish ASR with `diarize=auto`, maps speaker turns onto the stored `segments` by time overlap (`segments.speaker`), and discards the chunk. The dominant speaker is the lecturer; other speakers are students.
- `GET /api/lectures/:id` segments carry `speaker` (0 = lecturer, 1+ = students); the outline's `announcements`-style list gains `questionsAsked: [{ segmentId, text, start }]` for student questions. Disabled when `FISH_API_KEY` is absent or `FISH_DIARIZE=0`.
