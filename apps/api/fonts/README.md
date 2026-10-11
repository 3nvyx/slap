# OLED fonts

`src/oled.ts` registers these files with `@napi-rs/canvas` at import, under private family names (`OLED Sans`, `OLED CJK ja`), and draws every frame with them. System fonts are never used: they differ per machine and the Docker image has none. A missing file throws at startup.

The device shows captions in three languages: English, Vietnamese and Japanese. Both fonts are under the SIL Open Font License 1.1, which allows redistribution. Each folder holds the licence text that came with its files; keep them together.

| Folder | Files | Draws | Version and source |
|---|---|---|---|
| `noto-sans/` | `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | English and Vietnamese; all UI text | Noto Sans 2.015, unhinted TTF, from `notofonts/notofonts.github.io` (`fonts/NotoSans/unhinted/ttf/`, commit `578d18e`) |
| `fusion-pixel/` | `fusion-pixel-12px-proportional-ja.otf.woff2` | Japanese | Fusion Pixel Font 2026.09.25, from the release asset `fusion-pixel-font-12px-proportional-otf.woff2-v2026.09.25.zip` of `TakWolf/fusion-pixel-font`. It combines Ark Pixel, Cubic 11 and Galmuri; their licences are in `LICENSES/` |

About 1.5 MB in total. Unhinted and hinted Noto files give the same frames, so the smaller unhinted ones are used.

## Why a pixel font for Japanese

On a 1-bit screen at 12 px, Noto Sans CJK outlines threshold into heavy, partly filled blobs. Fusion Pixel is drawn on a 12 px grid, so at exactly 12 px (and whole multiples: the language banner uses 24 px) every stroke is whole pixels. At any other size it blurs. The file covers all kana and JIS X 0208 (the 6,355 kanji in everyday use); a rarer kanji draws as an empty box.

## Adding a language

A language needs a font that covers its script, an entry in `FONT_FILES` and the fallback list in `families()` (`src/oled.ts`), a `captionStyle` size whose lines stay within rows 0-53, and its code in `DEVICE_LANGS` (`packages/contracts`). The same release of Fusion Pixel has Simplified Chinese and Korean files. Scripts that sit at another height around the baseline than Latin (Devanagari, Arabic) need their own size and first baseline; Arabic also needs right-to-left lines.
