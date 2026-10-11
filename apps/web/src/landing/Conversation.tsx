import { useEffect, useReducer, useRef, useState } from 'react'
import { cx } from '../components/ui'
import { EXAMPLE, WHO_NAMES, type Who } from './data'
import { mmss } from './format'
import { prefersReducedMotion } from './motion'
import { EMPTY_TALK, talkRows, talkStep, talkText } from './talk'

// The Conversation side bar: the tab on the right edge opens it. It listens, writes down what is said, and
// sorts it into turns by speaker (the sorting is in talk.ts).
// The browser turns the sound into text (its built-in speech recognition, in Chrome and Safari).
// It cannot tell voices apart, so the "Who is speaking" buttons decide whose turn the words go to.

/** The browser's speech recognition, as far as this page uses it (TypeScript has no types for it yet). */
type Recognizer = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognizerClass = new () => Recognizer

function recognizerClass(): RecognizerClass | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

const WHOS: readonly Who[] = ['professor', 'student']
const SPOKEN = [
  { code: 'en-US', name: 'English' },
  { code: 'ja-JP', name: '日本語' },
  { code: 'vi-VN', name: 'Tiếng Việt' },
]

/** What is running outside React: the recogniser, whether it should keep going, and the example's timer. */
type Session = { rec: Recognizer | null; listening: boolean; demoTimer: number | undefined }

export function Conversation() {
  const [open, setOpen] = useState(false)
  const [talk, step] = useReducer(talkStep, EMPTY_TALK)
  const [listening, showListening] = useState(false)
  const [demoOn, setDemoOn] = useState(false)
  const [spoken, setSpoken] = useState(SPOKEN[0].code)
  // The line under the buttons. null until something has been said there.
  const [status, say] = useState<string | null>(null)

  const session = useRef<Session>({ rec: null, listening: false, demoTimer: undefined })
  const tabRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  // Opening moves the keyboard focus into the side bar; closing gives it back to the tab.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current === open) return
    wasOpen.current = open
    void panelRef.current?.offsetWidth // let the side bar become visible first, or it cannot take the keyboard focus
    const target = open ? closeRef.current : tabRef.current
    target?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Keep the newest words in view.
  useEffect(() => {
    const panel = panelRef.current
    if (panel?.classList.contains('open')) panel.scrollTop = panel.scrollHeight
  }, [talk])

  // Leaving the page stops the microphone and the example.
  useEffect(() => {
    const s = session.current
    return () => {
      s.listening = false
      window.clearTimeout(s.demoTimer)
      try {
        s.rec?.stop()
      } catch {
        /* already stopped */
      }
    }
  }, [])

  function toggle() {
    // The first time the side bar opens, say so if this browser cannot listen.
    if (!open && status === null && !recognizerClass()) say('This browser cannot listen. Open the page in Chrome or Safari, or play the example.')
    setOpen(!open)
  }

  function setListening(on: boolean) {
    session.current.listening = on
    showListening(on)
  }

  function clearInterim() {
    step({ type: 'heard', finals: [], interim: '', at: Date.now() })
  }

  function stopListening() {
    setListening(false)
    try {
      session.current.rec?.stop()
    } catch {
      /* already stopped */
    }
    clearInterim()
  }

  function startListening(lang: string) {
    const Rec = recognizerClass()
    if (!Rec) {
      say('This browser cannot listen. Open the page in Chrome or Safari.')
      return
    }
    stopDemo()
    const rec = new Rec()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      const finals: string[] = []
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript
        if (e.results[i].isFinal) finals.push(text)
        else interim += text
      }
      step({ type: 'heard', finals, interim, at: Date.now() })
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') say('The microphone is blocked here. Open this page in Chrome or Safari and press Allow when it asks.')
      else if (e.error === 'audio-capture') say('No microphone was found.')
      else if (e.error === 'network') say("The browser's speech service could not be reached.")
      else say(`Listening stopped (${e.error}).`)
      setListening(false)
    }
    // The browser ends a session after a silence; keep going until "Stop listening" is pressed.
    // A recogniser that has been replaced (after a change of language) stays stopped.
    rec.onend = () => {
      if (!session.current.listening || session.current.rec !== rec) return
      try {
        rec.start()
      } catch {
        setListening(false)
      }
    }
    session.current.rec = rec
    try {
      rec.start()
    } catch {
      say('Could not start listening.')
      return
    }
    setListening(true)
    say('Listening…')
  }

  // ---- The example: the same sorting, fed with written lines instead of the microphone.

  function stopDemo() {
    window.clearTimeout(session.current.demoTimer)
    session.current.demoTimer = undefined
    setDemoOn(false)
    clearInterim()
  }

  function playDemo() {
    if (session.current.listening) stopListening()
    step({ type: 'clear', at: Date.now() })
    setDemoOn(true)
    say('Playing an example conversation.')
    // With "reduce motion" switched on, the whole conversation appears at once.
    if (prefersReducedMotion()) {
      for (const l of EXAMPLE) {
        const at = Date.now()
        step({ type: 'speaker', who: l.who, newTurn: l.pause, at })
        step({ type: 'heard', finals: [l.text], interim: '', at })
      }
      stopDemo()
      say('')
      return
    }
    let line = 0
    let word = 0
    const next = () => {
      if (line >= EXAMPLE.length) {
        stopDemo()
        say('')
        return
      }
      const l = EXAMPLE[line]
      const words = l.text.split(' ')
      const at = Date.now()
      if (word === 0) step({ type: 'speaker', who: l.who, newTurn: l.pause, at })
      if (word < words.length) {
        // One more word, in grey.
        word++
        step({ type: 'heard', finals: [], interim: words.slice(0, word).join(' '), at })
        session.current.demoTimer = window.setTimeout(next, 150)
      } else {
        // The line is finished: file it and move on.
        step({ type: 'heard', finals: [l.text], interim: '', at })
        line++
        word = 0
        session.current.demoTimer = window.setTimeout(next, 650)
      }
    }
    next()
  }

  // ---- Buttons

  function copy() {
    if (!talk.turns.length) {
      say('There is nothing to copy yet.')
      return
    }
    // Browsers only offer the clipboard on a secure (https or localhost) page.
    const clipboard: Clipboard | undefined = navigator.clipboard
    if (!clipboard) {
      say('This browser cannot copy from here.')
      return
    }
    clipboard.writeText(talkText(talk.turns)).then(
      () => say('Copied.'),
      () => say('Could not copy.'),
    )
  }

  function clear() {
    stopDemo()
    step({ type: 'clear', at: Date.now() })
    say('')
  }

  const rows = talkRows(talk)

  return (
    <>
      <button ref={tabRef} className={cx('said-tab', listening && 'listening')} type="button" aria-expanded={open} aria-controls="saidPanel" onClick={toggle}>
        <i aria-hidden="true" />
        Conversation
      </button>
      <div className={cx('said-shade', open && 'open')} onClick={() => setOpen(false)} />
      <aside ref={panelRef} className={cx('said', open && 'open')} id="saidPanel" aria-label="Conversation">
        <div className="said-head">
          <h2>Conversation</h2>
          <button ref={closeRef} className="said-close" type="button" aria-label="Close" onClick={() => setOpen(false)}>
            <span aria-hidden="true" />
          </button>
        </div>
        <p className="said-intro">This side bar listens to what people say, writes it down, and sorts it into turns under the person who is speaking.</p>

        <div className="talk-actions">
          <button
            className={cx('btn btn-accent', listening && 'on')}
            id="talkStart"
            type="button"
            onClick={() => {
              if (listening) {
                stopListening()
                say('')
              } else startListening(spoken)
            }}
          >
            {listening ? 'Stop listening' : 'Start listening'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              if (demoOn) {
                stopDemo()
                say('')
              } else playDemo()
            }}
          >
            {demoOn ? 'Stop the example' : 'Play an example'}
          </button>
        </div>
        <p className="talk-status" role="status">
          {status}
        </p>

        <div className="talk-row">
          <span className="talk-label" id="talkWhoLabel">
            Who is speaking
          </span>
          <div className="seg" role="group" aria-labelledby="talkWhoLabel">
            {WHOS.map((who) => (
              <button key={who} type="button" aria-pressed={talk.who === who} onClick={() => step({ type: 'speaker', who, at: Date.now() })}>
                {WHO_NAMES[who]}
              </button>
            ))}
          </div>
        </div>
        <div className="talk-row">
          <label className="talk-label" htmlFor="talkLang">
            Spoken language
          </label>
          <select
            id="talkLang"
            value={spoken}
            onChange={(e) => {
              setSpoken(e.target.value)
              // The recogniser takes its language when it starts, so start it again.
              if (listening) {
                stopListening()
                startListening(e.target.value)
              }
            }}
          >
            {SPOKEN.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <ol className="talk-list">
          {rows.map((row, i) => (
            <li key={i} className={`turn turn-${row.who}`}>
              <div className="turn-head">
                <span className="turn-who">{WHO_NAMES[row.who]}</span>
                <time>{mmss(row.t)}</time>
              </div>
              <p>
                {row.text}
                {row.interim && <span className="interim">{(row.text ? ' ' : '') + row.interim}</span>}
              </p>
            </li>
          ))}
        </ol>
        <p className="talk-empty" hidden={rows.length > 0}>
          Nothing yet. Press “Start listening” and talk, or play the example.
        </p>

        <div className="talk-foot">
          <button className="talk-link" type="button" onClick={copy}>
            Copy
          </button>
          <button className="talk-link" type="button" onClick={clear}>
            Clear
          </button>
        </div>
        <p className="said-note">To turn sound into text, your browser sends it to its own speech service (Google in Chrome, Apple in Safari). This page saves nothing: the conversation is gone when you close or refresh it.</p>
      </aside>
    </>
  )
}
