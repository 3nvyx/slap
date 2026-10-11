# OLED fonts

`src/oled.ts` registers these files with `@napi-rs/canvas` at import, under private family names (`OLED Sans`, `OLED CJK zh`, ...), and draws every frame with them. System fonts are never used: they differ per machine and the Docker image has none. A missing file throws at startup.

All fonts are under the SIL Open Font License 1.1, which allows redistribution. Each folder holds the licence text that came with its files; keep them together.

| Folder | Files | Draws | Version and source |
|---|---|---|---|
| `noto-sans/` | `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | Latin, including Vietnamese; all UI text | Noto Sans 2.015, unhinted TTF, from `notofonts/notofonts.github.io` (`fonts/NotoSans/unhinted/ttf/`, commit `578d18e`) |
| `fusion-pixel/` | `fusion-pixel-12px-proportional-{zh_hans,ja,ko}.otf.woff2` | Chinese, Japanese, Korean | Fusion Pixel Font 2026.09.25, from the release asset `fusion-pixel-font-12px-proportional-otf.woff2-v2026.09.25.zip` of `TakWolf/fusion-pixel-font`. It combines Ark Pixel, Cubic 11 and Galmuri; their licences are in `LICENSES/` |
| `noto-sans-sc-rare/` | `NotoSansSC-Regular.rare.woff2` | Han characters the pixel font lacks | Subset of Noto Sans SC 2.004 (see below) |
| `noto-sans-devanagari/` | `NotoSansDevanagari-Regular.ttf` | Hindi | Noto Sans Devanagari 2.007, unhinted TTF, same repository and commit as Noto Sans |
| `noto-sans-arabic/` | `NotoSansArabic-Regular.ttf` | Arabic | Noto Sans Arabic 2.013, unhinted TTF, same repository and commit |

About 3.6 MB in total. Unhinted and hinted Noto files give the same frames, so the smaller unhinted ones are used.

## Why a pixel font for Chinese, Japanese and Korean

On a 1-bit screen at 12 px, Noto Sans CJK outlines threshold into heavy, partly filled blobs. Fusion Pixel is drawn on a 12 px grid, so at exactly 12 px every stroke is one whole pixel. At any other size it blurs, so keep text in these scripts at 12 px. The three files have the same character set with different regional shapes for some Han characters (4,198 differ between the Chinese and Japanese files). `oled.ts` picks Japanese for text with kana, Korean for text with hangul, and Simplified Chinese otherwise.

Each file covers 19,219 of the 20,992 basic Han characters (U+4E00–9FFF), all kana and all 11,172 hangul syllables. It lacks 143 characters of GB 2312 (栾, 牦, 瘙, ...), 960 of Big5 and 36 of KS X 1001; JIS X 0208 is complete.

## The rare-Han subset

`NotoSansSC-Regular.rare.woff2` holds only the 1,783 Han characters (1,770 in U+4E00–9FFF, 13 in U+F900–FAFF) that Noto Sans SC has and Fusion Pixel 12px 2026.09.25 does not. They are listed in `unicodes.txt`. The full Noto Sans SC is 8.3 MB; this is 0.4 MB. It is a modified version under the OFL: glyph outlines and font names are unchanged, everything else is removed.

To rebuild it (fontTools 4.66.1 with brotli), from `Sans/SubsetOTF/SC/NotoSansSC-Regular.otf` of `notofonts/noto-cjk` (commit `165c01b`):

```bash
pyftsubset NotoSansSC-Regular.otf --unicodes-file=unicodes.txt --output-file=NotoSansSC-Regular.rare.woff2 --flavor=woff2 --layout-features='' --no-hinting --desubroutinize --name-IDs='*'
```

After updating Fusion Pixel, regenerate `unicodes.txt` (code points in U+4E00–9FFF and U+F900–FAFF that are in the Noto Sans SC cmap and not in the Fusion Pixel cmap) before rebuilding.

## Not covered

Han characters outside those two blocks that Fusion Pixel lacks (most of Extension A, all of Extension B and later), and scripts outside the app's twelve languages that Noto Sans does not have (Thai, Hebrew, emoji), draw as an empty box.
