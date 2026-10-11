import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { Concept, RecallResult } from '@slap/contracts'
import { TopBar } from '../components/Shell'
import { Async, Button, ButtonLink, cx, ErrorBox, Label, textareaCls } from '../components/ui'
import { api } from '../lib/api'
import { fmtTime } from '../lib/format'
import type { LectureDetail } from '../lib/types'
import { useApi } from '../lib/useApi'

const DURATION = 180

export default function RecallPage() {
  const { lectureId = '' } = useParams()
  const lecture = useApi(() => api.lecture(lectureId), [lectureId])
  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        <Async state={lecture} label="Loading lecture">
          {(data) => <RecallView data={data} />}
        </Async>
      </main>
    </div>
  )
}

function RecallView({ data }: { data: LectureDetail }) {
  const { lecture } = data
  const [phase, setPhase] = useState<'ready' | 'writing' | 'submitting' | 'done'>('ready')
  const [left, setLeft] = useState(DURATION)
  const [text, setText] = useState('')
  const [result, setResult] = useState<RecallResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const textRef = useRef(text)
  textRef.current = text
  const area = useRef<HTMLTextAreaElement>(null)
  // Class concepts cover lectures whose own bundle isn't ready yet; used to link results to notes.
  const classConcepts = useApi(() => api.concepts(lecture.classId), [lecture.classId])

  const submit = async () => {
    setPhase('submitting')
    setError(null)
    try {
      setResult(await api.recall(lecture.id, textRef.current))
      setPhase('done')
    } catch (e) {
      setError(e)
      setPhase('writing')
    }
  }
  const submitRef = useRef(submit)
  submitRef.current = submit

  useEffect(() => {
    if (phase !== 'writing') return
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(t)
          if (textRef.current.trim()) void submitRef.current()
          return 0
        }
        return l - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  const pctLeft = left / DURATION

  return (
    <div>
      <div className="mb-6 text-sm">
        <Link to={`/c/${lecture.classId}/lecture/${lecture.id}`} className="text-muted hover:text-ink">
          ← {lecture.title}
        </Link>
      </div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Label className="mb-2">Recall check · retrieval practice</Label>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Write everything you remember</h1>
          <p className="mt-2 max-w-xl text-ink-2">No notes, no peeking. Three minutes. We compare it with the lecture and show what you got, missed and got wrong.</p>
        </div>
        <div className="flex items-center gap-4 rounded-md border border-line bg-panel px-5 py-3">
          <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--panel-2)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={left <= 30 ? 'var(--accent)' : 'var(--ink)'} strokeWidth="4" strokeDasharray={`${pctLeft * 97.4} 97.4`} strokeLinecap="round" />
          </svg>
          <div className={cx('font-mono text-4xl font-semibold tabular-nums', left <= 30 && phase === 'writing' && 'text-accent')}>{fmtTime(left)}</div>
        </div>
      </header>

      {phase === 'done' && result ? (
        <ResultView result={result} concepts={classConcepts.data ?? data.concepts} classId={lecture.classId} text={text} />
      ) : (
        <div>
          <div className="relative">
            <textarea
              ref={area}
              className={textareaCls + ' min-h-[45dvh] p-5 text-lg'}
              placeholder={phase === 'ready' ? 'Press start, then type…' : 'Concepts, definitions, examples, how things connect…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={phase !== 'writing'}
              aria-label="What you remember"
            />
            {phase === 'ready' && (
              <div className="absolute inset-0 grid place-items-center rounded-md bg-bg/60 backdrop-blur-[2px]">
                <Button
                  variant="accent"
                  size="lg"
                  onClick={() => {
                    setPhase('writing')
                    setTimeout(() => area.current?.focus(), 0)
                  }}
                >
                  Start 3:00
                </Button>
              </div>
            )}
          </div>
          {error != null && (
            <div className="mt-3">
              <ErrorBox error={error} />
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-muted">{text.trim() ? `${text.trim().split(/\s+/).length} words` : ''}</span>
            <Button variant="ink" size="lg" disabled={phase !== 'writing' || !text.trim()} onClick={() => void submit()}>
              {phase === 'submitting' ? 'Comparing…' : 'Submit'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultView({ result, concepts, classId, text }: { result: RecallResult; concepts: Concept[]; classId: string; text: string }) {
  const byName = useMemo(() => new Map(concepts.map((c) => [c.name.toLowerCase(), c])), [concepts])
  const find = (s: string) => byName.get(s.toLowerCase()) ?? concepts.find((c) => s.toLowerCase().includes(c.name.toLowerCase()))
  const cols: Array<{ key: keyof Omit<RecallResult, 'score'>; title: string; tone: string; dot: string }> = [
    { key: 'got', title: 'Got', tone: 'border-good/60', dot: 'bg-good' },
    { key: 'missed', title: 'Missed', tone: 'border-line', dot: 'bg-muted' },
    { key: 'wrong', title: 'Wrong', tone: 'border-bad/60', dot: 'bg-bad' },
  ]
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-6 rounded-md border border-line bg-panel p-5">
        <div>
          <Label>Score</Label>
          <div className="font-mono text-4xl font-bold">{Math.round(result.score * 100)}%</div>
        </div>
        <p className="max-w-xl text-sm text-ink-2">Misses and mistakes feed your mastery and become flashcards. Recalling is what makes it stick, so the score matters less than the attempt.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map((c) => (
          <section key={c.key} className={cx('rounded-md border-t-4 bg-panel p-5', c.tone)}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">{c.title}</h2>
              <span className="font-mono text-sm text-muted">{result[c.key].length}</span>
            </div>
            {result[c.key].length === 0 ? (
              <p className="text-sm text-muted">Nothing here.</p>
            ) : (
              <ul className="space-y-2">
                {result[c.key].map((item, i) => {
                  const concept = find(item)
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', c.dot)} />
                      {concept ? (
                        <Link to={`/c/${classId}/concept/${concept.id}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">
                          {item}
                        </Link>
                      ) : (
                        <span>{item}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
      <details className="mt-6 rounded-md border border-line bg-panel p-4 text-sm">
        <summary className="cursor-pointer label">What you wrote</summary>
        <p className="mt-3 whitespace-pre-wrap text-ink-2">{text}</p>
      </details>
      <div className="mt-6 flex gap-2">
        <ButtonLink variant="ink" to={`/c/${classId}/review`}>
          Review cards
        </ButtonLink>
        <ButtonLink to={`/c/${classId}/graph`}>See the graph</ButtonLink>
      </div>
    </div>
  )
}
