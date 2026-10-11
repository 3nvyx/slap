import assert from "node:assert/strict";
import { test } from "node:test";
import { OLED_FRAME_BYTES } from "@slap/contracts";
import { packXbm, render, renderIdle, renderPickCourse, renderRecording, renderText, renderUnpaired } from "../oled.ts";

test("every screen is exactly one 1,024-byte frame", () => {
  for (const f of [
    renderUnpaired("A7K2QX"),
    renderIdle("CS229", "https://slap.study/j/CS229"),
    renderRecording(125, 0.5, "a fairly long caption that has to wrap onto more than two lines of the small screen"),
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

// Caption area of a recording frame (below the level meter), as rows of 0/1.
const lit = (f: Uint8Array, x: number, y: number) => (f[y * 16 + (x >> 3)]! >> (x & 7)) & 1;
const captionCell = (f: Uint8Array, x0: number, w: number) => {
  let s = "";
  for (let y = 23; y < 64; y++) for (let x = x0; x < x0 + w; x++) s += lit(f, x, y);
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
