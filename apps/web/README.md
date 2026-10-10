# @slap/web

Vite + React 19 + TypeScript + Tailwind 4. One SPA: the public caption page, and the signed-in study app. Types come from `@slap/contracts`; response shapes that the contracts do not name are in `src/lib/types.ts`. API routes are in `docs/api.md`.

## Run

From the repo root:

- `pnpm dev:web`: Vite on :5173, proxying `/api` and `/ws` to the API on :8787 (`VITE_API_PROXY=http://localhost:8788` points it at another instance).
- `pnpm --filter @slap/web dev:mock`: `VITE_MOCK=1`, every endpoint answered from `src/lib/mock.ts` (fixture class CS229, a fake caption stream, a mock partner). The mock user owns CS229, so this is how to see the owner UI without signing in.
- `pnpm --filter @slap/web build`: `dist/`, which the API serves on :8787 (rebuild after web changes; the API needs no restart).
- `pnpm --filter @slap/web typecheck`, `lint` (oxlint).

Env (Vite, build time): `VITE_NEON_AUTH_URL` (Neon Auth base URL for sign-in), `VITE_API_BASE` (empty = same origin), `VITE_MOCK`.

## Pages

| Route | Who | What |
|---|---|---|
| `/` | public | Landing: class-code box, classes with guest access ("browse as a guest") |
| `/j/:code` | public | Join by class code: redirects to the live captions, polls every 5 s until the lecturer starts; otherwise links to the class (guests when allowed) |
| `/live/:lectureId` | public | Captions: two lines (source word-by-word, translation per segment), language and size pickers, reconnect with `since`; labelled *Replay* for a replay; ended state links to recall / notes |
| `/login`, `/auth/:path` | public | Neon Auth views; `?next=` returns the user where they were |
| `/classes` | signed in | Class cards, join by code, create (lecturer), your device |
| `/c/:classId` | member or guest | Class home: session panel (start/stop, laptop mic, who is watching, replay state), lectures, announcements feed, join QR + guest-access switch (owner), device, uploads, import |
| `/c/:classId/lecture/:id` | member or guest | Outline, concepts weakest-first, summary, questions asked in class, announcements, ask-the-lecture box (members), transcript with hover notes and a saved-translation toggle; owner: replay captions |
| `/c/:classId/graph` | member or guest | Force graph coloured by mastery; export as an Obsidian vault |
| `/c/:classId/concept/:id` | member or guest | Concept note: definition, exam quote, mentions, cards, related |
| `/c/:classId/exam-topics`, `/exam-sheet` | member or guest | Ranked topics; printable one-page sheet |
| `/c/:classId/review` | signed in | FSRS flashcards (space flips, 1–4 rates; looks ahead for more due) |
| `/c/:classId/practice` | signed in | 5 graded questions (`?concept=` / `?lecture=` first; A–D picks, Enter checks) |
| `/c/:classId/partner` | signed in | Spoken learning partner (hold to talk) |
| `/c/:classId/pretest` | signed in | Three questions on the syllabus's upcoming week |
| `/c/:classId/lecturer` | owner | Lecturer view: device, session, who is watching and in which languages, live caption tail, students enrolled, questions asked in class |
| `/c/:classId/today` | signed in | Cards due, next exam, practice set, pretest, coming-up announcements, weak spots, 7-day plan |
| `/recall/:lectureId` | signed in | 3-minute free recall, compared into got / missed / wrong |

Guests: `ClassLayout` asks the API for the class without a token; a class with guest access answers with `role: "guest"`, the layout shows a banner and sends the per-student nav items to sign-in (and back). A 401/403 without a session redirects to `/login?next=`.

## Layout of `src`

- `components/`: `ClassLayout` (class shell, nav, guest banner, polls the class every 8 s), `RequireAuth`, `Shell` (top bar, user menu), `ConceptText` (hover notes), `Announcements`, `ui` (buttons, panels, pills, bars).
- `lib/`: `api.ts` (every call; `downloadFile` for token-bearing downloads), `auth.ts` (Neon Auth client, JWT cache), `captions.ts` (caption reducer: snapshot/interim/final/translation, sorted by start), `ws.ts` (reconnecting socket), `micStream.ts` (laptop-microphone fallback), `holdRecorder.ts` + `partnerAudio.ts` (partner), `languages.ts`, `format.ts`, `mock.ts`.
- `pages/`: one file per route; `Practice.tsx` exports `AnswerCard`, shared with the pretest.
