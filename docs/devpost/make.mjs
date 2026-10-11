// Renders the Devpost image set into docs/devpost/img from the brand pieces already in the repo:
// the mascot logo (apps/web/src/lib/logo.ts), the "SLAP!" pixel letters and the whole switch-on frame
// (screen-lab/sprites.js, screen/splash/6), the housing renders, and the site's colours (apps/web/src/index.css).
//   node docs/devpost/make.mjs
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const out = join(here, 'img')
const require = createRequire(join(root, 'apps/api/package.json'))
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas')
GlobalFonts.registerFromPath(join(root, 'apps/web/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'Inter')
for (const sub of ['latin-ext', 'vietnamese']) GlobalFonts.registerFromPath(join(root, `apps/web/node_modules/@fontsource-variable/inter/files/inter-${sub}-wght-normal.woff2`), 'Inter')
GlobalFonts.registerFromPath('/System/Library/Fonts/HelveticaNeue.ttc', 'Helvetica Neue')
GlobalFonts.registerFromPath('/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc', 'Hiragino Sans')
GlobalFonts.registerFromPath('/System/Library/Fonts/SFNS.ttf', 'SF Pro') // Vietnamese diacritics (Inter's woff2 subsets do not fall back per glyph)

// Colours, from index.css.
const C = { enamel: '#e4e4e1', enamel2: '#d9d9d6', ink: '#151515', ink2: '#3d3d3d', muted: '#6f6f6c', line: '#c1c1bd',
  orange: '#ff6a00', dark: '#17171a', panel: '#1f1f22', inkLight: '#ededeb', mutedDark: '#8a8a8f', lineDark: '#2e2e33' }

// --- pixel art sources -----------------------------------------------------------------------------------------
const logoTs = readFileSync(join(root, 'apps/web/src/lib/logo.ts'), 'utf8')
const logoRects = [...logoTs.match(/LOGO_PATH =\s*'([^']+)'/)[1].matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)].map((m) => m.slice(1, 5).map(Number))
const LOGO = { w: 76, h: 56, rects: logoRects }

const sprites = readFileSync(join(root, 'screen-lab/sprites.js'), 'utf8')
const frame = sprites.match(/sprite\("screen\/splash\/6", `\n([\s\S]*?)`\)/)[1].split('\n').filter((l) => l.length === 128)
const frameRects = []
frame.forEach((row, y) => { for (let x = 0; x < 128; x++) if (row[x] === '#') frameRects.push([x, y, 1, 1]) })
const FRAME = { w: 128, h: 64, rects: frameRects }
// "SLAP!" letters: rows 3..14, columns 81..127 of that frame.
const wordRects = frameRects.filter(([x, y]) => y >= 3 && y <= 14 && x >= 81).map(([x, y]) => [x - 81, y - 3, 1, 1])
const WORD = { w: 47, h: 12, rects: wordRects }

function pixels(ctx, art, x0, y0, scale, color) {
  ctx.fillStyle = color
  for (const [x, y, w, h] of art.rects) ctx.fillRect(x0 + x * scale, y0 + y * scale, w * scale, h * scale)
}

// --- text helpers -------------------------------------------------------------------------------------------
const bold = (px) => `bold ${px}px "Helvetica Neue", Inter`
const regular = (px) => `${px}px Inter, "SF Pro", "Hiragino Sans"`
function wrap(ctx, text, maxWidth) {
  const words = text.split(' '); const lines = []; let line = ''
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w } else line = t }
  if (line) lines.push(line); return lines
}
function paragraph(ctx, text, x, y, maxWidth, lineHeight) {
  for (const l of wrap(ctx, text, maxWidth)) { ctx.fillText(l, x, y); y += lineHeight }
  return y
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function save(canvas, name) { writeFileSync(join(out, name), canvas.toBuffer('image/png')); console.log('wrote', name) }
function page(w, h, bg) { const c = createCanvas(w, h); const ctx = c.getContext('2d'); if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h) } return [c, ctx] }
function centeredPixels(ctx, art, cw, ch, scale, color, dy = 0) {
  pixels(ctx, art, Math.round((cw - art.w * scale) / 2), Math.round((ch - art.h * scale) / 2) + dy, scale, color)
}

// --- 1. square logos (Devpost thumbnail is square) -------------------------------------------------------------
for (const [name, bg, fg] of [['logo-1024-orange.png', C.orange, C.ink], ['logo-1024-dark.png', C.dark, C.inkLight], ['logo-1024-light.png', C.enamel, C.ink]]) {
  const [c, ctx] = page(1024, 1024, bg); centeredPixels(ctx, LOGO, 1024, 1024, 11, fg); save(c, name)
}
// Transparent marks, for pasting onto anything.
for (const [name, fg] of [['logo-mark-ink.png', C.ink], ['logo-mark-white.png', '#ffffff'], ['logo-mark-orange.png', C.orange]]) {
  const [c, ctx] = page(LOGO.w * 20, LOGO.h * 20, null); pixels(ctx, LOGO, 0, 0, 20, fg); save(c, name)
}

// --- 2. lockup: mascot + SLAP! ----------------------------------------------------------------------------------
function lockup(bg, fg, name) {
  const s = 16, gap = 10 * s, pad = 6 * s
  const w = pad * 2 + LOGO.w * s + gap + WORD.w * s, h = pad * 2 + LOGO.h * s
  const [c, ctx] = page(w, h, bg)
  pixels(ctx, LOGO, pad, pad, s, fg)
  pixels(ctx, WORD, pad + LOGO.w * s + gap, pad + Math.round((LOGO.h - WORD.h) / 2) * s, s, fg)
  save(c, name)
}
lockup(C.enamel, C.ink, 'lockup-light.png'); lockup(C.dark, C.inkLight, 'lockup-dark.png'); lockup(null, C.ink, 'lockup-transparent.png')

// --- 3. cover 1920x1080 ---------------------------------------------------------------------------------------
function cover(theme, name) {
  const dark = theme === 'dark'
  const bg = dark ? C.dark : C.enamel, fg = dark ? C.inkLight : C.ink, mu = dark ? C.mutedDark : C.muted, ln = dark ? C.lineDark : C.line
  const [c, ctx] = page(1920, 1080, bg)
  // faint dot grid, like the site
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)'
  for (let x = 40; x < 1920; x += 40) for (let y = 40; y < 1080; y += 40) ctx.fillRect(x, y, 2, 2)
  pixels(ctx, LOGO, 120, 200, 9, fg)
  const x = 900
  pixels(ctx, WORD, x, 250, 9, fg)
  ctx.fillStyle = C.orange; ctx.fillRect(x, 400, 72, 8)
  ctx.fillStyle = fg; ctx.font = bold(64)
  let y = paragraph(ctx, 'Slap it on the lecturer’s desk. The whole room gets captions.', x, 490, 900, 76)
  ctx.fillStyle = mu; ctx.font = regular(32)
  y = paragraph(ctx, 'Live, in each student’s language. Afterwards the lecture becomes a knowledge graph, flashcards, practice questions and a study plan.', x, y + 30, 880, 44)
  ctx.strokeStyle = ln; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(120, 960); ctx.lineTo(1800, 960); ctx.stroke()
  ctx.fillStyle = mu; ctx.font = regular(26)
  ctx.fillText('ESP32-S3  ·  one device per classroom  ·  no phone on the desk  ·  built solo in 36 hours', 120, 1010)
  save(c, name)
}
cover('light', 'cover-light.png'); cover('dark', 'cover-dark.png')

// --- 4. the switch-on screen, as the OLED shows it -------------------------------------------------------------
{
  const [c, ctx] = page(1920, 1080, C.enamel)
  const s = 11, fw = 128 * s, fh = 64 * s, bx = (1920 - fw) / 2, by = (1080 - fh) / 2
  ctx.fillStyle = C.ink; roundRect(ctx, bx - 48, by - 48, fw + 96, fh + 96, 28); ctx.fill()
  ctx.fillStyle = '#000'; ctx.fillRect(bx, by, fw, fh)
  pixels(ctx, FRAME, bx, by, s, '#f4f4f0')
  ctx.fillStyle = C.muted; ctx.font = regular(28); ctx.textAlign = 'center'
  ctx.fillText('What the 2.42" OLED shows when the device wakes up: the mascot gets slapped, then it records.', 960, 1000)
  save(c, 'screen-splash.png')
}

// --- 5. device renders with a caption --------------------------------------------------------------------------
async function renderCard(src, name, title, sub, chips) {
  const img = await loadImage(src)
  const [c, ctx] = page(1920, 1080, null)
  // the renders have their own light grey background; take it from a corner so the card matches it
  const probe = createCanvas(1, 1).getContext('2d'); probe.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, 1920, 1080)
  const ih = 760, iw = ih * (img.width / img.height)
  ctx.drawImage(img, 1920 - iw - 40, (1080 - ih) / 2 + 20, iw, ih)
  ctx.fillStyle = C.orange; ctx.fillRect(120, 300, 72, 8)
  ctx.fillStyle = C.ink; ctx.font = bold(56); let y = paragraph(ctx, title, 120, 380, 660, 66)
  ctx.fillStyle = C.muted; ctx.font = regular(28); y = paragraph(ctx, sub, 120, y + 24, 620, 40)
  y += 30; let x = 120; ctx.font = regular(24)
  for (const chip of chips) {
    const w = ctx.measureText(chip).width + 36
    if (x + w > 820) { x = 120; y += 58 }
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; roundRect(ctx, x, y, w, 44, 22); ctx.stroke()
    ctx.fillStyle = C.ink2; ctx.fillText(chip, x + 18, y + 30); x += w + 12
  }
  save(c, name)
}
await renderCard(join(root, 'apps/web/src/landing/img/device.png'), 'gallery-device.png',
  'One small box on the lecturer’s desk', 'Shake it or press REC and it records. The screen shows the join code, then the live caption. That is the whole device.',
  ['ESP32-S3', 'INMP441 I2S mic', '2.42" OLED', 'REC button', 'IMU shake-to-start', '3D-printed, screwless'])
await renderCard(join(root, 'apps/web/src/landing/img/exploded.png'), 'gallery-inside.png',
  'Lid, tray, button. Nothing else.', 'Parametric OpenSCAD housing, printed in black PLA with no supports. Six snap hooks hold the lid; every wire is a jumper from pin to pin.',
  ['OpenSCAD', 'Bambu P2S', 'PlatformIO', 'Arduino', 'WebSocket audio', '16 kHz PCM'])

// --- 6. how it works, three steps -------------------------------------------------------------------------------
{
  const [c, ctx] = page(1920, 1080, C.enamel)
  const cols = [
    ['1', 'Slap it on', 'Set the device on the desk and shake it. It joins Wi-Fi and starts a session by itself. Students scan the QR on its screen.'],
    ['2', 'Read along, live', 'Captions stream to every laptop and phone in the room, translated per student: English, 日本語, Tiếng Việt and more.'],
    ['3', 'Study what it heard', 'When the session ends: outline, concept graph, flashcards with spacing, practice questions, a recall check and a plan for today.'],
  ]
  const cw = 540, gap = 60, x0 = (1920 - (cw * 3 + gap * 2)) / 2
  cols.forEach(([n, title, body], i) => {
    const x = x0 + i * (cw + gap), y = 260
    ctx.fillStyle = '#f2f2ef'; roundRect(ctx, x, y, cw, 560, 16); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = C.orange; roundRect(ctx, x + 40, y + 40, 56, 56, 28); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = bold(30); ctx.textAlign = 'center'; ctx.fillText(n, x + 68, y + 79); ctx.textAlign = 'left'
    // small illustration per step
    const ix = x + 40, iy = y + 130
    if (i === 0) pixels(ctx, LOGO, ix, iy, 3, C.ink)
    if (i === 1) {
      ctx.fillStyle = C.ink; roundRect(ctx, ix, iy, 460, 170, 12); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = bold(26); ctx.fillText('So what does a Gaussian look like?', ix + 24, iy + 56)
      ctx.fillStyle = C.orange; ctx.font = regular(24); ctx.fillText('では、ガウス分布はどんな形でしょうか。', ix + 24, iy + 100)
      ctx.fillStyle = '#bdbdc2'; ctx.fillText('Vậy phân phối Gauss trông như thế nào?', ix + 24, iy + 140)
    }
    if (i === 2) {
      const nodes = [[60, 40, 'Gaussian'], [250, 30, 'mean'], [400, 100, 'variance'], [120, 150, 'MLE'], [330, 165, 'likelihood']]
      const edges = [[0, 1], [0, 2], [0, 3], [3, 4], [2, 4]]
      ctx.strokeStyle = C.line; ctx.lineWidth = 3
      for (const [a, b] of edges) { ctx.beginPath(); ctx.moveTo(ix + nodes[a][0], iy + nodes[a][1]); ctx.lineTo(ix + nodes[b][0], iy + nodes[b][1]); ctx.stroke() }
      nodes.forEach(([nx, ny, label], k) => {
        ctx.fillStyle = k === 0 ? C.orange : k === 3 ? '#e03131' : C.ink; ctx.beginPath(); ctx.arc(ix + nx, iy + ny, k === 0 ? 16 : 11, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = C.ink2; ctx.font = regular(20); ctx.fillText(label, ix + nx + 20, iy + ny + 7)
      })
    }
    ctx.fillStyle = C.ink; ctx.font = bold(38); ctx.fillText(title, x + 40, y + 370)
    ctx.fillStyle = C.muted; ctx.font = regular(24); paragraph(ctx, body, x + 40, y + 420, cw - 80, 34)
  })
  ctx.fillStyle = C.ink; ctx.font = bold(52); ctx.textAlign = 'center'; ctx.fillText('How Slap works', 960, 170); ctx.textAlign = 'left'
  save(c, 'gallery-how-it-works.png')
}
