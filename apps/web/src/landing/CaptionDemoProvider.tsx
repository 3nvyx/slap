import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CaptionDemoContext, STILL_TICK } from './captionDemo'
import { TICK_MS, type CaptionLang } from './data'
import { prefersReducedMotion } from './motion'

/** Runs the caption demo's clock for the device screens and the phones inside it. */
export function CaptionDemoProvider({ children }: { children: ReactNode }) {
  // The server and the browser both start at tick 0, so they draw the same first picture.
  const [tick, setTick] = useState(0)
  const [lang, setLang] = useState<CaptionLang>('ja')

  // The clock only starts in the browser, and waits while the tab is in the background.
  useEffect(() => {
    // With "reduce motion" switched on, the demo stays still on a finished sentence.
    if (prefersReducedMotion()) {
      setTick(STILL_TICK)
      return
    }
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1)
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  const value = useMemo(() => ({ tick, lang, setLang }), [tick, lang])
  return <CaptionDemoContext value={value}>{children}</CaptionDemoContext>
}
