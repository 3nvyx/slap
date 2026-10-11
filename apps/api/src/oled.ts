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

/** Greedy word wrap by measured width; words longer than a line are split by characters. */
export function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (ctx.measureText(word).width > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut--;
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

/** Draws full-width lines of one paragraph, `pitch` px apart: from the left edge, or from the right edge when
 *  the paragraph starts in a right-to-left script (Arabic). */
function paragraph(ctx: SKRSContext2D, text: string, lines: string[], y: number, pitch: number) {
  const rtl = RTL.test(text);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  lines.forEach((l, i) => ctx.fillText(l, rtl ? W - 1 : 1, y + i * pitch));
  ctx.direction = "ltr";
  ctx.textAlign = "left";
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

export function renderUnpaired(code: string): Uint8Array {
  return render(ctx => {
    ctx.font = font(11);
    centered(ctx, "Pair this Slap", 0);
    ctx.font = font(fitFont(ctx, code, 124, 26), true);
    centered(ctx, code, 12);
    ctx.font = font(10);
    centered(ctx, "enter code in the app", 49);
  });
}

export function renderIdle(classCode: string, joinUrl: string, wifiOk = true): Uint8Array {
  return render(ctx => {
    if (!drawQr(ctx, joinUrl, 0, 0, 64)) { ctx.font = font(10); ctx.fillText("URL too", 2, 17); ctx.fillText("long", 2, 29); }
    const x0 = 66, w = W - x0;
    ctx.font = font(fitFont(ctx, classCode, w - 2, 18), true);
    centered(ctx, classCode, 0, x0, w);
    ctx.font = font(11);
    centered(ctx, "slap to", 24, x0, w);
    centered(ctx, "start", 36, x0, w);
    if (!wifiOk) { ctx.font = font(9); centered(ctx, "no wifi", 51, x0, w); }
  });
}

/** Idle screen of a paired device with no active class (PICK_COURSE is also sent as the state message). */
export const PICK_COURSE = "Pick a course in the app";
export function renderPickCourse(): Uint8Array {
  return render(ctx => {
    ctx.font = font(13, true);
    centered(ctx, "Pick a course", 10);
    ctx.font = font(11);
    centered(ctx, "in the app", 30);
  });
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/** level is 0..1 (already perceptually scaled by the caller). */
export function renderRecording(seconds: number, level: number, lastCaption: string): Uint8Array {
  return render(ctx => {
    ctx.beginPath();
    ctx.arc(5, 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(11, true);
    ctx.fillText("REC", 13, 0);
    const t = mmss(seconds);
    ctx.fillText(t, W - ctx.measureText(t).width - 1, 0);
    ctx.fillRect(0, 15, W, 1);
    ctx.fillRect(0, 21, W, 1);
    ctx.fillRect(0, 15, 1, 7);
    ctx.fillRect(W - 1, 15, 1, 7);
    ctx.fillRect(2, 17, Math.round(Math.min(1, Math.max(0, level)) * (W - 4)), 3);
    ctx.font = font(12, false, lastCaption);
    paragraph(ctx, lastCaption, wrapText(ctx, lastCaption, W - 2).slice(-2), 25, 18);
  });
}

export function renderText(lines: string[]): Uint8Array {
  return render(ctx => {
    let row = 0;
    for (const text of lines) {
      ctx.font = font(12, false, text);
      const wrapped = wrapText(ctx, text, W - 2).slice(0, 4 - row);
      paragraph(ctx, text, wrapped, -1 + row * 16, 16);
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
