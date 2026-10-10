# Spikes (throwaway)

Benchmarks and feasibility checks run before the hackathon. None of this is
product code; the folder is deleted before hour 0 on Saturday.

| Spike | Question | Needs |
|---|---|---|
| `whisper_local/` | How fast is local Whisper (MLX, large-v3-turbo) on this Mac on real lecture audio? Real-time factor, memory. | uv, mlx-whisper, a 5-minute CS229 clip |
| `deepgram_stream/` | Speech → interim caption latency and word timestamps when streaming 16 kHz PCM, the exact format the device will send. | DEEPGRAM_API_KEY in `../.env` |

Secrets live in `slap/.env` (git-ignored). Never paste keys in chat.

## Results (6 October 2026, MacBook Pro M5 Pro 24 GB, 5-minute CS229 Lecture 3 clip, 16 kHz mono)

### Deepgram Nova-3 streaming, device format (3,200-byte chunks every 100 ms, real-time paced)
- Interim results: median **73 ms**, p90 99 ms after the audio chunk was sent. Source captions can update almost as fast as the device sends audio.
- Final results: median **1.08 s**, p90 2.0 s after the end of the segment's audio. This is end-of-utterance detection (`endpointing=300`, `utterance_end_ms=1000`), i.e. the delay before a sentence is "stable" enough to translate.
- 75 finals, 295 interims over 300 s; word timestamps present on every final. Technical vocabulary (Gaussian, GLMs, variance, least squares) came through correctly.
- Implication for the demo: English words appear within ~0.1–0.3 s of being spoken plus the device/hotspot path; the translated line lands roughly 1–1.5 s after the lecturer pauses, which matches the plan's budget.

### Local MLX Whisper (batch transcription of the whole clip, word timestamps on)
| Model | Wall time | Real-time factor | Peak RSS | Words |
|---|---|---|---|---|
| large-v3-turbo | 59.3 s | 0.20 (5.1× real time) | 1.9 GB | 1108 |
| small | 24.7 s | 0.08 (12× real time) | 1.9 GB | 1106 |

- Both transcripts match Deepgram's wording closely (1080 vs 1108 words; Whisper omits punctuation here because of the output mode).
- Implication: local STT is comfortably feasible on this Mac. Streamed through WhisperLiveKit it would run 1–3 s behind speech with large-v3-turbo and under 1 s with small, leaving most of the GPU free. Still a post-event option; the demo runs on Deepgram.

Files: `deepgram_stream/transcript_deepgram.txt`, `whisper_local/transcript_*.txt`, `whisper_local/results.json`. Audio is git-ignored.

## End-to-end smoke test, TypeScript stack (6 October 2026, `spikes/smoke/`)

Throwaway skeleton: Node 26 on the Mac / node:22-alpine in Docker, `ws` WebSocket server with `/ws/device` (binary PCM up) and `/ws/live` (caption JSON out), raw WebSocket to Deepgram, a fake device streaming the lecture clip in 3,200-byte chunks every 100 ms, a fake viewer, Neon Postgres and Neon Auth checks, a Vite React scaffold, and the ESP32-S3 toolchain.

| Layer | Result |
|---|---|
| Device → server → Deepgram → viewer (host, raw ws) | interim median **121 ms**, final median **438 ms**; server → viewer 0.1 ms; 47 caption events in 40 s |
| Same, inside the Docker container (node:22-alpine) | interim median **66 ms**, final median **456 ms** |
| Same via `@deepgram/sdk` | interim 555 ms / final 920 ms on Node 26; **crashes on Node 22** (`Invalid Sec-WebSocket-Protocol`: the SDK passes the key as a WS sub-protocol, which Node 22's built-in WebSocket rejects). Decision: no SDK, raw `ws` to Deepgram. |
| Neon Postgres from Node (`@neondatabase/serverless`) | cold query **921 ms** (scale-to-zero wake), then **70–75 ms** per query to us-east-2; create/insert/select/drop all fine |
| Neon Auth JWKS (`jose`) | JWKS fetched in 424 ms, 1 EdDSA key; bogus token rejected with `ERR_JWKS_NO_MATCHING_KEY`, so the verification path is wired correctly |
| Vite React TS scaffold + `react-force-graph-2d` + `ts-fsrs` | scaffold 0.6 s, install 2.2 s, production build **0.3 s** (222 kB JS) |
| Docker image (two-stage node:22-alpine, non-root, HEALTHCHECK) | build 11 s cold / 3 s cached, **236 MB**, health OK |
| ESP32-S3 compile (PlatformIO + pioarduino 55.03.35, U8g2, links2004/WebSockets) | **SUCCESS** in 114 s first build; RAM 16%, flash 36% of the sim sketch |

Gotchas found:
- `docker run --env-file` does not strip quotes from values; a quoted key produced a Deepgram 401. Pass secrets with `-e` or keep the file unquoted.
- macOS has no `timeout` command (use `gtimeout` from coreutils or a Node-side timer).
- Node 22 in the image vs Node 26 on the Mac behave differently for the Deepgram SDK; raw `ws` behaves identically on both.

Conclusion: every layer of the chosen stack works end to end. The remaining unknowns are hardware-only (real mic, real board on the hotspot) and arrive Wednesday.

## Fish Audio (7 October 2026, `spikes/fish_audio/`)

| Test | Result |
|---|---|
| TTS `s2.1-pro`, HTTP, `latency: low`, 150-character tutor question | first audio **618 ms**, total 2.36 s, 65 kB mp3 |
| TTS `s2.1-pro`, WebSocket live mode, text fed in two chunks | first audio **676 ms**, total 2.63 s |
| ASR `transcribe-1-pro`, 5-minute CS229 clip, `diarize=auto` | **6.0 s** for 300 s of audio (50× real time), 1,116 words with word timestamps |
| ASR accuracy vs Deepgram on the same clip | **93.5 %** word overlap (differences are mostly fillers and punctuation) |
| Speaker diarization | 2 speakers found, 5 turns: lecturer vs the student asking "Is it because the error is y minus…", with audio-event tags like `[crowd talking noise]` |

Conclusion: good enough for a press-to-talk learning partner (sub-second first audio, batch ASR in a few seconds) and for a post-lecture diarization pass to separate student questions from the lecturer. Not a live-caption engine (no streaming ASR). Cost of this whole test: under 1 cent.

## Learning partner, end to end (7 October 2026, real Fish key, mock LLM)
- Spoken 5-second answer → Fish ASR **213 ms** → graded → reply text; reply rendered by Fish TTS as mp3 (4.5–7.9 s for ~100-word replies before streaming; streaming + split clips being added so feedback plays within ~1 s).
- Diarization pass on the 5-minute lecture: **2 speakers, 5 turns**, 73 lecturer segments / 2 student segments, the student's question added to the outline's `questionsAsked`. 5.1 s for 300 s of audio. Audio only ever lived in memory.
