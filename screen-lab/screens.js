"use strict";
// The screens. Each one is a draw(ctx, d) on a 128 x 64 canvas: black background, white ink,
// text positioned by its top edge. Anything at least half bright becomes a lit pixel; the rest is off.
//
// ctx is a normal Canvas 2D context. d is the mock data (see README.md for every field):
//   d.classCode  d.pairCode  d.joinUrl  d.caption  d.lang  d.seconds  d.level  d.wifiOk  d.message  d.avatar  d.mascot  d.t
// Helpers: font(px, bold, text)  centered(ctx, text, y, x0, width)  fitFont(ctx, text, width, max)
//          wrapText(ctx, text, maxWidth)  paragraph(ctx, text, lines, y, pitch)  drawQr(ctx, text, x, y, box)  mmss(seconds)
//          drawSprite(ctx, name, x, y, scale)  spriteFit(name, boxW, boxH)
//          drawMascot(ctx, d, x, y, w, h, asleep, face)   the mascot from sprites.js, fitted into an area (defined further down)

const TODAY = "On the device today";
const IDEAS = "Ideas to play with";

// ---- The six screens the server draws now, copied from apps/api/src/oled.ts.
// Captions come first: while recording, the caption fills the screen and the timer and sound level are a thin
// strip under it.

screen({
  name: "Pair code",
  group: TODAY,
  note: "A new device, before someone types its code into the web app.",
  draw(ctx, d) {
    ctx.font = font(12);
    centered(ctx, "Pair this Slap", -2);
    ctx.font = font(fitFont(ctx, d.pairCode, 124, 30), true);
    centered(ctx, d.pairCode, 11);
    ctx.font = font(12);
    centered(ctx, "Enter it in the app", 48);
  },
});

screen({
  name: "Pick a course",
  group: TODAY,
  note: "Paired, but no class chosen in the web app yet.",
  draw(ctx) {
    ctx.font = font(17, true);
    centered(ctx, "Pick a course", 8);
    ctx.font = font(13);
    centered(ctx, "in the app", 34);
  },
});

screen({
  name: "Ready (join QR)",
  group: TODAY,
  note: "Waiting to start. Students scan the QR to open the captions page.",
  draw(ctx, d) {
    if (!drawQr(ctx, d.joinUrl, 0, 0, 64)) { ctx.font = font(11); ctx.fillText("Link too", 2, 16); ctx.fillText("long", 2, 29); }
    const x0 = 66, w = W - x0;
    ctx.font = font(fitFont(ctx, d.classCode, w - 2, 20), true);
    centered(ctx, d.classCode, 0, x0, w);
    ctx.font = font(13);
    centered(ctx, "Slap to", 24, x0, w);
    centered(ctx, "start", 38, x0, w);
    if (!d.wifiOk) { ctx.font = font(9); centered(ctx, "no Wi-Fi", 53, x0, w); }
  },
});

// Caption type on the recording screen, by script, sized so the lines' ink stays within rows 0-53. Chinese,
// Japanese and Korean stay at the pixel font's 12 px (four lines); the others get three lines. `base` is the
// first line's baseline: Arabic is drawn a size smaller and Hindi a row higher because both reach further
// below the baseline than Latin does.
function captionStyle(text) {
  if (CJK.test(text)) return { px: 12, pitch: 14, lines: 4, base: 11 };
  if (ARABIC.test(text)) return { px: 14, pitch: 18, lines: 3, base: 13 };
  if (DEVANAGARI.test(text)) return { px: 15, pitch: 18, lines: 3, base: 13 };
  return { px: 15, pitch: 18, lines: 3, base: 14 };
}

const clamp01 = v => Math.min(1, Math.max(0, v));

// Bottom strip of the recording screen (rows 55-62): sound level growing from the left, elapsed time on the
// right; mirrored under a right-to-left caption, whose short last line ends on the left.
function recordingFooter(ctx, seconds, level, rtl) {
  ctx.font = font(10, true);
  const t = mmss(seconds), tw = Math.ceil(ctx.measureText(t).width);
  ctx.fillText(t, rtl ? 0 : W - tw, 53);
  const w = W - tw - 5, fill = Math.round(clamp01(level) * w), x0 = rtl ? W - w : 0;
  ctx.fillRect(x0, 61, w, 1);
  ctx.fillRect(rtl ? W - fill : 0, 58, fill, 4);
}

// The server's renderRecording: with no caption yet the timer is large; after that the caption fills the screen.
function drawRecording(ctx, seconds, level, caption) {
  if (!caption.trim()) {
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
  const style = captionStyle(caption);
  ctx.font = font(style.px, false, caption);
  paragraph(ctx, caption, wrapText(ctx, caption, W - 2).slice(-style.lines), style.base, style.pitch);
  recordingFooter(ctx, seconds, level, RTL.test(caption));
}

screen({
  name: "Listening",
  group: TODAY,
  note: "Recording has started and nothing has been said yet: the timer is large, the sound level under it.",
  led: true,
  draw(ctx, d) {
    drawRecording(ctx, d.seconds, d.level, "");
  },
});

screen({
  name: "Recording",
  group: TODAY,
  note: "During a lecture: the latest three lines of caption (four in Chinese, Japanese and Korean), with the sound level and timer in a thin strip under them.",
  led: true,
  draw(ctx, d) {
    drawRecording(ctx, d.seconds, d.level, d.caption);
  },
});

screen({
  name: "Error",
  group: TODAY,
  note: "Something went wrong on the server.",
  draw(ctx, d) {
    const title = "Error";
    ctx.fillRect(0, 0, W, 17);
    ctx.fillStyle = "#000";
    ctx.font = font(13, true, title);
    paragraph(ctx, title, [title], 13, 0, 3);
    // Dark text on a lit bar loses its half-covered edge pixels to the threshold; a hairline outline restores the weight.
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.8;
    ctx.textBaseline = "alphabetic";
    ctx.strokeText(title, 3, 13);
    ctx.textBaseline = "top";
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.font = font(12, false, d.message);
    paragraph(ctx, d.message, wrapText(ctx, d.message, W - 2).slice(0, 3), 29, 15);
  },
});

// ---- Ideas. None of these are on the device; they are starting points to change or replace.

// A face made of shapes. It blinks, and its mouth opens with the sound level.
function drawFace(ctx, cx, cy, r, d, asleep = false) {
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const eyeY = cy - r * 0.2, blink = asleep || d.t % 3 > 2.7;
  for (const ex of [cx - r * 0.38, cx + r * 0.38]) {
    if (blink) ctx.fillRect(Math.round(ex) - 3, Math.round(eyeY), 6, 2);
    else { ctx.beginPath(); ctx.arc(ex, eyeY, Math.max(2, r * 0.13), 0, Math.PI * 2); ctx.fill(); }
  }
  const open = asleep ? 0 : d.level * r * 0.5;
  ctx.beginPath();
  if (open > 2.5) { ctx.ellipse(cx, cy + r * 0.42, r * 0.26, open / 2, 0, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.arc(cx, cy + r * 0.2, r * 0.4, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
}

screen({
  name: "Type sizes",
  group: IDEAS,
  note: "The chosen font and language at 8, 9, 10, 12 and 14 px. Use it to find the smallest size that still reads.",
  draw(ctx, d) {
    let y = 0;
    for (const px of [8, 9, 10, 12, 14]) {
      ctx.font = font(px);
      ctx.fillText(`${px} ${d.fullCaption}`, 1, y);
      y += px + 2;
    }
  },
});

screen({
  name: "Big caption",
  group: IDEAS,
  note: "Caption only, three larger lines. Right-to-left languages are aligned to the right edge.",
  led: true,
  draw(ctx, d) {
    ctx.font = font(15, true);
    if (d.lang.rtl) { ctx.direction = "rtl"; ctx.textAlign = "right"; }
    const lines = wrapText(ctx, d.caption, W - 2).slice(-3);
    lines.forEach((l, i) => ctx.fillText(l, d.lang.rtl ? W - 1 : 1, 2 + i * 21));
  },
});

screen({
  name: "Face + caption",
  group: IDEAS,
  note: "A drawn face that reacts to sound, with the caption beside it. Press Play to see it move.",
  led: true,
  draw(ctx, d) {
    drawFace(ctx, 22, 32, 20, d);
    ctx.font = font(11);
    const x0 = 48;
    const lines = wrapText(ctx, d.caption, W - x0 - 1).slice(-4);
    lines.forEach((l, i) => ctx.fillText(l, x0, 4 + i * 14));
  },
});

screen({
  name: "Avatar ready",
  group: IDEAS,
  note: "The avatar chosen on the right (from sprites.js), as large as fits, beside the class code.",
  draw(ctx, d) {
    const fit = spriteFit(d.avatar, 60, 60);
    drawSprite(ctx, d.avatar, Math.floor((64 - fit.w) / 2), Math.floor((H - fit.h) / 2), fit.scale);
    const x0 = 66, w = W - x0;
    ctx.font = font(fitFont(ctx, d.classCode, w - 2, 18), true);
    centered(ctx, d.classCode, 8, x0, w);
    ctx.font = font(11);
    centered(ctx, "slap to", 32, x0, w);
    centered(ctx, "start", 44, x0, w);
  },
});

screen({
  name: "Avatar + caption",
  group: IDEAS,
  note: "The chosen avatar hops with the sound, a small level bar under it, the caption beside it. Press Play, or turn on the microphone and talk.",
  led: true,
  draw(ctx, d) {
    const box = 46, level = Math.min(1, Math.max(0, d.level));
    const fit = spriteFit(d.avatar, box, 48);
    const hop = Math.round(level * 6);   // up to 6 pixels off the ground when it is loud
    drawSprite(ctx, d.avatar, Math.floor((box - fit.w) / 2), Math.max(0, 54 - fit.h - hop), fit.scale);
    ctx.fillRect(2, 58, Math.round(level * (box - 4)), 3);
    ctx.font = font(11);
    const x0 = box + 4;
    const lines = wrapText(ctx, d.caption, W - x0 - 1).slice(-4);
    lines.forEach((l, i) => ctx.fillText(l, x0, 4 + i * 14));
  },
});

// The mascot from sprites.js: a box head with a face in it.
// It is drawn as large as fits in the area (x, y, w, h), in the middle of it, at a whole-number size
// so the pixels stay square. It blinks now and then, and its mouth grows as the sound gets louder.
// `face` is one of the faces in sprites.js; left out, it is the one chosen on the page.
function drawMascot(ctx, d, x, y, w, h, asleep = false, face = d.mascot) {
  const fit = spriteFit(`mascot/${face}/head`, w, h);
  const px = x + Math.floor((w - fit.w) / 2), py = y + Math.floor((h - fit.h) / 2);
  const shut = asleep || d.t % 3.2 > 3;
  const mouth = asleep || d.level < 0.15 ? "quiet" : d.level < 0.45 ? "half" : "open";
  drawSprite(ctx, `mascot/${face}/head`, px, py, fit.scale);
  drawSprite(ctx, `mascot/${face}/${shut ? "blink" : "eyes"}`, px, py, fit.scale);
  drawSprite(ctx, `mascot/${face}/${mouth}`, px, py, fit.scale);
}

screen({
  name: "Mascot face",
  group: IDEAS,
  note: "The mascot, as large as fits. Choose the face under Mascot on the right. Its mouth follows the sound and it blinks: drag Sound level, press Play, or turn on the microphone.",
  led: true,
  draw(ctx, d) {
    drawMascot(ctx, d, 0, 0, W, H);
  },
});

screen({
  name: "Mascot + caption",
  group: IDEAS,
  note: "The mascot talks along with the lecture, with the caption beside it.",
  led: true,
  draw(ctx, d) {
    drawMascot(ctx, d, 0, 0, 54, H);
    ctx.font = font(11);
    const x0 = 57;
    const lines = wrapText(ctx, d.caption, W - x0 - 1).slice(-4);
    lines.forEach((l, i) => ctx.fillText(l, x0, 4 + i * 14));
  },
});

screen({
  name: "Mascot ready",
  group: IDEAS,
  note: "Waiting to start: the mascot beside the class code.",
  draw(ctx, d) {
    drawMascot(ctx, { ...d, level: 0 }, 2, 0, 54, H);
    const x0 = 58, w = W - x0;
    ctx.font = font(fitFont(ctx, d.classCode, w - 2, 18), true);
    centered(ctx, d.classCode, 8, x0, w);
    ctx.font = font(11);
    centered(ctx, "slap to", 32, x0, w);
    centered(ctx, "start", 44, x0, w);
  },
});

screen({
  name: "Mascot: both sketches",
  group: IDEAS,
  note: "Two of the earlier sketches side by side, to compare them. Both react to the sound.",
  draw(ctx, d) {
    drawMascot(ctx, d, 8, 4, 52, 40, false, "round");
    drawMascot(ctx, d, 68, 4, 52, 40, false, "odd");
    ctx.font = font(10);
    centered(ctx, "round", 49, 8, 52);
    centered(ctx, "odd", 49, 68, 52);
  },
});

screen({
  name: "Mascot asleep",
  group: IDEAS,
  note: "Nothing is happening: eyes shut, mouth small.",
  draw(ctx, d) {
    drawMascot(ctx, d, 10, 0, 84, H, true);
    ctx.font = font(10, true);
    ctx.fillText("z", 98, 14);
    ctx.font = font(13, true);
    ctx.fillText("z", 107, 1);
  },
});

screen({
  name: "Asleep",
  group: IDEAS,
  note: "An idle face for when nothing is happening.",
  draw(ctx, d) {
    drawFace(ctx, 64, 34, 24, d, true);
    ctx.font = font(10, true);
    ctx.fillText("z", 96, 14);
    ctx.font = font(13, true);
    ctx.fillText("z", 104, 2);
  },
});
