"use strict";
// Screen lab engine. Runs a screen's draw() on a 128x64 canvas, thresholds it to 1 bit the same
// way apps/api/src/oled.ts does (packXbm), and paints the result as OLED pixels.
// Screens, avatars and mock data live in screens.js, sprites.js and data.js.

const W = 128, H = 64;

const LAB = { screens: [], sprites: {}, fontFamily: "Helvetica", loadErrors: [] };

window.addEventListener("error", e => {
  LAB.loadErrors.push(`${(e.filename || "").split("/").pop()}:${e.lineno}  ${e.message}`);
  if (typeof showErrors === "function" && document.readyState === "complete") showErrors();
});

/** Registers a screen: { name, group, note?, led?, draw(ctx, d) }. */
function screen(def) { LAB.screens.push(def); }

/** Registers an avatar from pixel art: one text row per pixel row, "#" = lit, "." = off. */
function sprite(name, art) {
  const rows = String(art).split("\n").map(r => r.trim()).filter(Boolean);
  LAB.sprites[name] = { name, rows, w: Math.max(0, ...rows.map(r => r.length)), h: rows.length };
}

// ---- Drawing helpers. font, wrapText, centered, fitFont, drawQr and mmss match
// apps/api/src/oled.ts, so a draw() that only uses them can move to the server unchanged.

const font = (px, bold = false) => `${bold ? "bold " : ""}${px}px "${LAB.fontFamily}", sans-serif`;

/** Greedy word wrap by measured width; words longer than a line are split by characters. */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const raw of String(text).split(/\s+/).filter(Boolean)) {
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

function centered(ctx, text, y, x0 = 0, width = W) {
  ctx.fillText(text, x0 + Math.max(0, (width - ctx.measureText(text).width) / 2), y);
}

/** Largest font size (<= max) at which `text` fits `width`. */
function fitFont(ctx, text, width, max, bold = true) {
  let px = max;
  for (; px > 8; px--) { ctx.font = font(px, bold); if (ctx.measureText(text).width <= width) break; }
  return px;
}

/** Draws a QR code with dark modules on a lit square (2-module quiet zone) at (x, y), size <= box px. */
function drawQr(ctx, text, x, y, box) {
  const qr = qrcode(0, "L");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), total = n + 4;
  const scale = Math.floor(box / total);
  if (scale < 1) return false;
  const side = total * scale, ox = x + Math.floor((box - side) / 2), oy = y + Math.floor((box - side) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(ox, oy, side, side);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + (c + 2) * scale, oy + (r + 2) * scale, scale, scale);
  }
  ctx.fillStyle = "#fff";
  return true;
}

const mmss = s => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const pad = v => String(v).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/** Draws a registered avatar with its top-left corner at (x, y); each art pixel becomes scale x scale. */
function drawSprite(ctx, name, x, y, scale = 1) {
  const s = LAB.sprites[name];
  if (!s) return;
  s.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] !== "." && row[c] !== " ") ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
  });
}

/** Size of an avatar at the largest whole scale that fits the box: { w, h, scale }. */
function spriteFit(name, boxW, boxH) {
  const s = LAB.sprites[name];
  if (!s || !s.w || !s.h) return { w: 0, h: 0, scale: 1 };
  const scale = Math.max(1, Math.floor(Math.min(boxW / s.w, boxH / s.h)));
  return { w: s.w * scale, h: s.h * scale, scale };
}

// ---- Matching the server's text
// The server draws with @napi-rs/canvas, which places text differently from a browser in two ways
// that show at this size. matchServerText() makes the lab's canvas behave the same.
//  1. textBaseline "top": the baseline sits at y + round(ascent) - (underline position + thickness),
//     1 to 4 px higher than a browser puts it.
//  2. Only the regular face of Helvetica and Menlo is loaded (the first face in the .ttc), so their
//     bold is the regular outline thickened (Skia fake bold), with the regular widths.
// Measured from @napi-rs/canvas 0.1.100 on macOS, as fractions of the font size. A font that is
// not listed gets its ascent from the browser and a typical underline value: close, not exact.
// Since 10 October 2026 the server draws with the files in apps/api/fonts, not Helvetica: Noto Sans
// (regular and a real bold, so no fakeBold), and Fusion Pixel 12px for Chinese, Japanese and Korean.
// Their entries apply once FONTS in data.js has those files under these names.
const SERVER_FONTS = {
  "Noto Sans": { ascent: 1.069, under: 0.15 },
  "Fusion Pixel 12px": { ascent: 1.0833, under: 0.1667, fakeBold: true },
  "Helvetica": { ascent: 0.77, under: 0.125, fakeBold: true },
  "Arial": { ascent: 0.9053, under: 0.1792 },
  "Verdana": { ascent: 1.0054, under: 0.1465 },
  "Georgia": { ascent: 0.917, under: 0.1377 },
  "Menlo": { ascent: 0.9282, under: 0.1074, fakeBold: true },
  "Courier New": { ascent: 0.8325, under: 0.2739 },
};
const FAKE_BOLD = 2;   // stroke width as a multiple of Skia's embolden amount; 2 is the closest match to the server's frames
const BOLD = /(^|\s)(bold|[6-9]00)\s/;
const guessed = {};
const text = { px: 10, fake: false };   // font size and fake-bold flag of the font set on the canvas

function serverFont() {
  const name = LAB.fontFamily;
  if (SERVER_FONTS[name]) return SERVER_FONTS[name];
  if (guessed[name]) return guessed[name];
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = `1000px "${name}"`;
  const guess = { ascent: ctx.measureText("H").fontBoundingBoxAscent / 1000, under: 0.14 };
  if (document.fonts.check(`12px "${name}"`)) guessed[name] = guess;   // not while a web font is still loading
  return guess;
}

function matchServerText(ctx) {
  if (ctx.matched) return;
  ctx.matched = true;
  const fontProp = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "font");
  Object.defineProperty(ctx, "font", {
    get: () => fontProp.get.call(ctx),
    set(v) {
      text.fake = BOLD.test(v) && !!serverFont().fakeBold;
      fontProp.set.call(ctx, text.fake ? v.replace(BOLD, "$1") : v);
      text.px = parseFloat(/([\d.]+)px/.exec(fontProp.get.call(ctx))?.[1] ?? "10");
    },
  });
  const native = { fillText: ctx.fillText.bind(ctx), strokeText: ctx.strokeText.bind(ctx) };
  for (const fn of ["fillText", "strokeText"]) {
    ctx[fn] = (str, x, y, ...rest) => {
      const top = ctx.textBaseline === "top", f = serverFont();
      if (top) { ctx.textBaseline = "alphabetic"; y += Math.round(f.ascent * text.px) - f.under * text.px; }
      native[fn](str, x, y, ...rest);
      if (text.fake && fn === "fillText") {
        const { lineWidth, strokeStyle, lineJoin } = ctx;
        // Skia's embolden amount: size/24 at 9 px and below, easing to size/32 at 36 px.
        const k = Math.min(1, Math.max(0, (text.px - 9) / 27));
        Object.assign(ctx, { lineWidth: FAKE_BOLD * text.px * (1 / 24 + k * (1 / 32 - 1 / 24)), strokeStyle: ctx.fillStyle, lineJoin: "miter" });
        native.strokeText(str, x, y, ...rest);
        Object.assign(ctx, { lineWidth, strokeStyle, lineJoin });
      }
      if (top) ctx.textBaseline = "top";
    };
  }
}

// ---- Engine

/** Packs RGBA pixels into XBM bits: a pixel is lit when its red channel is >= threshold. */
function packXbm(rgba, width = W, height = H, threshold = 128) {
  const stride = Math.ceil(width / 8);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4] >= threshold) out[y * stride + (x >> 3)] |= 1 << (x & 7);
    }
  }
  return out;
}

const offscreen = document.createElement("canvas");

/** Black canvas, white ink, textBaseline top (as the server's render()); returns the 1,024-byte frame. */
function renderFrame(def, d) {
  offscreen.width = W;   // assigning the size also resets every canvas setting
  offscreen.height = H;
  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  matchServerText(ctx);
  text.px = 10;
  text.fake = false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.textBaseline = "top";
  let error = null;
  try { def.draw(ctx, d); } catch (e) { error = e; }
  return { frame: packXbm(ctx.getImageData(0, 0, W, H).data), error };
}

const lit = (frame, x, y) => ((frame[y * 16 + (x >> 3)] >> (x & 7)) & 1) === 1;

function paint(canvas, frame, scale, grid, color) {
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = color;
  const size = scale - (grid && scale >= 4 ? 1 : 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (lit(frame, x, y)) g.fillRect(x * scale, y * scale, size, size);
}

// ---- State

const STORE = "slap.screen-lab";
const DATA_KEYS = ["classCode", "pairCode", "joinBase", "caption", "message", "level", "seconds", "wifiOk"];
const DEFAULTS = {
  screen: "", view: "one", lang: "en", font: "Helvetica", avatar: "", color: "#f2f6ff", zoom: 5, grid: true,
  classCode: "CS229", pairCode: "A7K2QX", joinBase: "https://slap.example/j/", caption: "",
  message: "Lost connection to the server", level: 0.55, seconds: 754, wifiOk: true,
};

let langs, fonts, state, mockSig, timer = null, cells = [], drawErrors = [], lastFrame = null, imported = null;

const $ = id => document.getElementById(id);

function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ ...state, t: 0, mockSig })); } catch { /* storage blocked */ }
}

function loadState() {
  const mock = typeof MOCK !== "undefined" ? MOCK : {};
  mockSig = JSON.stringify(mock);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* storage blocked */ }
  // Edited data.js since the last visit: its values win over what was typed into the controls.
  if (saved.mockSig !== mockSig) for (const k of DATA_KEYS) delete saved[k];
  state = { ...DEFAULTS, ...mock, ...saved, t: 0 };
  if (!LAB.screens.some(s => s.name === state.screen)) state.screen = LAB.screens[0]?.name ?? "";
  if (!langs.some(l => l.code === state.lang)) state.lang = langs[0].code;
  if (!fonts.some(f => f.name === state.font)) state.font = fonts[0].name;
  if (!LAB.sprites[state.avatar]) state.avatar = Object.keys(LAB.sprites)[0] ?? "";
}

const currentScreen = () => LAB.screens.find(s => s.name === state.screen) ?? LAB.screens[0];
const currentLang = () => langs.find(l => l.code === state.lang) ?? langs[0];

/** While playing, the caption arrives a word (or a character, for scripts without spaces) at a time. */
function captionAt(full, t) {
  if (!t) return full;
  const words = full.split(/\s+/).filter(Boolean);
  const byWord = words.length > 3;
  const units = byWord ? words.map((w, i) => (i ? " " : "") + w) : Array.from(full);
  const rate = byWord ? 3 : 7;
  return units.slice(0, Math.floor(t * rate) % (units.length + rate * 2) + 1).join("");
}

/** The `d` every draw() receives. */
function mockData(lang = currentLang()) {
  const t = state.t;
  const full = state.caption.trim() || lang.sample.join(" ");
  return {
    classCode: state.classCode,
    pairCode: state.pairCode,
    joinUrl: state.joinBase + encodeURIComponent(state.classCode),
    lang,
    caption: captionAt(full, t),
    fullCaption: full,
    seconds: state.seconds + t,
    level: t ? state.level * (0.45 + 0.55 * Math.abs(Math.sin(t * 4.3) * Math.cos(t * 1.9))) : state.level,
    wifiOk: state.wifiOk,
    message: state.message,
    avatar: state.avatar,
    t,
  };
}

// ---- Fonts

const fontsStarted = new Set();

function useFont(name) {
  const f = fonts.find(x => x.name === name);
  LAB.fontFamily = name;
  if (!f || fontsStarted.has(name)) return;
  fontsStarted.add(name);
  if (f.file) {
    const face = new FontFace(name, `url("${encodeURI(f.file)}")`);
    face.load().then(() => { document.fonts.add(face); render(); })
      .catch(() => { LAB.loadErrors.push(`Font "${name}": could not load ${f.file}`); showErrors(); });
  } else if (f.google) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}&display=swap`;
    document.head.append(link);
    link.onload = () => document.fonts.load(`12px "${name}"`).then(render, render);
  }
}

function fontLabel(f) {
  return f.name + (f.google ? "  (web)" : f.file ? "  (file)" : f.temp ? "  (loaded, not saved)" : "") + (f.note ? `  · ${f.note}` : "");
}

async function loadFontFile(file) {
  const name = file.name.replace(/\.[^.]+$/, "");
  try {
    const face = await new FontFace(name, await file.arrayBuffer()).load();
    document.fonts.add(face);
  } catch {
    LAB.loadErrors.push(`"${file.name}" is not a font file this browser can read (use .ttf, .otf, .woff or .woff2).`);
    return showErrors();
  }
  fontsStarted.add(name);
  if (!fonts.some(f => f.name === name)) fonts.push({ name, temp: true });
  state.font = name;
  fillSelects();
  changed();
}

// ---- Picture -> avatar

function imageToArt(bmp, size, dither, invert) {
  const k = Math.min(Math.min(size, W) / bmp.width, Math.min(size, H) / bmp.height);
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
    lum[i] = (invert ? 1 - v : v) * (px[i * 4 + 3] / 255);
  }
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const i = y * w + x, on = lum[i] >= 0.5;
      if (dither) {   // Floyd–Steinberg: pushes the rounding error onto the neighbours, so greys become dot patterns
        const err = lum[i] - (on ? 1 : 0);
        if (x + 1 < w) lum[i + 1] += err * 7 / 16;
        if (y + 1 < h) {
          if (x > 0) lum[i + w - 1] += err * 3 / 16;
          lum[i + w] += err * 5 / 16;
          if (x + 1 < w) lum[i + w + 1] += err / 16;
        }
      }
      row += on ? "#" : ".";
    }
    rows.push(row);
  }
  return rows.join("\n");
}

function convertImported() {
  if (!imported) return;
  const art = imageToArt(imported, Number($("imgSize").value), $("imgDither").checked, $("imgInvert").checked);
  sprite("imported", art);
  $("imgCode").value = `sprite("my-avatar", \`\n${art}\n\`);`;
  $("imgOut").hidden = false;
  state.avatar = "imported";
  fillSelects();
  changed();
}

// ---- UI

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function fillSelects() {
  $("lang").replaceChildren(...langs.map(l => el("option", { value: l.code }, `${l.name} · ${l.native}`)));
  $("font").replaceChildren(...fonts.map(f => el("option", { value: f.name }, fontLabel(f))));
  $("avatar").replaceChildren(...Object.keys(LAB.sprites).map(n => el("option", { value: n }, n)));
  syncControls();
}

function syncControls() {
  for (const input of document.querySelectorAll("[data-key]")) {
    const v = state[input.dataset.key];
    if (input.type === "checkbox") input.checked = !!v;
    else if (document.activeElement !== input) input.value = v;
  }
}

function buildSidebar() {
  const groups = [...new Set(LAB.screens.map(s => s.group || "Screens"))];
  $("screens").replaceChildren(...groups.flatMap(group => [
    el("h2", {}, group),
    ...LAB.screens.filter(s => (s.group || "Screens") === group).map(s =>
      el("button", { className: "item", onclick: () => { state.screen = s.name; state.view = "one"; changed(); } }, s.name)),
  ]));
}

function buildCells() {
  const def = currentScreen();
  const list = state.view === "screens"
    ? LAB.screens.map(s => ({ label: s.name, def: s, lang: undefined, pick: () => { state.screen = s.name; state.view = "one"; changed(); } }))
    : langs.map(l => ({ label: `${l.native} · ${l.name}`, def, lang: l, pick: () => { state.lang = l.code; state.view = "one"; changed(); } }));
  cells = list.map(c => ({ ...c, canvas: el("canvas") }));
  $("cells").replaceChildren(...cells.map(c => el("button", { className: "cell", onclick: c.pick }, c.canvas, el("span", {}, c.label))));
}

/** The chosen zoom, or the largest whole zoom the page has room for (a fractional one would smear the pixels). */
function fitZoom() {
  const face = document.querySelector(".face");
  const room = $("stage").clientWidth - 48 - 36 - 20 - (face.offsetWidth ? face.offsetWidth + 18 : 0);
  return Math.max(2, Math.min(state.zoom, Math.floor(room / W)));
}

function showErrors() {
  const all = [...LAB.loadErrors, ...drawErrors];
  $("error").hidden = !all.length;
  $("errorText").textContent = all.join("\n");
}

function render() {
  if (!state || !LAB.screens.length) return;
  LAB.fontFamily = state.font;
  drawErrors = [];
  const run = (def, d) => {
    const { frame, error } = renderFrame(def, d);
    if (error) drawErrors.push(`Screen "${def.name}": ${error.message}`);
    return frame;
  };
  if (state.view === "one") {
    const def = currentScreen();
    lastFrame = run(def, mockData());
    paint($("oled"), lastFrame, fitZoom(), state.grid, state.color);
    paint($("real"), lastFrame, 3, false, state.color);
    let on = 0;
    for (const byte of lastFrame) for (let b = byte; b; b >>= 1) on += b & 1;
    $("name").textContent = def.name;
    $("note").textContent = def.note || "";
    $("stats").textContent = `128 × 64 pixels · ${on.toLocaleString()} lit (${Math.round(on / (W * H) * 100)}%)`;
    $("led").classList.toggle("on", !!def.led);
  } else {
    for (const c of cells) paint(c.canvas, run(c.def, mockData(c.lang)), 2, false, state.color);
  }
  showErrors();
}

/** Something in `state` changed: save it, bring the page in line, redraw. */
function changed() {
  save();
  useFont(state.font);
  syncControls();
  for (const b of document.querySelectorAll("#views button")) b.classList.toggle("on", b.dataset.view === state.view);
  for (const b of document.querySelectorAll("#screens .item")) b.classList.toggle("on", b.textContent === state.screen);
  $("one").hidden = state.view !== "one";
  $("cells").hidden = state.view === "one";
  if (state.view !== "one") buildCells();
  render();
}

function setPlaying(on) {
  clearInterval(timer);
  timer = null;
  state.t = 0;
  if (on) timer = setInterval(() => { state.t += 0.2; render(); }, 200);   // 5 fps, the device's redraw limit
  $("play").textContent = on ? "■ Stop" : "▶ Play";
  $("play").classList.toggle("on", on);
  render();
}

function savePng() {
  if (!lastFrame) return;
  const c = document.createElement("canvas");
  paint(c, lastFrame, 8, false, "#ffffff");
  el("a", { href: c.toDataURL("image/png"), download: `${state.screen.replace(/[^\w]+/g, "-").toLowerCase()}-${state.lang}.png` }).click();
}

/** Served over http (not opened as a file): reload when a file in this folder changes. */
function watchFiles() {
  if (!location.protocol.startsWith("http")) return;
  const files = ["index.html", "lab.js", "data.js", "sprites.js", "screens.js"];
  let last = null;
  setInterval(async () => {
    try {
      const sig = (await Promise.all(files.map(f => fetch(f, { cache: "no-store" }).then(r => r.text())))).join("\u0000");
      if (last !== null && sig !== last) location.reload();
      last = sig;
    } catch { /* server stopped */ }
  }, 1000);
  $("live").textContent = "Updates by itself when a file changes";
}

function boot() {
  langs = typeof LANGUAGES !== "undefined" && LANGUAGES.length ? LANGUAGES : [{ code: "en", name: "English", native: "English", sample: ["Hello"] }];
  fonts = typeof FONTS !== "undefined" && FONTS.length ? [...FONTS] : [{ name: "Helvetica" }];
  if (!LAB.screens.length) LAB.loadErrors.push("No screens found: screens.js did not load.");
  loadState();
  buildSidebar();
  fillSelects();

  for (const input of document.querySelectorAll("[data-key]")) {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = input.type === "checkbox" ? input.checked : input.type === "range" || input.type === "number" || key === "zoom" ? Number(input.value) : input.value;
      changed();
    });
  }
  for (const b of document.querySelectorAll("#views button")) b.onclick = () => { state.view = b.dataset.view; changed(); };
  $("play").onclick = () => setPlaying(!timer);
  $("png").onclick = savePng;
  $("fontFile").onchange = e => { if (e.target.files[0]) loadFontFile(e.target.files[0]); e.target.value = ""; };
  $("imgFile").onchange = async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try { imported = await createImageBitmap(file); } catch { LAB.loadErrors.push(`"${file.name}" is not a picture this browser can read.`); return showErrors(); }
    convertImported();
  };
  for (const id of ["imgSize", "imgDither", "imgInvert"]) $(id).onchange = convertImported;
  $("imgCopy").onclick = () => navigator.clipboard?.writeText($("imgCode").value).then(() => { $("imgCopy").textContent = "Copied"; setTimeout(() => $("imgCopy").textContent = "Copy", 1200); });
  $("errorDismiss").onclick = () => { LAB.loadErrors = []; showErrors(); };
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea, select") || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const i = LAB.screens.indexOf(currentScreen()) + (e.key === "ArrowDown" ? 1 : -1);
    if (LAB.screens[i]) { state.screen = LAB.screens[i].name; changed(); e.preventDefault(); }
  });
  window.addEventListener("resize", render);
  document.fonts.addEventListener("loadingdone", render);   // web fonts arrive in pieces (per script)

  changed();
  watchFiles();
}

document.addEventListener("DOMContentLoaded", boot);
