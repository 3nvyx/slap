// Server-side OLED rendering: draw on a 128x64 canvas, threshold to 1 bit, pack as XBM
// (row-major, 16 bytes per row, LSB = leftmost pixel, 1 = lit) for U8g2 drawXBM on the device.
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import QRCode from "qrcode";
import { OLED_FRAME_BYTES, OLED_HEIGHT as H, OLED_WIDTH as W } from "@slap/contracts";

// The fonts ship in ../fonts (all SIL OFL 1.1, sources in fonts/README.md) and are registered under private
// names, so a frame is the same on every host: system fonts differ per machine, and the Docker image has none.
const FONT_FILES = {
  "OLED Sans": ["noto-sans/NotoSans-Regular.ttf", "noto-sans/NotoSans-Bold.ttf"],
  "OLED CJK zh": ["fusion-pixel/fusion-pixel-12px-proportional-zh_hans.otf.woff2"],
  "OLED CJK ja": ["fusion-pixel/fusion-pixel-12px-proportional-ja.otf.woff2"],
  "OLED CJK ko": ["fusion-pixel/fusion-pixel-12px-proportional-ko.otf.woff2"],
  "OLED Han rare": ["noto-sans-sc-rare/NotoSansSC-Regular.rare.woff2"],
  "OLED Devanagari": ["noto-sans-devanagari/NotoSansDevanagari-Regular.ttf"],
  "OLED Arabic": ["noto-sans-arabic/NotoSansArabic-Regular.ttf"],
};
for (const [family, files] of Object.entries(FONT_FILES)) {
  for (const file of files) {
    const path = fileURLToPath(new URL(`../fonts/${file}`, import.meta.url));
    if (!GlobalFonts.registerFromPath(path, family)) throw new Error(`OLED font not loaded: ${path}`);
  }
}

const CJK = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;
const KANA = /[\u3040-\u30ff]/, HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const RTL = /^[^\p{L}]*[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const ARABIC = /\p{Script=Arabic}/u, DEVANAGARI = /\p{Script=Devanagari}/u;
const NO_LINE_START = /[、。，．！？：；）」』】〉》,.!?:;)]/;

/** Font list for drawing `text`: Noto Sans first, with fallbacks for the other scripts. Text that has Chinese,
 *  Japanese or Korean in it leads with the pixel font instead, so every glyph of the line sits on whole pixels
 *  (it is drawn for 12 px; other sizes blur), in the regional form of Han characters its script implies:
 *  Japanese with kana, Korean with hangul, otherwise Simplified Chinese. */
function families(text: string): string {
  const cjk = `"OLED CJK ${KANA.test(text) ? "ja" : HANGUL.test(text) ? "ko" : "zh"}"`;
  const lead = CJK.test(text) ? `${cjk}, "OLED Sans"` : `"OLED Sans", ${cjk}`;
  return `${lead}, "OLED Han rare", "OLED Devanagari", "OLED Arabic"`;
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

/** Runs `draw` on a black canvas with white ink and returns the packed frame.
 *  With textBaseline "top", @napi-rs/canvas puts the baseline of Noto Sans at y + round(1.069 * px) - 0.15 * px,
 *  so capital letters start about 0.2 * px below y (2 to 3 px at caption sizes) and y = -1 is not clipped. */
export function render(draw: (ctx: SKRSContext2D) => void): Uint8Array {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.textBaseline = "top";
  draw(ctx);
  const frame = packXbm(ctx.getImageData(0, 0, W, H).data);
  if (frame.length !== OLED_FRAME_BYTES) throw new Error("bad frame size");
  return frame;
}

/** Greedy word wrap by measured width; words longer than a line are split by characters (text without spaces,
 *  such as Chinese and Japanese, wraps this way), never leaving closing punctuation at the start of a line. */
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

function centered(ctx: SKRSContext2D, text: string, y: number, x0 = 0, width = W) {
  ctx.fillText(text, x0 + Math.max(0, (width - ctx.measureText(text).width) / 2), y);
}

/** Draws full-width lines of one paragraph, `pitch` px apart: `inset` px from the left edge, or from the right
 *  edge when the paragraph starts in a right-to-left script (Arabic). `baseline` is the y of the first line's
 *  baseline, not of its top: with textBaseline "top" the canvas takes the offset from the font of the line's
 *  first character, so a line starting with a Latin word or a digit would sit 3 px lower than its Hindi
 *  neighbours and 5 px higher than its Arabic ones. */
function paragraph(ctx: SKRSContext2D, text: string, lines: string[], baseline: number, pitch: number, inset = 1) {
  const rtl = RTL.test(text);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.textBaseline = "alphabetic";
  lines.forEach((l, i) => ctx.fillText(l, rtl ? W - inset : inset, baseline + i * pitch));
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

/** Largest font size (<= max) at which `text` fits `width`. */
function fitFont(ctx: SKRSContext2D, text: string, width: number, max: number, bold = true): number {
  let px = max;
  for (; px > 8; px--) { ctx.font = font(px, bold); if (ctx.measureText(text).width <= width) break; }
  return px;
}

/** Draws a QR code with dark modules on a lit square (2-module quiet zone) at (x, y), size <= box px. */
export function drawQr(ctx: SKRSContext2D, text: string, x: number, y: number, box: number): boolean {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "L" });
  const n = modules.size, total = n + 4;
  const scale = Math.floor(box / total);
  if (scale < 1) return false;
  const side = total * scale, ox = x + Math.floor((box - side) / 2), oy = y + Math.floor((box - side) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(ox, oy, side, side);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (modules.get(r, c)) ctx.fillRect(ox + (c + 2) * scale, oy + (r + 2) * scale, scale, scale);
  }
  ctx.fillStyle = "#fff";
  return true;
}

export function renderIdle(classCode: string, joinUrl: string, wifiOk = true): Uint8Array {
  return render(ctx => {
    if (!drawQr(ctx, joinUrl, 0, 0, 64)) { ctx.font = font(11); ctx.fillText("Link too", 2, 16); ctx.fillText("long", 2, 29); }
    const x0 = 66, w = W - x0;
    ctx.font = font(fitFont(ctx, classCode, w - 2, 20), true);
    centered(ctx, classCode, 0, x0, w);
    ctx.font = font(13);
    centered(ctx, "Slap to", 24, x0, w);
    centered(ctx, "start", 38, x0, w);
    if (!wifiOk) { ctx.font = font(9); centered(ctx, "no Wi-Fi", 53, x0, w); }
  });
}

/** Idle screen of a device with no active class (PICK_COURSE is also sent as the state message). */
export const PICK_COURSE = "Pick a course in the app";
export function renderPickCourse(): Uint8Array {
  return render(ctx => {
    ctx.font = font(17, true);
    centered(ctx, "Pick a course", 8);
    ctx.font = font(13);
    centered(ctx, "in the app", 34);
  });
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/** Caption type on the recording screen, by script, sized so the lines' ink stays within rows 0-53. Chinese,
 *  Japanese and Korean stay at the pixel font's 12 px (four lines); the others get three lines. `base` is the
 *  first line's baseline: Arabic is drawn a size smaller and Hindi a row higher because both reach further
 *  below the baseline than Latin does. */
function captionStyle(text: string) {
  if (CJK.test(text)) return { px: 12, pitch: 14, lines: 4, base: 11 };
  if (ARABIC.test(text)) return { px: 14, pitch: 18, lines: 3, base: 13 };
  if (DEVANAGARI.test(text)) return { px: 15, pitch: 18, lines: 3, base: 13 };
  return { px: 15, pitch: 18, lines: 3, base: 14 };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Bottom strip of the recording screen (rows 55-62): sound level growing from the left, elapsed time on the
 *  right; mirrored under a right-to-left caption, whose short last line ends on the left. */
function recordingFooter(ctx: SKRSContext2D, seconds: number, level: number, rtl: boolean) {
  ctx.font = font(10, true);
  const t = mmss(seconds), tw = Math.ceil(ctx.measureText(t).width);
  ctx.fillText(t, rtl ? 0 : W - tw, 53);
  const w = W - tw - 5, fill = Math.round(clamp01(level) * w), x0 = rtl ? W - w : 0;
  ctx.fillRect(x0, 61, w, 1);
  ctx.fillRect(rtl ? W - fill : 0, 58, fill, 4);
}

/** The caption fills the screen; the timer and sound level are a thin strip under it. With no caption yet
 *  (`lastCaption` empty) the timer is large instead. level is 0..1 (already perceptually scaled by the caller). */
export function renderRecording(seconds: number, level: number, lastCaption: string): Uint8Array {
  return render(ctx => {
    if (!lastCaption.trim()) {
      ctx.font = font(26, true);
      centered(ctx, mmss(seconds), -3);
      ctx.font = font(13);
      centered(ctx, "Listening...", 27);
      ctx.fillRect(0, 53, W, 1);
      ctx.fillRect(0, 62, W, 1);
      ctx.fillRect(0, 53, 1, 10);
      ctx.fillRect(W - 1, 53, 1, 10);
      ctx.fillRect(2, 55, Math.round(clamp01(level) * (W - 4)), 6);
      return;
    }
    const style = captionStyle(lastCaption);
    ctx.font = font(style.px, false, lastCaption);
    paragraph(ctx, lastCaption, wrapText(ctx, lastCaption, W - 2).slice(-style.lines), style.base, style.pitch);
    recordingFooter(ctx, seconds, level, RTL.test(lastCaption));
  });
}

/** A notice: the first line is the title, on a lit bar; the rest wraps under it (three lines at most). */
export function renderText(lines: string[]): Uint8Array {
  return render(ctx => {
    const [title = "", ...body] = lines;
    ctx.fillRect(0, 0, W, 17);
    ctx.fillStyle = "#000";
    ctx.font = font(13, true, title);
    paragraph(ctx, title, [title], 13, 0, 3);
    // Dark text on a lit bar loses its half-covered edge pixels to the threshold; a hairline outline restores the weight.
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.8;
    const rtl = RTL.test(title);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "alphabetic";
    ctx.strokeText(title, rtl ? W - 3 : 3, 13);
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    let row = 0;
    for (const text of body) {
      ctx.font = font(12, false, text);
      const wrapped = wrapText(ctx, text, W - 2).slice(0, 3 - row);
      paragraph(ctx, text, wrapped, 29 + row * 15, 15);
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
