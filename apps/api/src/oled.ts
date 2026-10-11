// Server-side OLED rendering: draw on a 128x64 canvas, threshold to 1 bit, pack as XBM
// (row-major, 16 bytes per row, LSB = leftmost pixel, 1 = lit) for U8g2 drawXBM on the device.
// The device has three server screens: recording (captions), the language banner, and "Saved".
// Everything before the server is reached (Wi-Fi, connecting) is drawn by the firmware itself.
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { DEVICE_LANGS, OLED_FRAME_BYTES, OLED_HEIGHT as H, OLED_WIDTH as W, type DeviceLang } from "@slap/contracts";

// The fonts ship in ../fonts (SIL OFL 1.1, sources in fonts/README.md) and are registered under private
// names, so a frame is the same on every host: system fonts differ per machine, and the Docker image has none.
// Noto Sans draws English and Vietnamese; Fusion Pixel 12px draws Japanese.
const FONT_FILES = {
  "OLED Sans": ["noto-sans/NotoSans-Regular.ttf", "noto-sans/NotoSans-Bold.ttf"],
  "OLED CJK ja": ["fusion-pixel/fusion-pixel-12px-proportional-ja.otf.woff2"],
};
for (const [family, files] of Object.entries(FONT_FILES)) {
  for (const file of files) {
    const path = fileURLToPath(new URL(`../fonts/${file}`, import.meta.url));
    if (!GlobalFonts.registerFromPath(path, family)) throw new Error(`OLED font not loaded: ${path}`);
  }
}

const CJK = /[⺀-鿿豈-﫿＀-￯]/;
const NO_LINE_START = /[、。，．！？：；）」』】〉》,.!?:;)]/;

/** Font list for drawing `text`: Noto Sans, with the pixel font for Japanese. Text that has Japanese in it leads
 *  with the pixel font instead, so every glyph of the line sits on whole pixels (it is drawn for 12 px and its
 *  whole multiples; other sizes blur). */
function families(text: string): string {
  return CJK.test(text) ? `"OLED CJK ja", "OLED Sans"` : `"OLED Sans", "OLED CJK ja"`;
}
const font = (px: number, bold = false, text = "") => `${bold ? "bold " : ""}${px}px ${families(text)}`;

/** Packs RGBA pixels into XBM bits: a pixel is lit when its red channel is >= threshold. */
export function packXbm(rgba: Uint8Array | Uint8ClampedArray, width = W, height = H, threshold = 128): Uint8Array {
  const stride = Math.ceil(width / 8);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4]! >= threshold) out[y * stride + (x >> 3)]! |= 1 << (x & 7);
    }
  }
  return out;
}

/** Runs `draw` on a black canvas with white ink and returns the packed frame. Text is placed by its baseline
 *  (textBaseline "alphabetic"): with "top" the canvas takes the offset from the font of the text's first
 *  character, so a Japanese line starting with a digit would sit at a different height from its neighbours. */
export function render(draw: (ctx: SKRSContext2D) => void): Uint8Array {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  draw(ctx);
  const frame = packXbm(ctx.getImageData(0, 0, W, H).data);
  if (frame.length !== OLED_FRAME_BYTES) throw new Error("bad frame size");
  return frame;
}

/** Greedy word wrap by measured width; words longer than a line are split by characters (Japanese has no
 *  spaces and wraps this way), never leaving closing punctuation at the start of a line. */
export function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (ctx.measureText(word).width > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut--;
      if (cut > 1 && NO_LINE_START.test(word[cut]!)) cut--;   // closing punctuation stays with the character before it
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws `text` centred in a horizontal span, on baseline y. */
function centered(ctx: SKRSContext2D, text: string, y: number, x0 = 0, width = W) {
  ctx.fillText(text, x0 + Math.max(0, (width - ctx.measureText(text).width) / 2), y);
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Caption type on the recording screen, sized so the lines' ink stays within rows 0-53: Japanese at the pixel
 *  font's 12 px (four lines), English and Vietnamese at 15 px (three lines). `base` is the first line's baseline. */
function captionStyle(text: string) {
  return CJK.test(text) ? { px: 12, pitch: 14, lines: 4, base: 11 } : { px: 15, pitch: 18, lines: 3, base: 14 };
}

/** Bottom strip of the recording screen (rows 55-62): sound level growing from the left, then the caption
 *  language and the elapsed time. */
function recordingFooter(ctx: SKRSContext2D, seconds: number, level: number, lang: DeviceLang) {
  ctx.font = font(10, true);
  const t = `${lang.toUpperCase()} ${mmss(seconds)}`, tw = Math.ceil(ctx.measureText(t).width);
  ctx.fillText(t, W - tw, 63);
  const w = W - tw - 5;
  ctx.fillRect(0, 61, w, 1);
  ctx.fillRect(0, 58, Math.round(clamp01(level) * w), 4);
}

/** The caption fills the screen; the sound level, language and timer are a thin strip under it. With no caption
 *  yet (`caption` empty) the timer is large instead. level is 0..1 (already perceptually scaled by the caller). */
export function renderRecording(seconds: number, level: number, caption: string, lang: DeviceLang = "en"): Uint8Array {
  return render(ctx => {
    if (!caption.trim()) {
      ctx.font = font(26, true);
      centered(ctx, mmss(seconds), 21);
      ctx.font = font(13);
      centered(ctx, "Listening...", 39);
      ctx.fillRect(0, 53, W, 1);
      ctx.fillRect(0, 62, W, 1);
      ctx.fillRect(0, 53, 1, 10);
      ctx.fillRect(W - 1, 53, 1, 10);
      ctx.fillRect(2, 55, Math.round(clamp01(level) * (W - 4)), 6);
      return;
    }
    const style = captionStyle(caption);
    ctx.font = font(style.px, false, caption);
    wrapText(ctx, caption, W - 2).slice(-style.lines).forEach((l, i) => ctx.fillText(l, 1, style.base + i * style.pitch));
    recordingFooter(ctx, seconds, level, lang);
  });
}

export const LANG_NAMES: Record<DeviceLang, string> = { en: "English", vi: "Tiếng Việt", ja: "日本語" };

/** Shown for a moment after the device is tilted: the new caption language, large, and where it sits among
 *  the three (the chosen one on a lit box). Tilting left moves left in that row, right moves right. */
export function renderLanguage(lang: DeviceLang): Uint8Array {
  return render(ctx => {
    const name = LANG_NAMES[lang];
    ctx.font = CJK.test(name) ? font(24, false, name) : font(20, true);
    centered(ctx, name, 30);
    const cell = 30, x0 = (W - cell * DEVICE_LANGS.length) / 2;
    DEVICE_LANGS.forEach((l, i) => {
      const x = x0 + i * cell;
      ctx.font = font(11, true);
      if (l === lang) {
        ctx.fillRect(x + 2, 46, cell - 4, 16);
        ctx.fillStyle = "#000";
      }
      centered(ctx, l.toUpperCase(), 58, x, cell);
      ctx.fillStyle = "#fff";
    });
    // Arrowheads at the edges: there is something to the left or right.
    const arrow = (x: number, dir: 1 | -1) => { for (let i = 0; i < 5; i++) ctx.fillRect(x + dir * i, 54 - i, 1, 1 + 2 * i); };
    if (lang !== DEVICE_LANGS[0]) arrow(4, 1);
    if (lang !== DEVICE_LANGS.at(-1)) arrow(W - 5, -1);
  });
}

/** One large line with a hint under it. */
export function renderNotice(big: string, small: string): Uint8Array {
  return render(ctx => {
    ctx.font = font(24, true);
    centered(ctx, big, 30);
    ctx.font = font(12, false, small);
    centered(ctx, small, 52);
  });
}

/** After a recording ended, until the device goes to sleep. */
export function renderSaved(seconds: number): Uint8Array {
  return renderNotice("Saved", `${mmss(seconds)} · see the app`);
}

/** A problem: the first line is the title, on a lit bar; the rest wraps under it (three lines at most). */
export function renderText(lines: string[]): Uint8Array {
  return render(ctx => {
    const [title = "", ...body] = lines;
    ctx.fillRect(0, 0, W, 17);
    ctx.fillStyle = "#000";
    ctx.font = font(13, true, title);
    ctx.fillText(title, 3, 13);
    // Dark text on a lit bar loses its half-covered edge pixels to the threshold; a hairline outline restores the weight.
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.8;
    ctx.strokeText(title, 3, 13);
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    let row = 0;
    for (const text of body) {
      ctx.font = font(12, false, text);
      const wrapped = wrapText(ctx, text, W - 2).slice(0, 3 - row);
      wrapped.forEach((l, i) => ctx.fillText(l, 1, 29 + (row + i) * 15));
      row += wrapped.length;
    }
  });
}

/** Terminal preview of a frame (two pixel rows per character) for scripts and debugging. */
export function frameToAscii(frame: Uint8Array): string {
  const lit = (x: number, y: number) => ((frame[y * 16 + (x >> 3)]! >> (x & 7)) & 1) === 1;
  const rows: string[] = [];
  for (let y = 0; y < H; y += 2) {
    let s = "";
    for (let x = 0; x < W; x++) {
      const a = lit(x, y), b = lit(x, y + 1);
      s += a && b ? "█" : a ? "▀" : b ? "▄" : " ";
    }
    rows.push(s);
  }
  return rows.join("\n");
}
