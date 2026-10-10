export const MOCK = import.meta.env.VITE_MOCK === '1' || import.meta.env.VITE_MOCK === 'true'

/** API origin. Empty = same origin (Vite proxies /api and /ws in dev). */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

export const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL ?? ''

export function wsUrl(path: string): string {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + path
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}
