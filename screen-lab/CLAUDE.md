# Screen lab

A browser emulator of the Slap device's screen (128 × 64, one colour), fed with mock data. The person you are working with is a designer on the team, not a programmer. They use this folder to try layouts, fonts, avatars and languages.

## Rules

- Edit files only inside `screen-lab/`. The rest of the repository belongs to another teammate who is working in it at the same time; any edit outside this folder risks a merge conflict. If a request needs a change elsewhere (the real device, the web app, the server), say so and stop there.
- No dependencies and no build step. Do not add a `package.json`, run `pnpm`/`npm install`, or introduce a bundler or framework. The page must keep working when `index.html` is opened by double-click, so scripts stay classic `<script src>` files (no ES modules, no `fetch` of local files).
- Commit only files under `screen-lab/`, and only when asked.
- Talk about what the screen shows, not about the code. After a change, look at the result in the browser yourself and describe or show it.

## Run it

Start the `screen-lab` launch configuration (`.claude/launch.json`: `python3 -m http.server 4173`), then open http://localhost:4173. Served this way the page reloads itself when `index.html`, `lab.js`, `data.js`, `sprites.js` or `screens.js` changes. Opened as a file it needs a manual refresh.

A broken file shows a red bar at the top of the page with the error text. Check for it after every edit.

## Files

| File | Role |
| --- | --- |
| `screens.js` | The screens. Most requests are edits here. |
| `sprites.js` | Avatars as pixel art. |
| `data.js` | `MOCK` (starting values of the controls), `FONTS` (font menu), `LANGUAGES` (12 languages with a sample caption each). |
| `fonts/` | Font files referenced from `FONTS`. `fonts/device` is a link to `apps/api/fonts`, the files the server draws with; do not replace it with copies. |
| `lab.js`, `index.html` | The emulator and its page. Change only when the lab needs a new control or view. |
| `vendor/qrcode.js` | Third-party QR generator. Do not edit. |

## The display

- 128 × 64 pixels, each on or off. `lab.js` draws a screen on a black canvas with white ink, then lights every pixel whose brightness is at least 50%. Greys, gradients, opacity and anti-aliased edges all collapse to on or off.
- Physical size is 55 × 27 mm, read from across a desk. Judge legibility on the real-size copy under the main view.
- Latin text reads down to about 10 px. CJK, Devanagari and Arabic need about 12 px or more. At 11 px Helvetica a full-width line holds about 26 Latin characters.
- Thin strokes (1 px, or anti-aliased curves) can vanish. Use `lineWidth = 2` for outlines and whole-number coordinates for rectangles.
- The device's font is Noto Sans (first in the font menu). Chinese, Japanese, Korean, Hindi and Arabic are drawn with the device's own fonts for those scripts whatever the menu says; `font(px, bold, text)` builds the list from the text. The Chinese, Japanese and Korean font is a pixel font, sharp at exactly 12 px and blurred at any other size.
- The scripts differ in height around the same baseline. At 15 px Latin reaches 14 rows above it (accented capitals) and 4 below; Hindi 14 and 5; Arabic 19 and 7. `captionStyle` in `screens.js` holds the sizes that keep three lines clear of the strip under the caption.
- Arabic is right-to-left: draw it with `paragraph`, which sets the direction and the right edge.

## Add or change a screen

```js
screen({
  name: "Class code, huge",          // shown in the list; must be unique
  group: IDEAS,                       // TODAY = what the device shows now, IDEAS = everything new
  note: "One line saying when this screen appears.",
  led: true,                          // optional: light the red recording LED on the mock-up
  draw(ctx, d) {
    ctx.font = font(fitFont(ctx, d.classCode, 124, 40), true);
    centered(ctx, d.classCode, 12);
  },
});
```

Leave the six `TODAY` screens as they are: they mirror `apps/api/src/oled.ts`, and the designer compares new ideas against them. To propose a change to one, copy it into `IDEAS` under a new name.

`ctx` is a Canvas 2D context, already set to white fill and stroke with `textBaseline = "top"`. `d` is the mock data:

`d.classCode`, `d.pairCode`, `d.joinUrl`, `d.caption` (grows while Play runs), `d.fullCaption`, `d.lang` (`{ code, name, native, rtl }`), `d.seconds`, `d.level` (0–1), `d.wifiOk`, `d.message`, `d.avatar` (name of the chosen sprite), `d.mascot` (name of the chosen mascot face), `d.t` (seconds since Play, 0 when stopped; drive animation from it).

Helpers (globals from `lab.js`):

| Helper | Does |
| --- | --- |
| `font(px, bold, text = "")` | Font string in the family chosen on the page, followed by the device's fonts for other scripts. Always set `ctx.font` with it so the font menu applies; pass the text when it may not be Latin. |
| `centered(ctx, text, y, x0 = 0, width = 128)` | Draws text centred in a horizontal span. |
| `fitFont(ctx, text, width, max, bold = true)` | Largest px size at which the text fits; also sets `ctx.font`. |
| `wrapText(ctx, text, maxWidth)` | Array of lines. Use `.slice(-n)` to keep the latest n. |
| `paragraph(ctx, text, lines, baseline, pitch, inset = 1)` | Draws wrapped lines from the left edge, or from the right for Arabic. `baseline` is the y of the first line's baseline. Use it for captions and messages. |
| `drawQr(ctx, text, x, y, box)` | QR code inside a square box; returns false if it cannot fit. |
| `mmss(seconds)` | `12:34`. |
| `drawSprite(ctx, name, x, y, scale = 1)` | Draws an avatar from `sprites.js`. |
| `spriteFit(name, boxW, boxH)` | `{ w, h, scale }` at the largest whole scale that fits. |
| `W`, `H` | 128, 64. |

Leave `ctx.textBaseline` as `"top"` and give `fillText` the y of the text's top edge. The lab moves `"top"` text to where the server's canvas library puts it (`matchServerText` in `lab.js`). The server takes that offset from the font of the text's first character, so a "top" line starting with a digit sits 5 px higher than an Arabic line beside it. Text that can be in any language goes through `paragraph`, which uses the baseline and is the same in the lab and on the server.

Keep `draw` portable: synchronous, Canvas 2D calls and these helpers only. No DOM, no images loaded by URL, no reading the clock (use `d.t` and `d.seconds`). The same function later runs on the server under `@napi-rs/canvas`.

## Live sound and real size (`lab.js`)

- "Use this laptop's microphone" replaces `d.level` with the microphone's level: loudest 85 ms of each 200 ms frame, on the server's scale (`micMeter`, the same formula as `meter` in `apps/api/src/ws/device.ts`). It also starts Play. Stopping Play stops the microphone.
- "Write what I say as the caption" replaces `d.caption` with the browser's speech-to-text (Web Speech API; Chrome and Safari only; the sound goes to the browser vendor's service). Empty until something is heard, as on the server; the "Recording" screen then shows its large timer and "Listening...".
- A `draw` needs nothing special for either: it reads `d.level` and `d.caption` as before.
- The "Real size" view draws the housing from `hardware/housing` (v2.3: 104.5 × 56 mm body, 63.4 × 40.4 mm glass window, 55 × 27.5 mm lit area, 12 mm button, 3 mm LED, 8 × 7 grille). Every length is `calc(mm * var(--mm))`; `--mm` is `state.pxPerMm`, set by the card outline. The lit area is centred in the glass because its real offset is not measured. Button, LED and grille positions are read off the housing preview, good to about a millimetre.
- The last converted picture is kept in this browser's storage and comes back as the avatar `imported`. It is still not in the files.

A new field of mock data needs three edits: a default in `MOCK` (`data.js`), the key added to `DATA_KEYS` and `mockData()` in `lab.js`, and a control with `data-key="…"` in `index.html`.

## Avatars

```js
sprite("cat", `
.#....#.
.##..##.
########
#.####.#
########
.##..##.
`);
```

One row of text per pixel row; `#` is lit, `.` is off; every row the same length; at most 64 rows and 128 columns. Whole-number `scale` only. For an avatar that moves, draw it with canvas shapes in `screens.js` and animate from `d.t` and `d.level` (see `drawFace`).

### The mascot

The mascot follows the designer's own pencil sketches: a box head with a face in it, no body. `cat` is the one the designer calls "the mascot": a box about 1.5 times as wide as tall with two open-triangle cat ears on its top edge, two outlined round eyes joined by a thin bar (like glasses), and an outlined square mouth low in the box. Three earlier sketches are kept as other faces: `round` (outlined round eyes, wide outlined flat mouth), `odd` (a big outlined rectangle for the left eye, a small outlined square for the right, an outlined triangle mouth), `tall` (tall rounded outlined eyes with a band across the top, small filled square mouth).

Per face, `sprites.js` holds six layers on one grid: `mascot/NAME/head`, `/eyes`, `/blink`, `/quiet`, `/half`, `/open` (`cat` is 26 × 21 with the ears in rows 0–3; the others 26 × 20). There is no shared head layer. `drawMascot(ctx, d, x, y, w, h, asleep, face)` in `screens.js` centres the face in the area at the largest whole scale (`spriteFit` on the head layer), then draws the head, one eye layer (blink from `d.t`) and one mouth layer (from `d.level`). `face` defaults to `d.mascot`, the "Mascot face" menu, which lists every NAME that has an `eyes` layer. A face the browser has not shown before is selected automatically on load (`state.mascotSeen`). The whole display gives scale 3, a 54-wide column beside a caption gives scale 2. Stay close to the sketches' proportions unless the designer asks otherwise. Any sprite whose name contains `/` is a part and is hidden from the Avatar menu.

When the designer asks to change the mascot, redraw the layers and keep them the same size. A new expression is a new layer plus a line in `drawMascot`. Shapes are solid on purpose: a line one pixel thick is hard to see at real size. Show the result on the "Mascot face" screen and in "Real size".

An earlier reference was another artist's illustration of a monitor-headed character. Do not trace or reproduce a reference picture that is not the team's own; say so if asked to.

The page's "Turn a picture into an avatar" converts an image and shows the `sprite(…)` text. This browser remembers the last one across refreshes, but it is not in the files; paste it into `sprites.js` under a proper name to keep it.

## Fonts

Add an entry to `FONTS` in `data.js`:

- `{ name: "Noto Sans", file: "fonts/device/…Regular.ttf", bold: "fonts/device/…Bold.ttf" }` — the device's font, first in the list. `bold` is optional for any file font; without it the browser thickens the regular face.
- `{ name: "Helvetica" }` — installed on this computer.
- `{ name: "My Font", file: "fonts/my-font.ttf" }` — a file in `fonts/`.
- `{ name: "Silkscreen", google: true }` — loaded from Google Fonts by its exact name; needs internet.

Pixel/bitmap fonts drawn at their native size (or a whole multiple) stay crisp; outline fonts get ragged below about 12 px. Only fonts kept as files in `fonts/` can be shipped to the real device, so say so when the designer settles on a system or Google font. Before adding a downloaded font file, check that its licence allows redistribution and tell the designer what it is.

## Languages

`LANGUAGES` in `data.js` mirrors the web app's list. Each has a `sample` array of sentences used as the caption. The translations are placeholders and unverified. To test a script's rendering, switch the page to "All languages".
