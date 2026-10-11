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

const ROLL_MS = 200;      // a new line pushes the others up over this long
const FADE_MS = 160;      // new words fade in over this long (a dither: the screen is 1-bit)
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

// The server's CaptionRoll (apps/api/src/oled.ts), for text that only grows: a word stays where it was first
// drawn, new words are added after it and fade in, and when a line fills up the lines roll up by one.
// update() takes the newest text; draw() draws the caption area at a moment in time (ms).
class CaptionRoll {
  constructor() { this.lines = []; this.cjk = false; this.rollAt = this.fadeAt = -Infinity; this.rollBy = 0; this.fadeLine = 0; this.fadeCol = 0; }
  get style() { return captionStyle(this.cjk ? "あ" : ""); }
  setFont(ctx) { ctx.font = font(this.style.px, false, this.cjk ? "あ" : ""); }
  // Lays `text` out in lines. Japanese has no spaces and breaks between any two characters, never leaving
  // closing punctuation at the start of a line.
  layout(ctx, text) {
    this.setFont(ctx);
    const fits = t => ctx.measureText(t).width <= CAPTION_W, lines = [];
    let cur = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const glue = cur && !(CJK.test(cur.at(-1)) && CJK.test(word[0])) ? " " : "";
      if (fits(cur + glue + word)) { cur += glue + word; continue; }
      if (!CJK.test(word) && fits(word)) { lines.push(cur); cur = word; continue; }
      let lead = glue;
      for (const ch of word) {
        if (fits(cur + lead + ch)) cur += lead + ch;
        else if (NO_LINE_START.test(ch) && [...cur].length > 1) { const cs = [...cur]; lines.push(cs.slice(0, -1).join("")); cur = cs.at(-1) + ch; }
        else { if (cur) lines.push(cur); cur = ch; }
        lead = "";
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  update(ctx, text, now) {
    const cjk = CJK.test(text), old = cjk === this.cjk ? this.lines : [], n = captionStyle(cjk ? "あ" : "").lines;
    this.cjk = cjk;
    const lines = this.lines = this.layout(ctx, text);
    // Where the new text starts to differ from what was on screen: from there on it fades in.
    for (let i = 0; i < lines.length; i++) {
      const was = old[i] ?? "", is = lines[i];
      if (was === is) continue;
      let col = 0;
      while (col < was.length && col < is.length && was[col] === is[col]) col++;
      if (col < is.length || i + 1 < lines.length) { this.fadeAt = now; this.fadeLine = i; this.fadeCol = col; }
      break;
    }
    // The window (the last n lines) moved down: roll the lines up into place.
    const top = Math.max(0, lines.length - n), oldTop = Math.max(0, old.length - n);
    if (old.length && top > oldTop) { this.rollAt = now; this.rollBy = Math.min(top - oldTop, n); }
  }
  draw(ctx, now) {
    const { lines } = this, style = this.style;
    if (!lines.length) {
      ctx.font = font(15);
      centered(ctx, "Listening...", 32, 0, CAPTION_W + 2);
      return;
    }
    this.setFont(ctx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CAPTION_W + 2, 54);
    ctx.clip();
    const top = Math.max(0, lines.length - style.lines);
    const t = (now - this.rollAt) / ROLL_MS, rolling = t >= 0 && t < 1;
    const shift = rolling ? Math.round(this.rollBy * style.pitch * (1 - t) * (1 - t)) : 0;   // eases into place
    const from = Math.max(0, top - (rolling ? this.rollBy : 0));
    const y = i => style.base + (i - top) * style.pitch + shift;
    for (let i = from; i < lines.length; i++) ctx.fillText(lines[i], 1, y(i));
    // New words: knock out a share of their pixels, fewer each frame.
    const f = (now - this.fadeAt) / FADE_MS;
    if (f >= 0 && f < 1) {
      const keep = 0.25 + 0.75 * f;
      ctx.fillStyle = "#000";
      for (let i = Math.max(from, this.fadeLine); i < lines.length; i++) {
        const x0 = i === this.fadeLine ? Math.floor(1 + ctx.measureText(lines[i].slice(0, this.fadeCol)).width) : 0;
        for (let yy = Math.max(0, y(i) - style.px); yy < Math.min(54, y(i) + 5); yy++) {
          for (let xx = x0; xx < CAPTION_W + 2; xx++) if ((BAYER[yy & 3][xx & 3] + 0.5) / 16 > keep) ctx.fillRect(xx, yy, 1, 1);
        }
      }
      ctx.fillStyle = "#fff";
    }
    ctx.restore();
  }
}

// One roll per language while Play runs (the lab draws the same screen for several languages at once).
const rolls = {};

// The server's recording screen. Stopped, it is a still frame; playing, the words fade in and the lines roll.
function drawRecording(ctx, d, caption) {
  ctx.textBaseline = "alphabetic";
  const now = d.t * 1000, key = d.lang.code;
  let roll = rolls[key];
  if (!d.t || !roll || now < roll.at) roll = rolls[key] = new CaptionRoll();   // stopped, or Play started again
  roll.at = now;
  roll.update(ctx, caption, now);
  roll.draw(ctx, d.t ? now : Infinity);
  recordingSide(ctx, d.seconds, d.level);
}

// One large line with a hint under it (the server's renderNotice).
function drawNotice(ctx, big, small) {
  ctx.textBaseline = "alphabetic";
  ctx.font = font(24, true);
  centered(ctx, big, 30);
  ctx.font = font(12, false, small);
  centered(ctx, small, 52);
}

// Which frame of the switch-on animation is up `ms` after it started (the firmware does the same sum).
function splashFrame(ms) {
  let i = 0;
  for (let end = 0; i < SPLASH_FRAME_MS.length && ms >= (end += SPLASH_FRAME_MS[i]); i++);
  return i + 1;
}

screen({
  name: "Switching on",
  group: TODAY,
  note: "After a shake, while the device joins Wi-Fi: the hand comes in, slaps, and the last frame stays for about a second. Press Play to watch it (it repeats every three seconds here; stopped, it shows the last frame). The frames are the sprites screen/splash/1 to 6 in sprites.js.",
  draw(ctx, d) {
    const n = SPLASH_FRAME_MS.length + 1;
    drawSprite(ctx, `screen/splash/${d.t ? splashFrame((d.t * 1000) % 3000) : n}`, 0, 0, 1);
  },
});

const STANDBY_SLAP_MS = 2400;   // how often the waiting name takes a slap

screen({
  name: "Waiting",
  group: TODAY,
  note: "Plugged in and connected, before a shake starts a session: the name alone. Press Play: it pops in, bobs gently, and every couple of seconds takes a slap. On the device it moves for twelve seconds, then the screen goes dark.",
  draw(ctx, d) {
    ctx.textBaseline = "alphabetic";
    const ms = d.t ? d.t * 1000 : Infinity;
    let scale = 1, dx = 0, dy = 0, skew = -0.2, lines = 0;
    if (Number.isFinite(ms)) {
      const hit = ms % STANDBY_SLAP_MS;
      if (ms < 360) {                      // pops in: small, a little too big, then its size
        const t = ms / 360;
        scale = t < 0.7 ? 0.5 + 0.65 * (t / 0.7) : 1.15 - 0.15 * ((t - 0.7) / 0.3);
      } else if (hit < 340) {              // takes a slap: knocked sideways and leaning, with movement lines
        const left = 1 - hit / 340;
        dx = Math.round(6 * left * Math.sin(hit / 11));
        skew = -0.2 - 0.14 * left * Math.cos(hit / 15);
        lines = left > 0.3 ? 1 + (Math.floor(hit / 60) % 2) : 0;
      } else {
        dy = Math.round(1.2 * Math.sin(ms / 450));   // and bobs gently in between
      }
    }
    ctx.save();
    ctx.translate(64 + dx, 32 + dy);
    ctx.scale(scale, scale);
    ctx.transform(1, 0, skew, 1, 0, 0);    // lean the bold: the device's font has no italic
    ctx.font = font(34, true);
    ctx.textAlign = "center";
    ctx.fillText("SLAP!", 1, 12);
    ctx.restore();
    for (let k = 0; k < (lines ? 3 : 0); k++) ctx.fillRect(lines === 1 ? 0 : W - 6 - k, 20 + k * 11, 6 + k, 2);   // at the edges, clear of the word
  },
});

screen({
  name: "Listening",
  group: TODAY,
  note: "The session has started (it starts by itself once the device is switched on) and nothing has been said yet.",
  led: true,
  draw(ctx, d) {
    drawRecording(ctx, d, "");
  },
});

screen({
  name: "Captions",
  group: TODAY,
  note: "During a lecture: the latest three lines of caption (four in Japanese). Press Play: new words fade in where they belong, and when a line fills up the lines roll up by one. On the right the sound level is a column of blocks that rises with the voice, with a record dot and the timer at its foot.",
  led: true,
  draw(ctx, d) {
    drawRecording(ctx, d, d.caption);
  },
});

// ---- A shake while recording, as the server draws it (shakeLook, shakeFrame and renderDizzy in apps/api/src/oled.ts).
// The motion sensor on the USB cable says when a shake begins and when it is over. In between the words blur,
// and a shake that goes on too long leaves the cat dizzy for a while.
const SHAKE_FADE_MS = 300;    // the blur dies away over this long once the shaking stops
const DIZZY_AFTER_MS = 2500;  // shaking this long makes the cat dizzy
const DIZZY_MS = 3000;        // and it stays dizzy this long after the shaking stops

// What the screen shows at `now` for a shake that began at `startedAt` and ended at `endedAt` (Infinity while it
// goes on): { kind: "still" }, { kind: "blur", ms, over } (ms since it began, ms since it ended) or { kind: "dizzy", ms }.
function shakeLook(startedAt, endedAt, now) {
  if (!(now >= startedAt)) return { kind: "still" };
  if (Math.min(endedAt, now) - startedAt >= DIZZY_AFTER_MS) {
    return now - endedAt < DIZZY_MS ? { kind: "dizzy", ms: now - startedAt - DIZZY_AFTER_MS } : { kind: "still" };
  }
  const over = Math.max(0, now - endedAt);
  return over < SHAKE_FADE_MS ? { kind: "blur", ms: now - startedAt, over } : { kind: "still" };
}

// Blurs the caption area already drawn on ctx (x < CAPTION_W + 3, rows 0-53): each lit pixel is smeared sideways,
// thinner with distance (every other pixel one step out, every fourth two steps out) so the edge of a letter reads
// as grey on a screen that has no grey, and the whole block trembles. The level column and the timer are left alone.
function blurCaptions(ctx, ms, over = 0) {
  if (ms < 0 || over >= SHAKE_FADE_MS) return;
  const s = 1 - Math.max(0, over) / SHAKE_FADE_MS, edge = CAPTION_W + 3;
  const img = ctx.getImageData(0, 0, edge, 54).data;
  const bit = (x, y) => x >= 0 && x < edge && y >= 0 && y < 54 && img[(y * edge + x) * 4] >= 128 ? 1 : 0;
  const spread = s > 0.66 ? 2 : s > 0.33 ? 1 : 0;
  const dy = Math.round(s * Math.cos(ms / 9));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, edge, 54);
  ctx.fillStyle = "#fff";
  for (let y = 0; y < 54; y++) {
    const dx = Math.round(s * (2 * Math.sin(ms / 13) + Math.sin(ms / 7 + y / 6)));
    for (let x = 0; x < edge; x++) {
      let v = 0;
      for (let k = -spread; k <= spread && !v; k++) {
        if (Math.abs(k) === 1 && ((x + y) & 1)) continue;
        if (Math.abs(k) === 2 && ((x + 2 * y) & 3)) continue;
        v = bit(x - dx - k, y - dy);
      }
      if (v) ctx.fillRect(x, y, 1, 1);
    }
  }
}

// The dizzy cat in the caption area, `ms` after it got that way: spirals for eyes, swaying from side to side,
// with three little stars circling over its head. Drawn over the recording screen, so the side stays.
function drawDizzyCat(ctx, d, ms) {
  drawRecording(ctx, d, d.caption);      // keeps the caption's own motion going underneath
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CAPTION_W + 2, 54);
  ctx.fillStyle = "#fff";
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CAPTION_W + 2, 54);
  ctx.clip();
  const head = LAB.sprites["mascot/cat/head"], scale = 2;
  const cx = Math.floor((CAPTION_W + 2) / 2), sway = Math.round(4 * Math.sin(ms / 170));
  const x = cx - head.w * scale / 2 + sway, y = 54 - head.h * scale - 2 + Math.round(Math.cos(ms / 230));
  for (const layer of ["head", "dizzy", "quiet"]) drawSprite(ctx, `mascot/cat/${layer}`, x, y, scale);
  for (let k = 0; k < 3; k++) {
    const a = ms / 260 + k * 2 * Math.PI / 3;
    const sx = Math.round(cx + sway / 2 + 22 * Math.cos(a)), sy = Math.round(5 + 3 * Math.sin(a));
    ctx.fillRect(sx - 1, sy, 3, 1);
    ctx.fillRect(sx, sy - 1, 1, 3);
  }
  ctx.restore();
}

const LAB_SHAKES = [[0, 1200], [3000, 6000]];   // the lab's loop: a short shake, then one that goes on too long (ms)
const SHAKE_LOOP_MS = 9500;

screen({
  name: "Shaken",
  group: TODAY,
  note: "A shake while recording (the motion sensor on the USB cable feels it): the words blur for as long as it goes on, then sharpen again. Press Play: a short shake first, then one that goes on for too long, which leaves the cat dizzy for three seconds. The sound level and the timer stay put.",
  led: true,
  draw(ctx, d) {
    const now = d.t ? (d.t * 1000) % SHAKE_LOOP_MS : 0;
    const [start, end] = LAB_SHAKES.findLast(([s]) => s <= now) ?? LAB_SHAKES[0];
    const look = shakeLook(start, d.t ? end : Infinity, now);
    if (look.kind === "dizzy") return drawDizzyCat(ctx, d, look.ms);
    drawRecording(ctx, d, d.caption);
    if (look.kind === "blur") blurCaptions(ctx, look.ms, look.over);
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
