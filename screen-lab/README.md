# Slap screen lab

A copy of the device's little screen that runs in a browser, filled with made-up data. Use it to try layouts, fonts, avatars and languages without the hardware.

Everything for it lives in this folder. Nothing here is used by the real device or the web app, so changing these files cannot break them.

## Open it

Double-click `index.html`. After a change to a file, refresh the page.

With an AI helper (Claude Code): open this `screen-lab` folder as the project and ask it to "open the screen lab". It starts a small local server, and the page then updates by itself whenever a file changes.

Without the AI, the same server from a terminal in this folder:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

then open http://localhost:4173.

## What is on the page

- **Left:** the list of screens. "On the device today" are the five the real device shows. "Ideas to play with" are examples to change or replace.
- **Middle:** the screen, enlarged, and below it a copy at about the real size (55 × 27 mm).
- **Right:** the made-up data (language, caption, class code, sound level…), the font, the avatar, and the display colour.
- **Top:** "All screens" shows every screen at once. "All languages" shows the current screen in all twelve languages. "Play" runs the clock, the sound level and the caption.

## What the real screen can and cannot do

- 128 pixels wide, 64 tall. That is all the room there is.
- Each pixel is either on or off. No grey, no colours, no see-through. Soft edges and thin lines turn blocky or vanish; the lab shows exactly that.
- Text smaller than about 10 px is hard to read. Chinese, Japanese, Korean, Hindi and Arabic need to be larger than English to stay readable.
- The glass is the size of a matchbox and people read it from across a desk. Check the real-size copy, not only the enlarged one.

## Change things

Ask the AI in plain words, for example:

- "Add a screen that shows the class code very large with the robot next to it."
- "Make the recording screen show three lines of caption instead of two."
- "Add a cat avatar, 24 pixels tall."
- "Add the font Press Start 2P from Google Fonts to the font menu."
- "Change the Japanese sample sentence to …"

Or edit the files yourself:

| File | What is in it |
| --- | --- |
| `screens.js` | The screens. One block per screen. |
| `sprites.js` | Avatars as pixel art: `#` is a lit pixel, `.` is off. |
| `data.js` | The made-up data, the sample sentence for each language, and the font menu. |
| `fonts/` | Font files you want to keep. |
| `index.html`, `lab.js`, `vendor/` | The lab itself. No need to touch these. |

### Avatars

Draw one in `sprites.js` with `#` and `.`, or use "Turn a picture into an avatar" on the page. Simple shapes with strong contrast work; photos mostly do not. A picture you convert is only kept until you refresh: press Copy and paste the result into `sprites.js` (or give it to the AI) to keep it.

### Fonts

- "Try a font file" loads a font until you refresh.
- To keep a font, put the file in `fonts/` and add a line to the `FONTS` list in `data.js`: `{ name: "My Font", file: "fonts/my-font.ttf" }`.
- A font from Google Fonts: `{ name: "Silkscreen", google: true }` (needs internet).

Fonts made of square pixels ("pixel" or "bitmap" fonts) stay sharp on this screen. Ordinary fonts get rough edges at small sizes.

Only fonts kept as files in `fonts/` can later be put on the real device. Fonts that come from this computer (Helvetica, Arial…) or from Google are for looking only, until someone adds the file.

## For whoever moves a screen to the real device

Each `draw(ctx, d)` uses plain Canvas 2D calls plus helpers with the same names and behaviour as `apps/api/src/oled.ts` (`font`, `wrapText`, `centered`, `fitFont`, `drawQr`, `mmss`), on the same black canvas with white ink and `textBaseline = "top"`, thresholded by the same `packXbm`. A draw function can be pasted into a `render(ctx => { … })` there with `d.…` swapped for real values. `drawSprite` and `spriteFit` exist only in the lab (`lab.js`) and would need to move too.

Two differences from the server:

- **Fonts.** The lab uses this computer's fonts, including its fallbacks for Chinese, Hindi, Arabic and so on. The server uses whatever is registered with `@napi-rs/canvas`. Text matches only when the same font file is registered there.
- **QR pattern.** The lab uses `vendor/qrcode.js` (qrcode-generator, MIT); the server uses the `qrcode` package. Both are valid codes for the same link, but the dot pattern and sometimes the size can differ.

## The data a screen receives

| Field | Meaning |
| --- | --- |
| `d.classCode` | Class code, e.g. `CS229` |
| `d.pairCode` | Six-character pairing code |
| `d.joinUrl` | The link the QR code points to |
| `d.caption` | The caption so far, in the chosen language (grows word by word while playing) |
| `d.fullCaption` | The whole caption |
| `d.lang` | `{ code, name, native, rtl }` of the chosen language |
| `d.seconds` | Seconds recorded |
| `d.level` | Sound level, 0 to 1 |
| `d.wifiOk` | Whether Wi-Fi is connected |
| `d.message` | Error message |
| `d.avatar` | Name of the avatar chosen on the page |
| `d.t` | Seconds since Play was pressed (0 when stopped); use it for animation |
