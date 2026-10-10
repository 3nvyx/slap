import type { NextExam } from './types'

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!d) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString(undefined, opts)
}

export function daysUntil(d: string): number | null {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

/** Normalises the open-ended `nextExam` field into a label + date. */
export function examInfo(x: NextExam): { name: string; date: string; days: number | null } | null {
  if (!x) return null
  if (typeof x === 'string') return { name: 'Exam', date: x, days: daysUntil(x) }
  if (!x.date) return null
  return { name: x.name || x.title || 'Exam', date: x.date, days: daysUntil(x.date) }
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)
const ORANGE = [255, 106, 0]
const AMBER = [240, 180, 40]
const GREEN = [47, 158, 68]

/** Mastery colour: null → grey, 0 → orange, 0.5 → amber, 1 → green. */
export function masteryColor(m: number | null | undefined, grey = '#9a9a96'): string {
  if (m == null) return grey
  const t = Math.max(0, Math.min(1, m))
  const [a, b, u] = t < 0.5 ? [ORANGE, AMBER, t / 0.5] : [AMBER, GREEN, (t - 0.5) / 0.5]
  return `rgb(${lerp(a[0], b[0], u)}, ${lerp(a[1], b[1], u)}, ${lerp(a[2], b[2], u)})`
}

export function pct(x: number | null | undefined): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}
