/** Seconds as 00:00, as on the device. */
export function mmss(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
