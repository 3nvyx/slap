"use strict";
// The screens. Each one is a draw(ctx, d) on a 128 x 64 canvas: black background, white ink,
// text positioned by its top edge. Anything at least half bright becomes a lit pixel; the rest is off.
//
// ctx is a normal Canvas 2D context. d is the mock data (see README.md for every field):
//   d.classCode  d.joinUrl  d.caption  d.lang  d.seconds  d.level  d.wifiOk  d.message  d.avatar  d.mascot  d.t
// Helpers: font(px, bold, text)  centered(ctx, text, y, x0, width)  fitFont(ctx, text, width, max)
//          wrapText(ctx, text, maxWidth)  drawQr(ctx, text, x, y, box)  mmss(seconds)
//          drawSprite(ctx, name, x, y, scale)  spriteFit(name, boxW, boxH)
//          drawMascot(ctx, d, x, y, w, h, asleep, face)   the mascot from sprites.js, fitted into an area (defined further down)

const TODAY = "On the device today";
const IDEAS = "Ideas to play with";

// ---- The screens the server draws now, copied from apps/api/src/oled.ts. The device is either asleep or
// recording, so there is no home screen: captions, the language banner after a tilt, "Saved", and an error.
// (The firmware draws "Joining Wi-Fi" and "Connecting" itself, before the server is reached.)
// Like the server, these place text by its baseline (ctx.textBaseline = "alphabetic"), not by its top edge.

// Caption type on the recording screen, sized so the lines' ink stays within rows 0-53: Japanese at the pixel
// font's 12 px (four lines), English and Vietnamese at 15 px (three lines). `base` is the first line's baseline.
function captionStyle(text) {
  return CJK.test(text) ? { px: 12, pitch: 14, lines: 4, base: 11 } : { px: 15, pitch: 18, lines: 3, base: 14 };
}

const clamp01 = v => Math.min(1, Math.max(0, v));
const DEVICE_LANGS = ["en", "vi", "ja"];
const LANG_NAMES = { en: "English", vi: "Tiếng Việt", ja: "日本語" };
const deviceLang = d => DEVICE_LANGS.includes(d.lang.code) ? d.lang.code : "en";

const CAPTION_W = 116;      // captions keep clear of the level column on the right
const LEVEL_STEPS = 13;     // blocks in the level column

// Right edge of the recording screen: the sound level as a column of blocks growing upwards (two 3 px squares
// per step, no frame), a record dot under it, and the elapsed time to the left of the dot.
function recordingSide(ctx, seconds, level) {
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

// The server's renderRecording: the caption fills the screen (until the first one, "Listening...").
function drawRecording(ctx, seconds, level, caption) {
  ctx.textBaseline = "alphabetic";
  if (!caption.trim()) {
    ctx.font = font(15);
    centered(ctx, "Listening...", 32, 0, CAPTION_W + 2);
  } else {
    const style = captionStyle(caption);
    ctx.font = font(style.px, false, caption);
    wrapText(ctx, caption, CAPTION_W).slice(-style.lines).forEach((l, i) => ctx.fillText(l, 1, style.base + i * style.pitch));
  }
  recordingSide(ctx, seconds, level);
}

// One large line with a hint under it (the server's renderNotice).
function drawNotice(ctx, big, small) {
  ctx.textBaseline = "alphabetic";
  ctx.font = font(24, true);
  centered(ctx, big, 30);
  ctx.font = font(12, false, small);
  centered(ctx, small, 52);
}

screen({
  name: "Switching on",
  group: TODAY,
  note: "For the first second and a half after a shake, while the device joins Wi-Fi. The picture is the sprite screen/splash in sprites.js; the device itself holds a copy (see the note there).",
  draw(ctx) {
    drawSprite(ctx, "screen/splash", 0, 0, 1);
  },
});

screen({
  name: "Listening",
  group: TODAY,
  note: "The session has started (it starts by itself once the device is switched on) and nothing has been said yet.",
  led: true,
  draw(ctx, d) {
    drawRecording(ctx, d.seconds, d.level, "");
  },
});

screen({
  name: "Captions",
  group: TODAY,
  note: "During a lecture: the latest three lines of caption (four in Japanese). On the right the sound level is a column of blocks that rises with the voice, with a record dot and the timer at its foot. Choose the language on the right of the page.",
  led: true,
  draw(ctx, d) {
    drawRecording(ctx, d.seconds, d.level, d.caption);
  },
});

screen({
  name: "Language (after a tilt)",
  group: TODAY,
  note: "Shown for a second and a half after the device is tipped left or right: the new caption language, and where it sits among the three.",
  led: true,
  draw(ctx, d) {
    ctx.textBaseline = "alphabetic";
    const lang = deviceLang(d), name = LANG_NAMES[lang];
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
    const arrow = (x, dir) => { for (let i = 0; i < 5; i++) ctx.fillRect(x + dir * i, 54 - i, 1, 1 + 2 * i); };
    if (lang !== DEVICE_LANGS[0]) arrow(4, 1);
    if (lang !== DEVICE_LANGS.at(-1)) arrow(W - 5, -1);
  },
});

screen({
  name: "Saved",
  group: TODAY,
  note: "After REC was held for two seconds (or the session was stopped in the app): the transcript is saved, then the screen goes dark.",
  draw(ctx, d) {
    drawNotice(ctx, "Saved", `${mmss(d.seconds)} · see the app`);
  },
});

screen({
  name: "Error",
  group: TODAY,
  note: "Something went wrong on the server.",
  draw(ctx, d) {
    ctx.textBaseline = "alphabetic";
    const title = "Error";
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
    ctx.font = font(12, false, d.message);
    wrapText(ctx, d.message, W - 2).slice(0, 3).forEach((l, i) => ctx.fillText(l, 1, 29 + i * 15));
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
