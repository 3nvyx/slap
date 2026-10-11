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
  screen: "", view: "one", lang: "en", font: "Helvetica", avatar: "", mascot: "", color: "#f2f6ff", zoom: 5, grid: true,
  classCode: "CS229", pairCode: "A7K2QX", joinBase: "https://slap.example/j/", caption: "",
  message: "Lost connection to the server", level: 0.55, seconds: 754, wifiOk: true,
  // Screen pixels per real millimetre, for the real-size views. A browser's own "mm" is rarely a true one:
  // it is 3.78 px, while Mac laptop screens are close to 5. Set exactly with the card outline on the page.
  pxPerMm: /Mac/.test(navigator.platform) ? 5 : 3.78, calibrated: false, calDpr: 0,
};
const VIEWS = ["one", "screens", "langs", "life"];

let langs, fonts, state, mockSig, timer = null, cells = [], drawErrors = [], lastFrame = null, imported = null, importedSrc = "";

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
  if (!VIEWS.includes(state.view)) state.view = "one";
  if (!(state.pxPerMm >= 2.5 && state.pxPerMm <= 9)) { state.pxPerMm = DEFAULTS.pxPerMm; state.calibrated = false; }
  if (!LAB.screens.some(s => s.name === state.screen)) state.screen = LAB.screens[0]?.name ?? "";
  if (!langs.some(l => l.code === state.lang)) state.lang = langs[0].code;
  if (!fonts.some(f => f.name === state.font)) state.font = fonts[0].name;
  if (!LAB.sprites[state.avatar]) state.avatar = Object.keys(LAB.sprites)[0] ?? "";
  // A face this browser has not shown before (just added to sprites.js) is selected straight away.
  const faces = mascotFaces(), seen = Array.isArray(state.mascotSeen) ? state.mascotSeen : [];
  const fresh = faces.find(f => !seen.includes(f));
  if (fresh) state.mascot = fresh;
  else if (!faces.includes(state.mascot)) state.mascot = faces[0] ?? "";
  state.mascotSeen = faces;
}

/** The mascot's faces: every NAME that has a "mascot/NAME/eyes" layer in sprites.js. */
const mascotFaces = () => Object.keys(LAB.sprites).map(n => n.match(/^mascot\/(.+)\/eyes$/)?.[1]).filter(Boolean);

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
    caption: mic.on && mic.speaking ? spokenCaption() : captionAt(full, t),
    fullCaption: full,
    seconds: state.seconds + t,
    level: mic.on ? mic.level : t ? state.level * (0.45 + 0.55 * Math.abs(Math.sin(t * 4.3) * Math.cos(t * 1.9))) : state.level,
    wifiOk: state.wifiOk,
    message: state.message,
    avatar: state.avatar,
    mascot: state.mascot,
    t,
  };
}

// ---- Live sound: this computer's microphone stands in for the device's

/** The server's meter (apps/api/src/ws/device.ts): -50 dBFS is an empty bar, -6 dBFS a full one. */
const micMeter = rms => rms <= 0 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(rms) + 50) / 44));

const LIVE_STORE = "slap.screen-lab.live";
const SPEECH_LOCALES = { en: "en-US", es: "es-ES", zh: "zh-CN", vi: "vi-VN", ko: "ko-KR", hi: "hi-IN", ar: "ar-SA", fr: "fr-FR", de: "de-DE", pt: "pt-BR", ja: "ja-JP", tl: "fil-PH" };
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const mic = {
  on: false, starting: false, stream: null, audio: null, analyser: null, buf: null, sampler: null,
  peak: 0, level: 0, problem: "",
  speaking: false, speech: null, speechLang: "", finals: "", interim: "", speechProblem: "",
};

/** Loudest 85 ms since the last redraw, as the device reports the loudest frame since its last message. */
function sampleMic() {
  mic.analyser.getFloatTimeDomainData(mic.buf);
  let sum = 0;
  for (const v of mic.buf) sum += v * v;
  mic.peak = Math.max(mic.peak, Math.sqrt(sum / mic.buf.length));
}

function takeMicLevel() {
  if (!mic.on) return;
  mic.level = micMeter(mic.peak);
  mic.peak = 0;
}

async function startMic() {
  if (mic.on || mic.starting) return;
  mic.problem = "";
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !Audio) {
    mic.problem = "This browser will not give the page a microphone. Open http://localhost:4173 in Chrome or Safari.";
    return micUi();
  }
  let stream;
  mic.starting = true;
  try {
    // Raw sound, as the device's microphone delivers it: no echo cancelling, noise removal or automatic volume.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    mic.problem = e.name === "NotAllowedError" || e.name === "SecurityError" ? "The microphone is blocked for this page. Allow it (the browser asks, or use the icon in the address bar), then press the button again. A browser built into another app may have no microphone at all: use Chrome or Safari."
      : e.name === "NotFoundError" ? "No microphone was found on this computer."
      : `The microphone did not start: ${e.message || e.name}`;
    rememberLive();
    return micUi();
  } finally {
    mic.starting = false;
  }
  mic.stream = stream;
  mic.audio = new Audio();
  mic.analyser = mic.audio.createAnalyser();
  mic.analyser.fftSize = 4096;
  mic.audio.createMediaStreamSource(stream).connect(mic.analyser);
  mic.buf = new Float32Array(mic.analyser.fftSize);
  mic.peak = mic.level = 0;
  mic.sampler = setInterval(sampleMic, 50);
  mic.on = true;
  // After the page reloads itself the browser may hold the sound back until the page is clicked.
  mic.audio.onstatechange = micUi;
  if (mic.audio.state === "suspended") {
    mic.audio.resume().catch(() => {});
    document.addEventListener("pointerdown", () => mic.audio?.resume(), { once: true });
  }
  if ($("speech").checked) startSpeech();
  rememberLive();
  if (!timer) setPlaying(true);
  micUi();
}

function stopMic() {
  if (!mic.on) return;
  mic.on = false;
  stopSpeech();
  clearInterval(mic.sampler);
  for (const track of mic.stream.getTracks()) track.stop();
  mic.audio.onstatechange = null;
  mic.audio.close().catch(() => {});
  mic.stream = mic.audio = mic.analyser = null;
  rememberLive();
  micUi();
}

/** Keeps a long talk short: the screens only ever show the last few lines. */
function captionTail(text) {
  const t = text.trim();
  if (t.length <= 240) return t;
  const cut = t.slice(-240), space = cut.indexOf(" ");
  return space > 0 && space < 30 ? cut.slice(space + 1) : cut;
}

/** Same placeholder as the server while nothing has been heard yet. */
const spokenCaption = () => captionTail(`${mic.finals} ${mic.interim}`) || "Listening...";

function startSpeech() {
  if (!Recognition || !mic.on || mic.speech) return;
  const r = new Recognition();
  r.continuous = true;
  r.interimResults = true;
  r.lang = SPEECH_LOCALES[state.lang] || state.lang;
  r.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript;
      if (e.results[i].isFinal) mic.finals = captionTail(`${mic.finals} ${text}`);
      else interim += text;
    }
    mic.interim = interim;
  };
  r.onerror = e => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    mic.speechProblem = e.error === "not-allowed" ? "Speech-to-text is blocked for this page. Allow the microphone in the browser, then tick the box again."
      : e.error === "language-not-supported" ? `This browser has no speech-to-text for ${currentLang().name}. Pick another language.`
      : "Speech-to-text did not start in this browser. Open http://localhost:4173 in Chrome or Safari and try again.";
    $("speech").checked = false;
    stopSpeech();
    rememberLive();
  };
  // The browser ends a session after a pause; start the next one while the box stays ticked.
  r.onend = () => {
    if (mic.speech !== r) return;
    mic.speech = null;
    mic.interim = "";
    if (mic.on && mic.speaking) setTimeout(startSpeech, 300);
  };
  try { r.start(); } catch { return; }
  mic.speech = r;
  mic.speechLang = state.lang;
  mic.speaking = true;
  mic.speechProblem = "";
  micUi();
}

function stopSpeech() {
  const r = mic.speech;
  mic.speaking = false;
  mic.speech = null;
  mic.finals = mic.interim = "";
  try { r?.abort(); } catch { /* already ended */ }
  micUi();
}

/** Switching language while talking: listen for the new one. */
function followSpeechLang() {
  if (!mic.speech || mic.speechLang === state.lang) return;
  stopSpeech();
  startSpeech();
}

/** The page reloads itself when a file changes; this turns the microphone back on afterwards. */
function rememberLive() {
  try {
    if (mic.on) sessionStorage.setItem(LIVE_STORE, $("speech").checked ? "speech" : "mic");
    else sessionStorage.removeItem(LIVE_STORE);
  } catch { /* storage blocked */ }
}

function micUi() {
  const waiting = mic.on && mic.audio?.state === "suspended";
  $("mic").textContent = mic.on ? "■ Stop the microphone" : "Use this laptop's microphone";
  $("mic").classList.toggle("on", mic.on);
  $("micNote").textContent = mic.problem
    || (waiting ? "Click anywhere on the page to wake the microphone."
      : mic.on ? "Listening. The sound level on the screen follows your voice."
      : "The sound level on the screen follows this laptop's microphone instead of the slider.");
  $("micNote").classList.toggle("bad", !!mic.problem || waiting);
  $("speech").disabled = !Recognition;
  $("speechRow").classList.toggle("off", !Recognition);
  $("speechNote").textContent = !Recognition ? "This browser cannot turn speech into text. Chrome and Safari can."
    : mic.speechProblem
    || (mic.speaking ? `Listening for ${currentLang().name}. Change the language below to speak another one.`
      : "Speak the language chosen below. The browser sends the sound to its own speech service to make the text.");
  $("speechNote").classList.toggle("bad", !!Recognition && !!mic.speechProblem);
  const slider = document.querySelector('[data-key="level"]');
  slider.disabled = mic.on;
  if (!mic.on) slider.value = state.level;
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

const AVATAR_STORE = "slap.screen-lab.avatar";

function showImported(art) {
  sprite("imported", art);
  $("imgCode").value = `sprite("my-avatar", \`\n${art}\n\`);`;
  $("imgOut").hidden = false;
}

function convertImported() {
  if (!imported) return;
  const opts = { size: Number($("imgSize").value), dither: $("imgDither").checked, invert: $("imgInvert").checked };
  const art = imageToArt(imported, opts.size, opts.dither, opts.invert);
  showImported(art);
  try { localStorage.setItem(AVATAR_STORE, JSON.stringify({ ...opts, art, src: importedSrc })); } catch { /* storage blocked or full */ }
  state.avatar = "imported";
  fillSelects();
  changed();
}

/** A small copy of the picture (longest side 256 px): enough for a 64 px avatar, and small enough to remember. */
function keepPicture(bmp) {
  const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, c.width, c.height);
  imported = c;
  importedSrc = c.toDataURL("image/png");
}

/** The last converted picture comes back after a refresh (the page also reloads itself when a file changes). */
function restoreImported() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AVATAR_STORE)); } catch { /* storage blocked */ }
  if (!saved?.art) return;
  if ([...$("imgSize").options].some(o => o.value === String(saved.size))) $("imgSize").value = saved.size;
  $("imgDither").checked = !!saved.dither;
  $("imgInvert").checked = !!saved.invert;
  showImported(saved.art);
  if (!saved.src) return;
  const img = new Image();
  img.onload = () => { imported = img; importedSrc = saved.src; };
  img.src = saved.src;
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
  // A name with "/" is a part of a layered character (see the mascot in sprites.js), not an avatar of its own.
  $("avatar").replaceChildren(...Object.keys(LAB.sprites).filter(n => !n.includes("/")).map(n => el("option", { value: n }, n)));
  $("mascot").replaceChildren(...mascotFaces().map(n => el("option", { value: n }, n)));
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
      el("button", { className: "item", onclick: () => { state.screen = s.name; if (state.view !== "life") state.view = "one"; changed(); } }, s.name)),
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
  if (state.view === "one" || state.view === "life") {
    const def = currentScreen();
    lastFrame = run(def, mockData());
    if (state.view === "one") {
      paint($("oled"), lastFrame, fitZoom(), state.grid, state.color);
      paint($("real"), lastFrame, 6, false, state.color);   // drawn large, shown small: the browser scales it down evenly
    } else {
      paint($("lifeScreen"), lastFrame, 6, false, state.color);
    }
    let on = 0;
    for (const byte of lastFrame) for (let b = byte; b; b >>= 1) on += b & 1;
    $("name").textContent = $("lifeName").textContent = def.name;
    $("note").textContent = def.note || "";
    $("stats").textContent = `128 × 64 pixels · ${on.toLocaleString()} lit (${Math.round(on / (W * H) * 100)}%)`;
    $("led").classList.toggle("on", !!def.led);
    $("lifeLed").classList.toggle("on", !!def.led);
  } else {
    for (const c of cells) paint(c.canvas, run(c.def, mockData(c.lang)), 2, false, state.color);
  }
  if (mic.on) document.querySelector('[data-key="level"]').value = mic.level;
  showErrors();
}

/** Real-size views: one real millimetre is `--mm` on the page. */
function applyScale() {
  document.documentElement.style.setProperty("--mm", `${state.pxPerMm}px`);
  const moved = state.calibrated && state.calDpr && state.calDpr !== window.devicePixelRatio;
  const exact = state.calibrated && !moved;
  $("realNote").textContent = exact ? "Real size (55 × 27 mm). Lean back to see what a student sees."
    : "About the real size (55 × 27 mm). Open “Real size” at the top to make it exact.";
  $("lifeNote").textContent = exact ? "The device as large as the real one: 104.5 × 56 mm, with a 55 × 27 mm screen. Step back to where a student would sit."
    : "Close to the real size (104.5 × 56 mm), not exact yet. Use the box below once to set it for this screen.";
  $("calNote").textContent = moved ? "The page zoom or the monitor has changed since this was set. Check it against the card again."
    : state.calibrated ? "Set for this screen. Do it again if you zoom the page or move the window to another monitor."
    : "Not set yet: the size shown is a guess for this kind of screen.";
  $("calNote").classList.toggle("bad", !!moved);
}

/** Something in `state` changed: save it, bring the page in line, redraw. */
function changed() {
  save();
  useFont(state.font);
  syncControls();
  for (const b of document.querySelectorAll("#views button")) b.classList.toggle("on", b.dataset.view === state.view);
  for (const b of document.querySelectorAll("#screens .item")) b.classList.toggle("on", b.textContent === state.screen);
  const grid = state.view === "screens" || state.view === "langs";
  $("one").hidden = state.view !== "one";
  $("life").hidden = state.view !== "life";
  $("cells").hidden = !grid;
  if (grid) buildCells();
  applyScale();
  followSpeechLang();
  render();
}

function setPlaying(on) {
  clearInterval(timer);
  timer = null;
  state.t = 0;
  if (!on) stopMic();
  if (on) timer = setInterval(() => { state.t += 0.2; takeMicLevel(); render(); }, 200);   // 5 fps, the device's redraw limit
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
      // "reload" also refreshes the browser's stored copy, so the page reload below cannot pick up a stale file.
      const sig = (await Promise.all(files.map(f => fetch(f, { cache: "reload" }).then(r => r.text())))).join("\u0000");
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
  restoreImported();
  loadState();
  buildSidebar();
  fillSelects();
  $("calBox").open = !state.calibrated;

  for (const input of document.querySelectorAll("[data-key]")) {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      state[key] = input.type === "checkbox" ? input.checked : input.type === "range" || input.type === "number" || key === "zoom" ? Number(input.value) : input.value;
      if (key === "pxPerMm") { state.calibrated = true; state.calDpr = window.devicePixelRatio; }
      changed();
    });
  }
  for (const b of document.querySelectorAll("#views button")) b.onclick = () => { state.view = b.dataset.view; changed(); };
  $("play").onclick = () => setPlaying(!timer);
  $("mic").onclick = () => mic.on ? setPlaying(false) : startMic();
  $("speech").onchange = () => {
    mic.speechProblem = "";
    if (!$("speech").checked) stopSpeech();
    else if (mic.on) startSpeech();
    else startMic();   // ticking the box is also a way to start listening
    rememberLive();
    render();
  };
  $("png").onclick = savePng;
  $("fontFile").onchange = e => { if (e.target.files[0]) loadFontFile(e.target.files[0]); e.target.value = ""; };
  $("imgFile").onchange = async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try { keepPicture(await createImageBitmap(file)); } catch { LAB.loadErrors.push(`"${file.name}" is not a picture this browser can read.`); return showErrors(); }
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
  micUi();
  watchFiles();

  let live = null;
  try { live = sessionStorage.getItem(LIVE_STORE); } catch { /* storage blocked */ }
  if (live) { $("speech").checked = live === "speech" && !!Recognition; startMic(); }
}

document.addEventListener("DOMContentLoaded", boot);
