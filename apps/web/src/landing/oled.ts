import qrcode from 'qrcode-generator'
import { mmss } from './format'

// The device screen: 128 x 64 pixels, each one on or off, as on the real OLED.
// The two screens below are the ones the device shows today ("Ready" and "Recording").
// This file draws on a canvas, so nothing in it may run on the server: paintOled is called from an effect.

export const OLED_W = 128
export const OLED_H = 64
export const OLED_SCALE = 4

export type OledScreen = 'ready' | 'recording'
export type OledData = { classCode: string; joinUrl: string; seconds: number; level: number; caption: string }

type Ctx = CanvasRenderingContext2D

function font(px: number, bold = false) {
  return `${bold ? 'bold ' : ''}${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`
}

function wrapText(ctx: Ctx, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth) line = next
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function centered(ctx: Ctx, text: string, y: number, x0: number, width: number) {
  ctx.fillText(text, x0 + Math.max(0, (width - ctx.measureText(text).width) / 2), y)
}

/** The largest bold size, down to 8 px, at which the text fits the width. */
function fitFont(ctx: Ctx, text: string, width: number, max: number) {
  let px = max
  for (; px > 8; px--) {
    ctx.font = font(px, true)
    if (ctx.measureText(text).width <= width) break
  }
  return px
}

/** Draws a QR code with a two-module white edge inside a square box. False when the box is too small for it. */
function drawQr(ctx: Ctx, text: string, x: number, y: number, box: number) {
  const qr = qrcode(0, 'L')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const total = n + 4
  const scale = Math.floor(box / total)
  if (scale < 1) return false
  const side = total * scale
  const ox = x + Math.floor((box - side) / 2)
  const oy = y + Math.floor((box - side) / 2)
  ctx.fillStyle = '#fff'
  ctx.fillRect(ox, oy, side, side)
  ctx.fillStyle = '#000'
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(ox + (c + 2) * scale, oy + (r + 2) * scale, scale, scale)
    }
  }
  ctx.fillStyle = '#fff'
  return true
}

const SCREENS: Record<OledScreen, (ctx: Ctx, d: OledData) => void> = {
  ready(ctx, d) {
    let x0 = 66
    let w = OLED_W - x0
    if (!drawQr(ctx, d.joinUrl, 0, 0, 64)) {
      x0 = 0
      w = OLED_W
    }
    ctx.font = font(fitFont(ctx, d.classCode, w - 2, 18), true)
    centered(ctx, d.classCode, 4, x0, w)
    ctx.font = font(11)
    centered(ctx, 'slap to', 28, x0, w)
    centered(ctx, 'start', 40, x0, w)
  },
  recording(ctx, d) {
    ctx.beginPath()
    ctx.arc(5, 6, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = font(11, true)
    ctx.fillText('REC', 13, 1)
    const t = mmss(d.seconds)
    ctx.fillText(t, OLED_W - ctx.measureText(t).width - 1, 1)
    // The sound level: a frame with a bar inside.
    ctx.fillRect(0, 15, OLED_W, 1)
    ctx.fillRect(0, 21, OLED_W, 1)
    ctx.fillRect(0, 15, 1, 7)
    ctx.fillRect(OLED_W - 1, 15, 1, 7)
    ctx.fillRect(2, 17, Math.round(Math.min(1, Math.max(0, d.level)) * (OLED_W - 4)), 3)
    ctx.font = font(12)
    wrapText(ctx, d.caption || 'Listening...', OLED_W - 2)
      .slice(-2)
      .forEach((line, i) => ctx.fillText(line, 1, 27 + i * 18))
  },
}

// One small hidden canvas, shared by every screen on the page. Made on first use, in the browser.
let offscreen: HTMLCanvasElement | null = null

/** Draws one screen in white on black, then lights every pixel that came out at least half bright. */
export function paintOled(canvas: HTMLCanvasElement, screen: OledScreen, d: OledData) {
  offscreen ??= document.createElement('canvas')
  offscreen.width = OLED_W
  offscreen.height = OLED_H
  const ctx = offscreen.getContext('2d', { willReadFrequently: true })
  const g = canvas.getContext('2d')
  if (!ctx || !g) return
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, OLED_W, OLED_H)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'top'
  SCREENS[screen](ctx, d)
  const px = ctx.getImageData(0, 0, OLED_W, OLED_H).data

  g.fillStyle = '#000'
  g.fillRect(0, 0, canvas.width, canvas.height)
  // The colour of a lit pixel is set in landing.css (--oled).
  g.fillStyle = getComputedStyle(canvas).getPropertyValue('--oled').trim() || '#dff1ff'
  for (let y = 0; y < OLED_H; y++) {
    for (let x = 0; x < OLED_W; x++) {
      if (px[(y * OLED_W + x) * 4] >= 128) g.fillRect(x * OLED_SCALE, y * OLED_SCALE, OLED_SCALE, OLED_SCALE)
    }
  }
}
