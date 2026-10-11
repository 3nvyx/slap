# Slap website

The public page that explains Slap: what it is, how to use it, what the study app does, the device, and common questions.

Everything for it lives in this folder. Nothing here is used by the real device or the web app, so changing these files cannot break them. There is nothing to install.

## Open it

Double-click `index.html`. After a change to a file, refresh the page.

With an AI helper (Claude Code): ask it to "open the website". It starts the `website` preview at http://localhost:4174.

Without the AI, from a terminal in this folder:

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

## What is where

| File | What it holds |
| --- | --- |
| `index.html` | All the words on the page, section by section, top to bottom. |
| `style.css` | How it looks. The colours and fonts are the short list at the very top. |
| `site.js` | What moves: the device screen, the caption demo and its translations, the lists that open and close, the Conversation side bar. |
| `img/` | Pictures of the device (copies of `hardware/housing/preview/assembled_black.png` and `exploded.png`). |
| `vendor/qrcode.js` | Third-party QR code maker (MIT licence). Do not edit. |

## Not connected to the app yet

The "Sign in" links in the footer need the web address of the Slap app. Put it in `APP_URL` at the top of `site.js`, for example `"https://slap.example"`. Until then they stay hidden.

## Left out on purpose

The page has no customer reviews, press mentions, sales numbers or shop button, because Slap does not have them yet. Add those sections when there is something real to show.

The translated sentences in the caption demo (`LINES` in `site.js`) were written by hand and should be checked by a native speaker of each language before the page goes public.

## The Conversation side bar

The black "Conversation" tab on the right edge opens a side bar that listens through the microphone, writes down what is said, and sorts it into turns.

- It only listens in Chrome and Safari, and the browser asks for permission first. The browser inside the Claude app has no microphone: use "Play an example" there.
- The browser cannot tell voices apart. The "Who is speaking" buttons decide whether the words are filed under Professor or Student. A pause of 2.5 seconds, or a change of speaker, starts a new turn.
- To turn sound into text the browser sends it to its own speech service (Google in Chrome, Apple in Safari). The page itself saves nothing.
- The example conversation is `EXAMPLE` in `site.js`.
