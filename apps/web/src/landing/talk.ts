import { WHO_NAMES, type Who } from './data'
import { mmss } from './format'

// The Conversation side bar's sorting: what was said, filed into turns by speaker. The words come from the
// browser's speech recognition or from the written example; both go through the same steps below.
// Every step carries the time it happened (`at`, in milliseconds), so the sorting itself never looks at a clock.

/** A pause this long starts a new turn, even for the same speaker. */
const NEW_TURN_AFTER_MS = 2500

/** One turn: who spoke, when (seconds since the first words), and what they said. */
export type Turn = { who: Who; t: number; text: string }

export type Talk = {
  turns: Turn[]
  /** Words still being recognised, shown in grey. */
  interim: string
  who: Who
  /** The next finished words start a new turn (after a change of speaker). */
  forceNewTurn: boolean
  startedAt: number
  lastFinalAt: number
  /** When the last step happened. */
  at: number
}

export type TalkStep =
  /** Someone else speaks now. `newTurn` starts a new turn even when it is the same speaker. */
  | { type: 'speaker'; who: Who; newTurn?: boolean; at: number }
  /** Words arrived: finished pieces to file, and what is still being recognised. */
  | { type: 'heard'; finals: readonly string[]; interim: string; at: number }
  | { type: 'clear'; at: number }

export const EMPTY_TALK: Talk = { turns: [], interim: '', who: 'professor', forceNewTurn: false, startedAt: 0, lastFinalAt: 0, at: 0 }

/** Files finished words under the current speaker: a new turn after a speaker change or a pause. */
function addFinal(talk: Talk, said: string, at: number): Talk {
  const text = said.trim()
  if (!text) return talk
  const startedAt = talk.startedAt || at
  const last = talk.turns.at(-1)
  const turns =
    !last || last.who !== talk.who || talk.forceNewTurn || at - talk.lastFinalAt > NEW_TURN_AFTER_MS
      ? [...talk.turns, { who: talk.who, t: (at - startedAt) / 1000, text }]
      : [...talk.turns.slice(0, -1), { ...last, text: `${last.text} ${text}` }]
  return { ...talk, turns, startedAt, forceNewTurn: false, lastFinalAt: at }
}

export function talkStep(talk: Talk, step: TalkStep): Talk {
  switch (step.type) {
    case 'speaker': {
      const changed = step.who !== talk.who
      if (!changed && !step.newTurn) return talk
      return { ...talk, who: step.who, forceNewTurn: true, at: step.at }
    }
    case 'heard': {
      const filed = step.finals.reduce((t, text) => addFinal(t, text, step.at), talk)
      return { ...filed, interim: step.interim.trim(), at: step.at }
    }
    case 'clear':
      return { ...talk, turns: [], interim: '', startedAt: 0, lastFinalAt: 0, at: step.at }
  }
}

/** A turn as shown in the list, with the grey words that are still being recognised. */
export type TalkRow = Turn & { interim: string }

/** The list to show: the turns, with the unfinished words joined to the last turn or in a turn of their own. */
export function talkRows(talk: Talk): TalkRow[] {
  const last = talk.turns.at(-1)
  const joins = talk.interim !== '' && last != null && last.who === talk.who && !talk.forceNewTurn && talk.at - talk.lastFinalAt <= NEW_TURN_AFTER_MS
  const rows = talk.turns.map((turn, i) => ({ ...turn, interim: joins && i === talk.turns.length - 1 ? talk.interim : '' }))
  if (talk.interim && !joins) rows.push({ who: talk.who, t: talk.startedAt ? (talk.at - talk.startedAt) / 1000 : 0, text: '', interim: talk.interim })
  return rows
}

/** The conversation as plain text, one turn per line, for the Copy button. */
export function talkText(turns: readonly Turn[]): string {
  return turns.map((t) => `[${mmss(t.t)}] ${WHO_NAMES[t.who]}: ${t.text}`).join('\n')
}
