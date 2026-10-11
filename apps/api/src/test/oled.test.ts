import assert from "node:assert/strict";
import { test } from "node:test";
import { OLED_FRAME_BYTES } from "@slap/contracts";
import { packXbm, render, renderIdle, renderPickCourse, renderRecording, renderText } from "../oled.ts";

test("every screen is exactly one 1,024-byte frame", () => {
  for (const f of [
    renderIdle("CS229", "https://slap.study/j/CS229"),
    renderRecording(125, 0.5, "a fairly long caption that has to wrap onto more than three lines of the small screen"),
    renderRecording(3, 0.5, ""),
    renderText(["hello", "world"]),
    renderPickCourse(),
  ]) assert.equal(f.length, OLED_FRAME_BYTES);
});

test("all-lit canvas packs to 0xFF bytes, blank to 0x00", () => {
  const lit = render(ctx => ctx.fillRect(0, 0, 128, 64));
  assert.ok(lit.every(b => b === 0xff));
  const blank = render(() => {});
  assert.ok(blank.every(b => b === 0));
});

test("XBM packing: LSB is the leftmost pixel, 16 bytes per row", () => {
  const rgba = new Uint8Array(128 * 64 * 4);
  const lightUp = (x: number, y: number) => { rgba[(y * 128 + x) * 4] = 255; };
  lightUp(0, 0); lightUp(7, 0); lightUp(8, 0); lightUp(127, 63);
  const f = packXbm(rgba);
  assert.equal(f[0], 0b1000_0001);
  assert.equal(f[1], 0b0000_0001);
  assert.equal(f[63 * 16 + 15], 0b1000_0000);
  assert.equal(f.reduce((n, b) => n + (b ? 1 : 0), 0), 3);
});

test("idle QR leaves the right half for text and fits 64 px", () => {
  const f = renderIdle("CS229", "https://slap.study/j/CS229");
  // the QR quiet zone is lit: left half has many lit pixels
  let left = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if ((f[y * 16 + (x >> 3)]! >> (x & 7)) & 1) left++;
  assert.ok(left > 1500, `expected a lit QR block, got ${left} lit pixels`);
});

// Caption area of a recording frame (above the timer and level strip), as rows of 0/1.
const lit = (f: Uint8Array, x: number, y: number) => (f[y * 16 + (x >> 3)]! >> (x & 7)) & 1;
const captionCell = (f: Uint8Array, x0: number, w: number) => {
  let s = "";
  for (let y = 0; y < 55; y++) for (let x = x0; x < x0 + w; x++) s += lit(f, x, y);
  return s;
};
const caption = (text: string) => captionCell(renderRecording(0, 0, text), 0, 128);

test("a CJK caption draws a different glyph for each character, not identical boxes", () => {
  // The pixel font advances 12 px per character from x = 1.
  for (const text of ["高斯分布曲线", "ガウスぶんぷ", "가우시안분포"]) {
    const f = renderRecording(0, 0, text);
    const cells = [...text].map((_, i) => captionCell(f, 1 + i * 12, 12));
    for (const c of cells) assert.ok(c.includes("1"), `${text}: empty glyph cell`);
    assert.equal(new Set(cells).size, cells.length, `${text}: glyph cells repeat`);
  }
});

test("every caption script has real glyphs: reordering the characters changes the frame", () => {
  // Missing glyphs are all the same box (or nothing, when no font is loaded), so order would not matter.
  const pairs = [
    ["Gauss", "ssuaG"], ["bình", "hnìb"], ["高斯分布", "布分斯高"], ["がうす", "すうが"], ["가우시안", "안시우가"],
    ["कखगघ", "घगखक"], ["سلام", "مالس"],
  ];
  for (const [a, b] of pairs) {
    assert.ok(caption(a!).includes("1"), `${a}: nothing drawn`);
    assert.notEqual(caption(a!), caption(b!), `${a} and ${b} render the same`);
  }
});

test("Han characters outside the pixel font fall back to a drawn glyph", () => {
  // 栾 and 牦 (both in GB 2312) are missing from Fusion Pixel 12px and come from the Noto Sans SC subset.
  assert.notEqual(caption("栾牦"), caption("牦栾"));
});

test("Arabic is shaped and laid out from the right edge", () => {
  const f = renderRecording(0, 0, "سلام");
  const cols = [...Array(128).keys()].filter(x => captionCell(f, x, 1).includes("1"));
  assert.ok(cols.at(-1)! >= 124, `text should end at the right edge, ends at ${cols.at(-1)}`);
  assert.ok(cols[0]! > 64, `a short word should not reach the left half, starts at ${cols[0]}`);
  // Zero-width non-joiners draw nothing themselves; they only stop the letters joining.
  assert.notEqual(caption("سلام"), caption("س‌ل‌ا‌م"));
});

const inkRows = (f: Uint8Array, y0: number, y1: number, x0 = 0, x1 = 128) => {
  const rows: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (lit(f, x, y)) { rows.push(y); break; }
  return rows;
};

test("a caption in any script stays clear of the timer and level strip", () => {
  // Three or four full lines with descenders, stacked accents, matras and Arabic tails; the strip starts at row 55.
  const long = [
    "gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy",
    "Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy",
    "那么高斯分布是什么样子的？它是一条以均值为中心的钟形曲线。只要数据足够多，这就是一个相当好的模型。",
    "पर्याप्त डेटा होने पर यह काफ़ी अच्छा मॉडल है। कू कृ पर्याप्त डेटा होने पर यह काफ़ी अच्छा मॉडल है। कू कृ",
    "مع بيانات كافية، يُعد هذا نموذجًا جيدًا إلى حد كبير. مع بيانات كافية، يُعد هذا نموذجًا جيدًا إلى حد كبير.",
  ];
  for (const text of long) {
    // level 0 and a timer on one side only: the middle columns of rows 54-57 are empty unless the caption reaches them.
    const f = renderRecording(0, 0, text);
    assert.ok(inkRows(f, 30, 54).length > 10, `${text.slice(0, 12)}: no caption drawn`);
    assert.deepEqual(inkRows(f, 54, 58, 40, 88), [], `${text.slice(0, 12)}: caption runs into the strip`);
  }
});

test("the level bar grows with the sound and the timer sits beside it, mirrored for Arabic", () => {
  const count = (f: Uint8Array, x0: number, x1: number) => {
    let n = 0;
    for (let y = 58; y < 62; y++) for (let x = x0; x < x1; x++) n += lit(f, x, y);
    return n;
  };
  const quiet = renderRecording(65, 0.1, "Gauss"), loud = renderRecording(65, 0.9, "Gauss");
  assert.ok(count(loud, 0, 90) > count(quiet, 0, 90) + 100);
  assert.ok(lit(loud, 2, 59) === 1 && lit(quiet, 60, 59) === 0);
  const ar = renderRecording(65, 0.9, "سلام");
  assert.ok(lit(ar, 125, 59) === 1 && lit(ar, 40, 59) === 0, "under an Arabic caption the bar grows from the right");
});

test("with no caption yet the screen shows the timer large, and it differs from a captioned frame", () => {
  const a = renderRecording(5, 0.3, ""), b = renderRecording(6, 0.3, "");
  assert.notDeepEqual(a, b);
  assert.ok(inkRows(a, 0, 24).length > 15, "large timer in the top rows");
});

test("Chinese and Japanese captions never start a line with closing punctuation", () => {
  const f = renderRecording(0, 0, "かなり良いモデルです。");   // ten characters fit; the full stop is the eleventh
  // The second line holds two characters (す。), not a lone full stop: ink reaches past the first cell.
  let right = 0;
  for (let y = 14; y < 27; y++) for (let x = 0; x < 128; x++) if (lit(f, x, y)) right = Math.max(right, x);
  assert.ok(right > 14, `second line should start with a character, ink ends at x=${right}`);
});
