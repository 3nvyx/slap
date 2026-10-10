# Slap

One small device per classroom. Slap it on the lecturer's desk and the whole room gets live captions in their language; afterwards the lecture becomes a knowledge graph, flashcards, practice questions, a recall check, exam topics and a study plan.

- `PLAN.md` — the full plan, decisions and measurements.
- `docs/api.md` — REST + WebSocket API. `docs/architecture.md` — local vs cloud, Docker, hosting. `docs/device-screen-remote.md` — testing the device's screen from a machine the board is not plugged into.
- `packages/contracts` — shared TypeScript types (device protocol, caption events, DTOs).
- `apps/api` — Node 22+/TypeScript server (Hono + ws): device ingest, Deepgram captions, translation, study pipeline, serves the web app.
- `apps/web` — Vite + React: captions page, classes, lectures, graph, review, practice, recall, exam topics, today.
- `firmware/esp32` — ESP32-S3 firmware (PlatformIO, pioarduino). `firmware/wokwi` — simulation of the display/button/Wi-Fi path.
- `hardware/` — wiring, housing CAD (OpenSCAD, STLs), measurements.
- `spikes/` — throwaway benchmarks (Deepgram, local Whisper, smoke test).

## Run locally

```bash
# at the repo root: copy .env.example to .env.local and fill DATABASE_URL and the API keys (or `neon env pull`)
pnpm install
pnpm db:push                      # apply the schema to the linked Neon branch
pnpm dev                          # API on :8787 (serves apps/web/dist if built)
pnpm dev:web                      # Vite dev server on :5173, proxies /api and /ws
```

Environment (read only in `apps/api/src/settings.ts`): `DATABASE_URL`, `DEEPGRAM_API_KEY`, optional `GOOGLE_TRANSLATE_API_KEY`, `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`), `PUBLIC_URL`, `DEVICE_KEYS`, `MODE=demo|local|cloud`. Missing keys fall back to mock backends so the whole UI runs.

## Deploy (after the event)

`docker compose up -d --build` on a small VPS with `SLAP_HOST` set for Caddy; see `docs/architecture.md`.

## Demo run

1. `pnpm dev` (API on :8787, serving the built web app; `pnpm --filter @slap/web build` first), then open `/classes`. There is no sign-in: every class and device is open to anyone who can reach the app, and study progress is kept per browser.
2. Create a class (code `CS229`), then pair the device by typing its on-screen code in the Device panel. The landing page lists every class, so judges open one directly.
3. Press the device's button (or double-slap it, or "Start session" in the app). Captions appear for anyone who opens `/j/CS229` (the page waits and opens them by itself if scanned early); pick a language in the top bar. The class home shows who is watching and in which languages.
4. Open Partner in the class nav to practise out loud: hold the orange button and answer; the partner grades you and asks the next question in your chosen Fish voice. Needs `FISH_API_KEY` (and `FISH_VOICE_ID`).
5. Stop the session: the study bundle runs (outline, concepts, cards, questions) and the lecture page, graph, review, practice, recall, exam topics, exam sheet, pretest and today pages fill in. Ask the lecture a question from its page; export the class as an Obsidian vault from the graph.

Without hardware: `node --env-file-if-exists=../../.env.local --env-file-if-exists=../../../.env.local apps/api/src/scripts/fake_device.ts --pair-code SLAP01 --seconds 300` streams the fixture lecture as a device would; toggle "Use laptop microphone" on the class page; or press **Replay captions** on any saved lecture to play it back through the caption page (labelled as a replay, joinable by the QR).

Study jobs need a real LLM (`ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`) and live translation needs `GOOGLE_TRANSLATE_API_KEY`; without them the API runs those backends as mocks and `GET /api/health/ready` says so.
