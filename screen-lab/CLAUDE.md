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
| `fonts/` | Font files referenced from `FONTS`. |
| `lab.js`, `index.html` | The emulator and its page. Change only when the lab needs a new control or view. |
| `vendor/qrcode.js` | Third-party QR generator. Do not edit. |

## The display

- 128 × 64 pixels, each on or off. `lab.js` draws a screen on a black canvas with white ink, then lights every pixel whose brightness is at least 50%. Greys, gradients, opacity and anti-aliased edges all collapse to on or off.
- Physical size is 55 × 27 mm, read from across a desk. Judge legibility on the real-size copy under the main view.
- Latin text reads down to about 10 px. CJK, Devanagari and Arabic need about 12 px or more. At 11 px Helvetica a full-width line holds about 26 Latin characters.
- Thin strokes (1 px, or anti-aliased curves) can vanish. Use `lineWidth = 2` for outlines and whole-number coordinates for rectangles.
- Arabic is right-to-left: set `ctx.direction = "rtl"` and `ctx.textAlign = "right"` and draw from the right edge (see "Big caption").

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

Leave the five `TODAY` screens as they are: they mirror `apps/api/src/oled.ts`, and the designer compares new ideas against them. To propose a change to one, copy it into `IDEAS` under a new name.

`ctx` is a Canvas 2D context, already set to white fill and stroke with `textBaseline = "top"`. `d` is the mock data:

`d.classCode`, `d.pairCode`, `d.joinUrl`, `d.caption` (grows while Play runs), `d.fullCaption`, `d.lang` (`{ code, name, native, rtl }`), `d.seconds`, `d.level` (0–1), `d.wifiOk`, `d.message`, `d.avatar` (name of the chosen sprite), `d.t` (seconds since Play, 0 when stopped; drive animation from it).

Helpers (globals from `lab.js`):

| Helper | Does |
| --- | --- |
| `font(px, bold)` | Font string in the family chosen on the page. Always set `ctx.font` with it so the font menu applies. |
| `centered(ctx, text, y, x0 = 0, width = 128)` | Draws text centred in a horizontal span. |
| `fitFont(ctx, text, width, max, bold = true)` | Largest px size at which the text fits; also sets `ctx.font`. |
| `wrapText(ctx, text, maxWidth)` | Array of lines. Use `.slice(-n)` to keep the latest n. |
| `drawQr(ctx, text, x, y, box)` | QR code inside a square box; returns false if it cannot fit. |
| `mmss(seconds)` | `12:34`. |
| `drawSprite(ctx, name, x, y, scale = 1)` | Draws an avatar from `sprites.js`. |
| `spriteFit(name, boxW, boxH)` | `{ w, h, scale }` at the largest whole scale that fits. |
| `W`, `H` | 128, 64. |

Keep `draw` portable: synchronous, Canvas 2D calls and these helpers only. No DOM, no images loaded by URL, no reading the clock (use `d.t` and `d.seconds`). The same function later runs on the server under `@napi-rs/canvas`.

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

The page's "Turn a picture into an avatar" converts an image and shows the `sprite(…)` text. It is lost on refresh; paste it into `sprites.js` under a proper name to keep it.

## Fonts

Add an entry to `FONTS` in `data.js`:

- `{ name: "Helvetica" }` — installed on this computer.
- `{ name: "My Font", file: "fonts/my-font.ttf" }` — a file in `fonts/`.
- `{ name: "Silkscreen", google: true }` — loaded from Google Fonts by its exact name; needs internet.

Pixel/bitmap fonts drawn at their native size (or a whole multiple) stay crisp; outline fonts get ragged below about 12 px. Only fonts kept as files in `fonts/` can be shipped to the real device, so say so when the designer settles on a system or Google font. Before adding a downloaded font file, check that its licence allows redistribution and tell the designer what it is.

## Languages

`LANGUAGES` in `data.js` mirrors the web app's list. Each has a `sample` array of sentences used as the caption. The translations are placeholders and unverified. To test a script's rendering, switch the page to "All languages".
