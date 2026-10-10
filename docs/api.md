# Slap REST + WebSocket API (v1)

Base: same origin as the web app. JSON bodies. Auth: `Authorization: Bearer <Neon Auth JWT>` unless marked public or **readable**. Types in `packages/contracts`.

**Guest access.** A class with `guestAccess: true` (owner switch, below) can be read by anyone: routes marked **readable** accept no token or a non-member's token and answer with `role: "guest"` and no mastery (`mastery: null`); per-student routes (review, practice, attempts, recall, today, partner, start/stop, import, upload) still need a member. Without guest access, readable routes are 401 with no token and 403 for a non-member, like everything else.

## Public
- `GET /api/health` liveness `{ ok }`; `GET /api/health/ready` → `Health` (checks DB and reports backends live/mock/down; never calls paid APIs).
- `GET /api/join/:code` → `{ classId, className, lectureId | null, live: boolean, guestAccess: boolean }` (code = class code, e.g. `CS229`).
- `GET /api/lectures/:id/public?lang=xx` → `{ title, className, classId, guestAccess, status, finals: [{segmentId,text,start,end,translation?}] }` for the caption page / guests.
- `WS /ws/live/:lectureId?lang=xx` → `CaptionEvent` stream; client sends `LiveClientMessage` (`subscribe` with `since` for reconnect; server replies `snapshot` then live events).

## Device
- `WS /ws/device?key=<DEVICE_KEY>` → protocol in contracts (`DeviceToServer` / `ServerToDevice`, binary PCM up, binary OLED frames down).
- A device belongs to a user (`devices.ownerUserId`) and records into its **active class** (`devices.classId`, nullable). A start from the device (either button) records into the active class; with none, the start is ignored and the screen says "Pick a course in the app". Unpaired devices show their pair code. Rows paired before owners existed belong to their active class's owner (recorded on the next hello).
- `POST /api/devices/pair` `{ pairCode, classId? }` (signed-in; member of `classId` if given) → `{ deviceId, ownerUserId, activeClassId: string | null, connected: boolean, state: DeviceState | "offline" }`. Pairs the device to the caller. `classId` becomes the active class; if omitted and the caller has exactly one class, that one; otherwise none. 404 if no device shows that code.
- `GET /api/devices` (signed-in) → the caller's devices `[{ id, name, pairCode, activeClass: { id, name, code } | null, connected, state: DeviceState | "offline", lastSeenAt }]`.
- `POST /api/devices/:id/active-class` `{ classId }` (device owner; member of the class) → the device (same shape). The device gets a `state` message and an idle frame with the new class code at once. 409 while it records another class's live lecture; 404 for someone else's device.
- `DELETE /api/devices/:id` (device owner) → `{ ok: true }`. Unpairs (no owner, no active class); a connected device shows a pair code again. 409 while it records.
- `WS /ws/lecture/:lectureId/audio?token=<Neon Auth JWT>` (owner of the lecture's class; lecture must be `live`): browser-microphone fallback. Binary frames as the device sends them (16 kHz int16 LE mono, 3,200 bytes = 100 ms) feed the lecture's STT stream. One audio source per lecture. Close codes: 4401 bad/missing token, 4403 not the owner, 4404 unknown lecture, 4410 not live, 4009 another source (device or browser) is streaming; 1000 when the lecture stops.

## Signed-in
- `GET /api/me` → `{ userId, email, classes: ClassSummary[] }`
- `POST /api/classes` `{ name, code }` → `ClassSummary` (creator = owner)
- `POST /api/classes/join` `{ code }` → `ClassSummary`
- `GET /api/classes/:classId` (readable) → `{ class, lectures: LectureSummary[], device: { paired: boolean, state: DeviceState | "offline", name: string | null }, live: { lectureId, viewers, languages } | null, nextExam: { name, date } | null, documents: [{id,kind,title}] }`. `device` is a device whose active class is this class (the caller's own first); `paired: false` if none. `live` is who is watching the live lecture right now (in-memory; null when nothing is live). `class.guestAccess` is the switch state.
- `POST /api/classes/:classId/guest-access` `{ enabled: boolean }` (owner) → `ClassSummary`. Lets anyone read the class without an account (see Guest access above).
- `GET /api/classes/:classId/export` (readable) → `application/zip` (`<code>-vault.zip`): an Obsidian vault of the class — `Concepts/<name>.md` per concept (frontmatter, definition, exam quote, `## Related` as `[[links]]`, `## Where it came up` linking lecture notes), `Lectures/<date> <title>.md` per ready/ended lecture (summary, outline, announcements, concepts), and `<class name>.md` as the index. Store-only zip, no dependencies. The caller's mastery is in the frontmatter for members.
- `GET /api/classes/:classId/announcements` (readable) → `[{ kind, text, when?, segmentId?, lectureId, lectureTitle, lectureDate }]`: the announcements from every lecture's outline, dated ones first by date, then undated by lecture date descending.
- `POST /api/classes/:classId/sessions/start` `{ title? }` (owner) → `LectureSummary` (status live). Records with the caller's device: one whose active class is this class, else the caller's device is switched here first (as `active-class` would) and records if connected. 409 if the caller's only connected device is recording another class.
- `POST /api/lectures/:id/stop` (owner) → `LectureSummary` (status processing; study bundle job enqueued). With a replay's id: stops the replay.
- `POST /api/lectures/:id/replay` `{ from?, to?, speed? }` (owner; `from`/`to` in lecture seconds, `speed` 0.25–10, default the whole transcript at 1×) → 201 `LectureSummary` of a **new in-memory lecture** (status live, title `Replay · <title>`) that plays the saved captions back through `/ws/live/:id`: interims grow word by word, finals fire at their original times with stored translations (other languages are translated as usual), and it stops itself at the end. Nothing is persisted and no study bundle runs. `GET /api/join/:code` finds it like a live lecture; its status events and `GET /api/lectures/:id/public` carry `replay: true` so the caption page labels it. 409 while the class has a live lecture or replay, 400 when there is nothing to replay in the window.
- `POST /api/classes/:classId/lectures/import` `{ title, date, transcript }` (owner; plain text or WebVTT) → `LectureSummary` (segments created, bundle enqueued)
- `GET /api/lectures/:id` (readable) → `{ lecture, segments: Segment[], outline: OutlineSection[], summary, announcements: Announcement[], concepts: Concept[], mentions: ConceptMention[] }` (`concepts[].mastery` filled for members)
- `GET /api/lectures/:id/translations?lang=xx` (readable) → `Record<segmentId, string>`
- `GET /api/classes/:classId/concepts` (readable) → `Concept[]` (mastery filled for the caller)
- `GET /api/classes/:classId/graph` (readable) → `{ nodes: Concept[], links: ConceptLink[] }`
- `GET /api/concepts/:id` (readable) → `{ concept, related: Concept[], mentions: [{lectureId, lectureTitle, segmentId, excerpt, start}], cards: Card[], questionCount }` (guests: cards without `due`/`state`)

## Study (pipeline)
- `GET /api/lectures/:id/bundle` (readable) → `StudyBundleStatus`; `POST /api/lectures/:id/bundle` re-runs (owner).
- `GET /api/classes/:classId/review/due?limit=20` → `Card[]` (card_state created lazily per user)
- `POST /api/cards/:id/review` `{ rating: 1|2|3|4 }` → `{ due, state }`
- `GET /api/classes/:classId/practice?n=5&conceptId=&lectureId=` → `Question[]` (interleaved across lectures, weak concepts first; `conceptId` puts that concept's questions first, then `lectureId` that lecture's, then the usual pick fills up)
- `POST /api/questions/:id/attempt` `{ answer }` → `Attempt`
- `POST /api/lectures/:id/recall` `{ text }` → `RecallResult`
- `POST /api/lectures/:id/ask` `{ question }` (member) → `LectureAnswer` `{ answer, citations: [{ segmentId, start, excerpt }], notInLecture }`: answered from the transcript only (the lines most relevant to the question plus neighbours are sent to the model; mock quotes the best-matching lines), with up to 4 cited segments in transcript order. Works during a live lecture on the finals persisted so far. Nothing is stored.
- `GET /api/classes/:classId/pretest` → `Pretest` `{ week: { week, topics, date? } | null, questions: PretestQuestion[] }`: three questions on the syllabus week the next lecture falls in (dated weeks: this week if it started in the last 6 days, else the next; undated: the week after the lectures held). Generated once per class per day and kept in memory (not tied to concept notes, nothing persisted); `week: null` with no syllabus or nothing left on it. `POST /api/classes/:classId/pretest` regenerates. `POST /api/classes/:classId/pretest/:questionId/attempt` `{ answer }` → `PretestAttempt` (graded like practice, not stored; 404 once the pretest has been regenerated or the server restarted).
- `GET /api/classes/:classId/exam-topics` (readable) → `ExamTopic[]` (guests: `mastery: null`)
- `GET /api/classes/:classId/today` → `{ date, cardsDue: Card[], weakConcepts: Concept[], practice: Question[], plan: StudyPlanDay[], nextExam }`
- `GET /api/classes/:classId/mastery` → `Record<conceptId, number>` (0..1)
- `POST /api/classes/:classId/documents` multipart `{ kind: book|syllabus, file }` → `{ id, jobId }`; `GET /api/documents/:id` → `{ id, kind, title, parsed }`

## Errors
`{ error: string }` with 400/401/403/404. Without a token only public and (for guest-access classes) readable routes work.

## Learning partner (spoken practice, Fish Audio)
- `GET /api/partner/voices` (signed-in) → `PartnerVoice[]` (curated list; the env default first).
- `POST /api/classes/:classId/partner/session` `{ lectureId?, voiceId?, lang? }` (member) → `PartnerSession` with an opening question already rendered to audio.
- `POST /api/partner/:sessionId/turn` multipart `{ audio? (webm/opus, wav or mp3 ≤ 60 s), text? }` (member) → `PartnerTurn`. The server transcribes with Fish ASR (`transcribe-1-pro`), decides the intent (answer to the open question → grade via the practice pipeline and reschedule the card; "explain X" → explanation from the concept note and its lecture excerpts; "skip"/"next" → new question), and renders the reply with Fish TTS (`s2.1-pro`, the session's voice).
- `GET /api/partner/audio/:id` (public, unguessable id) → `audio/mpeg`, cached in memory for ~10 minutes.
- `DELETE /api/partner/:sessionId` ends the session.
- Sessions live in memory (one process); a session is bound to the user, class and optional lecture; questions are picked weak-concepts-first and interleaved across lectures (same picker as `/practice`).

## Diarization pass (Fish Audio, post-lecture)
- While a lecture is live the server keeps at most the last 6 minutes of PCM in memory (never on disk). Every 5 minutes and at stop it sends that chunk to Fish ASR with `diarize=auto`, maps speaker turns onto the stored `segments` by time overlap (`segments.speaker`), and discards the chunk. The dominant speaker is the lecturer; other speakers are students.
- `GET /api/lectures/:id` segments carry `speaker` (0 = lecturer, 1+ = students); the outline's `announcements`-style list gains `questionsAsked: [{ segmentId, text, start }]` for student questions. Disabled when `FISH_API_KEY` is absent or `FISH_DIARIZE=0`.
