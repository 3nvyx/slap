# @slap/web

React Router 7 in framework mode, on Vite + React 19 + TypeScript + Tailwind 4. One app: the landing page, the caption page and the study app. Each page is a file in `src/routes`, and pages are rendered on the server first, then taken over by the browser. There is no sign-in; every page is open. Types come from `@slap/contracts`; response shapes that the contracts do not name are in `src/lib/types.ts`. API routes are in `docs/api.md`.

## Run

From the repo root:

- `pnpm dev:web`: the dev server on :5173 (pages update as you edit), proxying `/api` and `/ws` to the API on :8787 (`VITE_API_PROXY=http://localhost:8788` points it at another instance).
- `pnpm --filter @slap/web dev:mock`: `VITE_MOCK=1`, every endpoint answered from `src/lib/mock.ts` (fixture class CS229, a fake caption stream, a mock partner).
- `pnpm --filter @slap/web build`: `build/` (`client/`: the files a browser downloads; `server/`: the code that renders pages). The API serves and renders it on :8787 through `server.ts` (rebuild after web changes; the API needs no restart).
- `pnpm --filter @slap/web typecheck` (also regenerates the route types in `.react-router/`), `lint` (oxlint).

Env (Vite, build time): `VITE_API_BASE` (empty = same origin), `VITE_MOCK`.

## Pages

| Route | What |
|---|---|
| `/` | The landing page (`routes/_index.tsx`, built from `src/landing/`): what Slap is, how it works, the device, questions. See "The landing page" below |
| `/demo` | The landing page's "Demo" button. Two courses, found by code (`routes/demo.tsx`): `OCCHACKS` live (its device, a join QR, every device recording now) and `CS229` recorded (its first ready lecture with a transcript snippet per outline section, the course's exam and quiz dates, links into the course) |
| `/j/:code` | Join by class code: redirects to the live captions, polls every 5 s until the lecturer starts; otherwise links to the class |
| `/live/:lectureId` | Captions: two lines (source word-by-word, translation per segment), language and size pickers, reconnect with `since`; labelled *Replay* for a replay; ended state links to recall / notes |
| `/home` | The dashboard across every course (`routes/home.tsx`): "Recording now" (only while a device is recording: the course and a link to its captions), to-dos (cards due, suggested practice, exam topics when an exam is within a week), each course's next exam, the devices that are online, new recordings, then the course cards. It asks `today` for up to 8 courses that have lectures; it does not ask for the model-written study plan, which costs a model call per course |
| `/courses` | Course cards (every course, `components/Courses.tsx`) and the form that creates one |
| `/classes` | The old address of the list: redirects to `/home` |
| `/c/:classId` | Class home: session panel (start/stop, laptop mic, who is watching, replay state), lectures, announcements feed, join QR, device, exam and quiz dates (`components/Assessments.tsx`), uploads, import |
| `/c/:classId/lecture/:id` | Outline, concepts weakest-first, summary, questions asked in class, announcements, ask-the-lecture box, transcript with hover notes and a saved-translation toggle, replay captions |
| `/c/:classId/graph` | Force graph coloured by mastery; export as an Obsidian vault |
| `/c/:classId/concept/:id` | Concept note: definition, exam quote, mentions, cards, related |
| `/c/:classId/exam-topics`, `/exam-sheet` | Ranked topics; printable one-page sheet |
| `/c/:classId/review` | FSRS flashcards (space flips, 1–4 rates; looks ahead for more due) |
| `/c/:classId/practice` | 5 graded questions (`?concept=` / `?lecture=` first; A–D picks, Enter checks) |
| `/c/:classId/partner` | Spoken learning partner (hold to talk) |
| `/c/:classId/pretest` | Three questions on the syllabus's upcoming week |
| `/c/:classId/lecturer` | Lecturer view: device, session, who is watching and in which languages, live caption tail, questions asked in class |
| `/c/:classId/today` | Cards due, next exam, practice set, pretest, coming-up announcements, weak spots, and the model-written study plan (`components/StudyPlan.tsx`: overview, class pace, what each exam and quiz covers with a readiness bar, other dates, then day by day as typed tasks, each a link to the page that does it: recall check, practice, review, lecture notes, pretest; regenerate button) |
| `/recall/:lectureId` | 3-minute free recall, compared into got / missed / wrong |

Who you are: `lib/user.ts` keeps a random id in `localStorage` (`slap.user`) and `api.ts` sends it as `X-Slap-User` on every request. Cards, attempts, recall checks and mastery follow that id, so they are per browser; another browser or cleared site data starts fresh. The id is not a login and gives no access that others lack.

## The landing page

`/` is the public page that explains Slap: what it is, how to use it, the device, and common questions. `routes/_index.tsx` puts it together from `src/landing/`:

| File | What it holds |
| --- | --- |
| `Nav`, `Hero`, `About`, `HowItWorks`, `Hardware`, `Faq`, `Footer` | The sections, top to bottom, with all their words. |
| `landing.css` | How it looks. Plain CSS, loaded on this page only, with every rule inside `.landing` so it cannot reach app pages. The colours and fonts are the short list at the top. |
| `data.ts` | The demo's sentences and their translations (`LINES`), the example conversation (`EXAMPLE`), the demo class. |
| `CaptionDemoProvider`, `captionDemo.ts` | The caption demo's clock; the device screens and the phones follow it, so they tell the same story. |
| `Device`, `oled.ts` | The device picture and its 128 x 64 pixel screen, drawn pixel by pixel as on the real OLED. |
| `Phone` | The phone mock-up (captions, or the language list). |
| `Accordion`, `Reveal` | The lists that open and close; sections fading in as they scroll into view. |
| `Conversation`, `talk.ts` | The Conversation side bar. |
| `img/` | Pictures of the device (copies of `hardware/housing/preview/assembled_black.png` and `exploded.png`). |

- **Languages.** The caption demo offers Japanese and Vietnamese over an English lecture. To add one: add its line to every sentence in `LINES`, add it to `LANG_NAMES`, and it appears as a button. The translated sentences were written by hand and should be checked by a native speaker before the page goes public.
- **Left out on purpose:** customer reviews, press mentions, sales numbers and a shop button, because Slap does not have them yet.
- **The Conversation side bar** (the black tab on the right edge) listens through the microphone, writes down what is said and sorts it into turns. It only listens in Chrome and Safari, after the browser asks for permission; elsewhere use "Play an example". The browser cannot tell voices apart: the "Who is speaking" buttons file the words under Professor or Student, and a pause of 2.5 seconds or a change of speaker starts a new turn. The browser sends the sound to its own speech service (Google in Chrome, Apple in Safari); the page saves nothing.

## Layout of `src`

- `components/`: `ClassLayout` (class shell: the side bar with the class switch and nav, which folds to a narrow rail on a desktop; polls the class every 8 s), `Shell` (top bar of the pages outside a class), `ConceptText` (hover notes), `Announcements`, `LogoArt` (the logo drawing), `ui` (buttons, panels, pills, bars; `Logo` is the drawing with the name beside it).
- `lib/`: `api.ts` (every call; `downloadFile` for downloads that carry the caller id), `user.ts` (the per-browser id), `captions.ts` (caption reducer: snapshot/interim/final/translation, sorted by start), `ws.ts` (reconnecting socket), `micStream.ts` (laptop-microphone fallback), `holdRecorder.ts` + `partnerAudio.ts` (partner), `languages.ts`, `format.ts`, `mock.ts`, `logo.ts` (the logo).
- `routes/`: one file per page; the file's name is its address (`routes.ts` explains the naming). `c.$classId.tsx` is the frame around every class page; `c.$classId.practice.tsx` also exports `AnswerCard`, shared with the pretest. An address with no file gets a 404 and the error page in `root.tsx`.
- `root.tsx`: the HTML document around every page (head, global styles, scroll position, the error page).
- `landing/`: the landing page's components, stylesheet, pictures and demo data.
- `routes.ts`, `../react-router.config.ts`, `../server.ts`: which files are pages, the framework's settings, and the function the API calls to render a page.

## The logo

The logo (the mascot being slapped) lives in `lib/logo.ts` and nowhere else. `LOGO_PATH` is the drawing; `LogoArt` puts it on a page (the landing page, the app's top bar and class side bar, the phone mock-up) and `LOGO_ICON_HREF` is the same drawing as the browser-tab icon, set in `root.tsx`. There is no icon file in `public/`. The drawing is traced from the last frame of the device's switch-on animation, `screen/splash/6` in `screen-lab/sprites.js`, keeping only the mascot and the hand, one square per pixel. If the animation is redrawn, retrace it there and every place follows.

## Adding a page

Add a file to `src/routes`. `courses.tsx` is `/courses`; a `.` in the name is a `/` and `$name` is a value in the address, so `c.$classId.review.tsx` is `/c/:classId/review`. Default-export the page component. Run `pnpm --filter @slap/web typecheck` to regenerate the route types.

## Server rendering

Every page is rendered on the server for the first request and then taken over by the browser, so page code has to run in both places:

- `window`, `document`, `localStorage`, `navigator` and the like may only be used in effects and event handlers, never at the top of a file or while rendering.
- The first render in the browser must match what the server sent. A value only the browser has (a saved language, the text size) cannot be in that first render: gate the part on `useHydrated()` from `lib/useHydrated.ts`, as the captions page (`routes/live.$lectureId.tsx`) and the graph page do.
- Data is still fetched in the browser (`useApi`), because who you are is an id in this browser's storage that the server never sees. So the server sends the landing page in full, and for app pages the frame with a loading state. Pages under `/c/:classId` are drawn once the class has loaded.
- A library that needs a browser to load at all (`react-force-graph-2d`) must be imported lazily behind `useHydrated()`; see `routes/c.$classId.graph.tsx`.
