# Spikes (throwaway)

Benchmarks and feasibility checks run before the hackathon. None of this is
product code; the folder is deleted before hour 0 on Saturday.

| Spike | Question | Needs |
|---|---|---|
| `whisper_local/` | How fast is local Whisper (MLX, large-v3-turbo) on this Mac on real lecture audio? Real-time factor, memory. | uv, mlx-whisper, a 5-minute CS229 clip |
| `deepgram_stream/` | Speech → interim caption latency and word timestamps when streaming 16 kHz PCM, the exact format the device will send. | DEEPGRAM_API_KEY in `../.env` |
| `translate_local/` | Is a local translation model faster than Google Translate for English → Japanese and Vietnamese captions? Does sending audio in smaller packets make captions arrive sooner? | uv, mlx-lm, ctranslate2; GOOGLE_TRANSLATE_API_KEY and DEEPGRAM_API_KEY in `../.env.local` |

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


## Local translation and audio packet size (10 October 2026, `spikes/translate_local/`, MacBook Pro M5 Pro 24 GB, home Wi-Fi)

### Translation, English → Japanese and Vietnamese (`bench.py`, `batch_both.py`)

Twelve sentences from `apps/api/fixtures/lecture_sample.txt` (14 words on average), one sentence per request, one warm-up call per language. Times are wall time per sentence.

| Backend | ja median | vi median | Both languages, median | Memory |
|---|---|---|---|---|
| Google Translate v2, through `pipeline/translate.ts` | 176 ms | 172 ms | **167 ms** (two requests in parallel) | – |
| TranslateGemma 4B, MLX 4-bit | 257 ms | 276 ms | **305 ms** as one batch; 554 ms one after the other | 2.4 GB |
| NLLB-200 distilled 600M, CTranslate2 int8 on CPU, beam 4 | 280 ms | 394 ms | 668 ms one after the other | – |
| Hunyuan-MT 7B, MLX 4-bit | 577 ms | 953 ms | 1,544 ms one after the other | 6.4 GB |
| TranslateGemma 12B, MLX 4-bit | 701 ms | 824 ms | 1,515 ms one after the other | 6.9 GB |

- No local model is faster than Google. TranslateGemma 4B is the closest: 110 tokens/s, first token after 90 ms, about 20 output tokens per sentence.
- Quality, read from `translations.md` (Japanese checked by reading; Vietnamese needs a native reader): Google and Hunyuan-MT use the statistics term for "variance" in Japanese (分散); both TranslateGemma sizes use everyday words (変動, ばらつき); NLLB drops parts of sentences and once produced a Chinese word.
- mlx-lm does not stop TranslateGemma at `<end_of_turn>` by itself: call `tokenizer.add_eos_token("<end_of_turn>")`, or every answer runs to `max_tokens`.
- Not tested: giving the local model a course glossary, and translating partial sentences as they grow.

Files: `results.json`, `translations.md`.

### Audio packet size (`dg_chunks.mjs`)

The first 60 s of `lecture_sample_16k.wav`, streamed to Deepgram Nova-3 in real time with the server's query string, four packet sizes at once. "Word delay" is the time from sending the audio that ends a word to the first result containing it.

| Packet | Word delay, median | Word delay, p90 | Gap between interims, median | Final after its audio, median |
|---|---|---|---|---|
| 20 ms | 644 ms | 1,462 ms | 998 ms | 594 ms |
| 50 ms | 659 ms | 1,506 ms | 998 ms | 562 ms |
| 100 ms (the device today) | 599 ms | 1,475 ms | 1,002 ms | 682 ms |
| 250 ms | 629 ms | 1,617 ms | 1,018 ms | 493 ms |

- Packet size makes no measurable difference. Deepgram sends an interim about once a second whatever the packet size, so a word waits about 0.6 s for the next one.
- The 73 ms "interim latency" in the 6 October results is the time from the last packet sent to the interim arriving. It is not the delay of a word.
- `INTERIM_TR_GAP_MS` (700 ms) in `sessions.ts` rarely limits anything, because interims arrive about 1,000 ms apart.

### Soniox `stt-rt-v5` on the same clip (`sn_stream.mjs`, 10 October 2026)

The same 60 s, 100 ms packets, `language_hints: ["en"]`. "Token delay" is measured like the word delay above (Soniox tokens are parts of words).

| | Deepgram Nova-3 | Soniox stt-rt-v5 |
|---|---|---|
| Word / token delay, median | 599–659 ms | 595–620 ms |
| Word / token delay, p90 | 1,462–1,617 ms | 695–727 ms |
| Gap between updates, median | about 1,000 ms | 104–109 ms |
| Text final after its audio, median | 493–682 ms (per utterance) | 5.3–5.6 s without translation; 1.4 s with translation on |
| Differences from Whisper large-v3-turbo over the first 226 words | 14 (6.2%) | 3 (1.3%) |

- The typical delay is the same; Soniox is steadier because it sends text every 0.1 s where Deepgram sends it once a second.
- The accuracy row is agreement with a third model, not a score against a human transcript, and it covers 60 s. Most of Deepgram's differences are style ("wanna", "kinda", "alright"); three are real ("why i" for "Yi", two dropped words).
- Soniox has no per-utterance finals like Deepgram's. Tokens become final in clause-sized groups, so the server would have to build sentences from tokens.
- **Built-in translation** (`translation: { type: "one_way", target_language }`, one target language per session): each clause-sized group of English tokens becomes final and its translation follows about 50 ms later, also final. A translated word is on screen 1.4 s after its audio at the median and 2.3–2.5 s at p90. Translated text is only ever appended, never rewritten. Translating clause by clause leaves Japanese in English clause order.
- For Vietnamese, the translated sentence was complete about 0.7 s after the audio of the sentence's last word (16 translated sentences against 15 source sentences, paired in order). The same pairing does not work for Japanese, which came out as 25 sentences.

Files: `soniox_en.txt`, `soniox_ja_endpoint.txt`, `soniox_vi_endpoint.txt`.

### Deepgram Flux `flux-general-en` on the same clip (`flux_stream.mjs`, 10 October 2026)

The same 60 s on `/v2/listen` with 80 ms packets (Deepgram's recommendation for Flux), existing `DEEPGRAM_API_KEY`.

| | Nova-3 | Soniox stt-rt-v5 | Flux |
|---|---|---|---|
| Word first on screen, median / p90 | 599–659 / 1,462–1,617 ms | 595–620 / 695–727 ms | **95 / 302 ms** |
| Word stops changing, median / p90 | not measured | not measured | **184 / 453 ms** |
| Gap between updates, median | about 1,000 ms | 104–109 ms | 240 ms |
| Differences from Whisper large-v3-turbo | 14 of 226 words | 3 of 226 | 18 of 220 |

- Flux is about three times faster than the other two. A quarter of its words are rewritten after they first appear (for example "gal" → "Gauss" → "Gaussian"), which is why the "stops changing" row is the fair one.
- Its differences from Whisper are mostly style ("wanna", "kinda", "gonna", "alright"), plus "the" for "then" and "as" for "it's".
- Flux is built for voice agents. Each `Update` carries the whole current turn, and text is only final at `EndOfTurn`: 3 in these 60 s, so a "final" arrives every 15–20 s of lecture. The server would need its own sentence splitting to translate and store text sooner.

File: `flux_en.txt`.

