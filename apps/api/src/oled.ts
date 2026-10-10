// Server-side OLED rendering: draw on a 128x64 canvas, threshold to 1 bit, pack as XBM
// (row-major, 16 bytes per row, LSB = leftmost pixel, 1 = lit) for U8g2 drawXBM on the device.
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import QRCode from "qrcode";
import { OLED_FRAME_BYTES, OLED_HEIGHT as H, OLED_WIDTH as W } from "@slap/contracts";

const FONT = GlobalFonts.has("Helvetica") ? "Helvetica" : "sans-serif";
const font = (px: number, bold = false) => `${bold ? "bold " : ""}${px}px ${FONT}`;

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

/** Runs `draw` on a black canvas with white ink and returns the packed frame. */
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
    centered(ctx, "Pair this Slap", 1);
    ctx.font = font(fitFont(ctx, code, 124, 26), true);
    centered(ctx, code, 19);
    ctx.font = font(10);
    centered(ctx, "enter code in the app", 52);
  });
}

export function renderIdle(classCode: string, joinUrl: string, wifiOk = true): Uint8Array {
  return render(ctx => {
    if (!drawQr(ctx, joinUrl, 0, 0, 64)) { ctx.font = font(10); ctx.fillText("URL too", 2, 20); ctx.fillText("long", 2, 32); }
    const x0 = 66, w = W - x0;
    ctx.font = font(fitFont(ctx, classCode, w - 2, 18), true);
    centered(ctx, classCode, 4, x0, w);
    ctx.font = font(11);
    centered(ctx, "slap to", 28, x0, w);
    centered(ctx, "start", 40, x0, w);
    if (!wifiOk) { ctx.font = font(9); centered(ctx, "no wifi", 54, x0, w); }
  });
}

/** Idle screen of a paired device with no active class (PICK_COURSE is also sent as the state message). */
export const PICK_COURSE = "Pick a course in the app";
export function renderPickCourse(): Uint8Array {
  return render(ctx => {
    ctx.font = font(13, true);
    centered(ctx, "Pick a course", 14);
    ctx.font = font(11);
    centered(ctx, "in the app", 34);
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
    ctx.fillText("REC", 13, 1);
    const t = mmss(seconds);
    ctx.fillText(t, W - ctx.measureText(t).width - 1, 1);
    ctx.fillRect(0, 15, W, 1);
    ctx.fillRect(0, 21, W, 1);
    ctx.fillRect(0, 15, 1, 7);
    ctx.fillRect(W - 1, 15, 1, 7);
    ctx.fillRect(2, 17, Math.round(Math.min(1, Math.max(0, level)) * (W - 4)), 3);
    ctx.font = font(12);
    const lines = wrapText(ctx, lastCaption, W - 2).slice(-2);
    lines.forEach((l, i) => ctx.fillText(l, 1, 27 + i * 18));
  });
}

export function renderText(lines: string[]): Uint8Array {
  return render(ctx => {
    ctx.font = font(12);
    const wrapped = lines.flatMap(l => wrapText(ctx, l, W - 2)).slice(0, 4);
    wrapped.forEach((l, i) => ctx.fillText(l, 1, 1 + i * 16));
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
