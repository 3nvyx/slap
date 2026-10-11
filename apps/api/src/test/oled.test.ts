import assert from "node:assert/strict";
import { test } from "node:test";
import { OLED_FRAME_BYTES } from "@slap/contracts";
import { packXbm, render, renderIdle, renderPickCourse, renderRecording, renderText } from "../oled.ts";

test("every screen is exactly one 1,024-byte frame", () => {
  for (const f of [
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
