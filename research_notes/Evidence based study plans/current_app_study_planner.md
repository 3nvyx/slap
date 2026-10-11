# Current study-planning logic in the Slap app (code inventory, read 10 October 2026)

All sources are files under `/Users/nootnoot/slap` (paths below are relative to that root; `file:line`). Nothing was run; the files were read as they stood on 10 October 2026 while other sessions were editing `apps/`. Copies under `.claude/worktrees/` were ignored.

## 1. What does the product plan (PLAN.md) say a study plan should do?

### Takeaway
PLAN.md has a one-line "Study plan principles" entry (FSRS cards, retrieval practice through exam-style questions, interleaving across lectures, anchored to syllabus exam dates) and a stated evidence ranking (retrieval practice and spacing high; interleaving, self-explanation, free recall, pretesting moderate; re-reading low). It specifies no time budget, no plan-adherence tracking and no exam-aware spacing.

### Cited Findings
- The principles, quoted in full: "**Study plan principles** (pitch line): FSRS scheduling for cards, retrieval practice through exam-style questions, interleaving by mixing concepts across lectures, anchored to syllabus exam dates. `ts-fsrs`: confirm the current scheduler API (`repeat`/`next`) when wiring it in, timestamps are UTC, and both the card state and the review log are saved." — `PLAN.md:247`
- Evidence ranking, quoted: "Study features follow the evidence ranking: retrieval practice and spacing (high), interleaving, self-explanation, free recall and pretesting (moderate), re-reading aids (low). The post-lecture recall check is in; the one-page exam sheet is demoted to stretch." — `PLAN.md:18`
- On the graph: "The knowledge graph is framed as a map and a mastery view, not the study method itself. The research favours retrieval practice and spacing over viewing pre-made maps, so the cards and questions carry the learning, and the graph gets one generative question type (\"how are X and Y related?\")." — `PLAN.md:17`
- Scope row, Study plan: "| Should | Study plan (\"Today\" page) | Cards due (FSRS), weakest high-emphasis concepts, a practice set that mixes concepts across lectures, back-scheduled from syllabus exam dates. |" — `PLAN.md:72`
- Scope row, Flashcards: "Generated per concept, scheduled with an FSRS library." — `PLAN.md:57`
- Scope row, Practice: "Questions in the style of the lecturer's examples and the book's exercises; graded by the model as formative feedback, not a mark; results update mastery. Includes a \"how are X and Y related?\" type where the student draws the edge, the one form of concept mapping that is shown to help." — `PLAN.md:58`
- Scope row, Recall check: "Right after the session ends: three minutes to type everything remembered, compared against the transcript into got / missed / wrong. Misses feed mastery and cards. About 1 hour. The best-supported technique and the one only this product can do." — `PLAN.md:65`
- Scope row, Pretest (stretch): "Three questions on what the syllabus says is coming. About 30 minutes." — `PLAN.md:66`
- Scope row, Exam sheet (stretch): "Generated per exam from exam topics and weak spots. A re-reading aid, so low priority." — `PLAN.md:67`
- Scope row, Exam topics: "Concepts ranked by lecturer emphasis: explicit flags (\"this will be on the exam\"), how often and how long each was covered. The ranking is a heuristic, and the UI says so." — `PLAN.md:71`
- Scope row, Syllabus upload: "Once per class: exam dates, weekly topics, deadlines. Same PDF path as the book chapter. Anchors the study plan." — `PLAN.md:63`
- Cut order names a fallback plan: "spoken practice → syllabus-aware plan (fall back to a plain 7-day plan) → lecture outline → book upload → recall check → practice mode → flashcards." — `PLAN.md:79`
- Data model: "Per student: `profiles`, `enrollments`, `card_state` (FSRS card state), `review_logs`, `attempts`. Mastery is computed from review logs and attempts." — `PLAN.md:228`
- Emphasis: "the concept extraction call also returns an exam flag (with the lecturer's quote) and the backend counts mentions and time spent. Exam topics and the study plan read from this." — `PLAN.md:241`
- "The derived pages (exam topics, study plan) read from the bundle rather than calling the model again. Grading is formative feedback, and exam-topic ranking is a heuristic; the UI says both." — `PLAN.md:246`
- Timeline acceptance line: "Both pages show ranked, real data for the signed-in student, with review back-scheduled from the next exam date" — `PLAN.md:407`

### Inferences
- PLAN.md says the derived pages should not call the model again (`PLAN.md:246`), but the app now has a model-written plan (`apps/api/src/pipeline/studyPlan.ts`) next to the deterministic one. The model-written plan is the one the Today page shows (see section 9).
- PLAN.md says mastery is computed "from review logs and attempts" (`PLAN.md:228`); the code computes it from current card state (not review logs), attempts and recall checks (see section 5).
- PLAN.md's principles do not mention: a daily time budget, successive relearning to a criterion, exam-date-aware intervals, mock exams, plan completion or missed-day handling. Those are absent from the plan document itself, not only from the code.

### Gaps
- PLAN.md cites no learning-science sources for the evidence ranking (its References section, `PLAN.md:466-491`, lists only technical libraries and services).

## 2. The deterministic daily plan (`apps/api/src/pipeline/plan.ts`)

### Takeaway
`getToday` returns today's due cards (max 20), up to 5 "weak" concepts, 5 practice questions, a rule-based 7-day plan and the next exam. The 7-day plan covers each ranked topic once, round-robin, finishing two days before the exam, with the day before the exam for the 3 weakest and exam day as light review. The web Today page does not render this 7-day plan.

### Cited Findings
- Return shape: `Today { date; cardsDue: Card[]; weakConcepts: Concept[]; practice: Question[]; plan: StudyPlanDay[]; nextExam: { name; date } | null }` — `apps/api/src/pipeline/plan.ts:107-114`. `StudyPlanDay` is `{ date, cardsDue: number, concepts: string[] (ids), questions: string[] (ids), reason }` — `packages/contracts/src/*.ts:87` (grep line 87).
- Constant: `export const PLAN_DAYS = 7;` — `plan.ts:23`.
- Inputs loaded by `getToday`: mastery and syllabus (`plan.ts:117`); the next two upcoming exams (`plan.ts:118`); exam topics ranked with the next exam's syllabus topics (`plan.ts:119`); `getDueCards(userId, classId, 20, now)`, `pickPractice(userId, classId, 5, mastery)`, `dueForecast(userId, classId, PLAN_DAYS, now)` (`plan.ts:120-124`); the top `4 * PLAN_DAYS` = 28 ranked topics go to the plan (`plan.ts:125`).
- Weak concepts: `topics.filter(t => (t.mastery ?? 0) < 0.7).slice(0, 5)` — threshold 0.7, never-studied counts as 0, order is the exam-topic score order (not lowest mastery first) — `plan.ts:129`.
- Route: `GET /api/classes/:classId/today` → `getToday(user, classId)` — `apps/api/src/routes/study.ts:171-174`.
- `buildPlan` topic filter: only topics with `emphasis > 0 || examFlag || mastery !== null` — `plan.ts:36`.
- Exam handling: an exam counts if `daysLeft >= 0`; `examIn` is its day index only if `daysLeft < PLAN_DAYS` — `plan.ts:37-38`.
- Case A, exam inside the 7-day window: `spreadDays = Math.max(1, examIn - 1)` (comment: "last day before the exam is for weak spots"); `perDay = Math.min(4, Math.max(1, Math.ceil(Math.min(topics.length, 4 * spreadDays) / spreadDays)))` — `plan.ts:43-45`.
- Case B, exam beyond the window: `usable = Math.max(1, exam.daysLeft - 2)`; `perDay = Math.min(4, Math.max(2, Math.ceil(topics.length / usable)))`; `spreadDays = PLAN_DAYS` — `plan.ts:46-49`.
- Case C, no exam: `perDay = 3; spreadDays = PLAN_DAYS` — `plan.ts:50-53`.
- Distribution: `pool = topics.slice(0, perDay * spreadDays)`; `pool.forEach((t, k) => slots[k % spreadDays].push(t))` (round-robin, so rank 1 goes to day 0, rank 2 to day 1, and so on); empty study days are filled by cycling `topics[d % topics.length]` — `plan.ts:54-58`.
- Weakest three: `[...topics].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0) || b.score - a.score).slice(0, 3)` — `plan.ts:60`.
- Exam day: up to 2 exam-flagged topics; reason "`${exam.name} today: light review of flagged topics only, no new material.`" — `plan.ts:66-68`.
- Days after an exam in the window: 3 topics cycling from the top of the ranking (`topics[(k * 3 + j) % topics.length]`); reason "After X: N days to Y, back to steady mixed practice." or "After X: steady mixed practice so it sticks." — `plan.ts:69-75`.
- Day before the exam: `chosen = weakest`; reason "`Day before ${exam.name}: retrieval practice on your weakest high-emphasis topics.`" — `plan.ts:76-78`.
- Other days' reasons: "`${left} days to ${exam.name}: cover N topics, mixed across lectures.`" (in window), "`${left} days to ${exam.name} (${exam.date}): ${perDay} topics a day finishes the list 2 days early.`" (far exam), "No exam date in a syllabus yet: steady practice on the highest-priority topics, mixed across lectures." or "Nothing new to study yet: review due cards." — `plan.ts:79-91`.
- Cards: each day carries `cardsDue = dueByDay[d] ?? 0`; "Plus N card(s) due." is appended to the reason — `plan.ts:63, 92`.
- Questions per day: the first stored question id of each chosen topic, at most 3 a day — `plan.ts:93`; `questionIdsByConcept` orders by `desc(questions.id)` (ids are random UUIDs) — `apps/api/src/pipeline/practice.ts:196-204`.
- File header describing intent: "spreads ranked topics over the days before the exam round-robin (interleaving: each day mixes high and lower priority topics), finishing two days early when the exam is further out, keeps the last day before the exam for the weakest topics, makes exam day light review, then resumes mixed practice toward the following exam. Without a syllabus exam it is a steady 3-topics-a-day plan." — `plan.ts:1-11`.
- Tests confirm the behaviour (exam in 4 days: day 3 "Day before Midterm", day 4 "Midterm today", day 5 "After Midterm: 60 days to Final") — `apps/api/src/pipeline/scheduling.test.ts:98-126`.
- The web app never reads `Today.plan`: the type exists (`apps/web/src/lib/types.ts:125-132`) but a grep for `.plan` property access and `StudyPlanDay` in `apps/web/src` finds only the type file and the mock (`apps/web/src/lib/mock.ts:260`, `lib/types.ts:130`); `Today.tsx` uses only `t.cardsDue`, `t.nextExam`, `t.practice`, `t.weakConcepts`, `t.date` (`apps/web/src/pages/Today.tsx:23-108`). The only other caller of `getToday` is a verification script (`apps/api/src/pipeline/verify-db.ts:124`).

### Inferences
- In the deterministic plan each topic is scheduled once per window (the pool is dealt out once; `plan.ts:55-56`). A concept is revisited only if it is also among the 3 weakest on the day before the exam, an exam-flagged pick on exam day, or in the post-exam cycle. There is no rule that brings a concept back after a gap (no spaced re-exposure of practice topics); spacing exists only for flashcards via FSRS.
- "Interleaving" here means several different topics per day in priority order; nothing checks that a day's topics come from different lectures (topics carry no lecture id in `ExamTopic`, `packages/contracts` line 86), although the reason text says "mixed across lectures".
- The deterministic plan has no time estimate per day and no cap on cards; `cardsDue` is a raw count.
- Because the Today page shows the model-written plan instead (section 3, section 9), the deterministic 7-day plan is effectively dead output apart from `cardsDue`, `weakConcepts`, `practice` and `nextExam`.

### Gaps
- Whether anything outside `apps/web` (for example the device OLED) reads `Today.plan` was checked only by grep of `apps/api/src` (callers: `routes/study.ts:173`, `verify-db.ts:124`); no other consumer was found.

## 3. The model-written plan (`studyPlan.ts`, `tasks.ts`, `schemas.ts`)

### Takeaway
The Today page's "Study plan" panel is written by an LLM from a JSON payload (exams, deadlines, dated announcements, lecture outlines, top-40 concepts with mastery, class pace, cards due per day) under a fixed rule list in the prompt; the reply is normalised to exactly `horizonDays` consecutive days (7 to 21, default 14) and cached per student and class, keyed by a fingerprint that changes with the date, lecture count, concept count, exam and deadline dates, but not with the student's study activity.

### Cited Findings
- Constants: `MIN_PLAN_DAYS = 7`, `MAX_PLAN_DAYS = 21`, `DEFAULT_PLAN_DAYS = 14`, `MAX_CONCEPTS = 40`, `MAX_LECTURES = 30` — `apps/api/src/pipeline/studyPlan.ts:25-29`.
- Horizon: no exam → 14 days; otherwise `Math.max(7, Math.min(21, exam.daysLeft + 1))` — `studyPlan.ts:32-35`.
- Payload type (`StudyPlanPayload`): `today`, `horizonDays`, `exams[{name,date,daysLeft,topics}]`, `deadlines[{name,date,daysLeft}]`, `announcements[{lecture,lectureDate,kind,text,when}]`, `lectures[{title,date,summary,sections}]`, `concepts[{name,definition,emphasis,examFlag,mastery|null}]`, `pace{lecturesHeld,lecturesPerWeek,firstLectureDate,lastLectureDate,currentWeek,totalWeeks,weeks[{week,date,topics,covered}]}`, `cardsDueByDay[]` — `apps/api/src/pipeline/tasks.ts:34-59`.
- Payload limits: exams first 4, each with first 12 topics (`studyPlan.ts:94`); deadlines on or after today, first 8 (`studyPlan.ts:95`); announcements only those with a `when`, text cut to 200 chars, first 12 (`studyPlan.ts:96-98`); lectures that are not `live`, last 30, summary cut to 400 chars, first 10 section titles (`studyPlan.ts:88, 99-102`); concepts: top 40 by emphasis, definition cut to 240 chars, emphasis and mastery rounded to 2 decimals, mastery `null` when never practised (`studyPlan.ts:80, 103-106`); `cardsDueByDay` from `dueForecast(userId, classId, horizonDays, now)` (`studyPlan.ts:85, 108`).
- Pace (`computePace`): `lecturesPerWeek = round(held / max(1, (spanDays + 1) / 7), 1 dp)` when at least 2 lectures; `currentWeek` = last dated syllabus week that has started, or for undated weeks `min(held, lastWeek)`; per week `covered` = number of that week's topics matched by a concept name (`matchesTopics`) — `studyPlan.ts:39-67`.
- System prompt (`SYSTEM_TUTOR`), exact: "You turn university lecture transcripts and course documents into accurate study material. Stay faithful to the source: never invent facts the lecturer or book did not state, and keep the lecturer's terminology. Transcripts come from live speech recognition, so fix obvious mis-hearings of technical terms silently." — `tasks.ts:69-72`.
- Study-plan prompt, exact text (`studyPlanPrompt`, `tasks.ts:201-228`):
  - "Write a personal study plan for a student in this course, from today (${p.today}) for ${p.horizonDays} days, paced to the class. Use only the input: \"exams\" and \"deadlines\" from the syllabus, \"announcements\" the lecturer made, \"lectures\" held so far (the notes), \"concepts\" (notes with definitions, lecturer emphasis, examFlag and the student's mastery) and \"pace\" (how fast the class moves and which syllabus week it is in, with per-week topic coverage: weeks with topics but few covered concepts are coming up or were missed)."
  - "Plan rules:"
  - "- Back-schedule from the next exam: cover its topics first, finish new material 2 days before it, keep the day before for the weakest high-emphasis concepts, and make exam day light review. Days after an exam resume steady practice toward the next one."
  - "- Match the class pace: review each lecture's concepts within a few days of it, and preview the syllabus topics of the coming week before the lecture on them. Do not exceed roughly ${p.pace.lecturesPerWeek ?? 2} new lectures' worth of material a week."
  - "- Interleave: each day mixes 2-4 concepts across lectures, weakest and exam-flagged first; never only one concept all day."
  - "- Fold in due flashcards (\"cardsDueByDay\") and deadlines (lighter study days before a deadline)."
  - "- \"concepts\" in a day are concept names copied exactly from the input. \"tasks\" are 2-4 concrete things to do (e.g. \"Review 12 cards\", \"Practice: 3 questions on X\", \"Re-read lecture 3 notes on Y\", \"Preview: Z before Thursday's lecture\"). \"minutes\" is a realistic total (20-120). \"reason\" is one line on why this day looks like this."
  - "- \"keyDates\": every exam, deadline and dated announcement in the window plus the next exam even if outside it, soonest first, each with a one-line note on how to prepare. \"overview\" is 2-3 sentences on the strategy. \"pace\" is 1-2 sentences on how the class is moving and whether the student is keeping up, from the data."
  - "- Exactly ${p.horizonDays} days, consecutive from today, dates as YYYY-MM-DD."
  - JSON shape requested: `{"overview": string, "pace": string, "keyDates": [{"date","name","kind": "exam"|"deadline"|"lecture"|"other","note"}], "days": [{"date","focus" (<= 8 words),"concepts": [string],"tasks": [string],"minutes": number,"reason": string}]}`.
- Output schema `StudyPlanOut`: `overview` and `pace` strings default ""; `keyDates[]` with `kind` enum falling back to "other"; `days[]` with `date` (YYYY-MM-DD), `focus`, `concepts[]`, `tasks[]`, `minutes: z.coerce.number().min(0).max(600).catch(45)`, `reason` — `apps/api/src/pipeline/schemas.ts:116-134`.
- Model call: `completeJson("studyplan", studyPlanPrompt(payload), StudyPlanOut, { system: SYSTEM_TUTOR, maxTokens: 6000 })` — `studyPlan.ts:118`. Invalid JSON gets one retry with the validation error appended — `apps/api/src/pipeline/llm.ts:60-71`. Backend is chosen in settings: Claude when an Anthropic key is set (default model id `claude-sonnet-5-5`), else OpenAI (`gpt-5-mini`), else Gemini (`gemini-2.5-flash`), else a mock — `apps/api/src/settings.ts:18-24`, `llm.ts:28`.
- Mock backend (no API key): deterministic plan with the same rules (exam day light review; day before = weakest three; a deadline tomorrow = one concept; otherwise three concepts; `minutes: 20 + 15 * chosen.length + Math.min(30, due)`) — `apps/api/src/pipeline/mock.ts:436-475`.
- Normalisation of the reply (`generateStudyPlan`): days outside today..end are dropped and the first entry per date wins (`studyPlan.ts:125-126`); every day in the horizon is emitted, a missing day becomes `{ focus: "Review", tasks: ["Review N cards"] or ["Light review"], minutes: 20 if cards are due else 10, reason: "Light day: nothing new scheduled." }` (`studyPlan.ts:128-135`); concept names are mapped to ids by lower-cased name or slug, unknown names keep `id: null`, duplicates removed (`studyPlan.ts:136-145`); tasks are cut to 6, minutes rounded, `cardsDue` overwritten with the forecast (`studyPlan.ts:146`); key dates in the past are dropped, deduplicated by date and name, sorted, `daysLeft` computed, and the next exam is appended if the model left it out (`studyPlan.ts:149-158`).
- Returned `StudyPlan`: `{ date, generatedAt, horizonDays, overview, pace, paceData, nextExam, keyDates, days }` — `studyPlan.ts:160-164`; contract in `packages/contracts/src` lines 106-126.
- Caching: in-memory map keyed `userId|classId`, an in-flight map to avoid duplicate generations, and the `study_plans` table; a cached or saved plan is reused only when its fingerprint equals the current one and `fresh` is not set — `studyPlan.ts:167-199`.
- Fingerprint: `[today, lectures.length, conceptRows.length, exams "date name" list, deadlines "date name" list].join("|")` — `studyPlan.ts:110`.
- Table `study_plans`: `user_id`, `class_id`, `plan` (jsonb), `fingerprint`, `generated_at`, primary key `(user_id, class_id)`; comment "The latest model-written study plan per student per class ... `fingerprint` is what it was written from; a different one means it is out of date." — `apps/api/src/db/schema.ts:191-199`. Saved with `onConflictDoUpdate` (the row is overwritten) — `studyPlan.ts:193`.
- Routes: `GET /api/classes/:classId/study-plan` (cached) and `POST` (regenerate, `fresh: true`) — `apps/api/src/routes/study.ts:176-185`.

### Inferences
- The model is not given: which lecture each concept belongs to, when a concept was last studied, attempt or review history, per-card state, the student's available time, the previous plan, or whether earlier planned days were done (none of these are fields of `StudyPlanPayload`, `tasks.ts:34-59`). The "review each lecture's concepts within a few days of it" rule therefore depends on the model guessing concept-to-lecture links from lecture summaries and section titles.
- Mastery, cards due and practice results are not in the fingerprint (`studyPlan.ts:110`), so within one UTC day the plan does not change in response to what the student does unless "Regenerate" is pressed. The concept count in the fingerprint is capped at 40 by the query limit (`studyPlan.ts:80`), so new concepts past 40 change it only through the lecture count.
- The plan is rewritten from scratch each new day (the date is in the fingerprint) and only the latest plan is stored (one row per student and class), so there is no plan history and yesterday's plan cannot be compared with what was done.
- The 20-120 minute range and "2-4 tasks" are prompt instructions only; code accepts 0-600 minutes and up to 6 tasks (`schemas.ts:130`, `studyPlan.ts:146`).
- An exam more than 20 days away falls outside the 21-day horizon, so the day-by-day list ends before the exam; the exam still appears in key dates (`studyPlan.ts:155-158`).
- The plan rules encode: back-scheduling, a 2-day buffer, weakest-first the day before, light exam day, interleaving 2-4 concepts, lighter days before deadlines, preview before lectures. They do not mention: spacing repeated practice of the same concept at expanding gaps, practice tests or mock exams, sleep, session length limits beyond the total minutes, or what to do after a missed day.

### Gaps
- The actual quality or variability of model-written plans was not observed (no API was called, as instructed).
- Which LLM backend is configured in this checkout was not checked (that would mean reading `.env.local`, which was off limits).

## 4. Spaced repetition (`apps/api/src/pipeline/cards.ts`)

### Takeaway
Cards are scheduled by `ts-fsrs` 5.4.2 (FSRS-6) with all library defaults (`fsrs()` with no arguments): desired retention 0.9, maximum interval 36,500 days, fuzz off, learning steps 1 m and 10 m, relearning step 10 m. Every unseen card in the class becomes due immediately, there is no daily cap on new cards or reviews, and the exam date is not used anywhere in card scheduling.

### Cited Findings
- Dependency: `"ts-fsrs": "^5.2.0"` — `apps/api/package.json` (dependencies); resolved to 5.4.2 — `pnpm-lock.yaml:195-197, 1861`; installed at `node_modules/.pnpm/ts-fsrs@5.4.2/`.
- Scheduler construction: `const scheduler = fsrs();` (no parameters) — `cards.ts:46`. A repo-wide grep for `request_retention|maximum_interval|enable_fuzz|generatorParameters` in `apps/` and `packages/` finds no overrides.
- Library defaults in the installed version: `default_request_retention = 0.9`, `default_maximum_interval = 36500`, `default_enable_fuzz = false`, `default_enable_short_term = true`, `default_learning_steps = ["1m", "10m"]`, `default_relearning_steps = ["10m"]`, `FSRSVersion = "v5.4.2 using FSRS-6.0"`, 21 default weights ending in `FSRS6_DEFAULT_DECAY = 0.1542` — `node_modules/.pnpm/ts-fsrs@5.4.2/node_modules/ts-fsrs/dist/index.mjs:501-542`.
- Ratings: `Rating = 1 | 2 | 3 | 4` "FSRS: again, hard, good, easy" — `packages/contracts/src` line 79; review body validated to 1-4 — `apps/api/src/routes/study.ts:95`.
- Review: `applyReview` calls `scheduler.next(toFsrs(s), now, rating)`; `reviewCard` upserts `card_state` and inserts a `review_logs` row with the ts-fsrs log — `cards.ts:72-75, 108-118`.
- Card state columns: due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state (0 new, 1 learning, 2 review, 3 relearning), last_review — `apps/api/src/db/schema.ts:122-136`.
- Due selection: `getDueCards` first inserts a `card_state` row with `due = now` for every card in the class the user has no state for, then returns rows with `due <= now` ordered by `due` ascending then card id, limited to `Math.max(1, Math.min(200, limit))`, default 20 — `cards.ts:90-106`. The route default is 20, allowed 1-200 — `routes/study.ts:90-93`.
- `scheduleConceptCard` (called after a wrong practice answer and for each missed recall concept): takes the concept's first card by id (or creates a "What is X?" card), inserts a fresh schedule, and on conflict sets only `due: now` — `cards.ts:120-134`; callers `practice.ts:191`, `recall.ts:62`.
- `dueForecast`: SQL counts the class's cards by `greatest(0, floor((coalesce(due, now) - start of today) / 86400))`; cards with no state count as day 0; cards due beyond the horizon are dropped — `cards.ts:136-148`.
- Card generation: 1-3 cards per concept (max 3), batches of 12 concepts, fallback "What is X?" definition card — `cards.ts:24-42`; prompt: "Write spaced-repetition flashcards: 1-3 per concept (more only for rich concepts). Fronts ask one atomic thing (definition, why/when it is used, a contrast with a related concept, a key formula in words). Backs are short and self-contained." — `tasks.ts:104-112`.
- Exam date in card scheduling: `grep -n -i "exam\|syllabus" apps/api/src/pipeline/cards.ts` returns nothing.

### Inferences
- With defaults, FSRS optimises for 90% recall at each review indefinitely; it does not shorten or lengthen intervals so that a review lands shortly before the exam, and intervals can run past the exam date (maximum 36,500 days).
- All new cards become due at once the first time the student opens Today or Review after a lecture's bundle is ready (`cards.ts:93-98`), so a lecture with, say, 30 concepts can add up to 90 due cards in one go; the only limiter is the 20-card batch size in the Review page.
- `dueForecast` reflects only current due dates; it does not simulate cards coming back after today's reviews, so future days in both plans under-count the real card load.
- A wrong practice answer or recall miss makes a card due now but leaves stability, difficulty, lapses and state untouched (`cards.ts:131-132`), so FSRS's memory model is not told about the failure; a correct practice answer does not touch card state at all (`practice.ts:185-193`).
- Review logs are stored but nothing reads them (no optimiser fits per-student FSRS weights; mastery reads `card_state`, not `review_logs`: `mastery.ts:58-60`).

### Gaps
- Exact intervals produced by ts-fsrs for each rating on a new card were not computed (no code was run); only the default parameters were read from the library source.

## 5. Mastery (`apps/api/src/pipeline/mastery.ts`)

### Takeaway
Per-concept mastery (0..1) is a weighted average of up to three signals, re-weighted over those present: card stability (0.4), recency-weighted correctness of the last 5 practice attempts (0.4) and the latest recall check (0.2). It has no time decay.

### Cited Findings
- Weights: `const W = { cards: 0.4, attempts: 0.4, recall: 0.2 }; const RECALL_GOT = 0.7;` — `mastery.ts:19-20`.
- Card score: 0 if `reps <= 0`; else `(1 - Math.exp(-Math.max(0, stability) / 10)) / (1 + 0.15 * lapses)`, multiplied by 0.7 when `state === 3` (relearning); the concept's card component is the mean over its reviewed cards — `mastery.ts:22-26, 31, 38`.
- Attempts: the 5 most recent attempts on the concept's questions, weights `0.7 ** k` (1, 0.7, 0.49, 0.343, 0.2401), score = weighted share correct — `mastery.ts:39-44`.
- Recall: only the latest recall check that mentions the concept; got = 0.7 ("recalling is not mastering"), missed = 0 — `mastery.ts:8, 33, 45`.
- Combination: `sum / wsum` over present signals, rounded to 3 decimals; concepts with no signal are absent (UI shows "not studied yet") — `mastery.ts:35-48, 7`.
- Data loaded: card states with `reps > 0`; the last 1000 attempts; the last 50 recall checks — `mastery.ts:54-77`.
- Thresholds that consume mastery: weak concept if `(mastery ?? 0) < 0.7` (`plan.ts:129`); exam-topic score factor `1 - 0.9 * (mastery ?? 0)` (`examTopics.ts:17`); practice priority uses unknown mastery = 0.35 (`practice.ts:95`); UI colour runs orange → amber at 0.5 → green at 1.0, grey when null (`apps/web/src/lib/format.ts:33-44`).

### Inferences
- The card component saturates with stability: stability 10 days gives 0.63, 30 days gives 0.95 (from the formula at `mastery.ts:24`). It uses stability, not current retrievability, so mastery does not fall as days pass without review.
- A concept practised only through questions can reach mastery 1.0 from five correct attempts in one sitting (attempt weights ignore the time between attempts; `mastery.ts:40-43`), so a same-day cram reads as mastered.
- A concept with only a successful recall check has mastery 0.7, which is exactly the weak threshold (`< 0.7` is weak), so it is not listed as weak.

### Gaps
- None for the formula; no calibration data exists in the repo showing how these weights were chosen (the file comment gives no source).

## 6. Practice questions and exam topics (`practice.ts`, `examTopics.ts`, `concepts.ts`)

### Takeaway
Practice sets (default 5) are picked by priority = 0.7 x weakness + 0.3 x emphasis, round-robin across lectures with one question per concept, skipping questions attempted in the last 12 hours. Exam-topic score = (emphasis + 0.5 if exam-flagged) x (1 - 0.9 x mastery) x 1.3 if the next exam's topics name the concept.

### Cited Findings
- Selection formula: `prio = 0.7 * (1 - (mastery[conceptId] ?? 0.35)) + 0.3 * (emphasis[conceptId] ?? 0)`; ties broken by `hash32(seed + id)`, seed = `userId + isoDate(today)` — `practice.ts:95-96, 159`.
- Order of filling: questions not attempted in the last 12 h first, round-robin across lecture groups (book questions are one group), one per concept; then repeats of concepts; then recently attempted ones — `practice.ts:97-121`; the 12 h window is `new Date(Date.now() - 12 * 3600_000)` — `practice.ts:149`.
- Set size: default 5, clamp 1-50 — `practice.ts:146, 158`; route `GET /classes/:classId/practice?n=&conceptId=&lectureId=` — `routes/study.ts:105-112`. With `conceptId` that concept's questions come first, then with `lectureId` that lecture's, then the general pick — `practice.ts:161-167`.
- Question kinds: `mcq` (exactly 4 options), `short`, `relate` ("How are X and Y related?") in lecture or book style — `tasks.ts:114-129`, `practice.ts:54-78`.
- Grading: mcq by normalised exact match; short and relate by the model with this prompt: "Grade a student's answer as formative feedback (not a mark). Mark it correct if it captures the key idea of the model answer, even if worded differently or incomplete in minor details. Feedback is one line: what was right or what is missing." — `practice.ts:171-183`, `tasks.ts:131-138`.
- Effects of an attempt: a row in `attempts` (answer, correct, feedback); if wrong, `scheduleConceptCard` makes one of the concept's cards due now — `practice.ts:185-193`.
- Exam-topic score: `base = emphasis + (examFlag ? 0.5 : 0)`; `score = base * (1 - 0.9 * (mastery ?? 0)) * (syllabusBoost ? 1.3 : 1)`, rounded to 3 decimals; sorted by score, then emphasis, then name — `examTopics.ts:15-18, 27-34`.
- Syllabus boost: true when every content word of the concept name (stemmed, at least 3 letters, not a stopword) appears in one of the next exam's topics — `examTopics.ts:20-25`, `util.ts:120-128`. Topics come from the next exam only — `routes/study.ts:165-169`, `plan.ts:119`.
- Emphasis (per lecture): `0.5 * (mentions / max mentions) + 0.3 * (time share / max time share) + 0.2 if exam-flagged`, clamped to 0..1; merged across lectures with `greatest(old, new)` — `apps/api/src/pipeline/concepts.ts:71-83, 111`.
- Exam flag source: concept extraction sets `examFlag` "true only if the lecturer says it will be on an exam/test or stresses it must be known, with examQuote as their exact words" — `tasks.ts:88-102`.
- UI disclaimer on the Exam topics page: "Heuristic: concepts ranked by how much the lecturer stressed them (explicit "this will be on the exam", how often and how long each came up), weighted towards the ones you haven't mastered. A guide, not a prediction." — `apps/web/src/pages/ExamTopics.tsx:20-22`.
- Exam sheet: top 14 exam topics with definitions, labelled "Re-reading aid · one page", printable — `apps/web/src/pages/ExamSheet.tsx:10-14, 43`.

### Inferences
- Practice interleaves by lecture group and concept, but question kind (mcq, short, relate) is not balanced or ordered, and there is no difficulty progression.
- The exam flag is counted twice in the exam-topic score: +0.2 inside emphasis and +0.5 in the score base.
- Practice is drawn from the whole class pool, not scoped to the next exam's topics; only the exam-topic ranking and the plans use the exam's topic list.
- A question answered correctly can return 12 hours later; there is no expanding schedule for questions and no "answered correctly N times" criterion (successive relearning is not implemented for questions).
- Hand-entered exams and quizzes carry no topics from the web form (`apps/web/src/pages/Assessments.tsx:32` posts only `{ kind, name, date }`), so the 1.3 syllabus boost applies only to exams read from a syllabus PDF or created through the API with topics.

### Gaps
- How many questions exist per concept in practice depends on generated data (the questions prompt asks for "about N" per lecture, `tasks.ts:115`); pool sizes were not inspected (no database access).

## 7. Recall check and pretest (`recall.ts`, `pretest.ts`)

### Takeaway
The recall check is a 3-minute free-recall box per lecture, offered by a link on the live-captions page when the lecture ends and a button on every lecture page; a model classifies concepts as got or missed, misses lower mastery and make up to 10 cards due. The pretest is 3 model-written questions on the next syllabus week, always available from Today; its answers are graded but not stored and affect nothing.

### Cited Findings
- Recall timer: `const DURATION = 180`; the text box is disabled until "Start 3:00"; at 0 it auto-submits if anything was typed — `apps/web/src/pages/Recall.tsx:11, 55-68, 105-119`.
- Recall UI copy: "Write everything you remember" / "No notes, no peeking. Three minutes. We compare it with the lecture and show what you got, missed and got wrong." — `Recall.tsx:82-83`; result copy: "Misses and mistakes feed your mastery and become flashcards. Recalling is what makes it stick, so the score matters less than the attempt." — `Recall.tsx:155`.
- Where it is offered: "Take the 3-minute recall check" on the live page's "Lecture ended" card — `apps/web/src/pages/Live.tsx:181-191`; a "Recall check" button on the lecture page regardless of status — `apps/web/src/pages/Lecture.tsx:128-130`; route `/recall/:lectureId` — `apps/web/src/App.tsx:54`. A grep for `/recall` in `apps/web/src` finds no link from Today, the class home or the nav.
- Recall grading prompt: "A student wrote everything they remember from the lecture ... without notes. Compare it against the lecture's concepts. \"got\": concept names the student recalled correctly (even roughly); \"missed\": concept names not mentioned; \"wrong\": short statements of anything the student got factually wrong." — `tasks.ts:140-149`.
- Recall inputs and limits: up to 40 of the lecture's concepts by emphasis (`MAX_CONCEPTS = 40`), definitions cut to 300 chars, first 20 outline section titles, student text cut to 8000 chars (`MAX_TEXT`) — `recall.ts:21-31, 55-59`.
- Recall result: `got` = concepts the model named that match a lecture concept; `missed` = every other concept in the list (computed in code, the model's own "missed" list is not used); `wrong` = first 10 statements; `score = got / total` rounded to 2 decimals — `recall.ts:32-47`.
- Recall effects: stored in `recall_checks` (text up to 20,000 chars, result with concept ids); `scheduleConceptCard` for the first 10 missed concepts — `recall.ts:61-62`; mastery uses `gotIds` and `missedIds` — `mastery.ts:70-76`.
- Pretest constant: `PRETEST_COUNT = 3` — `pretest.ts:18`.
- Pretest week choice (`pickUpcomingWeek`): with dated syllabus weeks, the first week dated within the last 6 days or later; if that week has started and already had its usual number of lectures, the next week; without dates, week `lectureCount + 1` (or the next higher) — `pretest.ts:22-46`.
- Pretest prompt: "Write exactly ${p.count} short pre-lecture questions for a student about to attend week ${p.week} ... The student has NOT had that lecture yet: ask about the prerequisite ideas, intuitions and definitions a prepared student should bring, drawing on \"knownConcepts\" ... One question per topic where possible." — `tasks.ts:188-199`; inputs: first 8 week topics, top 20 class concepts by emphasis — `pretest.ts:53, 85-86`.
- Pretest storage: questions cached in memory per class, key `date|week|topics` (one set per class per day, shared by all students, lost on restart); "Answers are formative only and not stored." — `pretest.ts:1-7, 48-50, 72-90`; grading reuses `gradeAnswer` and writes nothing — `pretest.ts:92-98`.
- Pretest UI: Today tile "Before the next lecture — Three questions on what the syllabus says is coming, so you know what to listen for." — `apps/web/src/pages/Today.tsx:58-64`; page copy "warm-up, not a test", "Answer from what you already know. Wrong answers are fine: they tell you what to listen for in the lecture.", "Done. Now go to the lecture and listen for these." — `apps/web/src/pages/Pretest.tsx:30, 73, 91`; nav entry — `apps/web/src/components/ClassLayout.tsx:27`.
- Pretest needs syllabus weeks: with none it returns `{ week: null, questions: [] }` and the page says "The pretest comes from the syllabus's weekly topics. Upload the syllabus on the class page." — `pretest.ts:80-81`, `Pretest.tsx:44-58`. Hand-entered assessments add no weeks (`syllabus.ts:55`).

### Inferences
- The UI says "Misses and mistakes ... become flashcards", but only `missedIds` drive cards and mastery; the `wrong` statements are displayed and stored but not acted on (`recall.ts:43, 62`; `mastery.ts:73-74`).
- Nothing ties the recall check to the day of the lecture: it can be taken at any time, any number of times, and there is no delayed second recall (for example a day or a week later). Only the latest check counts for mastery (`mastery.ts:33`).
- The recall check is not surfaced in either plan: the model prompt's example tasks do not include it (`tasks.ts:214-215`) and the Today page has no recall entry.
- Pretest results cannot inform later study (not stored, not linked to concept notes), and the pretest is not timed relative to the next lecture date beyond the week choice.

### Gaps
- Whether students are prompted on the device or by any notification to take the recall check was checked by grep (`recall` in `apps/api/src/sessions.ts`, `oled.ts`, `pipeline/bundle.ts`): no matches. No notification mechanism was found anywhere in `apps/api/src`.

## 8. Dates (`syllabus.ts`, `assessments` and `study_plans` tables)

### Takeaway
Dates come from a parsed syllabus PDF (exams with topics, weekly topics, deadlines), from hand-entered assessments (exam, quiz, assignment) and, for the model plan only, from dated lecturer announcements. Quizzes are merged into the exams list with the kind dropped, so a quiz is treated exactly like an exam everywhere.

### Cited Findings
- Syllabus shape: `exams[{name, date, topics[]}]`, `weeks[{week, topics[], date|null}]`, `deadlines[{name, date}]`, dates `YYYY-MM-DD` — `apps/api/src/pipeline/schemas.ts:107-114`; parse prompt: "Extract exams (name, date, topics), the weekly topic schedule and deadlines (assignments, projects). ... Omit anything without a date except weeks, which may have a null date." — `tasks.ts:164-174`.
- `assessments` table: `kind` enum `["exam", "quiz", "assignment"]` default "exam", `name`, `date`, `topics` (jsonb string[]) — `apps/api/src/db/schema.ts:101-111`; API validation allows up to 20 topics of up to 80 chars — `apps/api/src/routes/courses.ts:20-25`.
- Merge rule (`withAssessments`): `assignment` → pushed to `deadlines` (name and date only); anything else (exam and quiz) → pushed to `exams` with name, date, topics; duplicates by same date and case-insensitive name are skipped; weeks come only from the PDF — `syllabus.ts:42-56`. File comment: "exams and quizzes as exams, assignments as deadlines, so a class needs no syllabus PDF to get a plan." — `syllabus.ts:4-6`.
- `getSyllabus` uses the most recent syllabus document that validates (of the latest 5) plus all assessments — `syllabus.ts:58-72`.
- Upcoming exams: date on or after today (UTC date string), soonest first, `daysLeft` by UTC day difference — `syllabus.ts:33-40`.
- Lecture announcements: kinds `deadline | exam | schedule | opportunity | other` with a free-text `when` — `schemas.ts:15, 26-31`; only the model plan receives them (`studyPlan.ts:96-98`); `upcomingExams` and `buildPlan` do not read them.
- Web form: kinds Exam, Quiz, Assignment; posts `{ kind, name, date }`; empty state "No dates yet. Add the next quiz or exam and the study plan works back from it." — `apps/web/src/pages/Assessments.tsx:13-15, 32, 49`.
- `study_plans` table: see section 3 — `schema.ts:191-199`.

### Inferences
- Because the kind is dropped at merge time, a low-stakes weekly quiz becomes "next exam": the deterministic plan gives it a weakest-topics day and a light-review day, the model plan back-schedules from it with a 2-day buffer, and the horizon is clamped around it. There is no notion of stakes, weight, cumulative coverage or exam format.
- "Today" is the UTC date (`util.ts:160`, `isoDate` uses `toISOString`), so day boundaries and "days left" follow UTC, not the student's local time.
- No field stores the time of day or duration of an exam, lecture times, or the student's own calendar.

### Gaps
- How well the syllabus parser extracts per-exam topics from real PDFs was not tested.

## 9. How the plan is shown (`Today.tsx`, `Review.tsx`, `Practice.tsx`, `Recall.tsx`, `Pretest.tsx`)

### Takeaway
The Today page shows four tiles (cards due, next exam, suggested practice, pretest), "Coming up" announcements, weak spots, a read-only practice preview and the model-written plan (overview, pace, key dates, day-by-day with minutes, concepts, text tasks and a reason). The student can start a review, a practice set or the pretest and regenerate the plan; nothing records whether a planned day was done, there is no time-budget setting and no missed-day handling.

### Cited Findings
- Tiles: "Cards due" count with "Start review" / "Nothing due" (`Today.tsx:26-32`); "Next exam" name, date, days, or "No exam dates yet. Upload the syllabus to anchor the plan." (`Today.tsx:33-49`); "Suggested practice" count, "questions, mixed across lectures", "Practice now" (`Today.tsx:50-57`); "Before the next lecture" → Pretest (`Today.tsx:58-64`).
- Left column: "Coming up" (up to 5 dated announcements) (`Today.tsx:69-73`); "Weak spots" with mastery bars, exam badge, link to the concept page, or "No weak spots yet. Practise to find them." (`Today.tsx:74-93`); "Practice set" listing each question's prompt and kind, not answerable there (`Today.tsx:94-108`).
- Study plan panel: fetches `api.studyPlan(classId)`; "Regenerate" button calls `api.regenerateStudyPlan`; loading label "Writing your study plan from the syllabus, notes and class pace" (`Today.tsx:122-148`); shows overview and pace text plus chips for lectures held, lectures per week, "week N of M" and "N-day plan" (`Today.tsx:151-165`); "Key dates" with date, "today" / "in Nd", name, kind label (Exam, Due, Lecture, Note) and note (`Today.tsx:120, 167-188`); "Day by day": day label ("Today" for index 0), date, "`{d.minutes} min`", focus, "`{d.cardsDue} cards`", concept chips coloured by mastery linking to the concept page, tasks as plain text bullets, reason (`Today.tsx:190-232`).
- Review page: kicker "Spaced repetition · FSRS"; loads 20 due cards; flip with space, rate Again (forgot) / Hard (struggled) / Good (recalled) / Easy (instant) with keys 1-4; end screen shows counts and "Continue · N cards" when more are due, plus links to Practice and Today — `apps/web/src/pages/Review.tsx:8-13, 17, 23, 62-74, 129-158`.
- Practice page: kicker "Practice · formative feedback, not a mark"; 5 questions at once; running score kept in component state; "Next set →"; optional `?concept=` or `?lecture=` focus — `apps/web/src/pages/Practice.tsx:13-16, 19, 25-32, 63-67`.
- Today's "Cards due" number is `t.cardsDue.length`, and `getToday` fetches at most 20 — `Today.tsx:28`, `plan.ts:121`. The plan's day-0 chip shows the full forecast count — `Today.tsx:203`, `studyPlan.ts:130`.
- No completion or budget state in the page: a grep for `minutes|localStorage|\.plan\b` in `Today.tsx`, `ClassHome.tsx` and `ClassLayout.tsx` finds only the `{d.minutes} min` display (`Today.tsx:198`).

### Inferences
- Plan tasks are free text from the model ("Practice: 3 questions on X"); they are not buttons or links, so the practice the student actually gets from "Practice now" is the generic weakest-first set, not the questions for the concepts named in today's plan (a concept chip links to the concept page; whether that page offers focused practice was not read).
- The Today tile under-reports when more than 20 cards are due (it shows 20), while the plan chip beside it can show a larger number for the same day.
- The page presents two independent recommendation sources at once (rule-based weak spots and practice set from `getToday`; LLM-written daily concepts and tasks), which can disagree about what to study today.
- The minutes figure is the model's estimate, not derived from the number of cards and questions or from any measured pace of the student.

### Gaps
- `Concept.tsx`, `ClassHome.tsx` and `Partner.tsx` were not read in full; they may add entry points (for example focused practice on a concept) but were outside the listed files.

## 10. What is NOT there (each verified by search)

### Takeaway
The app has no per-student time budget, no record of plan completion or missed days, no exam-date-aware card scheduling, no mock-exam scheduling, no reminders, no new-card limit, no per-student FSRS tuning and no spaced re-testing of practice questions or recall checks.

### Cited Findings
- No per-student time budget or availability setting: grep for `budget|minutesPerDay|minutes_per_day|dailyMinutes|studyMinutes|hoursPerWeek|availability|newCardsPerDay|new_cards|maxReviews|daily limit` across `apps/api/src`, `apps/web/src`, `packages` finds only a word budget for the spoken partner (`apps/api/src/pipeline/partner.ts:233-240, 455-458`) and an unrelated comment (`apps/web/src/pages/ClassHome.tsx:238`). No user-settings table exists in `apps/api/src/db/schema.ts` (tables: classes, devices, lectures, segments, translations, concepts, concept_links, concept_mentions, outlines, documents, assessments, cards, card_state, review_logs, questions, attempts, recall_checks, jobs, study_plans). Daily minutes exist only as model output (`tasks.ts:215-216`).
- No record of plan completion, adherence, streaks or missed days: grep for `completed|completion|markDone|doneAt|streak|adherence|missed day|catch-up|backlog|reschedul` finds nothing related to the plan (hits are in `partner.ts`, `captions.ts`, `mock.ts` announcement regex). `study_plans` keeps one overwritten row per student and class with no per-day status (`schema.ts:193-199`, `studyPlan.ts:193`).
- No missed-day handling: the plan is regenerated when the UTC date changes (`studyPlan.ts:110`) from a payload with no history of what was done (`tasks.ts:34-59`); overdue cards simply stay due and are counted in day 0 (`cards.ts:136, 140`).
- No exam-date-aware card scheduling: `cards.ts` contains no reference to exams or the syllabus (grep empty); `fsrs()` is built with defaults (`cards.ts:46`).
- No desired-retention or other FSRS setting, and no per-student parameter optimisation: grep for `request_retention|retention|maximum_interval|enable_fuzz|generatorParameters` in app code finds nothing; `review_logs` is written (`cards.ts:116`) but never read.
- No cap on new cards per day or reviews per day: all unseen cards become due now (`cards.ts:93-98`); only the fetch limit (default 20, max 200) bounds a batch (`cards.ts:104`).
- No mock exam, timed exam or past-paper feature: grep for `mock exam|mockExam|practice exam|past paper|timed exam|exam simulation|full-length` across `apps/api/src`, `apps/web/src`, `packages` returns nothing. Practice sets are 5 untimed questions (`Practice.tsx:16`).
- No same-day post-lecture review trigger beyond one link: the only prompts are the recall link on the ended live page (`Live.tsx:181-191`) and the lecture-page buttons (`Lecture.tsx:123-130`); grep for `recall|studyplan` in `apps/api/src/pipeline/bundle.ts`, `jobs.ts`, `sessions.ts` and `ws/` is empty, and Today does not surface "review today's lecture". The only same-week rule is a sentence in the model prompt ("review each lecture's concepts within a few days of it", `tasks.ts:210`).
- No reminders or notifications: grep for `notification|reminder|email|cron` in `apps/api/src` finds nothing (timer hits are speech-to-text keep-alives and session upkeep in `stt.ts:99`, `sessions.ts:713, 779`).
- No spaced or criterion-based re-testing of practice questions: the only timing rule is the 12-hour "recently attempted" filter (`practice.ts:149`); correct answers never update card state (`practice.ts:185-193`).
- No delayed or repeated recall schedule: one free-recall box per lecture, available any time (`Recall.tsx`, `recall.ts:50-64`).
- Pretest answers are not stored and do not feed mastery, cards or the plan (`pretest.ts:1-7, 92-98`).
- No time decay in mastery (formula uses stability, lapses, state, last 5 attempts, latest recall; no elapsed-time term) — `mastery.ts:22-48`.
- No distinction between quizzes and exams in planning (`syllabus.ts:50-53`), and no exam weight, format or cumulative flag (`schema.ts:103-111`).
- The deterministic 7-day plan is not displayed (section 2); the model plan's tasks are not actionable links (`Today.tsx:217-226`).
- No per-exam scoping of cards or practice: due cards and practice draw on the whole class (`cards.ts:100-104`, `practice.ts:151`).
- No local time zone handling: all day arithmetic is UTC (`util.ts:160-166`, `syllabus.ts:35-38`).

### Inferences
- Where each change would land, by file: FSRS parameters and exam-aware intervals or new-card limits in `apps/api/src/pipeline/cards.ts` (`fsrs()` at line 46, `getDueCards` at 91-106, `dueForecast` at 137-148); plan rules in `apps/api/src/pipeline/tasks.ts:201-228` (prompt) and `apps/api/src/pipeline/plan.ts:34-97` (rule-based); plan inputs in `apps/api/src/pipeline/studyPlan.ts:71-112` and `tasks.ts:34-59`; plan validation in `schemas.ts:116-134`; mastery weights in `mastery.ts:19-26`; practice selection in `practice.ts:91-122`; quiz versus exam handling in `syllabus.ts:45-56`; any time budget or completion tracking needs a new table next to `study_plans` in `apps/api/src/db/schema.ts:191-199` and UI in `apps/web/src/pages/Today.tsx:123-238`.
- The fingerprint (`studyPlan.ts:110`) would need to include any new input (time budget, completion state, mastery snapshot) for the cached plan to refresh when it changes.

### Gaps
- "Not there" claims rest on keyword greps of `apps/api/src`, `apps/web/src` and `packages` plus reading the listed files; a feature implemented under unrelated names in files not read (for example `apps/web/src/pages/Concept.tsx`, `ClassHome.tsx`, `Partner.tsx`, `apps/api/src/pipeline/partner.ts`) could have been missed, though the database schema (read in full) has no table or column that could store a time budget, plan completion or reminders.
- Other sessions were editing `apps/` during this read; line numbers are as of 10 October 2026 and may shift.
