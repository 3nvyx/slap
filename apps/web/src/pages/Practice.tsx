import type { Attempt, Concept, Question } from '@slap/contracts'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { Button, cx, Empty, ErrorBox, Label, PageTitle, Spinner, textareaCls } from '../components/ui'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'

export function PracticePage() {
  const { classId } = useClass()
  const { detail } = useClass()
  const [params, setParams] = useSearchParams()
  const focus = params.get('concept') ?? undefined
  const lectureId = params.get('lecture') ?? undefined
  const [round, setRound] = useState(0)
  const set = useApi(() => api.practice(classId, 5, { conceptId: focus, lectureId }), [classId, focus, lectureId, round])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const byId = useMemo(() => new Map((concepts.data ?? []).map((c) => [c.id, c])), [concepts.data])
  const [score, setScore] = useState({ correct: 0, total: 0 })

  const focusName = focus ? byId.get(focus)?.name : lectureId ? detail.lectures.find((l) => l.id === lectureId)?.title : undefined

  return (
    <div className="max-w-3xl">
      <PageTitle kicker="Practice · formative feedback, not a mark" title="Practice">
        <div className="rounded-md border border-line bg-panel px-4 py-2 text-right">
          <Label>Running score</Label>
          <div className="font-mono text-2xl font-semibold">
            {score.correct}
            <span className="text-muted">/{score.total}</span>
          </div>
        </div>
      </PageTitle>

      {(focus || lectureId) && (
        <div className="mb-6 flex items-center gap-3 text-sm">
          <span className="label">{focus ? 'Focus' : 'Lecture first'}</span>
          <span className="font-medium">{focusName ?? (focus ? 'this concept' : 'this lecture')}</span>
          <button className="cursor-pointer text-muted underline" onClick={() => setParams({})}>
            clear
          </button>
        </div>
      )}

      {set.error ? (
        <ErrorBox error={set.error} onRetry={set.reload} />
      ) : !set.data ? (
        <Spinner label="Picking questions" />
      ) : set.data.length === 0 ? (
        <Empty>No practice questions yet. They’re generated with each lecture’s study bundle.</Empty>
      ) : (
        <div className="space-y-5">
          {set.data.map((q, i) => (
            <QuestionCard
              key={`${round}-${q.id}`}
              n={i + 1}
              q={q}
              byId={byId}
              classId={classId}
              onGraded={(a) => setScore((s) => ({ correct: s.correct + (a.correct ? 1 : 0), total: s.total + 1 }))}
            />
          ))}
          <div className="flex justify-end pt-2">
            <Button variant="ink" size="lg" onClick={() => setRound((r) => r + 1)}>
              Next set →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionCard({ n, q, byId, classId, onGraded }: { n: number; q: Question; byId: Map<string, Concept>; classId: string; onGraded: (a: Attempt) => void }) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Attempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const card = useRef<HTMLElement>(null)
  const concept = byId.get(q.conceptId)
  const other = q.relateTo ? (byId.get(q.relateTo)?.name ?? q.relateTo) : null

  const submit = async () => {
    if (!answer.trim() || result) return
    setBusy(true)
    setError(null)
    try {
      const a = await api.attempt(q.id, answer)
      setResult(a)
      onGraded(a)
      // Hands off to the next question so a set can be answered from the keyboard alone.
      const next = card.current?.nextElementSibling
      if (next instanceof HTMLElement && next.tagName === 'ARTICLE') next.focus({ preventScroll: false })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  // Keyboard: A–D (or 1–4) picks an option, Enter checks; typed answers use ⌘/Ctrl+Enter (set on the textarea).
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (result || e.target instanceof HTMLTextAreaElement) return
    if (q.kind === 'mcq' && q.options) {
      const i = /^[a-d]$/i.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : /^[1-4]$/.test(e.key) ? Number(e.key) - 1 : -1
      if (i >= 0 && i < q.options.length) {
        e.preventDefault()
        setAnswer(q.options[i])
        return
      }
    }
    if (e.key === 'Enter' && answer.trim()) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <article
      ref={card}
      tabIndex={-1}
      onKeyDown={onKey}
      className={cx('rounded-md border bg-panel p-5 outline-none focus-visible:ring-2 focus-visible:ring-ink/40 md:p-6', result ? (result.correct ? 'border-good/60' : 'border-bad/60') : 'border-line')}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-muted">{String(n).padStart(2, '0')}</span>
        <span className="label">{q.kind === 'mcq' ? 'Multiple choice' : q.kind === 'short' ? 'Short answer' : 'Relate'}</span>
        <span className="label">· {q.styleSource === 'book' ? 'book style' : 'lecture style'}</span>
        {concept && (
          <Link to={`/c/${classId}/concept/${concept.id}`} className="ml-auto text-xs underline">
            {concept.name}
          </Link>
        )}
      </div>

      {q.kind === 'relate' && concept && other && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-line bg-bg px-2.5 py-1 font-medium">{concept.name}</span>
          <span className="font-mono text-muted">←?→</span>
          <span className="rounded-md border border-line bg-bg px-2.5 py-1 font-medium">{other}</span>
        </div>
      )}
      <p className="text-lg font-medium leading-snug">{q.prompt}</p>

      <div className="mt-4">
        {q.kind === 'mcq' && q.options ? (
          <div className="grid gap-2">
            {q.options.map((opt, i) => (
              <label
                key={i}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition',
                  answer === opt ? 'border-ink bg-panel-2' : 'border-line hover:bg-panel-2',
                  result && 'pointer-events-none',
                )}
              >
                <input type="radio" name={`q-${q.id}`} className="mt-0.5 accent-[var(--accent)]" checked={answer === opt} onChange={() => setAnswer(opt)} disabled={!!result} />
                <span>
                  <span className="mr-2 font-mono text-xs text-muted">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <textarea
            className={textareaCls + ' min-h-28'}
            placeholder={q.kind === 'relate' ? `Describe how ${concept?.name ?? 'these'} and ${other ?? 'the other concept'} are related…` : 'Your answer…'}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={!!result}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
            }}
          />
        )}
      </div>

      {error != null && (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      )}

      {result ? (
        <div className={cx('mt-4 rounded-md p-4 text-sm', result.correct ? 'bg-good/10' : 'bg-bad/10')} role="status">
          <div className={cx('mb-1 font-semibold', result.correct ? 'text-good' : 'text-bad')}>{result.correct ? 'Correct' : 'Not quite'}</div>
          <p className="leading-relaxed text-ink-2">{result.feedback}</p>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-end gap-4">
          <span className="text-xs text-muted">{q.kind === 'mcq' ? 'A–D picks · Enter checks' : '⌘/Ctrl+Enter checks'}</span>
          <Button variant="ink" disabled={busy || !answer.trim()} onClick={() => void submit()}>
            {busy ? 'Grading…' : 'Check'}
          </Button>
        </div>
      )}
    </article>
  )
}
