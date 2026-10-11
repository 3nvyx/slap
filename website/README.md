# Slap website

The public page that explains Slap: what it is, how to use it, what the study app does, the device, and common questions.

Everything for it lives in this folder. Nothing here is used by the real device or the web app, so changing these files cannot break them. There is nothing to install.

It is the front page of the Slap app: the app's server shows this folder at `/`, and the app's own pages (`/demo`, `/classes`, ...) sit behind it at the same address.

## Open it

With the app running, open http://localhost:8787 (`pnpm dev`) or http://localhost:5173 (`pnpm dev:web`). After a change to a file, refresh the page.

On its own, without the app: double-click `index.html`, or ask an AI helper (Claude Code) to "open the website" (the `website` preview, http://localhost:4174), or from a terminal in this folder:

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

On its own the page has no app behind it, so the "Demo" and "Open the app" buttons stay hidden.

## What is where

| File | What it holds |
| --- | --- |
| `index.html` | All the words on the page, section by section, top to bottom. |
| `style.css` | How it looks. The colours and fonts are the short list at the very top. |
| `site.js` | What moves: the device screen, the caption demo and its translations, the lists that open and close, the Conversation side bar. |
| `img/` | Pictures of the device (copies of `hardware/housing/preview/assembled_black.png` and `exploded.png`). |
| `vendor/qrcode.js` | Third-party QR code maker (MIT licence). Do not edit. |

## The logo

The drawing in the top bar and the footer (the mascot being slapped) is traced from the last frame of the device's switch-on animation, `screen/splash/6` in `screen-lab/sprites.js`, keeping only the mascot and the hand. It sits once near the top of `index.html` as `<symbol id="logo-art">`, one square per pixel. If the animation is redrawn, ask an AI helper to "retrace the website logo from the splash frame".

## Buttons into the app

"Demo" (next to "How it works") opens `/demo`: every device that is recording right now. "Open the app" in the top bar and "Classes" in the footer open `/classes`. Any link with `data-app="/some/page"` works the same way, and `data-app-block` hides an element until the app is found.

The page finds the app by asking its own address for `/api/health`. Only if the page is ever hosted somewhere else than the app, put the app's address in `APP_URL` at the top of `site.js`, for example `"https://slap.example"`.

## Left out on purpose

The page has no customer reviews, press mentions, sales numbers or shop button, because Slap does not have them yet. Add those sections when there is something real to show.

The translated sentences in the caption demo (`LINES` in `site.js`) were written by hand and should be checked by a native speaker of each language before the page goes public.

## The Conversation side bar

The black "Conversation" tab on the right edge opens a side bar that listens through the microphone, writes down what is said, and sorts it into turns.

- It only listens in Chrome and Safari, and the browser asks for permission first. The browser inside the Claude app has no microphone: use "Play an example" there.
- The browser cannot tell voices apart. The "Who is speaking" buttons decide whether the words are filed under Professor or Student. A pause of 2.5 seconds, or a change of speaker, starts a new turn.
- To turn sound into text the browser sends it to its own speech service (Google in Chrome, Apple in Safari). The page itself saves nothing.
- The example conversation is `EXAMPLE` in `site.js`.
