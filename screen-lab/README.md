# Slap screen lab

A copy of the device's little screen that runs in a browser, filled with made-up data. Use it to try layouts, fonts, avatars and languages without the hardware.

Everything for it lives in this folder. Nothing here is used by the real device or the web app, so changing these files cannot break them.

## Open it

Double-click `index.html` in Finder so it opens in your browser. After a change to a file, refresh the page.

(Opening the file inside Claude's own file preview does not work: it shows the page without starting it. Use the server below instead.)

With an AI helper (Claude Code): open this `screen-lab` folder as the project and ask it to "open the screen lab". It starts a small local server, and the page then updates by itself whenever a file changes.

Without the AI, the same server from a terminal in this folder:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

then open http://localhost:4173.

## What is on the page

- **Left:** the list of screens. "On the device today" are the six the real device shows: the picture while it switches on, listening, captions, the language name after a tilt, saved, and an error. (Between the picture and listening it shows "Joining Wi-Fi" and "Connecting", which the device draws itself.) "Ideas to play with" are examples to change or replace.
- **Middle:** the screen, enlarged, and below it a copy at about the real size (55 × 27 mm).
- **Right:** the made-up data (language, caption, class code, sound level…), the font, the avatar, and the display colour.
- **Top:** "All screens" shows every screen at once. "All languages" shows the current screen in the device's three languages: English, Vietnamese and Japanese. "Real size" shows the device as large as the real one. "Play" runs the clock, the sound level and the caption.

## Try it with real sound

No device needed: the laptop's microphone stands in for it.

1. Open the lab in Chrome or Safari at http://localhost:4173 (the browser inside the Claude app has no microphone).
2. Under "Live sound" on the right, press "Use this laptop's microphone" and allow it when the browser asks.
3. Talk. The sound level on the screen now follows your voice, and so does anything that reacts to sound (the level bar, the face's mouth, the hopping avatar).
4. Tick "Write what I say as the caption" to see your own words on the screen. Speak the language chosen under "Language". For this the browser sends the sound to its own speech service (Google in Chrome, Apple in Safari).

The laptop's microphone is not the device's, so how loud "loud" is will differ on the real thing. The bar uses the same scale as the server.

## See it at its real size

"Real size" at the top shows the whole device (104.5 × 56 mm) with its 55 × 27 mm screen. A laptop does not know how large its own screen is, so set it once: open "Make the size exact on this laptop screen", hold a bank card against the dashed outline, and drag the slider until they match. No card: the outline should measure 85.6 mm across with a ruler. Redo it if you zoom the page or move the window to another monitor.

After that the small copy under the enlarged screen is exact too. Put the laptop where the device would sit and step back to a student's distance. The microphone keeps working in this view.

Where the lit area sits inside the glass is not measured yet; the lab centres it.

## What the real screen can and cannot do

- 128 pixels wide, 64 tall. That is all the room there is.
- Each pixel is either on or off. No grey, no colours, no see-through. Soft edges and thin lines turn blocky or vanish; the lab shows exactly that.
- Text smaller than about 10 px is hard to read. Japanese needs 12 px.
- Japanese is drawn with the device's own pixel font, which is sharp at exactly 12 px (and at 24 px) and blurred at any other size. Keep Japanese text at 12 px.
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

Draw one in `sprites.js` with `#` and `.`, or use "Turn a picture into an avatar" on the page. Simple shapes with strong contrast work; photos mostly do not. The converted picture is remembered by this browser only (it comes back after a refresh, as the avatar called "imported"). To keep it for good and for teammates, press Copy and paste the result into `sprites.js`, or give it to the AI.

To watch an avatar live, pick the "Avatar + caption" screen, turn on the microphone and open "Real size".

### The mascot

The mascot comes from the designer's pencil sketches: a box for a head with a face in it. The eyes blink and the mouth grows with the sound. See it on the "Mascot face", "Mascot + caption", "Mascot ready" and "Mascot asleep" screens. Drag "Sound level" to move its mouth, or turn on the microphone and talk.

`cat` is the mascot. The other faces are earlier sketches, kept to compare ("Mascot: both sketches" shows two of them side by side). Choose a face under "Mascot" on the right:

| Face | What it looks like |
| --- | --- |
| `cat` | A box with two cat ears, round eyes joined by a bar, square mouth |
| `round` | Round eyes, wide flat mouth |
| `odd` | One big eye, one small eye, triangle mouth |
| `tall` | Tall rounded eyes with a band across the top, small square mouth |

Each face is drawn in `sprites.js` as six layers on one grid, like sheets of tracing paper:

| Layer | What it is |
| --- | --- |
| `mascot/NAME/head` | The box around the face, with the ears if it has any |
| `mascot/NAME/eyes`, `mascot/NAME/blink` | Eyes open, eyes shut |
| `mascot/NAME/quiet`, `mascot/NAME/half`, `mascot/NAME/open` | The mouth when it is quiet, for soft sound, for loud sound |

`NAME` is the face (`cat`, `round`, `odd`, `tall`). A new face is six more layers under a new name; it then appears in the menu by itself and the page switches to it. The six layers of one face must be the same size, or the parts slide out of place (`cat` is 26 pixels wide and 21 tall, the others 26 by 20). A screen gives the mascot an area and it is drawn there as large as fits: 3 times its size on the whole display, 2 times beside a caption.

The face can show anything that fits: hearts for eyes, a sound wave for a mouth, a wink. To change it, ask the AI in plain words ("bigger eyes", "add a surprised mouth for very loud sound", "make it wink"), send it a sketch, or change the `#` and `.` yourself.

The character is the team's own drawing. Pictures by other artists can inspire it, but should not be copied into the product.

### Fonts

- Noto Sans, first in the menu, is the device's own font: the very files its server draws with (the `fonts/device` folder is a link to them). Japanese always uses the device's pixel font, whatever the menu says.
- "Try a font file" loads a font until you refresh.
- To keep a font, put the file in `fonts/` and add a line to the `FONTS` list in `data.js`: `{ name: "My Font", file: "fonts/my-font.ttf" }`.
- A font from Google Fonts: `{ name: "Silkscreen", google: true }` (needs internet).

Fonts made of square pixels ("pixel" or "bitmap" fonts) stay sharp on this screen. Ordinary fonts get rough edges at small sizes.

Only fonts kept as files in `fonts/` can later be put on the real device. Fonts that come from this computer (Helvetica, Arial…) or from Google are for looking only, until someone adds the file.

## For whoever moves a screen to the real device

Each `draw(ctx, d)` uses plain Canvas 2D calls plus helpers with the same names and behaviour as `apps/api/src/oled.ts` (`font`, `wrapText`, `centered`, `fitFont`, `mmss`), on the same black canvas with white ink and `textBaseline = "top"`, thresholded by the same `packXbm`. A draw function can be pasted into a `render(ctx => { … })` there with `d.…` swapped for real values. `drawSprite` and `spriteFit` exist only in the lab (`lab.js`) and would need to move too.

How close the lab is to the server (checked on 10 October against `@napi-rs/canvas` 0.1.100 on a Mac, with the device's fonts):

- **Text position and line breaks match.** The lab loads the server's own font files and builds the same font list (`families` in `lab.js`). The five current screens were rendered both ways in the three languages and compared pixel by pixel: line breaks are the same, and 30 to 190 of the 8,192 pixels differ per screen, all single pixels on letter edges.
- **`textBaseline = "top"` is copied, with one limit.** `@napi-rs/canvas` puts "top" text at an offset taken from the font of the text's first character; `matchServerText` in `lab.js` copies that for the font chosen on the page. The five current screens place text by its baseline instead, as the server does, where the lab and the server agree without any correction.
- **Other fonts are close, not exact.** For a Google or file font the lab estimates the offset; expect text to sit up to 2 px off until the font is registered on the server and measured.

## The data a screen receives

| Field | Meaning |
| --- | --- |
| `d.classCode` | Class code, e.g. `CS229` |
| `d.joinUrl` | The link the QR code points to |
| `d.caption` | The caption so far, in the chosen language (grows word by word while playing; your own words when "Write what I say" is on) |
| `d.fullCaption` | The whole caption |
| `d.lang` | `{ code, name, native, rtl }` of the chosen language |
| `d.seconds` | Seconds recorded |
| `d.level` | Sound level, 0 to 1 (the microphone's when it is on) |
| `d.wifiOk` | Whether Wi-Fi is connected |
| `d.message` | Error message |
| `d.avatar` | Name of the avatar chosen on the page |
| `d.mascot` | Name of the mascot face chosen on the page |
| `d.t` | Seconds since Play was pressed (0 when stopped); use it for animation |
