// Learning partner: a spoken practice loop. The partner asks, you hold to answer, it grades, explains or moves on.
import type { Concept, PartnerReply, PartnerSession, PartnerVoice } from '@slap/contracts'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useClass } from '../components/ClassLayout'
import { Button, cx, Empty, ErrorBox, inputCls, Label } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useHoldRecorder, type Recording } from '../lib/holdRecorder'
import { LANGUAGES, storedLang, storeLang } from '../lib/languages'
import { replyClips, useAudioPlayer, type PlayResult } from '../lib/partnerAudio'
import { useApi } from '../lib/useApi'

const MAX_MS = 60_000
const MIN_MS = 400
const VOICE_KEY = 'slap.partner.voice'

type Phase = 'starting' | 'gate' | 'speaking' | 'ready' | 'thinking' | 'ended' | 'failed'
type Via = 'voice' | 'text' | 'chip'

type Entry =
  | { kind: 'partner'; id: number; reply: PartnerReply }
  | { kind: 'you'; id: number; text: string; via: Via; grade?: PartnerReply['grade']; pending?: boolean }
  | { kind: 'note'; id: number; text: string }

interface TurnInput {
  audio?: Blob
  filename?: string
  text?: string
  via: Via
  /** What to show in the "you" bubble while the server transcribes. */
  display?: string
}

function readVoice(): string {
  try {
    return localStorage.getItem(VOICE_KEY) ?? ''
  } catch {
    return ''
  }
}
function storeVoice(id: string) {
  try {
    if (id) localStorage.setItem(VOICE_KEY, id)
    else localStorage.removeItem(VOICE_KEY)
  } catch {
    /* storage blocked */
  }
}

/** Typing in a field must not trigger the talk / chip shortcuts. */
function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

/** The API reports Fish ASR/TTS failures as 502 with a useful message; the generic errorMessage() would
 *  turn that into "API not reachable". Keep the server's words when it sent some. */
function partnerError(err: unknown): unknown {
  if (err instanceof ApiError && err.status >= 502 && err.status <= 504 && err.message && !/^\d{3}\b/.test(err.message)) return new Error(err.message)
  return err
}

let entrySeq = 0
const nextId = () => ++entrySeq

export default function PartnerPage() {
  const { classId, detail } = useClass()
  const readyLectures = useMemo(
    () => detail.lectures.filter((l) => l.status === 'ready').sort((a, b) => b.date.localeCompare(a.date)),
    [detail.lectures],
  )
  const voices = useApi(() => api.partnerVoices(), [])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const conceptById = useMemo(() => new Map((concepts.data ?? []).map((c) => [c.id, c])), [concepts.data])

  // ---- settings (a change starts a new session) ----
  const [voiceId, setVoiceId] = useState(readVoice) // '' = the server's default voice
  const [lang, setLang] = useState(storedLang)
  const [lectureId, setLectureId] = useState(() => readyLectures[0]?.id ?? '')
  const [nonce, setNonce] = useState(0)
  // A stored voice that is no longer offered falls back to the default; the session waits for the list to know.
  const voiceStale = !!voiceId && !!voices.data && !voices.data.some((v) => v.id === voiceId)
  const voiceReady = !voiceId || (!voiceStale && (!!voices.data || !!voices.error))
  useEffect(() => {
    if (!voiceStale) return
    storeVoice('')
    setVoiceId('')
  }, [voiceStale])

  // ---- conversation ----
  const [phase, setPhase] = useState<Phase>('starting')
  const [session, setSession] = useState<PartnerSession | null>(null)
  const sessionRef = useRef<PartnerSession | null>(null)
  const [startError, setStartError] = useState<unknown>(null)
  const [turnError, setTurnError] = useState<{ err: unknown; input: TurnInput } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const busyRef = useRef(false)

  const player = useAudioPlayer(() => setPhase((p) => (p === 'speaking' ? 'ready' : p)))
  const { play: playAudio, stop: stopAudio, preload } = player

  const lastClips = useMemo(() => {
    const clips = entries.map((e) => (e.kind === 'partner' ? replyClips(e.reply) : [])).filter((c) => c.length > 0)
    return clips.length ? clips[clips.length - 1] : null
  }, [entries])
  const currentLine = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]
      if (e.kind === 'partner') return e.reply
    }
    return null
  }, [entries])
  const score = useMemo(() => {
    const graded = entries.filter((e): e is Extract<Entry, { kind: 'you' }> => e.kind === 'you' && !!e.grade)
    return { correct: graded.filter((e) => e.grade?.correct).length, total: graded.length }
  }, [entries])

  /** Plays clips back to back (feedback, then question); the status reads Speaking through all of them.
   *  With `holdMs`, Thinking/Connecting stays up until the first clip actually starts (streamed audio), at most
   *  `holdMs`, so a fast JSON response doesn't flash "Speaking" over silence. */
  const playClips = useCallback(
    async (clips: string[], holdMs = 0): Promise<PlayResult> => {
      const waiting = (p: Phase) => p === 'thinking' || p === 'starting'
      let timer: ReturnType<typeof setTimeout> | undefined
      if (holdMs) timer = setTimeout(() => setPhase((p) => (waiting(p) ? 'speaking' : p)), holdMs)
      else setPhase('speaking')
      const r = await playAudio(clips)
      clearTimeout(timer)
      if (r === 'played') setPhase((p) => (waiting(p) ? 'speaking' : p))
      else if (r === 'blocked') setPhase('gate')
      else if (r === 'error') {
        setPhase((p) => (waiting(p) || p === 'speaking' ? 'ready' : p))
        setNotice('Couldn’t play the audio. The text is above.')
      }
      return r
    },
    [playAudio],
  )

  /** Plays a reply. Autoplay may be blocked (Safari/iOS without a prior gesture): fall back to a Start tap. */
  const speak = useCallback(
    async (reply: PartnerReply, first = false) => {
      const clips = replyClips(reply)
      if (!clips.length) {
        setPhase('ready')
        return
      }
      const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
      if (first && ua && !ua.hasBeenActive) {
        setPhase('gate')
        return
      }
      await playClips(clips, 2000)
    },
    [playClips],
  )

  // ---- session lifecycle ----
  const hasLectures = readyLectures.length > 0
  useEffect(() => {
    if (!hasLectures || !voiceReady) return
    let cancelled = false
    setPhase('starting')
    setStartError(null)
    setTurnError(null)
    setNotice(null)
    api
      .partnerSession(classId, { lectureId: lectureId || undefined, voiceId: voiceId || undefined, lang })
      .then((s) => {
        if (cancelled) {
          void api.endPartner(s.sessionId).catch(() => {})
          return
        }
        sessionRef.current = s
        setSession(s)
        setEntries((prev) => [
          ...prev,
          ...(prev.length ? [{ kind: 'note' as const, id: nextId(), text: 'New session' }] : []),
          { kind: 'partner' as const, id: nextId(), reply: s.opening },
        ])
        preload(s.opening.audioUrl)
        void speak(s.opening, true)
      })
      .catch((e) => {
        if (cancelled) return
        setStartError(e)
        setPhase('failed')
      })
    return () => {
      cancelled = true
      const s = sessionRef.current
      sessionRef.current = null
      setSession(null)
      stopAudio()
      if (s) void api.endPartner(s.sessionId).catch(() => {})
    }
  }, [classId, voiceId, voiceReady, lang, lectureId, nonce, hasLectures, preload, speak, stopAudio])

  const send = useCallback(
    async (input: TurnInput) => {
      const s = sessionRef.current
      if (!s || busyRef.current) return
      busyRef.current = true
      stopAudio()
      setTurnError(null)
      setNotice(null)
      const pendingId = nextId()
      setEntries((prev) => [...prev, { kind: 'you', id: pendingId, text: input.display ?? input.text ?? '', via: input.via, pending: true }])
      setPhase('thinking')
      try {
        const t = await api.partnerTurn(s.sessionId, { audio: input.audio, filename: input.filename, text: input.text })
        if (sessionRef.current !== s) return
        preload(t.reply.audioUrl)
        setEntries((prev) => [
          ...prev.map((e) =>
            e.id === pendingId && e.kind === 'you' ? { ...e, text: t.transcript || e.text, grade: t.reply.grade ?? undefined, pending: false } : e,
          ),
          { kind: 'partner', id: nextId(), reply: t.reply },
        ])
        await speak(t.reply)
      } catch (err) {
        setEntries((prev) => prev.filter((e) => e.id !== pendingId))
        setTurnError({ err, input })
        if (sessionRef.current === s) setPhase('ready')
      } finally {
        busyRef.current = false
      }
    },
    [preload, speak, stopAudio],
  )

  const onRecorded = useCallback(
    (r: Recording) => {
      if (r.ms < MIN_MS || r.blob.size === 0) {
        setNotice('Hold the button down while you speak, then let go.')
        return
      }
      void send({ audio: r.blob, filename: r.filename, via: 'voice', display: 'Transcribing…' })
      if (r.capped) setNotice('Stopped at 60 seconds and sent what you said.')
    },
    [send],
  )
  const rec = useHoldRecorder({ maxMs: MAX_MS, onDone: onRecorded })
  const recording = rec.state === 'recording' || rec.state === 'requesting'

  const canTalk = !!session && (phase === 'ready' || phase === 'speaking')
  const beginTalk = () => {
    if (!canTalk || recording) return
    if (phase === 'speaking') {
      stopAudio()
      setPhase('ready')
    }
    setNotice(null)
    void rec.start()
  }
  const endTalk = () => rec.stop()
  const skip = () => {
    if (canTalk && !recording) void send({ text: 'skip', via: 'chip', display: 'Skip' })
  }
  const explain = () => {
    if (canTalk && !recording) void send({ text: 'explain that', via: 'chip', display: 'Explain that' })
  }
  const repeat = () => {
    if (!lastClips || !session || phase === 'thinking' || recording) return
    setNotice(null)
    void playClips(lastClips)
  }
  const startFromGate = () => {
    if (!lastClips) {
      setPhase('ready')
      return
    }
    setPhase('speaking')
    // Called inside the tap, so Safari/iOS unlock the shared audio element here.
    void playAudio(lastClips).then((r) => {
      if (r === 'blocked' || r === 'error') {
        setPhase('ready')
        setNotice('Audio is blocked in this browser. Read the question above and answer when ready.')
      }
    })
  }
  const endSession = async () => {
    const s = sessionRef.current
    sessionRef.current = null
    setSession(null)
    rec.stop()
    stopAudio()
    setPhase('ended')
    setTurnError(null)
    if (s) await api.endPartner(s.sessionId).catch(() => {})
  }
  const restart = () => setNonce((n) => n + 1)

  // ---- keyboard: hold Space to talk, S skip, E explain, R repeat ----
  const onSpace = () => (phase === 'gate' ? startFromGate() : beginTalk())
  const keys = useRef({ onSpace, endTalk, skip, explain, repeat })
  keys.current = { onSpace, endTalk, skip, explain, repeat }
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) keys.current.onSpace()
      } else if (e.repeat) return
      else if (e.code === 'KeyS') keys.current.skip()
      else if (e.code === 'KeyE') keys.current.explain()
      else if (e.code === 'KeyR') keys.current.repeat()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return
      e.preventDefault()
      keys.current.endTalk()
    }
    const blur = () => keys.current.endTalk()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // ---- text fallback ----
  const [typed, setTyped] = useState('')
  const submitTyped = (e: FormEvent) => {
    e.preventDefault()
    const text = typed.trim()
    if (!text || !session || phase === 'thinking') return
    setTyped('')
    void send({ text, via: 'text' })
  }

  if (readyLectures.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <Header />
        <Empty>
          The partner quizzes you out loud on processed lectures. It opens once a lecture’s study bundle is ready.{' '}
          <Link to={`/c/${classId}`} className="underline">
            Back to lectures
          </Link>
        </Empty>
      </div>
    )
  }

  const expired = turnError?.err instanceof ApiError && turnError.err.status === 404
  const status: { label: string; live?: boolean } =
    rec.state === 'recording'
      ? { label: 'Listening', live: true }
      : rec.state === 'requesting'
        ? { label: 'Waiting for the mic' }
        : phase === 'speaking'
          ? { label: 'Speaking', live: true }
          : phase === 'thinking'
            ? { label: 'Thinking', live: true }
            : phase === 'starting'
              ? { label: 'Connecting' }
              : phase === 'gate'
                ? { label: 'Ready' }
                : phase === 'ended'
                  ? { label: 'Session ended' }
                  : phase === 'failed'
                    ? { label: 'Not connected' }
                    : { label: 'Your turn' }

  return (
    <div className="mx-auto max-w-4xl">
      <Header score={score}>
        {phase !== 'ended' && phase !== 'failed' && (
          <Button variant="outline" onClick={() => void endSession()} disabled={!session}>
            <span className="size-2.5 rounded-[2px] bg-ink" /> End session
          </Button>
        )}
      </Header>

      <Settings
        voices={voices.data}
        voicesError={voices.error}
        voiceId={voiceId || session?.voiceId || ''}
        onVoice={(id) => {
          storeVoice(id)
          setVoiceId(id)
        }}
        lang={lang}
        onLang={(code) => {
          storeLang(code)
          setLang(code)
        }}
        lectures={readyLectures}
        lectureId={lectureId}
        onLecture={setLectureId}
      />

      {/* ---- stage ---- */}
      <section className="dotgrid mt-6 flex flex-col items-center rounded-md border border-line bg-panel px-4 pb-8 pt-6 md:px-10">
        <div className="flex items-center gap-2" aria-live="polite">
          <span className={cx('inline-block size-2 rounded-full', status.live ? 'pulse bg-accent' : phase === 'ready' ? 'bg-good' : 'bg-muted')} />
          <span className="label !text-ink-2">Partner · {status.label}</span>
        </div>

        <div className="mt-4 flex min-h-[7.5rem] w-full max-w-2xl items-center justify-center text-center">
          {phase === 'failed' ? (
            <div className="w-full text-left">
              <ErrorBox error={partnerError(startError)} onRetry={restart} />
            </div>
          ) : phase === 'ended' ? (
            <div>
              <p className="text-2xl font-semibold tracking-tight md:text-3xl">Nice work.</p>
              <p className="mt-2 text-sm text-muted">
                {score.total
                  ? `${score.correct} of ${score.total} answers correct this time. Your review cards were rescheduled from them.`
                  : 'No answers graded this time.'}
              </p>
            </div>
          ) : currentLine ? (
            <p
              className={cx(
                'text-balance font-semibold leading-snug tracking-tight',
                currentLine.text.length > 160 ? 'text-xl md:text-2xl' : 'text-2xl md:text-[2rem]',
              )}
            >
              {currentLine.text}
            </p>
          ) : (
            <p className="label">Picking a question…</p>
          )}
        </div>

        <div className="mt-6">
          {phase === 'failed' ? null : phase === 'ended' ? (
            <RoundButton onClick={restart} label="New session" sub="Start again" />
          ) : phase === 'gate' ? (
            <RoundButton onClick={startFromGate} label="Start" sub={score.total ? 'Tap to hear the reply' : 'Tap to hear the first question'} />
          ) : (
            <TalkButton
              disabled={!canTalk}
              recording={rec.state === 'recording'}
              speaking={phase === 'speaking'}
              thinking={phase === 'thinking' || phase === 'starting'}
              level={rec.level}
              progress={rec.elapsedMs / MAX_MS}
              onDown={beginTalk}
              onUp={endTalk}
            />
          )}
        </div>

        <div className="mt-4 h-5 text-center text-sm" aria-live="polite">
          {rec.state === 'recording' ? (
            <span className={cx('font-mono', MAX_MS - rec.elapsedMs < 10_000 ? 'font-semibold text-bad' : 'text-ink-2')}>
              {Math.ceil((MAX_MS - rec.elapsedMs) / 1000)} s left · release to send
            </span>
          ) : phase === 'ready' || phase === 'speaking' ? (
            <span className="text-muted">
              Hold to talk <Kbd>Space</Kbd>
            </span>
          ) : null}
        </div>

        {phase !== 'ended' && phase !== 'failed' && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Chip onClick={skip} disabled={!canTalk || recording} k="S">
              Skip
            </Chip>
            <Chip onClick={explain} disabled={!canTalk || recording} k="E">
              Explain that
            </Chip>
            <Chip onClick={repeat} disabled={!lastClips || !session || phase === 'thinking' || recording} k="R">
              Repeat
            </Chip>
          </div>
        )}

        <div className="mt-5 w-full max-w-xl space-y-3">
          {(rec.error || notice) && (
            <p className={cx('text-center text-sm', rec.state === 'denied' || rec.state === 'error' || rec.state === 'unsupported' ? 'text-bad' : 'text-ink-2')} role="status">
              {rec.error ?? notice}
            </p>
          )}
          {turnError &&
            (expired ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-bad/50 bg-bad/10 px-4 py-3 text-sm" role="alert">
                <span>
                  <span className="label mr-2 !text-bad">Expired</span>This session ended on the server.
                </span>
                <Button size="sm" onClick={restart}>
                  Start a new session
                </Button>
              </div>
            ) : (
              <ErrorBox error={partnerError(turnError.err)} onRetry={() => void send(turnError.input)} />
            ))}
          {phase !== 'ended' && phase !== 'failed' && (
            <form onSubmit={submitTyped} className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Or type your answer…"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label="Type your answer"
                disabled={!session}
              />
              <Button variant="ink" disabled={!typed.trim() || !session || phase === 'thinking'}>
                Send
              </Button>
            </form>
          )}
        </div>
      </section>

      <Transcript entries={entries} conceptById={conceptById} classId={classId} onPlay={(clips) => {
          if (phase === 'ready') void playClips(clips)
        }} />
    </div>
  )
}

// ---------- pieces ----------

function Header({ score, children }: { score?: { correct: number; total: number }; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Label className="mb-2">Learning partner · spoken practice</Label>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Practice out loud</h1>
      </div>
      <div className="flex items-center gap-3">
        {score && (
          <div className="rounded-md border border-line bg-panel px-4 py-1.5 text-right">
            <Label>Correct</Label>
            <div className="font-mono text-xl font-semibold leading-tight">
              {score.correct}
              <span className="text-muted">/{score.total}</span>
            </div>
          </div>
        )}
        {children}
      </div>
    </header>
  )
}

const selectCls = 'h-9 w-full min-w-0 rounded-md border border-line bg-bg px-2 text-sm text-ink focus:border-ink focus:outline-none'

function Settings({
  voices,
  voicesError,
  voiceId,
  onVoice,
  lang,
  onLang,
  lectures,
  lectureId,
  onLecture,
}: {
  voices: PartnerVoice[] | undefined
  voicesError: unknown
  voiceId: string
  onVoice: (id: string) => void
  lang: string
  onLang: (code: string) => void
  lectures: { id: string; title: string }[]
  lectureId: string
  onLecture: (id: string) => void
}) {
  return (
    <div className="grid gap-4 rounded-md border border-line bg-panel p-4 sm:grid-cols-[1.4fr_0.8fr_1fr]">
      <div className="min-w-0">
        <label className="label mb-1.5 block" htmlFor="partner-voice">
          Voice
        </label>
        <select id="partner-voice" className={selectCls} value={voiceId} onChange={(e) => onVoice(e.target.value)}>
          {!voices && <option value={voiceId}>{voicesError ? 'Default voice' : 'Loading voices…'}</option>}
          {voices?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.style}
              {v.default ? ' (default)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label className="label mb-1.5 block" htmlFor="partner-lang">
          Language
        </label>
        <select id="partner-lang" className={selectCls} value={lang} onChange={(e) => onLang(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native}
              {l.native !== l.name ? ` · ${l.name}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label className="label mb-1.5 block" htmlFor="partner-lecture">
          Lecture
        </label>
        <select id="partner-lecture" className={selectCls} value={lectureId} onChange={(e) => onLecture(e.target.value)}>
          {lectures.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
          <option value="">All lectures (interleaved)</option>
        </select>
      </div>
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function TalkButton({
  disabled,
  recording,
  speaking,
  thinking,
  level,
  progress,
  onDown,
  onUp,
}: {
  disabled: boolean
  recording: boolean
  speaking: boolean
  thinking: boolean
  level: number
  progress: number
  onDown: () => void
  onUp: () => void
}) {
  const R = 92
  const C = 2 * Math.PI * R
  return (
    <div className="relative grid size-52 place-items-center">
      {/* live level halo */}
      <span
        aria-hidden
        className={cx('absolute inset-4 rounded-full bg-accent transition-transform duration-75', speaking && !recording && 'breathe')}
        style={recording ? { transform: `scale(${1 + level * 0.32})`, opacity: 0.18 + level * 0.3 } : speaking ? undefined : { opacity: 0 }}
      />
      {/* 60 s cap progress */}
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--line)" strokeWidth="2" />
        {recording && (
          <circle cx="100" cy="100" r={R} fill="none" stroke={progress > 0.83 ? 'var(--bad)' : 'var(--ink)'} strokeWidth="3" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, progress))} strokeLinecap="round" />
        )}
      </svg>
      <button
        type="button"
        aria-label="Hold to talk"
        aria-pressed={recording}
        disabled={disabled}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          onDown()
        }}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Enter acts like a short hold for keyboard users; Space is handled globally.
          if (e.key === 'Enter' && !e.repeat) onDown()
        }}
        onKeyUp={(e) => e.key === 'Enter' && onUp()}
        className={cx(
          'relative z-10 grid size-40 cursor-pointer touch-none select-none place-items-center rounded-full text-accent-ink shadow-[0_4px_0_rgba(0,0,0,0.28)] transition [-webkit-touch-callout:none] [-webkit-user-select:none]',
          recording ? 'translate-y-[3px] bg-[color-mix(in_srgb,var(--accent)_88%,black)] shadow-[0_1px_0_rgba(0,0,0,0.28)]' : 'bg-accent hover:brightness-105',
          disabled && 'cursor-default opacity-60',
        )}
      >
        {thinking ? (
          <span className="inline-flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="pulse inline-block size-2.5 rounded-full bg-white" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1.5">
            <MicIcon className="size-9" />
            <span className="font-mono text-[12px] uppercase tracking-[0.14em]">{recording ? 'Listening' : 'Hold'}</span>
          </span>
        )}
      </button>
    </div>
  )
}

function RoundButton({ onClick, label, sub }: { onClick: () => void; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        className="grid size-40 cursor-pointer place-items-center rounded-full bg-ink text-bg shadow-[0_4px_0_rgba(0,0,0,0.28)] transition hover:opacity-90 active:translate-y-[3px] active:shadow-[0_1px_0_rgba(0,0,0,0.28)]"
      >
        <span className="flex flex-col items-center gap-2">
          <span className="ml-1 inline-block size-0 border-y-[14px] border-l-[22px] border-y-transparent border-l-accent" aria-hidden />
          <span className="font-mono text-[12px] uppercase tracking-[0.14em]">{label}</span>
        </span>
      </button>
      <span className="text-sm text-muted">{sub}</span>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ml-1 rounded-[3px] border border-line bg-bg px-1 py-px font-mono text-[11px] text-ink-2">{children}</kbd>
}

function Chip({ children, onClick, disabled, k }: { children: ReactNode; onClick: () => void; disabled?: boolean; k: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-line bg-bg px-3 text-sm transition hover:bg-panel-2 disabled:pointer-events-none disabled:opacity-45"
    >
      {children}
      <span className="font-mono text-[11px] text-muted">{k}</span>
    </button>
  )
}

function Transcript({
  entries,
  conceptById,
  classId,
  onPlay,
}: {
  entries: Entry[]
  conceptById: Map<string, Concept>
  classId: string
  onPlay: (clips: string[]) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [entries])
  const turns = entries.filter((e) => e.kind === 'you' && !e.pending).length

  return (
    <section className="mt-6 rounded-md border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <Label>Conversation</Label>
        <span className="label">{turns} {turns === 1 ? 'answer' : 'answers'}</span>
      </div>
      <div ref={box} className="max-h-[44dvh] min-h-32 space-y-3 overflow-y-auto px-4 py-4 md:px-5" aria-live="polite">
        {entries.length === 0 && <p className="py-6 text-center text-sm text-muted">The conversation shows up here.</p>}
        {entries.map((e) => {
          if (e.kind === 'note')
            return (
              <div key={e.id} className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-line" />
                <span className="label">{e.text}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )
          if (e.kind === 'you')
            return (
              <div key={e.id} className="flex flex-col items-end gap-1">
                <div className={cx('max-w-[85%] rounded-md rounded-tr-none bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-bg', e.pending && 'opacity-60')}>
                  {e.text || '…'}
                </div>
                <div className="flex items-center gap-2">
                  {e.pending && <span className="label pulse">Sending</span>}
                  {e.via === 'voice' && !e.pending && <span className="label">Spoken</span>}
                  {e.grade && (
                    <span
                      title={e.grade.feedback}
                      className={cx(
                        'inline-flex h-5 items-center rounded-sm px-1.5 font-mono text-[11px] uppercase tracking-wider',
                        e.grade.correct ? 'bg-good text-white' : 'border border-bad text-bad',
                      )}
                    >
                      {e.grade.correct ? 'Correct' : 'Not yet'}
                    </span>
                  )}
                </div>
              </div>
            )
          const r = e.reply
          const concept = r.conceptId ? conceptById.get(r.conceptId) : undefined
          return (
            <div key={e.id} className="flex flex-col items-start gap-1">
              <div className="max-w-[85%] rounded-md rounded-tl-none border border-line bg-bg px-3.5 py-2.5 text-sm leading-relaxed">{r.text}</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="label capitalize">{r.intent}</span>
                {r.intent === 'explanation' && r.conceptId && (
                  <Link
                    to={`/c/${classId}/concept/${r.conceptId}`}
                    className="inline-flex h-5 items-center gap-1 rounded-sm border border-accent px-1.5 text-[12px] text-accent hover:bg-accent hover:text-accent-ink"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-wider">explained:</span> {concept?.name ?? 'concept'}
                  </Link>
                )}
                {replyClips(r).length > 0 && (
                  <button type="button" onClick={() => onPlay(replyClips(r))} className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-muted underline hover:text-ink">
                    play
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
