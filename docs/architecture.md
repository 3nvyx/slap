# Architecture: local app, Docker and hosting

Companion to `PLAN.md`. Documentation only: nothing here is built before Saturday, and only the STT interface and env-based config are on the Saturday critical path. Everything else is built after the event, or Saturday if ahead. Facts verified October 2026.

## One codebase, two ways to run

The same Node/TypeScript app runs on the laptop and in a container. Behaviour is set by environment variables (12-factor config), never by code branches or separate builds.

Runtime: Node 22 LTS (the Mac has Node 26; the Docker image uses `node:22-alpine`), pnpm, and TypeScript run directly by Node (type stripping) in dev. One process, Hono (or Fastify) plus `ws`, serves the API, the two WebSocket paths (`/ws/device` and `/ws/live`), the landing page (`website/`, plain files, at `/`) and the built Vite app from one origin. The device protocol and caption event types live in `packages/contracts`, shared by `apps/api` and `apps/web`.

| Variable | Values | Meaning |
|---|---|---|
| `MODE` | `demo`, `local`, `cloud` | Which way the app is being run; the variables below still choose the backends |
| `STT_BACKEND` | `deepgram` (default), `fast`, `accurate`, `mock`; planned: `whisperlivekit` | Which speech-to-text implementation sits behind the `stt.ts` interface. `fast` is Deepgram Flux and `accurate` is Soniox (`SONIOX_API_KEY`); both can also be chosen at runtime with `PUT /api/captions/mode`. `whisperlivekit` (WhisperLiveKit with the MLX Whisper backend, native on the Mac) is not built |
| `LLM_BACKEND` | `claude` (default), `openai`, `gemini`, `mock` | Post-lecture jobs, grading and the study plan; `openai` is the Responses API (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING`); `gemini` is the hosted fallback (Gemini Flash free tier); `mock` runs with no key. Ollama (`local`) is a post-event idea, not built |
| `TRANSLATE_BACKEND` | `google` (default), `azure`, `deepl` | Live caption translation |
| `DATABASE_URL` | the Neon project's value (`neon env pull` writes it to `.env.local`) | Postgres; server-side only. There is no sign-in: the app has no accounts, and Neon Auth is not used (`neon env pull` still writes `NEON_AUTH_*`; nothing reads them) |
| API keys | e.g. `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY` | Only for the backends that are selected |

`neon env pull` also writes `DATABASE_URL_UNPOOLED` (a direct connection, for migrations), `NEON_BRANCH` and `NEON_FUNCTION_API_BASE_URL`; the plan does not use the last one.

Rules: no secrets in the image or the repo (`.env`, `.env.local` and `.neon` stay untracked, `.env.example` lists names only); `settings.ts` is the only file that reads the environment.

Health is split in two. `GET /health` is liveness: cheap, no backend calls, used by the Docker `HEALTHCHECK` and the host's uptime probe. `GET /health/ready` is readiness: the status and which backends are live (for example STT `deepgram`, LLM `claude`, translation `google`, database reachable), used as the pre-demo check. Neither calls a paid API. Neon scales to zero after inactivity, so the first database call after a quiet spell is slow; the readiness check doubles as the pre-demo warm-up.

## Local mode

- Run: `pnpm dev` in `apps/api` (Node in watch mode, running the TypeScript directly), plus a browser tab (the Vite dev server, or the built `apps/web/dist` served by the Node server).
- Data: connect to the Neon branch directly. There is no local Postgres. The project `slap` is linked from the repo root through `.neon` (git-ignored), and `neon env pull` writes `DATABASE_URL` and the other connection variables to `.env.local`.
- Branches: `neon checkout <name> --create` makes an isolated database branch (for example a demo-data branch); `production` is the default branch. The free tier scales to zero, so the first query after idle has a short cold start.
- Tooling: Neon CLI 8.x, the Neon agent skills (`.agents/skills/neon*`) and the Neon MCP server are installed for development.
- Offline speech-to-text: `STT_BACKEND=whisperlivekit`. WhisperLiveKit does not have a whisper.cpp backend; on macOS it uses MLX Whisper on Apple Silicon. Pin the version and set the streaming policy explicitly (its default is SimulStreaming). Benchmark `large-v3-turbo` on the actual Mac and fall back to a smaller model if it cannot keep up while the UI and Docker also run. Expect roughly 0.5–2 s latency, to be measured. whisper.cpp remains a separate CLI/server experiment, not the WhisperLiveKit path. This is the one place Python stays: WhisperLiveKit and MLX Whisper run as a Python sidecar on the Mac (`uv` is used for it only), and `stt.ts` talks to it over its WebSocket API.
- Native, not in Docker: local inference (WhisperLiveKit with MLX Whisper) and Ollama, because Docker on macOS gets no GPU and the Linux image cannot run MLX.
- The offline capability table is in `PLAN.md`, "Local mode and cloud mode". Saving data needs Neon, so offline mode is live English captions and the OLED only.

During the hackathon the backend runs this way on the laptop with Deepgram, behind Cloudflare Tunnel, as `PLAN.md` describes. Demo-day settings (no reload, one worker, LAN path for the device, readiness checks) are in `PLAN.md`, "Demo operations".

## Desktop packaging (later, not Saturday)

For the hackathon, "local app" is the dev server plus a browser tab. A real Mac `.app` later: Tauri 2 wrapping `apps/web`, with the Node server bundled as a sidecar that Tauri starts and stops (a Node single-executable build is the likely route, to be decided). Tauri bundles are about 2.5–10 MB against Electron's 85–250 MB. Lives in `apps/desktop`. Open item for then: how the local STT backend (WhisperLiveKit with MLX Whisper) and its model are shipped or downloaded.

## Docker image

Build context is the repo root; `.dockerignore` keeps `.git`, `.claude`, every `node_modules` and `dist`, env files and the non-app folders out of it. The host's `node_modules` must stay out, because they hold macOS binaries and would be copied over the image's.

Four stages in `Dockerfile`, all on `node:22-alpine` (22.18 or later, so type stripping needs no flag):
1. `base`: `corepack enable` (pnpm at the version in the root `packageManager` field) and the manifests only (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` and the `package.json` of `apps/api`, `apps/web` and `packages/contracts`), so the dependency layers are cached until dependencies change. The lockfile is committed and never re-resolved in the build.
2. `web`: `pnpm install --frozen-lockfile --filter "@slap/web..."`, then the source and `pnpm --filter @slap/web build`, output `apps/web/dist`.
3. `prod-deps`: `pnpm install --frozen-lockfile --prod --filter "@slap/api..."`. Only `node_modules` leaves this stage; pnpm and its store do not reach the runtime image.
4. Runtime, in the same layout as the repo under `/app`:
   - `node_modules` from `prod-deps`, then the `apps/api` and `packages/contracts` source (TypeScript, run directly by Node), which includes the OLED fonts in `apps/api/fonts`, `apps/web/dist` from the web stage, and `website/`. The server finds the web app through the default `WEB_DIST` (`../web/dist`) and the landing page through the default `SITE_DIR` (`../../website`).
   - The workspace layout is required. Node does not strip types from files under `node_modules`, so `@slap/contracts` has to resolve through its workspace symlink to `/app/packages/contracts`. `pnpm deploy` copies it into `node_modules` as TypeScript and the server then fails at import with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
   - `NODE_ENV=production`, `MODE=cloud`, non-root `node` user. The image is read-only to that user except `apps/api/.uploads` (uploaded PDFs until they are parsed).
   - `HEALTHCHECK` calls `/api/health` with `wget`.
   - Working directory `/app/apps/api`, start with `node src/server.ts`. One process, because the subscriber registry is in memory; the app trusts the forwarded headers from Caddy. The server needs `DATABASE_URL` to start.

Build scripts of dependencies are approved in `pnpm-workspace.yaml` under `allowBuilds` (pnpm 11 removed `onlyBuiltDependencies`). pnpm exits 1 on any dependency with an install script that has no entry there, on the host and in the image, so a new one needs `true` or `false` (`pnpm approve-builds` writes it).

Building on Apple Silicon for an x86 VPS needs explicit platform flags (for example `docker buildx build --platform linux/amd64`, or `platform: linux/amd64` in Compose); otherwise the image is arm64 and will not run there.

Alpine is fine for the runtime now that there is no Python. The one thing to check is that `@napi-rs/canvas` (OLED frames) installs its musl prebuilt binary in the image; if it does not, switch the runtime stage to `node:22-slim`. The Noto fonts are shipped in the repo and registered from a path, not taken from the system.

The image contains no models. Cloud mode uses Deepgram and a hosted LLM; local WhisperLiveKit/MLX Whisper and Ollama are laptop-only (see above).

## Compose and Caddy

`docker-compose.yml` has two services:
- `api`: the image above, env from `.env`, not published to the internet directly.
- `caddy`: publishes 80 and 443, with a `Caddyfile` that does a `reverse_proxy` to `api`. Caddy gets and renews HTTPS certificates automatically for the domain, and proxies WebSockets with no extra configuration, which the device and caption sockets need. The domain's DNS must point at the host first.

Caddy replaces cloudflared on a host with a public IP. The firmware's fixed address then points at the new domain; plan to reflash, and keep the address in `config.h` only.

## Hosting after the event

| Option | Cost | Verdict |
|---|---|---|
| Hetzner CX23 running Compose + Caddy | €5.49/mo excl. IPv4 (June 2026 listing; confirm at checkout) | Recommended: always on, full WebSocket support, no cold starts |
| DigitalOcean droplet running Compose + Caddy | $6/mo | Equivalent alternative |
| Railway | $5 trial, then $1/mo free credit; Hobby $5/mo incl. $5 usage | Simplest: deploy from the repo, no server to look after |
| Render free | Free | Avoid for a live demo: sleeps after 15 minutes idle (WebSocket messages now keep it awake, but the cold-start risk remains), roughly a minute to wake |
| Koyeb free | Free | Avoid for a live demo: the free instance scales to zero after an hour |
| Fly.io | n/a | Avoid: no free tier for new organisations |
| Google Cloud Run | Pay per use | Avoid for a live demo: needs min-instances to avoid cold starts, and WebSocket requests are capped at 60 minutes |
| Oracle free tier | Free | Avoid: capacity problems getting an instance |

The cloud profile is the API container plus external AI APIs plus Neon (Postgres), and nothing else: no local Whisper, LLM or database on a 1 GiB box. Neon's other services are not used (see `PLAN.md`, Context).

## CI (after the event)

The first deploy is manual. Once it works, add one GitHub Actions workflow on push to `main`:
1. Type-check and test (`tsc --noEmit` and the pipeline tests; Node strips types without checking them).
2. Build the image.
3. Push it to GitHub Container Registry (GHCR).
4. SSH to the host and run `docker compose pull && docker compose up -d`.

Secrets (SSH key, host) live in repository secrets. The host's `.env` is managed on the host, not in CI.

## Sources

See the References list at the end of `PLAN.md`.
