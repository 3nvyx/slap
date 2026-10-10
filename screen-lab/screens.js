"use strict";
// The screens. Each one is a draw(ctx, d) on a 128 x 64 canvas: black background, white ink,
// text positioned by its top edge. Anything at least half bright becomes a lit pixel; the rest is off.
//
// ctx is a normal Canvas 2D context. d is the mock data (see README.md for every field):
//   d.classCode  d.pairCode  d.joinUrl  d.caption  d.lang  d.seconds  d.level  d.wifiOk  d.message  d.avatar  d.mascot  d.t
// Helpers: font(px, bold)  centered(ctx, text, y, x0, width)  fitFont(ctx, text, width, max)
//          wrapText(ctx, text, maxWidth)  drawQr(ctx, text, x, y, box)  mmss(seconds)
//          drawSprite(ctx, name, x, y, scale)  spriteFit(name, boxW, boxH)
//          drawMascot(ctx, x, y, scale, d, asleep)   the mascot from sprites.js (defined further down)

const TODAY = "On the device today";
const IDEAS = "Ideas to play with";

// ---- The five screens the server draws now, copied from apps/api/src/oled.ts.

screen({
  name: "Pair code",
  group: TODAY,
  note: "A new device, before someone types its code into the web app.",
  draw(ctx, d) {
    ctx.font = font(11);
    centered(ctx, "Pair this Slap", 1);
    ctx.font = font(fitFont(ctx, d.pairCode, 124, 26), true);
    centered(ctx, d.pairCode, 19);
    ctx.font = font(10);
    centered(ctx, "enter code in the app", 52);
  },
});

screen({
  name: "Pick a course",
  group: TODAY,
  note: "Paired, but no class chosen in the web app yet.",
  draw(ctx) {
    ctx.font = font(13, true);
    centered(ctx, "Pick a course", 14);
    ctx.font = font(11);
    centered(ctx, "in the app", 34);
  },
});

screen({
  name: "Ready (join QR)",
  group: TODAY,
  note: "Waiting to start. Students scan the QR to open the captions page.",
  draw(ctx, d) {
    if (!drawQr(ctx, d.joinUrl, 0, 0, 64)) { ctx.font = font(10); ctx.fillText("URL too", 2, 20); ctx.fillText("long", 2, 32); }
    const x0 = 66, w = W - x0;
    ctx.font = font(fitFont(ctx, d.classCode, w - 2, 18), true);
    centered(ctx, d.classCode, 4, x0, w);
    ctx.font = font(11);
    centered(ctx, "slap to", 28, x0, w);
    centered(ctx, "start", 40, x0, w);
    if (!d.wifiOk) { ctx.font = font(9); centered(ctx, "no wifi", 54, x0, w); }
  },
});

screen({
  name: "Recording",
  group: TODAY,
  note: "During a lecture: timer, sound level, and the last two lines of caption.",
  led: true,
  draw(ctx, d) {
    ctx.beginPath();
    ctx.arc(5, 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(11, true);
    ctx.fillText("REC", 13, 1);
    const t = mmss(d.seconds);
    ctx.fillText(t, W - ctx.measureText(t).width - 1, 1);
    ctx.fillRect(0, 15, W, 1);
    ctx.fillRect(0, 21, W, 1);
    ctx.fillRect(0, 15, 1, 7);
    ctx.fillRect(W - 1, 15, 1, 7);
    ctx.fillRect(2, 17, Math.round(Math.min(1, Math.max(0, d.level)) * (W - 4)), 3);
    ctx.font = font(12);
    const lines = wrapText(ctx, d.caption, W - 2).slice(-2);
    lines.forEach((l, i) => ctx.fillText(l, 1, 27 + i * 18));
  },
});

screen({
  name: "Error",
  group: TODAY,
  note: "Something went wrong on the server.",
  draw(ctx, d) {
    ctx.font = font(12);
    const wrapped = ["Error", d.message].flatMap(l => wrapText(ctx, l, W - 2)).slice(0, 4);
    wrapped.forEach((l, i) => ctx.fillText(l, 1, 1 + i * 16));
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

// The mascot from sprites.js: a box head with a face in it, 26 x 20 pixels times `scale`.
// It blinks now and then, and its mouth grows as the sound gets louder.
// `face` is one of the faces in sprites.js; left out, it is the one chosen on the page.
function drawMascot(ctx, x, y, scale, d, asleep = false, face = d.mascot) {
  const shut = asleep || d.t % 3.2 > 3;
  const mouth = asleep || d.level < 0.15 ? "quiet" : d.level < 0.45 ? "half" : "open";
  drawSprite(ctx, "mascot/head", x, y, scale);
  drawSprite(ctx, `mascot/${face}/${shut ? "blink" : "eyes"}`, x, y, scale);
  drawSprite(ctx, `mascot/${face}/${mouth}`, x, y, scale);
}

screen({
  name: "Mascot face",
  group: IDEAS,
  note: "The mascot's head, as large as fits. Choose the face under Mascot on the right. Its mouth follows the sound and it blinks: drag Sound level, press Play, or turn on the microphone.",
  led: true,
  draw(ctx, d) {
    drawMascot(ctx, 25, 2, 3, d);
  },
});

screen({
  name: "Mascot + caption",
  group: IDEAS,
  note: "The mascot talks along with the lecture, with the caption beside it.",
  led: true,
  draw(ctx, d) {
    drawMascot(ctx, 0, 12, 2, d);
    ctx.font = font(11);
    const x0 = 56;
    const lines = wrapText(ctx, d.caption, W - x0 - 1).slice(-4);
    lines.forEach((l, i) => ctx.fillText(l, x0, 4 + i * 14));
  },
});

screen({
  name: "Mascot ready",
  group: IDEAS,
  note: "Waiting to start: the mascot beside the class code.",
  draw(ctx, d) {
    drawMascot(ctx, 2, 12, 2, { ...d, level: 0 });
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
  note: "The two newest sketches side by side, to compare them. Both react to the sound.",
  draw(ctx, d) {
    drawMascot(ctx, 8, 4, 2, d, false, "round");
    drawMascot(ctx, 68, 4, 2, d, false, "odd");
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
    drawMascot(ctx, 14, 2, 3, d, true);
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
