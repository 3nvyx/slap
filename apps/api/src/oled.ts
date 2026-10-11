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

const CAPTION_W = 116;      // captions keep clear of the level column on the right
const LEVEL_STEPS = 13;     // blocks in the level column

/** Right edge of the recording screen: the sound level as a column of blocks growing upwards (two 3 px squares
 *  per step, no frame), a record dot under it, and the elapsed time to the left of the dot. */
function recordingSide(ctx: SKRSContext2D, seconds: number, level: number) {
  const lit = Math.round(clamp01(level) * LEVEL_STEPS);
  for (let i = 0; i < lit; i++) {
    const y = 49 - i * 4;
    ctx.fillRect(121, y, 3, 3);
    ctx.fillRect(125, y, 3, 3);
  }
  ctx.beginPath();
  ctx.arc(124.5, 59.5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(10, true);
  const t = mmss(seconds);
  ctx.fillText(t, 118 - Math.ceil(ctx.measureText(t).width), 63);
}

/** The transcript as the device's screen needs it: sentences that are finished (a few recent ones, oldest
 *  first, each with an id that never changes) and the sentence being spoken. */
export interface CaptionText { finals: Array<{ id: number; text: string }>; interim: string }

const ROLL_MS = 200;      // a new line pushes the others up over this long
const FADE_MS = 160;      // new words fade in over this long (a dither: the screen is 1-bit)
const KEEP_LINES = 12;    // lines of finished sentences kept (the screen shows three or four)
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const measure = createCanvas(W, H).getContext("2d");

/** The captions of one device, laid out so that they read steadily: a word stays where it was first drawn,
 *  new words are added after it and fade in, and when a line fills up the lines roll up by one instead of the
 *  whole text being wrapped again. update() takes the newest text; frame() draws the screen at a moment in
 *  time, so calling it every 50 ms while animating() plays the roll and the fade. */
export class CaptionRoll {
  private done: string[] = [];     // lines of the finished sentences
  private lines: string[] = [];    // `done` continued with the sentence being spoken: what is on screen
  private first = 0;               // how many lines were dropped from the top of `done` so far
  private lastId: number | null = null;
  private cjk = false;
  private rollAt = -Infinity;
  private rollBy = 0;              // lines the window moved by at rollAt
  private fadeAt = -Infinity;
  private fadeLine = 0;            // first new character: line (counted from the very first line) and column
  private fadeCol = 0;

  private get style() { return captionStyle(this.cjk ? "あ" : ""); }
  private setFont(ctx: SKRSContext2D) { ctx.font = font(this.style.px, false, this.cjk ? "あ" : ""); }

  /** Adds `text` after the last of `lines`, starting new lines as they fill. Japanese has no spaces and breaks
   *  between any two characters, never leaving closing punctuation at the start of a line. */
  private append(lines: string[], text: string) {
    this.setFont(measure);
    const fits = (t: string) => measure.measureText(t).width <= CAPTION_W;
    let cur = lines.pop() ?? "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const glue = cur && !(CJK.test(cur.at(-1)!) && CJK.test(word[0]!)) ? " " : "";
      if (fits(cur + glue + word)) { cur += glue + word; continue; }
      if (!CJK.test(word) && fits(word)) { lines.push(cur); cur = word; continue; }
      let lead = glue;
      for (const ch of word) {
        if (fits(cur + lead + ch)) cur += lead + ch;
        else if (NO_LINE_START.test(ch) && [...cur].length > 1) { const cs = [...cur]; lines.push(cs.slice(0, -1).join("")); cur = cs.at(-1)! + ch; }
        else { if (cur) lines.push(cur); cur = ch; }
        lead = "";
      }
    }
    if (cur) lines.push(cur);
  }

  update(c: CaptionText, now: number) {
    const cjk = CJK.test(c.finals.map(f => f.text).join("") + c.interim);
    const at = c.finals.findIndex(f => f.id === this.lastId);
    // Another language, or sentences that do not follow the ones on screen (a new session): start again.
    if (cjk !== this.cjk || (this.lastId !== null && at < 0)) {
      this.done = []; this.lines = []; this.first = 0; this.lastId = null;
      this.rollAt = this.fadeAt = -Infinity;
    }
    this.cjk = cjk;
    for (const f of this.lastId === null ? c.finals : c.finals.slice(at + 1)) { this.append(this.done, f.text); this.lastId = f.id; }
    const oldFirst = this.first, old = this.lines, n = this.style.lines;
    if (this.done.length > KEEP_LINES) { this.first += this.done.length - KEEP_LINES; this.done = this.done.slice(-KEEP_LINES); }
    const lines = [...this.done];
    if (c.interim.trim()) this.append(lines, c.interim);
    this.lines = lines;

    // Where the new text starts to differ from what was on screen: from there on it fades in.
    const end = this.first + lines.length, oldEnd = oldFirst + old.length;
    for (let i = this.first; i < end; i++) {
      const was = i >= oldFirst && i < oldEnd ? old[i - oldFirst]! : "", is = lines[i - this.first]!;
      if (was === is) continue;
      let col = 0;
      while (col < was.length && col < is.length && was[col] === is[col]) col++;
      if (col < is.length || i + 1 < end) { this.fadeAt = now; this.fadeLine = i; this.fadeCol = col; }
      break;
    }
    // The window (the last n lines) moved down: roll the lines up into place.
    const top = Math.max(this.first, end - n), oldTop = Math.max(oldFirst, oldEnd - n);
    if (old.length && top > oldTop) { this.rollAt = now; this.rollBy = Math.min(top - oldTop, n); }
  }

  animating(now: number): boolean { return now - this.rollAt < ROLL_MS || now - this.fadeAt < FADE_MS; }

  frame(seconds: number, level: number, now: number): Uint8Array {
    return render(ctx => {
      const { lines } = this, style = this.style;
      if (!lines.length) {
        ctx.font = font(15);
        centered(ctx, "Listening...", 32, 0, CAPTION_W + 2);
      } else {
        this.setFont(ctx);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, CAPTION_W + 2, 54);
        ctx.clip();
        const top = Math.max(0, lines.length - style.lines);
        const t = (now - this.rollAt) / ROLL_MS, rolling = t >= 0 && t < 1;
        const shift = rolling ? Math.round(this.rollBy * style.pitch * (1 - t) * (1 - t)) : 0;   // eases into place
        const from = Math.max(0, top - (rolling ? this.rollBy : 0));
        const y = (i: number) => style.base + (i - top) * style.pitch + shift;
        for (let i = from; i < lines.length; i++) ctx.fillText(lines[i]!, 1, y(i));
        // New words: knock out a share of their pixels, fewer each frame.
        const f = (now - this.fadeAt) / FADE_MS;
        if (f >= 0 && f < 1) {
          const keep = 0.25 + 0.75 * f;
          ctx.fillStyle = "#000";
          for (let i = Math.max(from, this.fadeLine - this.first); i < lines.length; i++) {
            const x0 = i === this.fadeLine - this.first ? Math.floor(1 + ctx.measureText(lines[i]!.slice(0, this.fadeCol)).width) : 0;
            for (let yy = Math.max(0, y(i) - style.px); yy < Math.min(54, y(i) + 5); yy++) {
              for (let xx = x0; xx < CAPTION_W + 2; xx++) if ((BAYER[yy & 3]![xx & 3]! + 0.5) / 16 > keep) ctx.fillRect(xx, yy, 1, 1);
            }
          }
          ctx.fillStyle = "#fff";
        }
        ctx.restore();
      }
      recordingSide(ctx, seconds, level);
    });
  }
}

/** One still recording frame for `caption` (no history, no animation): the caption fills the screen (until the
 *  first one, "Listening..."); the sound level is a column of blocks on the right, with a record dot and the
 *  elapsed time at its foot. level is 0..1 (already perceptually scaled by the caller). */
export function renderRecording(seconds: number, level: number, caption: string): Uint8Array {
  const roll = new CaptionRoll();
  roll.update({ finals: [], interim: caption }, 0);
  return roll.frame(seconds, level, Infinity);
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

export const SHAKE_MS = 450;   // how long the captions react to a shake

/** The recording frame `ms` after the device was shaken: the caption text is thrown about (each row slides
 *  sideways by its own amount, so the letters bend, and the whole block hops up and down), with short movement
 *  lines beside it. It dies away over SHAKE_MS. The level column and the timer on the right stay put. */
export function shakeFrame(frame: Uint8Array, ms: number): Uint8Array {
  if (ms < 0 || ms >= SHAKE_MS) return frame;
  const left = 1 - ms / SHAKE_MS, edge = CAPTION_W + 3;   // the caption area is x < edge, rows 0-53
  const bit = (x: number, y: number) => x >= 0 && x < edge && y >= 0 && y < 54 ? (frame[y * 16 + (x >> 3)]! >> (x & 7)) & 1 : 0;
  const out = Uint8Array.from(frame);
  const put = (x: number, y: number, v: number) => { if (v) out[y * 16 + (x >> 3)]! |= 1 << (x & 7); else out[y * 16 + (x >> 3)]! &= ~(1 << (x & 7)); };
  const dy = Math.round(2 * left * Math.cos(ms / 11));
  for (let y = 0; y < 54; y++) {
    const dx = Math.round(left * (5 * Math.sin(ms / 14) + 2.5 * Math.sin(ms / 9 + y / 5)));
    for (let x = 0; x < edge; x++) put(x, y, bit(x - dx, y - dy));
  }
  // Movement lines in the gaps between the caption lines, flicking from side to side.
  const phase = Math.floor(ms / 60);
  if (left > 0.25) {
    for (const [k, y] of [19, 37, 1].entries()) {
      const len = 5 + 2 * ((phase + k) % 3), right = (phase + k) % 2 === 0;
      for (let i = 0; i < len; i++) put(right ? edge - 1 - i : i, y, 1);
    }
  }
  return out;
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
