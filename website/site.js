"use strict";
// Everything that moves on the Slap website: the device screen, the live-caption demo,
// the language buttons, the open/close lists, and the "Conversation" side bar.

// ---- Settings

// The web address of the Slap app, for example "https://slap.example". While this is empty the
// site is not connected to the app and the "Sign in" links in the footer stay hidden.
var APP_URL = "";

// The class shown in the demo.
var DEMO_CLASS = "CS229";

// What the lecturer "says" in the demo, with its translation in each language offered by the
// buttons in the hero. To add a language: add its line to every sentence, add it to LANG_NAMES,
// and add a button with the same data-lang in index.html.
var LINES = [
  {
    en: "So what does a Gaussian look like?",
    es: "Entonces, ¿cómo es una gaussiana?",
    zh: "那么，高斯分布是什么样子的？",
    ja: "では、ガウス分布はどんな形でしょうか。",
    vi: "Vậy phân phối Gauss trông như thế nào?",
    ko: "그렇다면 가우시안은 어떻게 생겼을까요?",
    fr: "Alors, à quoi ressemble une gaussienne ?",
    de: "Wie sieht also eine Gauß-Verteilung aus?",
    pt: "Então, como é uma gaussiana?",
  },
  {
    en: "The mean is its center.",
    es: "La media es su centro.",
    zh: "均值就是它的中心。",
    ja: "平均がその中心です。",
    vi: "Giá trị trung bình là tâm của nó.",
    ko: "평균이 그 중심입니다.",
    fr: "La moyenne est son centre.",
    de: "Der Mittelwert ist ihr Zentrum.",
    pt: "A média é o seu centro.",
  },
  {
    en: "With enough data, this is a pretty good model.",
    es: "Con suficientes datos, este es un modelo bastante bueno.",
    zh: "只要数据足够多，这就是一个相当不错的模型。",
    ja: "データが十分にあれば、これはかなり良いモデルです。",
    vi: "Khi có đủ dữ liệu, đây là một mô hình khá tốt.",
    ko: "데이터가 충분하면 이것은 꽤 좋은 모델입니다.",
    fr: "Avec assez de données, c'est un assez bon modèle.",
    de: "Mit genügend Daten ist das ein ziemlich gutes Modell.",
    pt: "Com dados suficientes, este é um modelo bastante bom.",
  },
  {
    en: "So it's a great place to start.",
    es: "Así que es un excelente punto de partida.",
    zh: "所以这是一个很好的起点。",
    ja: "ですから、出発点として最適です。",
    vi: "Vì vậy đây là một điểm khởi đầu tuyệt vời.",
    ko: "그래서 시작하기에 아주 좋은 출발점입니다.",
    fr: "C'est donc un excellent point de départ.",
    de: "Es ist also ein großartiger Ausgangspunkt.",
    pt: "Por isso, é um ótimo ponto de partida.",
  },
];

var LANG_NAMES = { es: "Español", zh: "中文", ja: "日本語", vi: "Tiếng Việt", ko: "한국어", fr: "Français", de: "Deutsch", pt: "Português" };

var TICK_MS = 250;   // one new word every tick
var PAUSE = 6;       // ticks of silence after each sentence

var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- The device screen: 128 x 64 pixels, each one on or off, as on the real OLED.
// The two screens below are the ones the device shows today ("Ready" and "Recording").

var W = 128, H = 64, SCALE = 4;
var OLED_COLOR = getComputedStyle(document.documentElement).getPropertyValue("--oled").trim() || "#dff1ff";
var offscreen = document.createElement("canvas");

function font(px, bold) { return (bold ? "bold " : "") + px + 'px "Helvetica Neue", Helvetica, Arial, sans-serif'; }

function wrapText(ctx, text, maxWidth) {
  var lines = [], line = "";
  String(text).split(/\s+/).filter(Boolean).forEach(function (word) {
    var next = line ? line + " " + word : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else { if (line) lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
}

function centered(ctx, text, y, x0, width) {
  ctx.fillText(text, x0 + Math.max(0, (width - ctx.measureText(text).width) / 2), y);
}

function fitFont(ctx, text, width, max) {
  var px = max;
  for (; px > 8; px--) { ctx.font = font(px, true); if (ctx.measureText(text).width <= width) break; }
  return px;
}

function drawQr(ctx, text, x, y, box) {
  if (typeof qrcode !== "function") return false;
  var qr = qrcode(0, "L");
  qr.addData(text);
  qr.make();
  var n = qr.getModuleCount(), total = n + 4, scale = Math.floor(box / total);
  if (scale < 1) return false;
  var side = total * scale, ox = x + Math.floor((box - side) / 2), oy = y + Math.floor((box - side) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(ox, oy, side, side);
  ctx.fillStyle = "#000";
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(ox + (c + 2) * scale, oy + (r + 2) * scale, scale, scale);
  ctx.fillStyle = "#fff";
  return true;
}

function mmss(s) {
  var t = Math.max(0, Math.floor(s)), m = Math.floor(t / 60), sec = t % 60;
  return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
}

var SCREENS = {
  ready: function (ctx, d) {
    var x0 = 66, w = W - x0;
    if (!drawQr(ctx, d.joinUrl, 0, 0, 64)) { x0 = 0; w = W; }
    ctx.font = font(fitFont(ctx, d.classCode, w - 2, 18), true);
    centered(ctx, d.classCode, 4, x0, w);
    ctx.font = font(11);
    centered(ctx, "slap to", 28, x0, w);
    centered(ctx, "start", 40, x0, w);
  },
  recording: function (ctx, d) {
    ctx.beginPath();
    ctx.arc(5, 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(11, true);
    ctx.fillText("REC", 13, 1);
    var t = mmss(d.seconds);
    ctx.fillText(t, W - ctx.measureText(t).width - 1, 1);
    ctx.fillRect(0, 15, W, 1);
    ctx.fillRect(0, 21, W, 1);
    ctx.fillRect(0, 15, 1, 7);
    ctx.fillRect(W - 1, 15, 1, 7);
    ctx.fillRect(2, 17, Math.round(Math.min(1, Math.max(0, d.level)) * (W - 4)), 3);
    ctx.font = font(12);
    wrapText(ctx, d.caption || "Listening...", W - 2).slice(-2).forEach(function (l, i) { ctx.fillText(l, 1, 27 + i * 18); });
  },
};

/** Draws one screen in white on black, then lights every pixel that came out at least half bright. */
function paintOled(canvas, d) {
  var draw = SCREENS[canvas.getAttribute("data-screen")];
  if (!draw) return;
  offscreen.width = W;
  offscreen.height = H;
  var ctx = offscreen.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  draw(ctx, d);
  var px = ctx.getImageData(0, 0, W, H).data;
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  var g = canvas.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = OLED_COLOR;
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (px[(y * W + x) * 4] >= 128) g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
}

// ---- The live-caption demo: the device screen and the phones tell the same story.

var lang = "es";
var tick = 0;
var words = LINES.map(function (l) { return l.en.split(" "); });
var cycle = words.reduce(function (n, w) { return n + w.length + PAUSE; }, 0);

/** Where the lecturer is at a given tick: which sentence, how many of its words, and all the text so far. */
function demoAt(t) {
  var pos = t % cycle, said = [];
  for (var i = 0; i < words.length; i++) {
    var span = words[i].length + PAUSE;
    if (pos < span) {
      var shown = Math.min(pos + 1, words[i].length);
      return { line: i, shown: shown, done: pos >= words[i].length, first: t < cycle, said: said.concat(words[i].slice(0, shown)).join(" ") };
    }
    pos -= span;
    said = said.concat(words[i]);
  }
}

function el(tag, text, cls) {
  var n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function renderDemo() {
  var s = demoAt(tick), w = words[s.line];

  $$('[data-cap="source"]').forEach(function (p) {
    p.textContent = "";
    if (s.done) { p.appendChild(el("b", w.join(" "))); return; }
    var cut = Math.max(0, s.shown - 2);
    if (cut) p.appendChild(document.createTextNode(w.slice(0, cut).join(" ") + " "));
    p.appendChild(el("b", w.slice(cut, s.shown).join(" ")));
  });

  $$('[data-cap="trans"]').forEach(function (p) {
    p.textContent = "";
    p.lang = lang;
    if (s.done) { p.textContent = LINES[s.line][lang]; return; }
    var prev = s.line > 0 ? LINES[s.line - 1] : s.first ? null : LINES[LINES.length - 1];
    if (prev) p.appendChild(el("span", prev[lang] + " ", "dim"));
    p.appendChild(el("span", "…", "wait"));
  });

  var speaking = !s.done;
  var d = {
    classCode: DEMO_CLASS,
    joinUrl: (APP_URL || "https://slap.example").replace(/\/$/, "") + "/j/" + DEMO_CLASS,
    seconds: 754 + (tick * TICK_MS) / 1000,
    level: speaking ? 0.38 + 0.4 * Math.abs(Math.sin(tick * 1.7)) : 0.06,
    caption: s.said,
  };
  $$("canvas.oled").forEach(function (c) { paintOled(c, d); });
}

function setLang(code) {
  if (!LANG_NAMES[code]) return;
  lang = code;
  $$("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === code)); });
  $$('[data-cap="langcode"]').forEach(function (n) { n.textContent = code.toUpperCase(); });
  $$('[data-cap="langlabel"]').forEach(function (n) { n.textContent = "Your language · " + LANG_NAMES[code]; });
  renderDemo();
}

$$("[data-lang]").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang")); }); });

// With "reduce motion" switched on, the demo stays still on a finished sentence.
if (reducedMotion) tick = words[0].length + PAUSE + words[1].length + PAUSE + words[2].length;
renderDemo();
if (!reducedMotion) setInterval(function () { if (!document.hidden) { tick++; renderDemo(); } }, TICK_MS);

// ---- Lists that open and close. data-required keeps one item open; data-stage names the
// picture box whose scenes follow the open item.

$$("[data-accordion]").forEach(function (acc) {
  var items = $$(".acc-item", acc);
  var required = acc.hasAttribute("data-required");
  var stage = document.getElementById(acc.getAttribute("data-stage") || "");
  var scenes = stage ? $$(".scene", stage) : [];

  function show(index) {
    items.forEach(function (item, i) {
      var open = i === index;
      item.classList.toggle("open", open);
      item.querySelector(".acc-head").setAttribute("aria-expanded", String(open));
    });
    if (index >= 0) scenes.forEach(function (sc, i) { sc.classList.toggle("on", i === index); });
  }

  items.forEach(function (item, i) {
    item.querySelector(".acc-head").addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      if (isOpen && required) return;
      show(isOpen ? -1 : i);
    });
  });
});

// ---- Links to the app (hidden until APP_URL is set)

var appBase = APP_URL.replace(/\/$/, "");
if (appBase) {
  $$("[data-app]").forEach(function (a) { a.href = appBase + a.getAttribute("data-app"); });
  $$("[data-app-block]").forEach(function (b) { b.hidden = false; });
}

// ---- Conversation side bar: the tab on the right edge opens and closes it

(function () {
  var tab = document.getElementById("saidTab");
  var panel = document.getElementById("saidPanel");
  var shade = document.getElementById("saidShade");
  var close = document.getElementById("saidClose");
  if (!tab || !panel) return;

  function setOpen(open) {
    panel.classList.toggle("open", open);
    shade.classList.toggle("open", open);
    tab.setAttribute("aria-expanded", String(open));
    void panel.offsetWidth;   // let the side bar become visible first, or it cannot take the keyboard focus
    (open ? close : tab).focus();
  }

  tab.addEventListener("click", function () { setOpen(!panel.classList.contains("open")); });
  close.addEventListener("click", function () { setOpen(false); });
  shade.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) setOpen(false); });
})();

// ---- Conversation side bar: listen, write down what is said, and sort it into turns by speaker.
// The browser turns the sound into text (its built-in speech recognition, in Chrome and Safari).
// It cannot tell voices apart, so the "Who is speaking" buttons decide whose turn the words go to.

(function () {
  var startBtn = document.getElementById("talkStart");
  if (!startBtn) return;
  var demoBtn = document.getElementById("talkDemo");
  var statusEl = document.getElementById("talkStatus");
  var listEl = document.getElementById("talkList");
  var emptyEl = document.getElementById("talkEmpty");
  var langEl = document.getElementById("talkLang");
  var tab = document.getElementById("saidTab");
  var panel = document.getElementById("saidPanel");

  var NAMES = { professor: "Professor", student: "Student" };
  var NEW_TURN_AFTER_MS = 2500;   // a pause this long starts a new turn, even for the same speaker

  // The example conversation played by "Play an example".
  var EXAMPLE = [
    { who: "professor", text: "So what does a Gaussian look like?" },
    { who: "student", text: "Is the mean always in the middle?" },
    { who: "professor", text: "Yes. The mean is its center." },
    { who: "professor", text: "With enough data, this is a pretty good model.", pause: true },
    { who: "student", text: "So it is a good place to start?" },
    { who: "professor", text: "Exactly. It's a great place to start." },
  ];

  var turns = [];          // { who, t (seconds since the start), text }
  var interim = "";        // words still being recognised, shown in grey
  var who = "professor";
  var listening = false;
  var recognition = null;
  var startedAt = 0, lastFinalAt = 0, forceNewTurn = false;
  var demoTimer = null;

  function Recognition() { return window.SpeechRecognition || window.webkitSpeechRecognition; }
  function say(text) { statusEl.textContent = text || ""; }
  function now() { return Date.now(); }

  function setWho(next) {
    if (next === who) return;
    who = next;
    forceNewTurn = true;
    $$("#talkWho button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-who") === who)); });
    render();
  }

  /** Files finished words under the current speaker: a new turn after a speaker change or a pause. */
  function addFinal(text) {
    text = String(text).trim();
    if (!text) return;
    if (!startedAt) startedAt = now();
    var last = turns[turns.length - 1];
    if (!last || last.who !== who || forceNewTurn || now() - lastFinalAt > NEW_TURN_AFTER_MS) {
      turns.push({ who: who, t: (now() - startedAt) / 1000, text: text });
    } else {
      last.text += " " + text;
    }
    forceNewTurn = false;
    lastFinalAt = now();
  }

  function turnNode(turn, extra) {
    var li = document.createElement("li");
    li.className = "turn turn-" + turn.who;
    var head = el("div", "", "turn-head");
    head.appendChild(el("span", NAMES[turn.who], "turn-who"));
    head.appendChild(el("time", mmss(turn.t)));
    var p = el("p", turn.text);
    if (extra) p.appendChild(el("span", (turn.text ? " " : "") + extra, "interim"));
    li.appendChild(head);
    li.appendChild(p);
    return li;
  }

  function render() {
    listEl.textContent = "";
    var last = turns[turns.length - 1];
    var joins = interim && last && last.who === who && !forceNewTurn && now() - lastFinalAt <= NEW_TURN_AFTER_MS;
    turns.forEach(function (turn, i) { listEl.appendChild(turnNode(turn, joins && i === turns.length - 1 ? interim : "")); });
    if (interim && !joins) listEl.appendChild(turnNode({ who: who, t: startedAt ? (now() - startedAt) / 1000 : 0, text: "" }, interim));
    emptyEl.hidden = listEl.children.length > 0;
    if (panel.classList.contains("open")) panel.scrollTop = panel.scrollHeight;
  }

  function setListening(on) {
    listening = on;
    startBtn.classList.toggle("on", on);
    startBtn.textContent = on ? "Stop listening" : "Start listening";
    tab.classList.toggle("listening", on);
  }

  function stopListening() {
    setListening(false);
    if (recognition) { try { recognition.stop(); } catch (e) { /* already stopped */ } }
    interim = "";
    render();
  }

  function startListening() {
    var Rec = Recognition();
    if (!Rec) { say("This browser cannot listen. Open the page in Chrome or Safari."); return; }
    stopDemo();
    recognition = new Rec();
    recognition.lang = langEl.value;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = function (e) {
      interim = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var text = e.results[i][0].transcript;
        if (e.results[i].isFinal) addFinal(text); else interim += text;
      }
      interim = interim.trim();
      render();
    };
    recognition.onerror = function (e) {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") say("The microphone is blocked here. Open this page in Chrome or Safari and press Allow when it asks.");
      else if (e.error === "audio-capture") say("No microphone was found.");
      else if (e.error === "network") say("The browser's speech service could not be reached.");
      else say("Listening stopped (" + e.error + ").");
      setListening(false);
    };
    // The browser ends a session after a silence; keep going until "Stop listening" is pressed.
    recognition.onend = function () {
      if (!listening) return;
      try { recognition.start(); } catch (err) { setListening(false); }
    };
    try { recognition.start(); } catch (err) { say("Could not start listening."); return; }
    setListening(true);
    say("Listening…");
  }

  // ---- The example: the same sorting, fed with written lines instead of the microphone.

  function stopDemo() {
    if (demoTimer) clearTimeout(demoTimer);
    demoTimer = null;
    demoBtn.textContent = "Play an example";
    interim = "";
  }

  function playDemo() {
    if (listening) stopListening();
    turns = []; startedAt = 0; lastFinalAt = 0; interim = "";
    demoBtn.textContent = "Stop the example";
    say("Playing an example conversation.");
    var line = 0, word = 0;
    if (reducedMotion) {
      EXAMPLE.forEach(function (l) { setWho(l.who); if (l.pause) forceNewTurn = true; addFinal(l.text); });
      stopDemo(); say(""); render();
      return;
    }
    (function step() {
      if (line >= EXAMPLE.length) { stopDemo(); say(""); render(); return; }
      var l = EXAMPLE[line], w = l.text.split(" ");
      if (word === 0) { setWho(l.who); if (l.pause) forceNewTurn = true; }
      if (word < w.length) {
        word++;
        interim = w.slice(0, word).join(" ");
        render();
        demoTimer = setTimeout(step, 150);
      } else {
        interim = "";
        addFinal(l.text);
        render();
        line++; word = 0;
        demoTimer = setTimeout(step, 650);
      }
    })();
  }

  // ---- Buttons

  startBtn.addEventListener("click", function () { if (listening) { stopListening(); say(""); } else startListening(); });
  demoBtn.addEventListener("click", function () { if (demoTimer) { stopDemo(); say(""); render(); } else playDemo(); });
  langEl.addEventListener("change", function () { if (listening) { stopListening(); startListening(); } });
  $$("#talkWho button").forEach(function (b) { b.addEventListener("click", function () { setWho(b.getAttribute("data-who")); }); });
  document.getElementById("talkClear").addEventListener("click", function () {
    stopDemo();
    turns = []; interim = ""; startedAt = 0; lastFinalAt = 0;
    say("");
    render();
  });
  document.getElementById("talkCopy").addEventListener("click", function () {
    if (!turns.length) { say("There is nothing to copy yet."); return; }
    var text = turns.map(function (t) { return "[" + mmss(t.t) + "] " + NAMES[t.who] + ": " + t.text; }).join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say("Copied."); }, function () { say("Could not copy."); });
    } else say("This browser cannot copy from here.");
  });

  if (!Recognition()) say("This browser cannot listen. Open the page in Chrome or Safari, or play the example.");
  render();
})();

// ---- Sections fade in as they scroll into view

var revealed = $$(".reveal");
if ("IntersectionObserver" in window && !reducedMotion) {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  revealed.forEach(function (n) { io.observe(n); });
} else {
  revealed.forEach(function (n) { n.classList.add("in"); });
}
