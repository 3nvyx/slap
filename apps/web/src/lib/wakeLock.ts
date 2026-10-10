import { useEffect } from 'react'

/** Keep the screen on while captions are showing (where supported). Re-acquires when the tab returns. */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let disposed = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || disposed) return
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unsupported (e.g. low battery) */
      }
    }
    void acquire()
    const onVis = () => void acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVis)
      void sentinel?.release().catch(() => {})
    }
  }, [enabled])
}
