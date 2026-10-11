# Slap on Devpost

Copy for the submission form, in the order Devpost asks for it. Images are in `img/` (regenerate with `node docs/devpost/make.mjs`).

## Elevator pitch (30 seconds)

Slap is a small box you put on the lecturer's desk. Shake it, and everyone in the room gets live captions on their own laptop or phone, each in their own language. When the lecture ends, Slap turns what it heard into a concept map, flashcards, practice questions and a recall check, so the lecture is still useful a week later. One device serves the whole room, nobody has to prop up a phone, and the lecturer does nothing but talk. I built it solo in 36 hours: the firmware, the 3D-printed housing, and the web app.

## Title

Slap

## Tagline (60 characters max)

Slap it on the lecturer's desk. The whole room gets captions.

Alternatives:
- One $20 box per classroom: live captions in your language, then flashcards.
- Live lecture captions for the whole room, then a study plan from what it heard.

## Thumbnail

`img/logo-1024-orange.png` (the mascot on the brand orange). Dark and grey versions are beside it.

## Gallery (in this order)

1. `img/cover-light.png`: logo, wordmark, pitch line.
2. `img/gallery-device.png`: the housing render with the parts list.
3. `img/gallery-how-it-works.png`: slap it on, read along, study what it heard.
4. `img/screen-splash.png`: the switch-on animation as the OLED shows it.
5. `img/gallery-inside.png`: the exploded housing.
6. Add real screenshots after these: the live caption page with two languages open, the knowledge graph, a flashcard, Practice, the Partner page. Phone photos of the real device on a desk beat the renders; put one first if you have it.

## Built with (tags)

esp32, c++, platformio, arduino, i2s, websockets, typescript, node.js, hono, react, react-router, vite, tailwind, postgresql, neon, drizzle, deepgram, google-translate, claude, fish-audio, openscad, 3d-printing, cloudflare-tunnel

## Links

- Try it: the public URL of the running app (judges open any class from the landing page, no sign-in).
- Code: the GitHub repository.
- Video: 2 to 3 minutes, see the outline at the end.

## Description

### Inspiration

Lecture halls are the one place where captions and translation would help the most people at once, and the one place that still has none. Students who are deaf or hard of hearing, international students following a lecture in their second or third language, and anyone sitting at the back all get the same thing: the lecturer's voice, once, at speed. The usual fix is a phone propped on the desk running a transcription app. That serves one student, drains one battery, and nobody actually gives up their phone for ninety minutes.

I wanted the room to be the unit, not the student. One cheap device at the front, and every laptop and phone in the room follows along. And since the device already has the whole lecture, it should do the boring study work afterwards too, following what the learning science actually says works: retrieval practice and spacing, not re-reading.

### What it does

**In the room.** The device sits on the lecturer's desk. Shake it (or press the orange REC button) and it wakes up, joins Wi-Fi and starts a session. Its screen shows a QR code; students scan it, pick a language, and captions stream to their screen as the lecturer speaks. Each student sees their own language: English, Japanese, Vietnamese and others. The class page shows who is watching and in which languages. There is no pairing and no sign-in; the device shows up in the app on its own.

**After the lecture.** Stopping the session runs the study pipeline on the transcript:

- An outline of the lecture, split into titled sections with timestamps.
- Concept notes with definitions, where each concept came up, and links between them, shown as an Obsidian-style knowledge graph. Node colour shows mastery, so weak spots are visible.
- Flashcards scheduled with FSRS spaced repetition.
- Practice questions in the style of the lecturer's examples, graded by the model as feedback, not a mark, including "how are X and Y related?" questions where the student draws the link.
- A recall check right after the session: three minutes to type everything you remember, compared against the transcript into got, missed and wrong. The misses feed the cards.
- Exam topics ranked by how much the lecturer emphasised them, a pretest before the next lecture, a one-page exam sheet, an announcements feed (deadlines and schedule changes mentioned in lecture), and a Today page that puts it together into a plan.
- "Ask the lecture": a question box over the transcript.
- Partner: a spoken study partner. Hold the button, answer out loud, and it grades you and asks the next question in a voice you pick.
- Export the whole class as an Obsidian vault.

Content is generated once per class and shared; only progress is per student.

### How I built it

**Hardware.** An ESP32-S3 DevKitC-1 reads an INMP441 I2S microphone and streams 16 kHz PCM over a single WebSocket to the server. A 2.42" SSD1309 OLED shows the join QR, the recording state and the latest caption; the server renders the frames and the device just draws them. An IMU turns a shake into "start"; a knock or a bump is ignored. The firmware is C++ on PlatformIO with the pioarduino core, U8g2 for the display and arduinoWebSockets for the stream. A Wokwi simulation of the display, button and Wi-Fi path let me test screens without the board.

**Housing.** A parametric OpenSCAD slab: tray, lid and button, screwless with six snap hooks, printed on a Bambu P2S in black PLA with no supports. Every connection is a female-to-female jumper from a module pin to a board pin, so there is no custom PCB.

**Server.** TypeScript end to end. A Node server on Hono and ws takes the device audio, forwards it to Deepgram for streaming speech-to-text with word timestamps, translates each caption with Google Translate, and fans the captions out to every browser on the session. Study jobs call Claude through the Anthropic SDK (OpenAI and Gemini backends exist too) with validated, persisted output per lecture; derived pages read from that bundle instead of calling the model again. Postgres on Neon with Drizzle. Fish Audio does the speech recognition and voices for Partner. ts-fsrs schedules the cards. A shared contracts package holds the device protocol, caption events and DTOs, so firmware, server and web app agree on one set of types.

**Web app.** React Router in framework mode, one file per page, rendered on the server first. Tailwind, Radix, react-force-graph for the knowledge graph. The caption page is captions only: full screen, dark, no navigation, the same on a phone and a laptop. The design is one orange on grey enamel in light mode and near-black in dark mode.

Every external backend has a mock, so the whole UI runs with no API keys, and a fake-device script streams a fixture lecture as the hardware would.

### Challenges

- **First time doing streaming or WebSockets.** The device-to-server audio path was the first thing I built on Saturday, and it stayed the simplest part of the system on purpose: one socket, raw PCM, the server decides when a session starts and stops.
- **Shake detection that ignores the desk.** A real shake has to count and a knock on the desk must not. The rule that worked: the acceleration must stay 0.4 g away from its recent average for 120 ms in total.
- **Wi-Fi on a phone hotspot.** The ESP32 is 2.4 GHz only, and the Mac and the board had to find each other on the hotspot. That cost more time than any line of code.
- **Soldering.** The mic boards and the OLED shipped without headers, so the week before the event was my first soldering. Twenty joints.
- **Keeping the LLM output trustworthy.** Every study job writes one validated bundle per lecture with a status, and the UI says plainly that grading is feedback and exam-topic ranking is a heuristic.

### Accomplishments

- A device, a housing and a full-stack app that work end to end, built by one person in 36 hours.
- Captions in three languages on every screen in the room, with no app install and no sign-in.
- Study features chosen from the evidence (retrieval practice, spacing, free recall, pretesting) rather than from what is easy to generate.
- Nothing lives only in a demo: the mocks, the fake device and the replay mode mean the whole product can be shown without hardware or keys.

### What I learned

- Design the demo order first. Study apps are a crowded category; the hardware and the live translated captions had to be the first sixty seconds, with the graph and practice as "and here is what it does with what it heard".
- One language end to end pays for itself. Shared types between firmware protocol, server and web app removed a whole class of bugs.
- The device should have one job. Every feature I was tempted to put on it belongs in the app.
- How to solder, how I2S works, and how much easier a hardware demo gets when the server renders the screen.

### What's next

- Offline captions: a local Whisper backend behind the same speech-to-text interface, so English captions work with no cloud at all.
- A Docker image for a small server, so a school can run one Slap for every room.
- More languages, and a lecturer view with questions from the room.
- A printed QR sticker and NFC tag on the case, so joining is a tap.
- Book and syllabus upload are in; next is matching the lecturer's examples to the textbook's exercises.

## Video outline (2 to 3 minutes)

1. 0:00 The device on a desk. Shake it. Screen wakes, mascot gets slapped, QR appears. (10 s)
2. 0:10 Scan with a phone, pick Japanese. Open the laptop on Vietnamese. Talk: captions appear on both, word by word. (40 s)
3. 0:50 The class page: who is watching, in which languages. (10 s)
4. 1:00 Stop the session. The lecture page fills in: outline, concepts, graph. Hover a term. (30 s)
5. 1:30 Flashcards, a practice question with feedback, the recall check. (30 s)
6. 2:00 Partner: answer out loud, it grades and asks the next one. (20 s)
7. 2:20 The housing opened: ESP32-S3, mic, OLED. "One device. The whole room." (15 s)
