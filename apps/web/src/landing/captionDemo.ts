import { createContext, useContext } from 'react'
import { DEMO_CLASS, DEMO_JOIN_URL, LINES, PAUSE, TICK_MS, type CaptionLang } from './data'
import type { OledData } from './oled'

// The live-caption demo: the device screens and the phones tell the same story. Everything on the page is
// worked out from one number, the tick, which starts at 0 on the server and in the browser alike.

const WORDS = LINES.map((l) => l.en.split(' '))
const CYCLE = WORDS.reduce((n, w) => n + w.length + PAUSE, 0)

/** With "reduce motion" switched on, the demo stays still here: on the finished third sentence. */
export const STILL_TICK = WORDS[0].length + PAUSE + WORDS[1].length + PAUSE + WORDS[2].length

export type DemoStep = {
  /** Which sentence, and its words. */
  line: number
  words: string[]
  /** How many of its words have been said. */
  shown: number
  /** The sentence is finished (the pause after it). */
  done: boolean
  /** Still in the first round, so nothing was said before the first sentence. */
  first: boolean
  /** All the text so far in this round. */
  said: string
}

/** Where the lecturer is at a given tick. */
export function demoAt(tick: number): DemoStep {
  let pos = tick % CYCLE
  let line = 0
  const said: string[] = []
  while (pos >= WORDS[line].length + PAUSE) {
    pos -= WORDS[line].length + PAUSE
    said.push(...WORDS[line])
    line++
  }
  const words = WORDS[line]
  const shown = Math.min(pos + 1, words.length)
  return { line, words, shown, done: pos >= words.length, first: tick < CYCLE, said: [...said, ...words.slice(0, shown)].join(' ') }
}

/** What the device has to show at a given tick. */
export function screenAt(tick: number): OledData {
  const step = demoAt(tick)
  return {
    classCode: DEMO_CLASS,
    joinUrl: DEMO_JOIN_URL,
    seconds: 754 + (tick * TICK_MS) / 1000,
    level: step.done ? 0.06 : 0.38 + 0.4 * Math.abs(Math.sin(tick * 1.7)),
    caption: step.said,
  }
}

export type CaptionDemo = { tick: number; lang: CaptionLang; setLang: (lang: CaptionLang) => void }

export const CaptionDemoContext = createContext<CaptionDemo>({ tick: 0, lang: 'ja', setLang: () => {} })

/** The demo's tick and caption language, shared by everything inside CaptionDemoProvider. */
export function useCaptionDemo(): CaptionDemo {
  return useContext(CaptionDemoContext)
}
