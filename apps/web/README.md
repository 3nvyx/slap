# @slap/web

Vite + React 19 + TypeScript + Tailwind 4. One SPA: the caption page and the study app. There is no sign-in; every page is open. Types come from `@slap/contracts`; response shapes that the contracts do not name are in `src/lib/types.ts`. API routes are in `docs/api.md`.

## Run

From the repo root:

- `pnpm dev:web`: Vite on :5173, proxying `/api` and `/ws` to the API on :8787 (`VITE_API_PROXY=http://localhost:8788` points it at another instance).
- `pnpm --filter @slap/web dev:mock`: `VITE_MOCK=1`, every endpoint answered from `src/lib/mock.ts` (fixture class CS229, a fake caption stream, a mock partner).
- `pnpm --filter @slap/web build`: `dist/`, which the API serves on :8787 (rebuild after web changes; the API needs no restart).
- `pnpm --filter @slap/web typecheck`, `lint` (oxlint).

Env (Vite, build time): `VITE_API_BASE` (empty = same origin), `VITE_MOCK`.

## Pages

| Route | What |
|---|---|
| `/` | Landing: class-code box, every class ("open a class") |
| `/j/:code` | Join by class code: redirects to the live captions, polls every 5 s until the lecturer starts; otherwise links to the class |
| `/live/:lectureId` | Captions: two lines (source word-by-word, translation per segment), language and size pickers, reconnect with `since`; labelled *Replay* for a replay; ended state links to recall / notes |
| `/classes` | Class cards (every class), create, device |
| `/c/:classId` | Class home: session panel (start/stop, laptop mic, who is watching, replay state), lectures, announcements feed, join QR, device, uploads, import |
| `/c/:classId/lecture/:id` | Outline, concepts weakest-first, summary, questions asked in class, announcements, ask-the-lecture box, transcript with hover notes and a saved-translation toggle, replay captions |
| `/c/:classId/graph` | Force graph coloured by mastery; export as an Obsidian vault |
| `/c/:classId/concept/:id` | Concept note: definition, exam quote, mentions, cards, related |
| `/c/:classId/exam-topics`, `/exam-sheet` | Ranked topics; printable one-page sheet |
| `/c/:classId/review` | FSRS flashcards (space flips, 1–4 rates; looks ahead for more due) |
| `/c/:classId/practice` | 5 graded questions (`?concept=` / `?lecture=` first; A–D picks, Enter checks) |
| `/c/:classId/partner` | Spoken learning partner (hold to talk) |
| `/c/:classId/pretest` | Three questions on the syllabus's upcoming week |
| `/c/:classId/lecturer` | Lecturer view: device, session, who is watching and in which languages, live caption tail, questions asked in class |
| `/c/:classId/today` | Cards due, next exam, practice set, pretest, coming-up announcements, weak spots, 7-day plan |
| `/recall/:lectureId` | 3-minute free recall, compared into got / missed / wrong |

Who you are: `lib/user.ts` keeps a random id in `localStorage` (`slap.user`) and `api.ts` sends it as `X-Slap-User` on every request. Cards, attempts, recall checks and mastery follow that id, so they are per browser; another browser or cleared site data starts fresh. The id is not a login and gives no access that others lack.

## Layout of `src`

- `components/`: `ClassLayout` (class shell, nav, polls the class every 8 s), `Shell` (top bar), `ConceptText` (hover notes), `Announcements`, `ui` (buttons, panels, pills, bars).
- `lib/`: `api.ts` (every call; `downloadFile` for downloads that carry the caller id), `user.ts` (the per-browser id), `captions.ts` (caption reducer: snapshot/interim/final/translation, sorted by start), `ws.ts` (reconnecting socket), `micStream.ts` (laptop-microphone fallback), `holdRecorder.ts` + `partnerAudio.ts` (partner), `languages.ts`, `format.ts`, `mock.ts`.
- `pages/`: one file per route; `Practice.tsx` exports `AnswerCard`, shared with the pretest.
