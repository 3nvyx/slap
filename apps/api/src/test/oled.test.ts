import assert from "node:assert/strict";
import { test } from "node:test";
import { DEVICE_LANGS, OLED_FRAME_BYTES } from "@slap/contracts";
import { packXbm, render, renderLanguage, renderNotice, renderRecording, renderSaved, renderText } from "../oled.ts";

const lit = (f: Uint8Array, x: number, y: number) => (f[y * 16 + (x >> 3)]! >> (x & 7)) & 1;
// Caption area of a recording frame (above the level, language and timer strip), as rows of 0/1.
const captionCell = (f: Uint8Array, x0: number, w: number) => {
  let s = "";
  for (let y = 0; y < 55; y++) for (let x = x0; x < x0 + w; x++) s += lit(f, x, y);
  return s;
};
const caption = (text: string) => captionCell(renderRecording(0, 0, text), 0, 128);
const inkRows = (f: Uint8Array, y0: number, y1: number, x0 = 0, x1 = 128) => {
  const rows: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (lit(f, x, y)) { rows.push(y); break; }
  return rows;
};

test("every screen is exactly one 1,024-byte frame", () => {
  for (const f of [
    renderRecording(125, 0.5, "a fairly long caption that has to wrap onto more than three lines of the small screen"),
    renderRecording(3, 0.5, ""),
    renderLanguage("ja"),
    renderSaved(2520),
    renderNotice("Slap", "Starting..."),
    renderText(["hello", "world"]),
  ]) assert.equal(f.length, OLED_FRAME_BYTES);
});

test("all-lit canvas packs to 0xFF bytes, blank to 0x00", () => {
  const all = render(ctx => ctx.fillRect(0, 0, 128, 64));
  assert.ok(all.every(b => b === 0xff));
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

test("a Japanese caption draws a different glyph for each character, not identical boxes", () => {
  // The pixel font advances 12 px per character from x = 1.
  const text = "ガウスぶんぷ曲線";
  const f = renderRecording(0, 0, text);
  const cells = [...text].map((_, i) => captionCell(f, 1 + i * 12, 12));
  for (const c of cells) assert.ok(c.includes("1"), "empty glyph cell");
  assert.equal(new Set(cells).size, cells.length, "glyph cells repeat");
});

test("English, Vietnamese and Japanese have real glyphs: reordering the characters changes the frame", () => {
  // Missing glyphs are all the same box (or nothing, when no font is loaded), so order would not matter.
  for (const [a, b] of [["Gauss", "ssuaG"], ["bình", "hnìb"], ["がうす", "すうが"], ["分布", "布分"]]) {
    assert.ok(caption(a!).includes("1"), `${a}: nothing drawn`);
    assert.notEqual(caption(a!), caption(b!), `${a} and ${b} render the same`);
  }
});

test("a caption in any of the three languages stays clear of the strip under it", () => {
  // Full lines with descenders, stacked accents and kanji; the strip starts at row 55.
  const long = [
    "gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy gjpqy",
    "Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy Ế Ỗ ặ ự gjy",
    "では、ガウス分布はどんな形でしょうか。平均を中心とした釣鐘型の曲線です。データが十分にあれば、これはかなり良いモデルです。",
  ];
  for (const text of long) {
    // Level 0: the middle columns of rows 54-57 are empty unless the caption reaches them.
    const f = renderRecording(0, 0, text);
    assert.ok(inkRows(f, 30, 54).length > 10, `${text.slice(0, 12)}: no caption drawn`);
    assert.deepEqual(inkRows(f, 54, 58, 0, 80), [], `${text.slice(0, 12)}: caption runs into the strip`);
  }
});

test("the level bar grows with the sound; the strip names the caption language", () => {
  const count = (f: Uint8Array, x0: number, x1: number) => {
    let n = 0;
    for (let y = 58; y < 62; y++) for (let x = x0; x < x1; x++) n += lit(f, x, y);
    return n;
  };
  const quiet = renderRecording(65, 0.1, "Gauss"), loud = renderRecording(65, 0.9, "Gauss");
  assert.ok(count(loud, 0, 70) > count(quiet, 0, 70) + 100);
  assert.ok(lit(loud, 2, 59) === 1 && lit(quiet, 60, 59) === 0);
  assert.notDeepEqual(renderRecording(65, 0.5, "Gauss", "en"), renderRecording(65, 0.5, "Gauss", "vi"));
});

test("with no caption yet the screen shows the timer large", () => {
  const a = renderRecording(5, 0.3, ""), b = renderRecording(6, 0.3, "");
  assert.notDeepEqual(a, b);
  assert.ok(inkRows(a, 0, 24).length > 15, "large timer in the top rows");
});

test("Japanese captions never start a line with closing punctuation", () => {
  const f = renderRecording(0, 0, "かなり良いモデルです。");   // ten characters fit; the full stop is the eleventh
  // The second line holds two characters (す。), not a lone full stop: ink reaches past the first cell.
  let right = 0;
  for (let y = 14; y < 27; y++) for (let x = 0; x < 128; x++) if (lit(f, x, y)) right = Math.max(right, x);
  assert.ok(right > 14, `second line should start with a character, ink ends at x=${right}`);
});

test("the language banner is different for each language and marks the chosen one", () => {
  const frames = DEVICE_LANGS.map(l => renderLanguage(l));
  assert.equal(new Set(frames.map(f => Buffer.from(f).toString("hex"))).size, DEVICE_LANGS.length);
  // The chosen language sits on a lit box in the bottom row: EN on the left, JA on the right.
  const boxLit = (f: Uint8Array, x: number) => lit(f, x, 47);
  assert.ok(boxLit(frames[0]!, 30) && !boxLit(frames[0]!, 95));
  assert.ok(boxLit(frames[2]!, 95) && !boxLit(frames[2]!, 30));
});
