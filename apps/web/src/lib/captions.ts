import type { CaptionEvent, CaptionWord, LiveClientMessage } from '@slap/contracts'
import { useEffect, useReducer, useRef, useState } from 'react'
import { MOCK, wsUrl } from './env'
import { type SocketState, useReconnectingSocket } from './ws'

export interface LiveFinal {
  segmentId: number
  text: string
  start: number
  end: number
  words?: CaptionWord[]
}

export type StatusEvent = Extract<CaptionEvent, { type: 'status' }>

export interface CaptionState {
  lang: string
  seq: number
  finals: LiveFinal[]
  interim: { text: string; words: CaptionWord[] } | null
  translations: Record<number, string>
  status: StatusEvent | null
  /** ms timestamp of the last caption event, for "receiving" feedback. */
  lastEventAt: number
}

const MAX_FINALS = 60

export function initialCaptions(lang: string): CaptionState {
  return { lang, seq: 0, finals: [], interim: null, translations: {}, status: null, lastEventAt: 0 }
}

function upsertFinal(finals: LiveFinal[], f: LiveFinal): LiveFinal[] {
  const i = finals.findIndex((x) => x.segmentId === f.segmentId)
  const next = i >= 0 ? finals.map((x, j) => (j === i ? { ...x, ...f, words: f.words ?? x.words } : x)) : [...finals, f]
  // Time order, not id order: ids are negative and decreasing for replays and unpersisted lectures.
  next.sort((a, b) => a.start - b.start || a.segmentId - b.segmentId)
  return next.length > MAX_FINALS ? next.slice(-MAX_FINALS) : next
}

export type CaptionAction = { kind: 'event'; ev: CaptionEvent } | { kind: 'reset'; lang: string }

export function captionReducer(s: CaptionState, a: CaptionAction): CaptionState {
  if (a.kind === 'reset') return initialCaptions(a.lang)
  const ev = a.ev
  const now = Date.now()
  switch (ev.type) {
    case 'snapshot': {
      // Authoritative catch-up: merge (do not drop) finals we already have.
      let finals = s.finals
      const translations = { ...s.translations }
      for (const f of ev.finals) {
        finals = upsertFinal(finals, { segmentId: f.segmentId, text: f.text, start: f.start, end: f.end })
        if (f.translation) translations[f.segmentId] = f.translation
      }
      return { ...s, finals, translations, interim: null, seq: Math.max(s.seq, ev.seq), lastEventAt: now }
    }
    case 'interim':
      if (ev.seq <= s.seq) return s
      return { ...s, seq: ev.seq, interim: { text: ev.text, words: ev.words }, lastEventAt: now }
    case 'final':
      if (ev.seq <= s.seq) return s
      return {
        ...s,
        seq: ev.seq,
        interim: null,
        finals: upsertFinal(s.finals, { segmentId: ev.segmentId, text: ev.text, start: ev.start, end: ev.end, words: ev.words }),
        lastEventAt: now,
      }
    case 'translation':
      if (ev.seq <= s.seq && s.translations[ev.segmentId] === ev.text) return s
      if (ev.lang !== s.lang) return { ...s, seq: Math.max(s.seq, ev.seq) }
      return {
        ...s,
        seq: Math.max(s.seq, ev.seq),
        translations: { ...s.translations, [ev.segmentId]: ev.text },
        lastEventAt: now,
      }
    case 'status':
      return { ...s, status: ev }
    default:
      return s
  }
}

function isCaptionEvent(x: unknown): x is CaptionEvent {
  return !!x && typeof x === 'object' && typeof (x as { type?: unknown }).type === 'string'
}

/** Live caption stream for one lecture in one language. Mock mode replays the fixture lecture. */
export function useCaptions(lectureId: string, lang: string): { state: CaptionState; socket: SocketState } {
  const [state, dispatch] = useReducer(captionReducer, lang, initialCaptions)
  const seqRef = useRef(0)
  seqRef.current = state.seq

  // Language change → fresh state; the server's snapshot re-sends finals with the new translation.
  useEffect(() => {
    dispatch({ kind: 'reset', lang })
  }, [lang, lectureId])

  const [mockSocket, setMockSocket] = useState<SocketState>('connecting')
  useEffect(() => {
    if (!MOCK) return
    let stop: (() => void) | undefined
    let cancelled = false
    void import('./mock').then(({ startMockCaptionStream }) => {
      if (cancelled) return
      setMockSocket('open')
      stop = startMockCaptionStream(lang, (ev) => dispatch({ kind: 'event', ev }))
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [lang, lectureId])

  const { state: socket } = useReconnectingSocket({
    url: MOCK ? null : wsUrl(`/ws/live/${encodeURIComponent(lectureId)}?lang=${encodeURIComponent(lang)}`),
    onOpen: (send, attempt) => {
      const msg: LiveClientMessage = { type: 'subscribe', lang, ...(attempt > 0 && seqRef.current > 0 ? { since: seqRef.current } : {}) }
      send(msg)
    },
    onMessage: (data) => {
      if (isCaptionEvent(data)) dispatch({ kind: 'event', ev: data })
    },
    heartbeat: { type: 'ping' } satisfies LiveClientMessage,
  })

  return { state, socket: MOCK ? mockSocket : socket }
}
