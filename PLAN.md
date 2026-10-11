# Slap: hackathon plan (solo, 36 hours, education track)

Name: **Slap** (`slap` in code and domains, "Slap!" on the logo). Pitch line: slap it on the lecturer's desk and the whole room gets captions.

## Context

The idea has two parts:
- **One hardware device** that sits on the lecturer's desk, records the lecture, and drives live captions in each student's language.
- **A study web app** (software only). Students sign in, pick their class, and get that class's lecture transcripts by date, an Obsidian-style knowledge graph, flashcards, practice questions that mimic the lecture and the book, exam topics, and a study plan.

Decisions made so far:
- Name: Slap (decided 6 October). Domain candidates to check in the Student Pack, in order: slap.study, slap.app, getslap.app, slapnotes.com, slapcaptions.com.
- Hardware order placed 6 October: DORHEA ESP32-S3 N16R8 3-pack, arriving Wednesday 7 October. Soldering Wednesday evening (preferred, boards and header pins in hand) or Thursday; Thursday-evening gate unchanged.
- 36-hour hackathon starting Saturday 10 October 2026, solo builder. Rules: hardware and planning may be done beforehand; all project code is written at the event. This file is the `PLAN.md` taken into the event.
- Builder background (from GitHub): comfortable in TypeScript/React (the stronger of the two, and the reason for the 6 October stack decision below) and Python, self-taught Arduino, no prior WebSocket or streaming work. The device WebSocket path is therefore the first Saturday block and is kept as simple as possible.
- Demo class: Stanford CS229 Machine Learning, Spring 2026 series (playlist PLaqpC4kq8Gpw, starting with "Lecture 1: Introduction", youtube.com/watch?v=DATnpGoGhM8). Lectures 1–3 seed the class as real dated days; the live five-minute clip comes from a denser lecture (linear regression, gradient descent or logistic regression) so the concepts link well on the graph. The CS229 lecture notes PDF is the "book"; the public syllabus anchors the plan. Not Creative Commons: demo use only. Fallback: Harvard CS50 Week 3 (CC BY-NC-SA, published transcripts).
- The knowledge graph is framed as a map and a mastery view, not the study method itself. The research favours retrieval practice and spacing over viewing pre-made maps, so the cards and questions carry the learning, and the graph gets one generative question type ("how are X and Y related?").
- Study features follow the evidence ranking: retrieval practice and spacing (high), interleaving, self-explanation, free recall and pretesting (moderate), re-reading aids (low). The post-lecture recall check is in; the one-page exam sheet is demoted to stretch.
- 3D printer is at home; the housing is designed and printed before Saturday.
- Main board is an ESP32-S3 DevKitC-1 N16R8 (DORHEA 3-pack B0CKXJLP4B, delivering Wednesday 7 October). The UNO R4 WiFi is ruled out for the device: no I2S library in its Arduino core, Wi-Fi reached through a slow serial bridge to an onboard module (bad for continuous audio), and 32 kB RAM. It can still bench-test the OLED before the ESP32s arrive. A classic ESP32 (WROOM-32) would also work and is the alternate if supply changes.
- The builder solders the headers themselves, learning on the spare mic board. The iron is ordered with the boards; mic and OLED soldering doesn't wait for the ESP32s.
- There is one device and it has one job: lecture capture. Everything at home is software. The device does not show flashcards or act as a tutor.
- Phones stay an optional way to view captions; the laptop is the primary screen.
- Book upload is limited to one PDF chapter with no search index.
- Real sign-in through Neon Auth, GitHub first and Google second if time allows; Neon Postgres is the database. Judges get read-only guest access to the demo class and never need to sign in.
- Database and auth: Neon, decided 6 October, replacing Supabase. Project `slap` (id `bold-glitter-22589234`, aws-us-east-2, Postgres 18, default branch `production`), linked from the repo root through `.neon` (git-ignored); `neon.ts` declares `auth: true` and a sample function, and `neon deploy` has been run once. Neon Auth is managed Better Auth, with users and sessions stored in the project's Postgres. Neon Functions, Object Storage and AI Gateway exist but are not used: the backend stays a Node/TypeScript server on the laptop (hackathon) and in Docker (after). Neon Functions is a post-event option for small HTTP endpoints only.
- Backend language: decided 6 October, replacing Python/FastAPI. The whole product is **TypeScript end to end**: a Node API server, the Vite React app and a shared contracts package. Rationale: Neon Auth is Better Auth, which is TypeScript-first; Neon's driver and tooling are TypeScript; the builder is fluent in TypeScript; and one language gives shared types between the device protocol, the server and the React app (`packages/contracts`, no second schema language). Python stays only as a sidecar for local speech-to-text after the event. The stack, repo layout and Docker description below are updated to match, and the end-to-end smoke test in `spikes/smoke` validates it (see "This week").
- Slap to start: decided 6 October. A double slap on the case starts or stops a session. The device detects it two ways: from the microphone's transient while idle, and from the kit's MPU6050 IMU (10-DOF module) as the robust sensor. The IMU interrupt also wakes the ESP32 from deep sleep, so a slap turns the device on. It is reported to the server as `{button: "slap"}`, like the BOOT button, so the server needs no new path. The device now carries an IMU: one more I2C module and five more jumpers (see Hardware).
- The build is designed to need no soldering, with one possible exception (mic header pins, see Hardware).
- The class is the top-level object. Content is generated once per class and shared; only progress is per student.
- First prototype on a breadboard; a 3D-printed housing follows.
- The product runs as a local app on the laptop, and the same backend deploys as Docker containers to a cloud host after the event. Speech-to-text sits behind an interface chosen by `STT_BACKEND`. Saturday builds the interface and the Deepgram implementation; local WhisperLiveKit with the MLX Whisper backend (offline captions) is a post-event or if-ahead addition. See "Local mode and cloud mode" below and `docs/architecture.md`.
- Stack review of 6 October 2026: the builder accepted the technical corrections (firmware toolchain, WebSocket library, wire formats, auth, speech-to-text and LLM provider changes, demo operations), applied through this file, `docs/architecture.md` and `hardware/wiring.md`. Pushback, recorded on purpose: the review recommended cutting the demo to one loop (device → captions → one language → saved lecture → concepts, cards and questions) and deferring exam topics and the study plan. The builder keeps the existing scope and cut order. The accepted part is "build the study bundle first, derived pages after", which the timeline already reflects.

## One-line pitch

"One $20 device per classroom captions the lecture live in your language, then turns it and your textbook into a knowledge graph, flashcards and practice questions."

The answer to "why not a phone?": a phone serves one student; this serves the room, and nobody gives up their phone for 90 minutes.

Differentiator once local captions work: the English captions can run with no cloud at all. Granola and Wispr Flow are not actually local (they upload audio), so "works offline" is something they cannot say. Make this claim only if the local WhisperLiveKit backend has been shown working; the Saturday demo itself runs on Deepgram.

**Demo order matters.** Study apps are a crowded category, so the first 60 seconds are the hardware and live translated captions. The graph and practice mode come second, as "and here is what it does with what it heard".

**Screens:** the laptop is the primary screen. The caption page at `/live/:session` is the same on phone and laptop and is captions-only: full screen, dark, no navigation.

## Scope

| Tier | Feature | Notes |
|---|---|---|
| Must | Device mic → live transcript → live translation | The demo opener. Everything else depends on it. |
| Must | Join by printed QR sticker, NFC tap, URL or OLED QR, pick a language | Primary: a printed short-URL QR sticker on the device (`https://<domain>/j/AB12`). Secondary: an NFC sticker holding the same plain URL, and the join QR on the OLED while idle. Keep URLs short so the OLED QR stays low-density. Laptop first; phone optional. |
| Must | Slap to start | A double slap on the case starts/stops the session; detected from the microphone's transient while idle, and from the kit's MPU6050 IMU (10-DOF module) as a robust sensor; the IMU interrupt wakes the ESP32 from deep sleep, so a slap turns the device on. |
| Must | Karaoke-style captions | Two lines: source on top with each newly recognised word bold and older words dimmed (from Deepgram word timestamps); translation below, highlighted per segment (labelled approximate if animated). Live; audio isn't stored, so the only replay is the labelled demo replay of a saved lecture's captions (see "Demo operations"). |
| Must | Concept notes + hover definitions | Each concept is a note: definition, where it came up in the lecture, related concepts. Hovering a term in the transcript shows the note. |
| Must | Knowledge graph view | Obsidian-style force graph of concept notes and their links. Click a node to open the note. Pitch it as the map and mastery view; the cards and questions are the training. |
| Should | Flashcards with spaced repetition | Generated per concept, scheduled with an FSRS library. |
| Should | Practice-question mode | Questions in the style of the lecturer's examples and the book's exercises; graded by the model as formative feedback, not a mark; results update mastery. Includes a "how are X and Y related?" type where the student draws the edge, the one form of concept mapping that is shown to help. |
| Should | Mastery on the graph | Node colour reflects card and question results, so weak areas are visible. |
| Should | Book upload (one PDF chapter) | Sent to the model directly for concepts and questions, parsed once and the result persisted. No embeddings or vector database. |
| Should | Lecture outline | Post-lecture job splits the transcript into titled sections with timestamps and summaries; the lecture page is organised by section. |
| Should | Study bundle | One validated, persisted job per lecture, run first: outline + linked concepts + cards + questions, with status tracking. The derived pages (exam topics, study plan) read from it. |
| Should | Syllabus upload | Once per class: exam dates, weekly topics, deadlines. Same PDF path as the book chapter. Anchors the study plan. |
| Should | Announcements feed | Deadlines, schedule changes and opportunities mentioned in lecture; one more field in the post-lecture extraction call. |
| Should | Recall check | Right after the session ends: three minutes to type everything remembered, compared against the transcript into got / missed / wrong. Misses feed mastery and cards. About 1 hour. The best-supported technique and the one only this product can do. |
| Stretch | Pretest before the next lecture | Three questions on what the syllabus says is coming. About 30 minutes. |
| Stretch | One-page exam sheet | Generated per exam from exam topics and weak spots. A re-reading aid, so low priority. |
| Stretch | Lecturer view | One page: device live, students connected, languages in use, questions asked. Makes the classroom pitch concrete. About 1 hour; first stretch to pick up. |
| Stretch | "Ask the lecture" chat | Question box over the transcript, during and after the lecture. About 1 hour; only after the lecturer view. |
| Must | GitHub sign-in, class picker, lectures by date | Neon Auth. Start with GitHub only (five-minute OAuth app); Google second if time. Read-only guest access to the demo class so judges never need to sign in. The join QR identifies one lecture/session and grants nothing else. The live caption page stays open without sign-in. |
| Should | Exam topics | Concepts ranked by lecturer emphasis: explicit flags ("this will be on the exam"), how often and how long each was covered. The ranking is a heuristic, and the UI says so. |
| Should | Study plan ("Today" page) | Cards due (FSRS), weakest high-emphasis concepts, a practice set that mixes concepts across lectures, back-scheduled from syllabus exam dates. |
| Should | Spoken learning partner (built) | `/c/:classId/partner`: hold to talk, Fish ASR + TTS, grades through the practice pipeline, voice and language pickers. Browser mic and speakers; no device involved. |
| Stretch | Export as an Obsidian vault | Concept notes are already markdown with `[[links]]`; write them to a folder. |
| Stretch | Local speech-to-text (`STT_BACKEND=whisperlivekit`) | Second implementation of the STT interface: WhisperLiveKit with the MLX Whisper backend (pinned, streaming policy set explicitly) running natively on the Mac, no internet for English captions. Post-event, or if ahead. |
| Stretch | Docker image and Compose file | Documented in `docs/architecture.md`; built Saturday if ahead, otherwise after the event. |
| Cut | Multi-document library, any study feature on the device | Roadmap lines in the pitch. |

Cut order if behind schedule: spoken practice → syllabus-aware plan (fall back to a plain 7-day plan) → lecture outline → book upload → recall check → practice mode → flashcards. Never cut the caption path or the graph.

Sign-in fallback: GitHub only to start; add Google only if time allows. Guest access to the demo class means judges never depend on sign-in. If GitHub does not work one hour after starting, switch to a name-and-email form with no password and move on.

## Hardware

One device design: ESP32-S3 + one INMP441 mic + 2.42" OLED + MPU6050 IMU (the kit's 10-DOF module), connected by fifteen F/F jumpers (ten for mic and OLED, five for the IMU), plus a kit LED and 220 Ω resistor in two more jumper sockets as the recording light: seventeen F/F in all. The board's BOOT button is start/stop, as is a double slap on the case, so there is no breadboard and no external button. Power over USB-C from the laptop (also the serial log) or the Anker bank. The amp and speaker are not used.

Optional: a tactile switch on GPIO 1 to GND (internal pull-up) on the kit's breadboard if a bigger button is wanted; the firmware supports it.

Slap to start: the firmware watches the microphone while idle for an amplitude spike pattern (two hits within 500 ms) and the MPU6050 for a tap. The IMU interrupt on GPIO 7 wakes the ESP32 from deep sleep, so a slap also turns the device on. The mic path only works while the device is awake; the IMU is the robust sensor. Both report `{button: "slap"}`.

### No soldering

Everything connects with header pins, a breadboard and jumper wires. First look at the parts on hand: if the three mic boards and the OLEDs already have metal pins attached, nothing needs soldering at all.

| Part | Solder-free approach |
|---|---|
| ESP32 boards | These 3-packs ship with pins attached. Confirm on arrival. |
| Button | The board's own BOOT button (GPIO 0) is start/stop in both builds, pressed through a printed plunger in the housing. Caption language is chosen in the web app. |
| Recording light | A kit LED and 220 Ω resistor pushed into F/F jumper sockets on GPIO 2, plus a REC marker on the OLED. The onboard RGB LED on these boards usually needs a pad bridged; ignore it. |
| OLED | Confirmed "2.42OLED-IIC VER:1.1": I2C only, 4 pins (GND, VDD, SCL, SDA), address 0x3C, onboard boost so 3.3 V is correct. Header not fitted: 4 solder joints, same session as the mics. |
| Housing wiring | Female-to-female jumpers from pin to pin. |
| INMP441 mic | Confirmed from the listing photo: pins ship loose as two 3-pin strips, so each board needs 6 solder joints. Get two boards done this week. |
| MPU6050 IMU | The kit's 10-DOF module has its pins pre-soldered (confirm on arrival), so it needs no soldering. If it turns out to have a loose header, that adds joints to the list below. Five F/F jumpers. |

Soldering list (20 joints, one sitting, nothing else on any board):
- INMP441 ×2: two 3-pin strips each (included), pins pointing out of the component side so the bare port side can face the housing wall.
- OLED ×2: one 4-pin strip each in the top-edge holes, pins pointing out of the back, away from the screen.
- IMU: nothing, if the kit module's pins are pre-soldered (confirm).
- Pins: the mic pack's 18 cover both mics and one OLED; four more from any 0.1" header strip for the second OLED.
- With pins pointing outward, every connection in both builds is an F/F jumper pin to pin; the mic pack's ten F/F cover only the mic and OLED of one build, and the IMU and LED need seven more (see "To buy").

Doing it yourself (decided):
- Iron: basic adjustable kit with stand, brass tip cleaner and solder (about $15–20) or a Pinecil (about $26). Solder: 63/37 leaded rosin-core, 0.8 mm; wash hands, ventilate.
- Practice on the third mic board and spare header pins first, then the two real mics, then the OLEDs. About an hour in total.
- Hold pins square by pushing the strip into the breadboard and setting the module on top. Iron about 330 °C: touch pin and pad together two seconds, feed solder, one more second, lift. A good joint is a small shiny cone. Compare against Adafruit's "Guide to Excellent Soldering".
- The mics and OLEDs are already on hand, so this happens as soon as the iron arrives, independent of the ESP32 delivery.

Backups if it goes badly:
1. Have someone solder them: a campus makerspace, a friend, or the hardware table at the hackathon. It is a two-minute job.
2. Learn it. Header pins are the easiest soldering there is, about 30 minutes with a video and a $15–20 iron kit, and there are three mic boards to practise on while only two are needed.
3. Buy a mic module sold with pins already attached (check the listing photos and reviews).

Do not rely on unsoldered pins held in by friction; the connection drops out and the audio stream breaks mid-demo.

Decision: the soldering gets done this week by the builder; no alternative board is ordered up front. **Gate: Thursday 8 October, evening.** If the joints are not done and working by then, Saturday runs the Arduino fallback (UNO R4 WiFi drives the OLED, BOOT-style button and LED; laptop mic captures audio), which needs no purchase. Nothing else in the plan changes.

Parts on hand: INMP441 I2S mic (3), 2.42" SSD1309 OLED 128×64 I2C (2), tactile switches, LEDs, NFC stickers.

To buy:
- **DORHEA 3-pack ESP32-S3 DevKitC-1 N16R8** (B0CKXJLP4B, $18.99), chosen; select the "3pcsN16R8" set. One for the desk build, one for the housed build, one spare. Delivers Wednesday 7 October. Use a data-capable USB-C cable (the SunFounder kit cable is one).
- **Soldering iron:** borrowed (brother's kit). Check it has solder wire, a tip cleaner and a fine tip; buy 63/37 rosin-core 0.8 mm solder if missing.
- **40-pin male header strip** (a few dollars): the OLEDs ship without pins, and the mic pack's spares only cover one.
- **ELEGOO jumper set** (F/F, F/M and M/M, a few dollars), now worth buying. The mic pack's ten F/F no longer cover everything: 10 (mic and OLED) + 5 (IMU) + 2 (LED and resistor sockets) = 17 F/F per build. For the desk build alone, the kit's F/M jumpers through the breadboard also work; the mic pack's ten then move from the desk build to the housed build at assembly time.
- **A second breadboard** (optional, about $10 for a multi-pack): these boards are wide and leave one free row per side on a standard breadboard.
- A USB power bank if you don't own one.

Things to check when the boards arrive:
- Pin labels on the silkscreen match the wiring table (standard DevKitC-1 numbering).
- IMU: the kit's 10-DOF module has pins fitted, the MPU6050 answers at 0x68 (other sensors on the same module sit at other addresses), and which pin is INT.
- Wi-Fi is 2.4 GHz only; set the phone hotspot to its 2.4 GHz / compatibility mode.
- Two USB-C ports: use the one labelled UART/COM for flashing and the serial log.
- If the first upload fails to connect, hold BOOT while it starts.
- Toolchain: the standard PlatformIO `espressif32` platform ships the Arduino-ESP32 2.0.x core, which does not have the `ESP_I2S` API. Use the pioarduino platform fork pinned to a numbered release (not its moving "stable" URL) to get Arduino-ESP32 3.x under PlatformIO, or use Arduino CLI/IDE with Espressif's own package. Compile the stock I2S example first: a toolchain mismatch would look like an I2S bug.
- Mic data: the INMP441 sends 24-bit samples in 32-bit I2S slots. Capture 32-bit, select the left slot, shift to signed 16-bit little-endian, and check gain and clipping on the serial plotter before connecting speech-to-text.

Power: the laptop's USB port during development and on the bench (it also gives you the serial log), the Anker power bank for the standalone moment in the demo. Every USB power bank supplies 5 V on its ports; higher voltages only happen when a device negotiates them, which this board never does. The one thing to test is that the bank doesn't switch itself off at the board's low idle draw; many Anker banks have a low-current mode (double-press or hold the button) for exactly this.

### Build stages

1. **Desk prototype.** ESP32, mic and OLED connected by F/F jumpers, loose on the desk. All firmware and pipeline work happens here. No breadboard needed.
2. **3D-printed housing.** The same device, built again on a second board from the 3-pack with the second OLED and a second mic, same seventeen F/F jumpers, and the IMU (the kit's 10-DOF module; confirm how many it has: if only one, it goes in the housed build and the desk build falls back to mic-only slap detection). This is a copy, not a second product: the desk build stays intact as the demo fallback, because moving the only working build into a case late in the event is how demos die.

Housing design (v2.1 slab, `hardware/housing/housing_slab.scad`; v1 box kept for reference only):
- Flat slab, 105.5 × 51.0 × 31.4 mm, 3 mm corner radius, Teenage Engineering cues: everything on one face.
- Top face: OLED window left (measured glass + 0.4 mm/side), dot-grid mic grille, orange 12 mm REC button over BOOT (captive, collar, no fastener), 3 mm LED window, engraved `REC` and `SLAP` labels.
- Screwless: five snap hooks between tray and top plate, 3 × 1 mm pry slot on the back; OLED on necked pegs plus two removable printed clips; dev board on two pedestals with snap tabs and lid posts on the USB shells.
- Jumpers plug onto the dev board's LONG underside pins (the short top pins can't hold a Dupont), so the housings hang below the board; OLED and mic headers are soldered with the long side pointing inward (≥ 6 mm).
- IMU (requirement added 6 October, not yet in the CAD): a small board pocket near the dev board, the module fixed rigidly to the tray (no foam, no loose fit) so a slap reaches it, with its five jumpers reaching the dev board. Module outline still to measure.
- USB-C slot in the right end wall (UART/COM port; `usb_slot_mode` can open both). NFC recess and rubber-foot recesses underneath.
- Tolerance block `tol_*` (holes +0.3 dia, fits 0.2/side, snap 0.25, window 0.4/side, elephant foot 0.3); README maps each fit coupon to the value to change. `part="clash_check"` renders empty when nothing collides.
- Height is set by the OLED stacking over the ESP32 module; `oled_back_keep=0` and `oled_proud=1` save up to 2 mm once the OLED back is measured.
- Print: top plate face-down, tray floor-down, button on its cap with brim, clips flat; 0.4 nozzle, 0.2 mm layers, 3 walls, 15% infill, PLA, light grey body + orange button, no supports.
- Fit-test order: snap coupon, OLED ring, OLED frame (after measuring), mic + LED, button, USB.

The printer is at home, so the housing is designed and printed this week. Fit-test pieces first, the final once the board has been measured. A print order can be sent remotely during the event if a revision is needed, but the plan doesn't depend on it.

### Wiring

Every connection is one F/F jumper from a module pin to a board pin. Same map on the desk and in the housing.

| Module pin | ESP32-S3 pin | Notes |
|---|---|---|
| INMP441 VDD | 3V3 | 3.3 V only |
| INMP441 GND | GND | |
| INMP441 SCK | GPIO 5 | I2S bit clock |
| INMP441 WS | GPIO 4 | I2S word select |
| INMP441 SD | GPIO 6 | data in |
| INMP441 L/R | GND | left slot |
| OLED VDD | 3V3 | module has its own boost converter |
| OLED GND | GND | |
| OLED SCL | GPIO 9 | I2C |
| OLED SDA | GPIO 8 | I2C |
| MPU6050 VCC | 3V3 | 3.3 V |
| MPU6050 GND | GND | |
| MPU6050 SCL | GPIO 9 | shared I2C bus with the OLED |
| MPU6050 SDA | GPIO 8 | shared I2C bus; address 0x68, no conflict with the OLED at 0x3C |
| MPU6050 INT | GPIO 7 | tap/motion interrupt, wake source from deep sleep |
| LED anode | GPIO 2 via 220 Ω | resistor and LED legs in F/F jumper sockets |
| LED cathode | GND | |
| Start/stop | BOOT button (GPIO 0) | onboard, no wiring |
| Power | USB-C from laptop or power bank | |

Seventeen F/F jumpers in all: ten for the mic and OLED, five for the IMU, two for the LED and resistor sockets (10 + 5 + 2). The mic pack's ten cover only the first group, so buy the ELEGOO set, or for the desk build use the kit's F/M jumpers through the breadboard. The LED can still be dropped in favour of the REC marker on the OLED. Three modules now share 3V3 and GND; if the board's pins run out, run both through the breadboard rails.

Optional external button (GPIO 1 to GND, internal pull-up) on the kit's breadboard if wanted.

OLED notes: two header positions (top edge and right side), same four signals; use whichever suits the housing. Four corner mounting holes. The board's note says ACK is only returned if pad D2 is bridged, so an I2C scanner may find nothing even when wiring is correct; U8g2 (`U8G2_SSD1309_128X64_NONAME0_F_HW_I2C`, address 0x78 in U8g2's 8-bit form) should still drive it. Don't bridge D2; that's surface-mount soldering.

Avoid GPIO 0 (except as the BOOT button), 19, 20, 26–37, 43–46.

**If a classic ESP32 (WROOM-32) is used instead**, the wiring is identical except for pin numbers: mic SCK → 14, WS → 15, SD → 32; OLED SCL → 22, SDA → 21; IMU SCL → 22 and SDA → 21 (shared with the OLED), INT → 33 (an RTC pin, provisional); LED → 13; optional button → 27; BOOT stays GPIO 0. Avoid GPIO 6–11 (flash), 1 and 3 (serial), 12 (strapping). Wokwi's "ESP32 DevKit v1" matches it.

Unverified until the parts are in hand: exact `ESP_I2S` calls in core 3.x (read 32-bit frames, shift to 16-bit; needs the pinned pioarduino or Arduino CLI toolchain, see "Things to check"); U8g2 driving the display without ACK; power bank stays on at idle draw; the IMU's tap/motion interrupt tuned to a slap, and deep-sleep wake on GPIO 7 (a wake is a cold boot, so check how the two-hits-in-500-ms window is handled).

### Simulation

Build the firmware first in Wokwi (ESP32-S3 + SSD1306 128×64 + push button + LED, with its Wi-Fi gateway reaching the real backend through the tunnel). Display frames, pairing code, button, WebSocket protocol and reconnect logic are all testable there before the boards arrive. The I2S mic cannot be simulated: a `FAKE_AUDIO` build flag streams a short PCM clip from flash for pipeline development only, never for the demo. The real mic is verified on the bench with the serial plotter. Keep `firmware/wokwi/diagram.json` in the repo. Use the same pinned toolchain and the same library set (`firmware/wokwi/libraries.txt`, with `WebSockets` meaning links2004/WebSockets) as the hardware build, so a version mismatch shows up in simulation first.

Power: USB power bank. No battery circuit.

## Architecture

```
ESP32-S3 ──WebSocket (16 kHz PCM + button events up; OLED frames down)──► Backend (one Node/TypeScript app, runs local or in Docker)
Backend ──► speech-to-text interface, chosen by STT_BACKEND
              ├─ deepgram        Deepgram Nova-3 streaming (cloud; default for the live demo)
              └─ whisperlivekit  WhisperLiveKit + MLX Whisper, native on the Mac (local; post-event)
        ──► translation service (Google Cloud Translation) for live captions   [TRANSLATE_BACKEND]
        ──► LLM after the lecture: outline, concept notes, flashcards, questions, syllabus; grading on demand   [LLM_BACKEND]
        ──► WebSocket fan-out to browsers (one channel per language)
        ──► GET /health (liveness) and GET /health/ready (readiness: which STT, LLM and translation backends are live)
Laptop / phones ──► web app at one fixed public address (Cloudflare Tunnel + own domain)
Neon ──► Neon Auth (GitHub sign-in, Google second) + Postgres   (project `slap`; the laptop connects to the Neon branch directly)
```

Data model:
- Shared per class: `classes`, `lectures` (class, date), `segments` (transcript), `concepts` (definition, emphasis, exam-flag quote), `concept_links`, `concept_mentions`, `cards`, `questions`, `study_bundles` (lecture, status, validated result).
- Per student: `profiles`, `enrollments`, `card_state` (FSRS card state), `review_logs`, `attempts`. Mastery is computed from review logs and attempts.
- Neon Auth keeps its own users and sessions in the project's Postgres. Everything above is still ordinary Postgres tables that the backend reaches through `DATABASE_URL`; the per-student tables key on the Neon Auth user id (the token's subject).

Key choices:
- **Device is a thin client.** It captures audio, sends button presses, and shows pixels. All logic is on the backend.
- **Firmware structure.** One audio capture task reads the I2S mic into a bounded queue; one network task drains the queue and sends frames over the WebSocket; display updates are infrequent. If the socket blocks or the queue fills, drop the oldest audio rather than growing a backlog, so latency stays bounded. The INMP441 outputs 24-bit samples in 32-bit I2S slots: capture 32-bit, select the left slot, shift to signed 16-bit little-endian, and check gain and clipping on the serial plotter before connecting speech-to-text. TDK lists the INMP441 as NRND (not recommended for new designs, still in production): fine for the hackathon, pick a different mic for any later PCB. Slap detection runs on the device: an amplitude spike pattern on the mic (two hits within 500 ms) while idle, and the MPU6050's tap interrupt, which also wakes the ESP32 from deep sleep. A detected double slap is reported to the server as `{button: "slap"}`, like the BOOT button, and handled the same way.
- **Server renders the OLED.** Backend draws a 128×64 image with `@napi-rs/canvas` (Noto and Fusion Pixel fonts shipped in `apps/api/fonts`, join QR from the `qrcode` npm package), packs it to a 1-bit bitmap and sends 1,024 bytes, so any script works. The frame is XBM layout: row-major, 128 px per row = 16 bytes per row, 64 rows, least significant bit = leftmost pixel in each byte, 1 = lit; the device draws it with U8g2 `drawXBM`. Start with status text and the join code; server-rendered multilingual captions come after. OLED states: none when idle (a device that is on records); when live, the latest three or four caption lines in English, Vietnamese or Japanese with a thin level meter, the language and a timer under them; "Saved" after a stop.
- **Network:** device and laptop on a phone hotspot. One Node process (Hono or Fastify, plus `ws`) serves the API, the two WebSocket paths (`/ws/device` and `/ws/live`) and the built Vite app from one origin, exposed at a fixed tunnel address. The address must not change between runs: OAuth redirects, the device firmware and the NFC sticker all point at it. Venue Wi-Fi is not trusted.
- **Joining:** the primary route is a printed QR sticker on the device encoding a short URL such as `https://<domain>/j/AB12`. The NFC sticker (the same plain URL) and the join QR on the OLED are secondary. Short URLs keep the OLED QR low-density and scannable at desk distance. The code identifies one lecture/session and grants nothing else (see Auth).
- **Auth:** the React app signs in through Neon Auth with the Better Auth client (GitHub first, Google second if time); the backend verifies the JWT on study routes with `jose`, using `createRemoteJWKSet` on `NEON_AUTH_JWKS_URL` (a JWKS flow, not an assumed shared secret), with issuer and audience set to the auth base URL (`NEON_AUTH_BASE_URL`). Validate signature, issuer, audience and expiry, and check class membership. `DATABASE_URL` stays server-side only. The OAuth redirect is registered on the fixed tunnel hostname in Neon Auth's settings. `/live/:session` needs no sign-in. Judges get read-only guest access to the demo class; the join QR identifies one lecture/session and must not grant access to other lectures or to any paid or "start lecture" action.
- **Device sessions:** starting a session attaches the device to a class and creates today's lecture; when it stops, the transcript is saved under that date and the concept, card and question jobs run.
- **Device protocol** (one WebSocket, `/ws/device?key=…`): device sends `{hello}` on connect, `{button: press}` on the BOOT button, `{button: "slap"}` on a detected double slap, and 3,200-byte PCM frames every 100 ms while recording. Server sends `{state: idle|recording}` and 1,024-byte OLED bitmaps (XBM, see above). Pairing: first boot shows a 6-character code on the OLED, entered in the web app to bind the device to a class. WebSocket library: links2004/WebSockets (arduinoWebSockets), pinned, the one library for the firmware. Heartbeat on (ping every 10 s) and reconnect with bounded backoff. Drop the oldest audio rather than queue it (see Firmware structure). The message types live in `packages/contracts`, shared by the server and the React app; the firmware follows them by hand.
- **Pipeline modules are pure functions** (text in, data out, no web or database code) so they can be tested against a saved transcript without the device.
- **Emphasis:** the concept extraction call also returns an exam flag (with the lecturer's quote) and the backend counts mentions and time spent. Exam topics and the study plan read from this.
- **Speech-to-text:** behind a small interface in `stt.ts` (audio frames in, caption events out), selected by `STT_BACKEND=deepgram|whisperlivekit`. The Deepgram implementation (a raw `ws` WebSocket to Deepgram's live endpoint; not `@deepgram/sdk`) is the default and the one built Saturday: streaming, raw linear16 input, interim results with word timestamps for display, only final results persisted, finalized segments translated. Diarization is off for the demo (one lecturer); turn it on later so the outline can separate lecturer from student questions.
- **Caption events** carry `words[]` with start and end times. The live page bolds the most recent words of the current segment and dims the rest, then locks the segment and appends its translation when the final arrives. Source words are highlighted from Deepgram timestamps; translated text is highlighted per segment, and labelled approximate if it is animated. Word-level sync lags the speaker by the recognition delay (about 0.5–1 s); translation sync is per segment because word order differs across languages. The target is fast source interim text with the translated segment a beat later, not a single end-to-end number.
- **Translation:** a translation service, not a model. Google Cloud Translation (`@google-cloud/translate`, or its REST API; 500k chars/month free, widest coverage); Azure Translator F0 (2M chars/month free) is the larger free tier if Google's 500k runs out; DeepL (500k free, strong for European and CJK) is another alternative. Translate only stable, finalized clauses or segments, never an expanding prefix of interim text. One request per target language per segment (never per student), only for languages with a connected viewer, cached by (segment_id, revision, language). Stretch: push extracted key vocabulary into the service's glossary for consistent technical terms.
- **Model jobs run after the lecture** (or in 10-minute batches during it): outline (sections, timestamps, summaries), concept notes with emphasis, flashcards, exam-style questions, and once per class the syllabus (exam dates, weekly topics, deadlines). Grading runs on demand. Nothing on the live path waits on a model.
- **Study bundle first.** Per lecture, one job produces one validated, persisted study bundle (outline + linked concepts + cards + questions) with status tracking. The derived pages (exam topics, study plan) read from the bundle rather than calling the model again. Grading is formative feedback, and exam-topic ranking is a heuristic; the UI says both.
- **Study plan principles** (pitch line): FSRS scheduling for cards, retrieval practice through exam-style questions, interleaving by mixing concepts across lectures, anchored to syllabus exam dates. `ts-fsrs`: confirm the current scheduler API (`repeat`/`next`) when wiring it in, timestamps are UTC, and both the card state and the review log are saved.
- **Concept notes are the one data model everything hangs off.** Every ~30 seconds of transcript, `claude-sonnet-5-5` returns `{concept, definition, related[], source_excerpt}`; results are merged into existing notes by name. Notes are stored as markdown with `[[links]]`. Hover cards, the graph, flashcards, questions and mastery all read from these notes.
- **Graph:** `react-force-graph-2d`; nodes are concept notes, edges are `related[]` links, colour is mastery, size is how often the concept came up. Stop or cool the simulation after it settles, and label only selected nodes and their neighbourhoods. In the app, register the API and WebSocket routes before the SPA catch-all, derive `wss:` from `https:`, and use relative API URLs.
- **Book chapter:** the PDF goes to Claude as a document, through the TypeScript SDK (`@anthropic-ai/sdk`), in a single pass that returns the same concept shape plus the chapter's exercise questions. Book concepts merge into the same notes, tagged by source. Claude's PDF input processes pages as images plus text, so parse the chapter and syllabus once and persist the result; consider extracting text locally for long chapters.
- **Practice questions:** generated from two style sources, the lecturer's worked examples and questions found in the transcript and the book's exercises. Mix of multiple choice and short answer; short answers graded by the model with a one-line explanation. Each question is linked to a concept.
- **Mastery:** per-concept score from card grades and question results. Missed questions create or reschedule a card for that concept.
- **Privacy:** raw audio is never stored, only the transcript. Recording light is on whenever the mic is live.

### Local mode and cloud mode

One Node/TypeScript codebase runs the same way on the laptop and on a cloud host. What differs is configuration, read from the environment (12-factor): `MODE` (`demo`, `local` or `cloud`), `STT_BACKEND`, `LLM_BACKEND`, `TRANSLATE_BACKEND`, `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, plus the API keys for whichever backends are chosen. `GET /health/ready` reports which backends are live, so a glance tells you whether the demo is running on cloud or local services.

- **Local mode:** `pnpm dev` in `apps/api` (Node in watch mode, running the TypeScript directly) and a browser tab on the laptop. The app connects to the Neon branch directly: there is no local Postgres and no local auth stack, and `neon env pull` writes the connection variables to `.env.local`. This is how the product runs during the hackathon, with Deepgram and the cloud services still switched on.
- **Cloud mode:** the same code built into a Docker image and run with Compose behind Caddy on an always-on host after the event, still talking to Neon.

What works with no internet, and what does not:

| Capability | Offline? | Needs |
|---|---|---|
| English captions | Yes, with `STT_BACKEND=whisperlivekit` | WhisperLiveKit with the pinned MLX Whisper backend, native on the Mac; `large-v3-turbo` benchmarked on the actual Mac, a smaller model if it cannot keep up; about 0.5–2 s latency, to be measured |
| OLED (join QR, status, latest caption) | Yes | Rendered by the backend; nothing external |
| Device link | Yes | Device and laptop on the same network; the firmware points at the laptop's address instead of the tunnel |
| Saving transcripts and study data | No | Neon Postgres over the internet; offline mode is live captions and the OLED only (a local Postgres is not planned) |
| Translation and captions in other languages | No | Cloud translation service (`TRANSLATE_BACKEND`) |
| GitHub (or Google) sign-in | No | Neon Auth and the OAuth providers over the internet |
| Concept notes, cards, questions, grading | No, unless `LLM_BACKEND=local` | Ollama running natively on the laptop |
| Live demo captions | No | Deepgram Nova-3: sub-300 ms with interim results, funded by the $200 credit (promotional pricing, not a budget assumption) |

Notes on the local speech-to-text path:
- WhisperLiveKit provides the live streaming layer behind a WebSocket API; `stt.ts` talks to that. WhisperLiveKit and MLX Whisper are Python, so this is the one place Python stays: a sidecar process on the Mac, outside the product image. It does not have a whisper.cpp backend: on macOS it uses MLX Whisper. Pin the version and set the streaming policy explicitly (its default is SimulStreaming) rather than relying on defaults.
- whisper.cpp remains a separate CLI/server experiment, not the WhisperLiveKit path. Its `whisper-server` is a request/response HTTP API, not a live stream.
- If the local backend cannot supply word timestamps, the caption page falls back to whole-segment captions instead of word-by-word bolding. Translation is already per segment.
- Skipped: faster-whisper (no Metal backend on a Mac).
- Local inference runs in the native Mac process, not in the Linux Docker image, and so does Ollama: Docker on macOS gets no GPU, so containers are for the cloud host, where Deepgram and a hosted LLM are used. Benchmark `large-v3-turbo` on the actual Mac with the UI and Docker also running; fall back to a smaller model if it cannot keep up. Still post-event, or if ahead.

Packaging, Docker, hosting and CI are in `docs/architecture.md`. The short version: for the hackathon, "local app" means a dev server plus a browser tab; a real Mac `.app` later is Tauri 2 with the Node server bundled as a sidecar (a Node single-executable build is the likely route, to be decided), not for Saturday.

### Demo operations

How the server runs on the day. These are settings and checks, not extra features.

- **Run without reload.** For judging run `node server` (not the watch-mode `pnpm dev`) as a single process, so the in-memory subscriber registry is the single source of truth.
- **Device path.** Once client-to-client reachability on the phone hotspot is confirmed, the device connects to the Mac directly over the hotspot LAN (plain `ws://` to the Mac's LAN IP). The public WSS tunnel path is the fallback. Keep both addresses in `config.h`.
- **Idle sockets.** Cloudflare closes idle sockets, so the device and the browser both run heartbeat plus reconnect with bounded backoff.
- **Caption recovery.** Browser-level sequence numbers on caption events and a snapshot on reconnect, so a browser that drops and returns recovers the current captions instead of showing a gap.
- **Input fallback.** Browser microphone input if the device fails.
- **Replay mode.** Replays a saved lecture through the live caption path, clearly labelled as replay in the UI.
- **Health.** `GET /health` is liveness only (cheap). `GET /health/ready` is readiness (which STT, LLM and translation backends are configured and reachable, database reachable). Neither calls a paid API.
- **Neon warm-up.** The free tier is serverless and scales to zero after inactivity, so the first query after a quiet spell has a short cold start. Run a query (for example `GET /health/ready`, which checks the database) a few minutes before the demo and again before the run-through. `neon checkout demo --create` makes an isolated database branch for demo data, so rehearsal changes never touch `production`.
- **Protected routes.** "Start lecture" and the job endpoints (study bundle, grading) need a device key or the signed-in class owner. Guests and join codes cannot reach them.

### Tech stack (free tier plus about $20 of API credit)

| Layer | Choice | Cost |
|---|---|---|
| Firmware | PlatformIO with the pioarduino platform fork pinned to a numbered release (Arduino-ESP32 3.x), or Arduino CLI/IDE with Espressif's package; `ESP_I2S`, links2004/WebSockets (arduinoWebSockets, pinned), U8g2 | Free |
| Speech-to-text (default) | Deepgram streaming (Nova-3) over a raw `ws` WebSocket (not `@deepgram/sdk`), interim results, raw linear16 input, diarization off for the demo, behind the `STT_BACKEND` interface | $200 signup credit (promotional, not a budget assumption) |
| Speech-to-text (local, later) | WhisperLiveKit with the MLX Whisper backend, pinned, streaming policy set explicitly; `large-v3-turbo` or a smaller model, native on the Mac | Free |
| Translation | Google Cloud Translation via `@google-cloud/translate` or REST (or Azure Translator F0 / DeepL) | 500k chars/month free (Azure F0: 2M) |
| LLM | `claude-sonnet-5-5` through `@anthropic-ai/sdk` for the study bundle (outline, concepts, cards, questions), grading, syllabus and the PDF chapter; one hosted fallback, Gemini Flash free tier | About $15 of credit |
| Runtime | Node 22 LTS (the Mac has Node 26; the Docker image uses `node:22-alpine`), pnpm, TypeScript run directly by Node (type stripping) in dev | Free |
| Backend | Hono (or Fastify) + `ws` for WebSockets, one process and one origin; `@napi-rs/canvas` + `qrcode` for OLED frames; `ts-fsrs`; `jose` (`createRemoteJWKSet`) for Neon Auth token verification | Free |
| Database access | `@neondatabase/serverless`, or `pg` + Drizzle ORM for schema and migrations (Drizzle recommended) | Free |
| Shared contracts | `packages/contracts`: TypeScript types for the device protocol and caption events, imported by `apps/api` and `apps/web` | Free |
| Database + auth | Neon: Postgres 18 + Neon Auth (managed Better Auth; GitHub first, Google second). Project `slap`, aws-us-east-2, default branch `production`; Neon CLI 8.x, agent skills and the MCP server installed for development | Free tier (serverless, scales to zero) |
| Frontend | Vite + React + TypeScript, Tailwind, Better Auth client (Neon Auth), `react-force-graph-2d`, `qrcode.react` | Free |
| Public URL | Cloudflare Tunnel with a domain from the GitHub Student Developer Pack (or about $10) | Free |
| Hosting (hackathon) | Laptop; one Node process serves API, WebSockets and the built frontend from one origin | Free |
| Docker and hosting (after the event) | Two-stage Dockerfile (Vite build, then `node:22-alpine` running `node server` as a non-root user with a HEALTHCHECK), Compose with Caddy; Hetzner CX23 (€5.49/mo excl. IPv4, June 2026 listing; confirm at checkout) or a $6 DigitalOcean droplet, or Railway Hobby ($5/mo incl. $5 usage) for the simplest path | About €5.49/mo or less |
| Desktop app (later) | Tauri 2 with the Node server as a sidecar; bundles are about 2.5–10 MB against Electron's 85–250 MB | Free |
| Tooling | `pnpm`, `tsc --noEmit` for type checking (Node strips types without checking them); `uv` only for the Python sidecar | Free |

Why not the alternatives: ngrok's free static domain shows a warning page to browsers, which breaks QR joins. Free hosts such as Render sleep when idle and cold-start too slowly for a live demo. The Python/FastAPI option was dropped on 6 October (see Context).

**LLM provider switch.** `llm.ts` exposes `complete(task, messages)` behind a provider setting:
- `claude` (default when credits exist, through `@anthropic-ai/sdk`): Sonnet 5.5 for all post-lecture jobs and grading. PDF input is processed as page images plus text, so parse a chapter or syllabus once and persist the result.
- `free`: one hosted fallback only, the Gemini Flash free tier, for grading, small jobs, the PDF chapter and the syllabus. Rate-limited, enough for one classroom. Its free-tier data may be used by Google to improve products, so use it for demo content only. Groq's `openai/gpt-oss-120b` is an alternative if the free account exposes it. Groq retired Llama 3.3 70B for free/developer accounts on 16 Aug 2026, so it is not an option.
- `local`: Ollama with Qwen3-8B, run natively on the laptop (Docker on macOS gets no GPU). A post-event local option, fine for post-lecture jobs since nothing live waits on it.
Since the model is off the live path, a slow CPU-only VM is acceptable for batch jobs, but not needed.

**Docker** packages the backend and built frontend, not the models: `Dockerfile` (two-stage `node:22-alpine`) + `docker-compose.yml` (api + caddy). Develop natively; during the hackathon the backend runs on the laptop behind Cloudflare Tunnel as above. After the event, Compose on an always-on host keeps the app reachable. Build steps, hosting comparison and CI are in `docs/architecture.md`.

Free-tier gotchas: Neon scales the database to zero after inactivity and the first query has a short cold start, so warm it with a query before the demo (see "Demo operations"). If no domain is available, fall back to a `cloudflared` quick tunnel: add its hostname to Neon Auth's allowed redirects (check whether wildcards are accepted; otherwise register each new hostname) and reflash the device with the new URL.

Repo layout (new project folder, created at build time; a monorepo):

```
slap/
├── apps/
│   ├── api/                 Node + TypeScript backend (package.json, tsconfig.json; run directly by Node in dev)
│   │   ├── src/
│   │   │   ├── server.ts, settings.ts (env config), auth.ts, db.ts, sessions.ts, llm.ts, oled.ts
│   │   │   ├── ws/          device.ts, live.ts
│   │   │   └── pipeline/    stt.ts, translate.ts (service client), outline.ts, concepts.ts, book.ts, syllabus.ts, cards.ts, recall.ts, practice.ts, plan.ts
│   │   ├── drizzle/         schema and migrations (Drizzle ORM)
│   │   ├── scripts/         import-transcript.ts (seeds past lectures)
│   │   └── tests/           pipeline tests with recorded fixtures
│   ├── web/                 Vite + React + TypeScript
│   │   └── src/pages/       Live, Login, Classes, ClassHome, Lecture, Graph, Concept, Review, Practice, ExamTopics, Today
│   └── desktop/             Tauri 2 shell (later, not Saturday)
├── packages/contracts/      shared TypeScript types: device protocol, caption events (imported by api and web)
├── firmware/
│   ├── esp32/               src/: main.cpp, config.h, audio, link (WebSocket), display, button, slap (mic transient + IMU)
│   └── wokwi/               diagram.json, wokwi.toml (simulation)
├── hardware/                wiring.md, housing/ (CAD + STL)
├── demo/                    CS229 transcripts, syllabus, notes
├── docs/architecture.md     Docker, hosting, CI, packaging
├── spikes/                  throwaway experiments (spikes/smoke is the end-to-end TypeScript smoke test); not product code
├── package.json, pnpm-workspace.yaml   (workspace root)
├── Dockerfile, docker-compose.yml, Caddyfile, .env.example   (after the event, or Saturday if ahead)
└── PLAN.md
```

Routes: `/live/:session` (captions, no sign-in), `/j/:code` (short join URL, redirects to the live page), `/login`, `/classes`, then per class `/c/:class` (lectures by date, device status, Start button), `/c/:class/lecture/:id`, `/graph`, `/concept/:id`, `/review`, `/practice`, `/exam-topics`, `/today`.


## This week (Monday 5 to Friday 9 October)

**Monday**
1. Done 6 Oct: DORHEA ESP32-S3 3-pack ordered, arriving Wednesday. Still to confirm: the 40-pin male header strip is in the order. Borrow the soldering kit; add solder if the kit has none. Buy the ELEGOO jumper set (17 F/F per build, see Hardware).
2. Measure the OLED (outer width, height, hole spacing) and photograph the Pi. (Mic pins confirmed loose; OLED confirmed I2C-only, header not fitted.)
3. Soldering Wednesday evening when the boards and header strip arrive (Thursday at the latest): practise on the spare mic, then two mics and two OLEDs, 20 joints, assuming the kit's IMU module has its pins fitted (confirm). Thursday evening is the gate; see "No soldering" for the fallback.
4. Accounts: Deepgram (claim the credit; it is promotional, not a budget assumption), Anthropic (about $15), Neon project (done: `slap`, see Context), GitHub OAuth app configured in Neon Auth, Google Cloud project with Cloud Translation enabled, Gemini API key (the one hosted LLM fallback), Google OAuth client only if time allows (verify the Google provider in Neon Auth later). Domain via the GitHub Student Developer Pack, named Cloudflare Tunnel.
5. Networking checklist: verify the Student Pack domain can use Cloudflare DNS (nameservers) and a named tunnel; register the OAuth redirect on that hostname in Neon Auth's settings before the event; confirm the phone hotspot's 2.4 GHz mode and client-to-client access between the actual phone and the Mac.
6. Done: the name is Slap. Register the domain (candidates listed in Context) and use it for the tunnel hostname and OAuth redirect.

**Tuesday**
7. Wokwi: ESP32-S3 + SSD1306 + button + LED. Learn the display library, the button, and connecting to a WebSocket echo server through Wokwi's Wi-Fi gateway. Throwaway sketches.
8. Housing CAD v1 from measured OLED and mic plus the DevKitC-1 published dimensions. Print fit-test pieces: OLED window, mic hole, USB-C slot, BOOT plunger, IMU pocket.
9. CS229 Spring 2026 materials: pull YouTube transcripts for Lectures 1–3 to seed the class and check their quality; pick a 5-minute stretch of a denser lecture (regression or gradient descent) for the live demo; download the CS229 lecture notes PDF (one chapter as the "book") and the Spring 2026 syllabus with its exam dates. If transcript quality is poor, switch to CS50 Week 3.

**When the boards arrive (Tuesday to Friday)**
10. Bench test with stock examples: LED blink on GPIO 2, BOOT button read, text on the OLED, mic levels on the serial plotter (32-bit capture, left slot, shift to 16-bit; check gain and clipping), IMU read and tap interrupt (I2C address 0x68, INT on GPIO 7), Wi-Fi join on the phone hotspot (2.4 GHz). Measure the board; adjust the housing and print the final.
11. Anker power bank: confirm it stays on with the board idle for ten minutes (enable its low-current mode if it has one). Laptop USB is the fallback power source and works fine for the demo.

**Friday**
12. Phone on cellular reaches a hello-world server on the laptop through the tunnel. The Neon Auth redirect on the tunnel hostname works with a test sign-in, and `neon env pull` has produced a current `.env.local`.
13. Pack: two boards wired (breadboard build and housed build), spare board, power bank, cables, extra jumpers, tape, the printed housing, NFC stickers.
14. Sleep.

**Saturday**: open this file, start at hour 0.

## 36-hour timeline

| Hours | Work | Done when |
|---|---|---|
| 0–3 | Scaffold the pnpm workspace, database tables, GitHub sign-in (Google if time), guest access to the demo class, class picker; device joins hotspot and opens a WebSocket | Signed-in user sees their class; server logs a hello from the device |
| 3–7 | Mic → backend → Deepgram → transcript in browser, saved under the class and date | Speaking near the device shows English text |
| 7–10 | Translation fan-out, two-line karaoke captions page, language picker, printed QR / NFC join | Laptop and one phone show two languages live, with words bolding as they are recognised |
| 10–12 | OLED frames, recording light, buttons, slap to start (mic transient and IMU tap) | Device shows the join QR, then status and the latest caption; a double slap starts and stops a session |
| 12–14 | Post-lecture job: outline + concept notes with emphasis; hover cards | Lecture page shows sections; hovering a term shows its note |
| 14–17 | Sleep | |
| 17–20 | Graph view, note page, lectures-by-date page; import script and seeded past lectures | Class has three lectures and a populated graph |
| 20–22 | PDF path: book chapter merged into notes, syllabus parsed to dates and topics | Graph shows lecture and book concepts linked; class shows its exam dates |
| 22–25 | Flashcards + FSRS review, saved per student; recall check | Cards are reviewable and reschedule; a recall check shows got / missed / wrong |
| 25–29 | Practice mode, grading, mastery colours | A wrong answer turns a node red and adds a card |
| 29–31 | Exam topics page and study plan page (syllabus-anchored) | Both pages show ranked, real data for the signed-in student, with review back-scheduled from the next exam date |
| 31–34 | Assemble the housed build, flash it, polish, demo script, backup video | Housed build passes the caption test; full run-through recorded. If it fails, demo on the breadboard. |
| 34–36 | Rehearse and submit | |

**Speech-to-text scope (hours 3–7):** build the `stt.ts` interface with the Deepgram implementation, and the `STT_BACKEND` setting that selects it. Local WhisperLiveKit (MLX Whisper) is a post-event addition, or something to try if the schedule is ahead; the interface exists so that it can be added without touching the rest of the pipeline. Dockerfile and Compose are likewise post-event unless ahead.

Spoken practice only if a block finishes early. Fallback if device audio isn't working by hour 6: use the laptop's browser mic and keep debugging firmware in parallel.

## Measured on 6 October (spikes, see `spikes/README.md`)

- Deepgram Nova-3 with the device's exact audio format: interim captions median 73 ms (p90 99 ms) after the chunk is sent; finals median 1.1 s (p90 2.0 s) after a sentence ends, which is the translation trigger. Vocabulary from a real CS229 clip transcribed correctly.
- Local MLX Whisper on the M5 Pro: large-v3-turbo runs 5× real time, small 12× real time, 1.9 GB peak. Local STT is feasible; it stays post-event.
- End-to-end TypeScript smoke test (device format audio → Node `ws` server → Deepgram raw WebSocket → viewer): interim captions median 121 ms on the Mac and 66 ms inside the node:22 container; finals ~450 ms. Neon Postgres: 0.9 s cold, 70 ms warm per query. Neon Auth JWKS verification path works (EdDSA). Vite build 0.3 s. Docker image 236 MB, builds in 11 s. ESP32-S3 sketch compiles with pinned pioarduino + U8g2 + links2004/WebSockets (RAM 16%, flash 36%). Decision: talk to Deepgram with raw `ws`, not `@deepgram/sdk` (slower, and crashes on Node 22). Details in `spikes/README.md`.
- Wokwi: display, BOOT button, LED, Wi-Fi and HTTP verified on the simulated ESP32-S3; WebSocket handshake could not be tested through Wokwi's gateway.

## Known risks

- **Scope.** The timeline now has no dedicated buffer. Any block that overruns must be paid for from the cut order. Doing all of this week's setup is what makes it fit.
- **Soldering.** First-time soldering, 20 joints, must be done and tested by Thursday evening. Practise on the spare mic first. The gate and the Arduino fallback are in the Hardware section; Friday is not available (not at home).
- **Delivery.** Boards may not arrive until Friday. Wokwi on Tuesday is what keeps Saturday morning from becoming hardware debugging. If the boards slip past Friday, the UNO R4 WiFi becomes the device for everything except audio: OLED, button, LED, pairing code and the WebSocket link are all low-bandwidth and work on it (WiFiS3 plus ArduinoHttpClient's WebSocket client), while the laptop's microphone captures the lecture. The device still sits at the front showing the join QR and captions. The firmware's audio module is the only part that is ESP32-specific, so keep it in its own file.
- **WebSockets are new to the builder.** Keep the device protocol to one socket, JSON text frames plus raw binary, and get a device hello and a browser echo working before anything else on Saturday.
- **Sign-in.** OAuth redirect and token problems can eat hours. Do the Neon Auth and GitHub setup before the event (Google only if time), register the redirect on the final hostname in Neon Auth's settings, keep the tunnel address fixed, and use the one-hour fallback. Guest access keeps judges clear of it.
- **Toolchain mismatch.** The standard PlatformIO `espressif32` platform ships Arduino-ESP32 2.0.x, which has no `ESP_I2S`. A wrong toolchain would look like an I2S bug. Pin pioarduino to a numbered release or use Arduino CLI/IDE, and compile the stock I2S example first.
- **Neon cold start.** The free tier scales to zero and the first query after idle is slow. Warm it before the demo and before every run-through; a first request that hangs on stage looks like a bug.
- **Far-field pickup.** One MEMS mic picks up well within about a metre, which suits a device on the lecturer's desk. Demo at that distance. Roadmap: 3-mic beamforming array.
- **Concept merging.** Duplicate or near-duplicate concepts make the graph messy. Pass the existing concept names into each extraction call and ask for reuse.
- **Recording consent.** California requires all-party consent. Pitch it as professor-owned or opt-in, with the recording light and no stored audio.
- **Phone distraction.** Lead the demo on the laptop; the phone join is only "see it in your language".
- **Housing transfer.** Loose jumpers inside a closed case are fragile. Keep the breadboard build intact as the fallback, and add a dab of hot glue on the housed build's connectors once it works.
- **OLED without ACK.** If the display stays blank on bench-test day, try U8g2 before suspecting wiring; the module's missing ACK is a known quirk of this version.
- **Latency.** Target fast source interim text with the translated segment a beat later, rather than one end-to-end number; measure both at hour 9. Deepgram is sub-300 ms to a first result; local WhisperLiveKit on MLX Whisper is about 0.5–2 s (to be measured on the actual Mac), so the offline path is slower and is not the demo path. Demo-day settings are in "Demo operations".
- **Local and cloud scope creep.** Local Whisper, Docker, hosting and Tauri are all attractive and none is on the Saturday critical path. Only the STT interface and env-based config are built on Saturday; everything else waits for the event to end.
- **Slap detection.** False triggers (a bumped desk, a dropped book) and misses are likely until tuned: set the thresholds on the bench, and keep the two-hits-in-500-ms rule. Both paths report the same `{button: "slap"}` event. A wake from deep sleep is a cold boot, so Wi-Fi and the WebSocket take seconds to come back; for the demo keep the device awake and use the sleep wake only as the "a slap turns it on" beat. The MPU6050 has no dedicated tap register as far as the register map shows (see `hardware/wiring.md`), so the tap interrupt is a tuned motion interrupt.
- **TypeScript run directly by Node.** Type stripping does no type checking (run `tsc --noEmit`), accepts only erasable syntax (no enums or parameter properties), needs `.ts` extensions in imports, and refuses `.ts` files inside `node_modules`, so `packages/contracts` stays a linked workspace package. The Mac has Node 26 and the image Node 22: develop and pin the image on 22.18 or later (confirm the version where stripping is on without a flag).

## What approving this plan means now

This week's work is documents and hardware, not project code:
- **First: the Wokwi simulation.** A `diagram.json` wiring the ESP32-S3, SSD1306 128×64, push button and LED exactly as in the schematic, plus a throwaway test sketch (display text, read the button, blink the LED, join Wi-Fi, open a WebSocket to an echo server). It verifies everything except the mic before any hardware arrives, and the sketch is discarded on Saturday.
- Create the project folder with this file as `PLAN.md`, `hardware/wiring.md`, and the week checklist.
- Design the housing (CAD and STL) once the photos and measurements are in; print fit-tests, then the final.
- Prepare the Wokwi diagram as a hardware description; firmware source is written Saturday.
- Collect the CS229 materials into `demo/` (transcripts, syllabus, notes).

All firmware, backend and frontend code starts at hour 0 on Saturday.

## Verification

- Per milestone: the "Done when" column above.
- End to end: sign in with GitHub (and with Google if it was set up), open the demo class as a guest, pick the class, start a session (BOOT button, then again with a double slap), play the lecture clip from a speaker about 1 m from the device, and upload the chapter PDF. Confirm live captions in two languages, the lecture saved under today's date, hover notes, a linked graph with both sources, reviewable cards, a graded practice round, a node changing colour after a wrong answer, and exam topics and the study plan reflecting it.
- Two students: sign in as a second account and confirm the class content is the same but progress is separate.
- Network: run the full test with the device on the hotspot and a phone on cellular through the tunnel, including sign-in on the phone (Neon Auth redirect on the tunnel hostname).
- Demo safety: backup video recorded by hour 34; browser-mic fallback works.
- Backends: `GET /health/ready` shows the STT, LLM and translation backends that are live and that the database answers; check it before the run-through, which also warms Neon. If the local backend has been built, repeat the caption test with `STT_BACKEND=whisperlivekit` and the laptop's Wi-Fi off to confirm English captions and the OLED still work.

## References

Verified October 2026.

- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- WhisperLiveKit: https://github.com/QuentinFuxa/WhisperLiveKit
- pioarduino platform: https://github.com/pioarduino/platform-espressif32
- arduinoWebSockets (links2004/WebSockets): https://github.com/Links2004/arduinoWebSockets
- Deepgram pricing: https://deepgram.com/pricing
- Tauri sidecar: https://v2.tauri.app/develop/sidecar/
- Node.js TypeScript support, type stripping (check, not opened): https://nodejs.org/api/typescript.html
- Hono (check, not opened): https://hono.dev
- ws (check, not opened): https://github.com/websockets/ws
- Drizzle ORM (check, not opened): https://orm.drizzle.team
- jose (check, not opened): https://github.com/panva/jose
- ts-fsrs (check, not opened): https://github.com/open-spaced-repetition/ts-fsrs
- @napi-rs/canvas (check, not opened): https://github.com/Brooooooklyn/canvas
- Deepgram JavaScript SDK (check, not opened): https://github.com/deepgram/deepgram-js-sdk
- Railway pricing: https://railway.com/pricing
- Render free tier: https://render.com/docs/free
- Cloud Run WebSockets: https://docs.cloud.google.com/run/docs/triggering/websockets
- Caddy reverse_proxy: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Neon docs: https://neon.com/docs
- Neon Auth overview (check, not opened): https://neon.com/docs/neon-auth/overview
- Neon pricing (check, not opened): https://neon.com/pricing
- 12-factor config: https://12factor.net/config
