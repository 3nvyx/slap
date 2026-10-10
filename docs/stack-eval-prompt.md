# Prompt: evaluate this tech stack for trending alternatives

Paste everything below the line into Perplexity (or any research assistant).

---

I am a solo student building a hardware + software project at a 36-hour hackathon on 10 October 2026, then continuing it afterwards. Evaluate my tech stack layer by layer. For each layer: (1) say whether my choice is still the mainstream pick in October 2026, (2) name up to two trending or better alternatives with a one-line reason each, (3) flag anything deprecated, unmaintained, or with a known gotcha, and (4) give a verdict: keep / consider / switch. Cite sources with dates. Prioritise free tiers, speed to a working demo for one person, and reliability for a live demo over novelty. Do not recommend anything that needs a GPU server or a paid plan unless the free tier is clearly stated.

## What the product does

- A small device (ESP32-S3 + I2S MEMS microphone + 128×64 OLED) sits on a lecturer's desk and streams 16 kHz 16-bit PCM audio over a WebSocket to a backend.
- The backend does streaming speech-to-text, live translation into each student's language (captions on laptop or phone, word-by-word highlighting), then after the lecture runs LLM jobs: lecture outline, concept notes (Obsidian-style knowledge graph with [[links]]), flashcards with spaced repetition, exam-style practice questions with grading, syllabus parsing, exam-topic ranking, a study plan, and a free-recall check.
- Students sign in, pick a class, and see transcripts by date, the graph, cards and practice.
- Two run modes from one codebase: local on an Apple Silicon Mac (optionally offline speech-to-text), and dockerized on a cheap cloud host after the event.

## Constraints

- One developer, comfortable in Python and TypeScript/React, some Arduino; new to WebSockets, Docker deployment and desktop packaging.
- All project code is written during the 36 hours; only hardware, accounts and planning happen before.
- Budget: free tiers plus roughly $20 of API credit.
- Must work from a laptop on a phone hotspot with a public URL for judges' phones.

## Current stack

### Hardware
| Part | Choice |
|---|---|
| Microcontroller | ESP32-S3 DevKitC-1 N16R8 (clone 3-pack) |
| Microphone | INMP441 I2S MEMS breakout |
| Display | 2.42" SSD1309 128×64 OLED, I2C |
| Wiring | Female-to-female Dupont jumpers, no PCB |
| Enclosure | 3D-printed (Bambu Lab P2S), parametric OpenSCAD |
| Join mechanism | QR code on the OLED and NTAG215 NFC stickers |

### Firmware
| Layer | Choice |
|---|---|
| Toolchain | PlatformIO with the Arduino-ESP32 core 3.x |
| Audio capture | ESP_I2S (Arduino-ESP32 built-in) |
| Display driver | U8g2 |
| Transport | WebSocket client (links2004/WebSockets or ArduinoWebsockets), one socket: binary PCM frames up, JSON control and 1,024-byte server-rendered OLED bitmaps down |
| Simulation | Wokwi (ESP32-S3, SSD1306, button, LED) |

### Backend
| Layer | Choice |
|---|---|
| Language / framework | Python 3.12, FastAPI, uvicorn via `fastapi run`, `websockets` |
| Package manager | uv |
| Speech-to-text (live) | Deepgram Nova-3 streaming (interim results, word timestamps, diarization) |
| Speech-to-text (local/offline option) | whisper.cpp with Metal, `large-v3-turbo`, live chunking via WhisperLiveKit (LocalAgreement) |
| Translation (live captions) | Google Cloud Translation API (free 500k chars/month); alternatives considered: Azure Translator, DeepL |
| LLM (post-lecture jobs, grading) | Anthropic Claude (`claude-sonnet-5-5`) via the Anthropic SDK; PDF chapter and syllabus sent directly as documents |
| LLM free/local fallbacks | Groq free tier (Llama 3.3 70B), Gemini Flash free tier, Ollama with Qwen3-8B locally |
| Spaced repetition | FSRS via the `fsrs` Python package (py-fsrs) |
| OLED frame rendering | Pillow + Noto fonts, 1-bit 128×64 bitmaps; `qrcode` for the join QR |
| Auth | Supabase Auth (GitHub and Google OAuth), JWT verified in FastAPI with PyJWT |
| Database | Supabase Postgres (free tier); `supabase start` for a local stack |
| Config | 12-factor environment variables: STT_BACKEND, LLM_BACKEND, TRANSLATE_BACKEND, SUPABASE_URL/KEY; `/health` endpoint |

### Frontend
| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript, Vite |
| Styling | Tailwind CSS (shadcn/ui components optional) |
| Knowledge graph | react-force-graph-2d |
| QR | qrcode.react |
| Realtime | Native browser WebSocket to the FastAPI backend |
| Package manager | pnpm |
| Served by | Built static files served from the FastAPI process (one origin) |

### Local app packaging (after the event)
| Layer | Choice |
|---|---|
| Hackathon | `uv run fastapi dev` + browser tab |
| Later | Tauri 2 shell with the FastAPI server as a PyInstaller sidecar |

### Networking during the hackathon
| Layer | Choice |
|---|---|
| Public URL | Cloudflare Tunnel (`cloudflared`) to a domain from the GitHub Student Developer Pack |
| Device and laptop network | Phone hotspot (2.4 GHz) |

### Deployment after the event
| Layer | Choice |
|---|---|
| Containers | Two-stage Dockerfile: `node:22-alpine` builds Vite, `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` runs FastAPI; non-root; HEALTHCHECK |
| Orchestration | Docker Compose: api + Caddy (automatic HTTPS, WebSocket proxy) |
| Host | Hetzner CX23 or DigitalOcean $6 droplet (always-on, WebSockets); Railway Hobby as the simplest alternative |
| CI | GitHub Actions: build → push to GHCR → SSH `docker compose pull && up -d` |

### Monorepo layout
`apps/api`, `apps/web`, `apps/desktop` (later), `packages/contracts` (shared message schemas), `firmware/esp32`, `hardware/`, `docs/`.

## Specific questions

1. Is Deepgram still the best free-credit option for live streaming STT with word timestamps, or have AssemblyAI, Speechmatics, OpenAI Realtime, Gladia, or Google's models overtaken it on latency, accents, or price?
2. For live translation of caption segments at 100–300 ms, is a translation API still better than a small fast LLM? Any 2026 service with a generous free tier and glossary support?
3. Is whisper.cpp still the best local STT on Apple Silicon, or should I look at MLX Whisper, WhisperKit, Moonshine, Parakeet, or Apple's SpeechAnalyzer?
4. For a React knowledge graph, is react-force-graph-2d still the pragmatic pick, or is there something newer (Sigma.js, Cosmograph, D3 7 with WebGL) that handles a few hundred nodes better with less code?
5. Is FSRS still the standard spaced-repetition algorithm and is py-fsrs maintained?
6. Is Supabase still the right free auth + Postgres combo for a solo dev, versus Neon + Better Auth, Convex, PocketBase, or Firebase?
7. For the ESP32 firmware, is Arduino-ESP32 3.x + PlatformIO still standard, or has ESP-IDF, MicroPython, or Zephyr become the better default for an I2S audio streaming device? Any issue with PlatformIO's ESP32 support in 2026?
8. For a Python + React desktop shell, is Tauri 2 with a sidecar still the standard path, or has something simpler emerged (e.g. Electrobun, Wails, pywebview, Flet)?
9. For always-on, WebSocket-friendly, cheap hosting of one container, is a $6 VPS with Docker Compose + Caddy still the usual answer, or have Railway, Fly, Render, Koyeb or Sevalla changed their free tiers in 2026?
10. Anything in this stack that is a known time sink for a first-time user that I should swap before the event?

Finish with a one-page summary: a revised stack table (layer, current choice, verdict, alternative if switching) and the top five changes you would actually make given the constraints.
