import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { type CaptionState, useCaptions } from '../lib/captions'
import { LANGUAGES, storedLang, storeLang } from '../lib/languages'
import { useApi } from '../lib/useApi'
import { useWakeLock } from '../lib/wakeLock'

const SIZES = ['clamp(1.35rem, 3.4vw, 2.4rem)', 'clamp(1.75rem, 4.6vw, 3.4rem)', 'clamp(2.25rem, 6.2vw, 4.75rem)']
const SIZE_KEY = 'slap.captionSize'
const TAIL_WORDS = 24
const FRESH = 3

function readSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return Number.isInteger(n) && n >= 0 && n < SIZES.length ? n : 1
  } catch {
    return 1
  }
}

const toks = (words: { word: string; punctuated?: string }[] | undefined, text: string) =>
  words && words.length ? words.map((w) => w.punctuated ?? w.word) : text.split(/\s+/).filter(Boolean)

/** Source line: tail of the last final + current interim; newest words bright, older dimmed. */
function SourceLine({ state, size }: { state: CaptionState; size: string }) {
  const tokens = useMemo(() => {
    const last = state.finals[state.finals.length - 1]
    const finalToks = last ? toks(last.words, last.text) : []
    const interimToks = state.interim ? toks(state.interim.words, state.interim.text) : []
    return [...finalToks, ...interimToks].slice(-TAIL_WORDS)
  }, [state.finals, state.interim])

  if (tokens.length === 0) return <p className="text-white/40" style={{ fontSize: size }}>Waiting for the lecturer…</p>
  const n = tokens.length
  return (
    <p className="font-medium leading-[1.18] tracking-tight" style={{ fontSize: size }} aria-live="off">
      {tokens.map((t, i) => {
        const age = n - 1 - i
        const cls = age < FRESH ? 'text-white font-bold' : age < FRESH + 8 ? 'text-white/70' : 'text-white/35'
        return (
          <span key={i} className={`${cls} transition-colors duration-500`}>
            {t}{' '}
          </span>
        )
      })}
    </p>
  )
}

/** Translation line, subtitle style: the sentence being spoken is translated as it grows (bold) after the last
 *  finished one (dim). Between sentences: latest translated final bold, the previous one dim. */
function TranslationLine({ state, lang, size }: { state: CaptionState; lang: string; size: string }) {
  const rtl = LANGUAGES.find((l) => l.code === lang)?.rtl
  const items = useMemo(() => {
    if (lang === 'en') return state.finals.map((f) => ({ id: f.segmentId, text: f.text }))
    return state.finals.filter((f) => state.translations[f.segmentId]).map((f) => ({ id: f.segmentId, text: state.translations[f.segmentId] }))
  }, [state.finals, state.translations, lang])
  const live = lang !== 'en' ? state.interimTr : null
  const pending = lang !== 'en' && state.finals.length > 0 && !state.translations[state.finals[state.finals.length - 1].segmentId]
  const latest = items[items.length - 1]
  const prev = items[items.length - 2]
  if (!latest && !live) return null
  return (
    <p dir={rtl ? 'rtl' : undefined} lang={lang} className="leading-[1.22] tracking-tight" style={{ fontSize: size }} aria-live="polite">
      {live ? (
        <>
          {latest && <span className="text-white/40">{latest.text} </span>}
          <span className="font-bold text-white">{live.text}</span>
        </>
      ) : (
        <>
          {prev && <span className="text-white/40">{prev.text} </span>}
          <span key={latest.id} className="font-bold text-white">
            {latest.text}
          </span>
          {pending && <span className="pulse text-white/40"> …</span>}
        </>
      )}
    </p>
  )
}

export function LivePage() {
  const { lectureId = '' } = useParams()
  const [lang, setLang] = useState(storedLang)
  const [sizeIdx, setSizeIdx] = useState(readSize)
  const meta = useApi(() => api.publicLecture(lectureId, lang), [lectureId])
  const { state, socket } = useCaptions(lectureId, lang)
  useWakeLock(true)

  // Captions page is always dark, whatever the system theme.
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#0d0d0d'
    return () => {
      document.body.style.background = prev
    }
  }, [])

  const cycleSize = () =>
    setSizeIdx((i) => {
      const n = (i + 1) % SIZES.length
      try {
        localStorage.setItem(SIZE_KEY, String(n))
      } catch {
        /* ignore */
      }
      return n
    })

  const ended = state.status?.state === 'ended' || (meta.data && meta.data.status !== 'live' && state.finals.length === 0 && !state.interim)
  const live = !ended && socket === 'open' && state.status?.state === 'recording'
  // Clearly labelled: a replay of a saved lecture is not the room's live audio.
  const replay = !!(state.status?.replay || meta.data?.replay)
  const translated = lang !== 'en'
  const size = SIZES[sizeIdx]
  const smaller = SIZES[Math.max(0, sizeIdx - 1)]

  return (
    <div className="flex h-dvh flex-col bg-[#0d0d0d] text-white [color-scheme:dark]">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 md:px-8">
        <a href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="Slap home">
          <span className="inline-flex h-4 w-6 items-center rounded-[3px] bg-white">
            <span className="ml-auto mr-0.5 size-1.5 rounded-full bg-[#ff6a00]" />
          </span>
          <span className="hidden sm:inline">slap</span>
        </a>
        <div className="min-w-0 flex-1 truncate text-sm text-white/60">
          {replay && (
            <span className="mr-2 inline-flex h-5 items-center rounded-sm border border-yellow-400/70 px-1.5 font-mono text-[10px] uppercase tracking-wider text-yellow-300" title="A saved lecture played back, not live audio">
              Replay
            </span>
          )}
          {meta.data ? (
            <>
              <span className="text-white/90">{meta.data.className}</span> · {meta.data.title}
            </>
          ) : meta.error ? (
            'Live captions'
          ) : (
            '…'
          )}
        </div>
        <label className="sr-only" htmlFor="lang">
          Language
        </label>
        <select
          id="lang"
          value={lang}
          onChange={(e) => {
            setLang(e.target.value)
            storeLang(e.target.value)
          }}
          className="h-10 rounded-md border border-white/15 bg-[#1c1c1c] px-2 text-sm font-medium text-white"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
              {l.code !== 'en' ? ` · ${l.name}` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={cycleSize}
          className="grid h-10 min-w-12 cursor-pointer place-items-center rounded-md border border-white/15 bg-[#1c1c1c] px-3 font-semibold"
          aria-label="Change text size"
          title="Text size"
        >
          <span style={{ fontSize: 12 + sizeIdx * 4 }}>Aa</span>
        </button>
      </header>

      <main
        className="flex min-h-0 flex-1 cursor-pointer flex-col justify-end overflow-hidden px-5 pb-6 md:px-12 md:pb-10"
        onClick={cycleSize}
        title="Tap to change text size"
      >
        <div className="mx-auto w-full max-w-6xl space-y-6">
          {ended && (
            <div className="rounded-md border border-white/15 bg-white/5 p-5 text-base" onClick={(e) => e.stopPropagation()}>
              <div className="font-mono text-xs uppercase tracking-widest text-white/50">{replay ? 'Replay ended' : 'Lecture ended'}</div>
              <p className="mt-2 text-white/80">{replay ? 'That was a saved lecture played back; its notes and practice are already in the class.' : 'Captions stopped. Notes, flashcards and practice will be ready shortly.'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to={`/recall/${lectureId}`}
                  className="inline-flex h-10 items-center rounded-md bg-[#ff6a00] px-4 text-sm font-semibold text-white"
                >
                  Take the 3-minute recall check
                </Link>
                {meta.data && (
                  <Link to={`/c/${meta.data.classId}/lecture/${lectureId}`} className="inline-flex h-10 items-center rounded-md border border-white/20 px-4 text-sm">
                    Open the lecture notes
                  </Link>
                )}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">{replay ? 'Replay of a saved lecture · EN' : 'Lecturer · EN'}</div>
            <SourceLine state={state} size={translated ? smaller : size} />
          </div>
          {(translated || state.finals.length > 0) && (
            <div className="border-t border-white/10 pt-5">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
                {translated ? `${LANGUAGES.find((l) => l.code === lang)?.native ?? lang} · machine translation, approximate` : 'Last sentence'}
              </div>
              {translated && state.finals.length > 0 && Object.keys(state.translations).length === 0 && !state.interimTr ? (
                <p className="pulse text-white/40" style={{ fontSize: size }}>
                  Translating…
                </p>
              ) : (
                <TranslationLine state={state} lang={lang} size={size} />
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-white/55 md:px-8">
        <span className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${live ? (replay ? 'pulse bg-yellow-400' : 'pulse bg-[#ff6a00]') : socket === 'reconnecting' ? 'bg-yellow-400' : 'bg-white/30'}`} />
          <span className={live ? (replay ? 'text-yellow-300' : 'text-[#ff8a3d]') : ''}>
            {ended ? 'Ended' : socket === 'reconnecting' ? 'Reconnecting' : socket === 'connecting' ? 'Connecting' : live ? (replay ? 'Replay' : 'Live') : (state.status?.state ?? 'Waiting')}
          </span>
        </span>
        {state.status && <span>{state.status.viewers} watching</span>}
        {state.status?.latencyMs != null && <span>{state.status.latencyMs} ms</span>}
        <span className="ml-auto hidden normal-case tracking-normal text-white/35 sm:inline">Recording light on · audio never stored</span>
      </footer>
    </div>
  )
}
