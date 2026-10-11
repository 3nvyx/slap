import type { Card, Concept, Rating } from '@slap/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useClass } from '../components/ClassLayout'
import { Bar, Button, ButtonLink, ErrorBox, Label, PageTitle, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'

const RATINGS: Array<{ r: Rating; label: string; hint: string; cls: string }> = [
  { r: 1, label: 'Again', hint: 'forgot', cls: 'border-bad/60 hover:bg-bad/10' },
  { r: 2, label: 'Hard', hint: 'struggled', cls: '' },
  { r: 3, label: 'Good', hint: 'recalled', cls: '' },
  { r: 4, label: 'Easy', hint: 'instant', cls: 'border-good/60 hover:bg-good/10' },
]

export function ReviewPage() {
  const { classId } = useClass()
  const due = useApi(() => api.due(classId, 20), [classId])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const names = useMemo(() => new Map((concepts.data ?? []).map((c: Concept) => [c.id, c.name])), [concepts.data])

  return (
    <div className="max-w-3xl">
      <PageTitle kicker="Spaced repetition · FSRS" title="Review" />
      {due.error ? (
        <ErrorBox error={due.error} onRetry={due.reload} />
      ) : !due.data ? (
        <Spinner label="Loading due cards" />
      ) : (
        <ReviewSession key={due.data.map((c) => c.id).join()} cards={due.data} names={names} classId={classId} onMore={due.reload} />
      )}
    </div>
  )
}

function ReviewSession({ cards, names, classId, onMore }: { cards: Card[]; names: Map<string, string>; classId: string; onMore: () => Promise<void> }) {
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [counts, setCounts] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })
  const card = cards[i]

  const rate = useCallback(
    async (r: Rating) => {
      if (!card || busy) return
      setBusy(true)
      setError(null)
      try {
        await api.review(card.id, r)
        setCounts((c) => ({ ...c, [r]: c[r] + 1 }))
        setFlipped(false)
        setI((x) => x + 1)
      } catch (e) {
        setError(e)
      } finally {
        setBusy(false)
      }
    },
    [card, busy],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        void rate(Number(e.key) as Rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, rate])

  if (cards.length === 0 || !card) return <Finished counts={counts} classId={classId} onMore={onMore} />


  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Label>
          Card {i + 1} / {cards.length}
        </Label>
        <Label>{names.get(card.conceptId) ?? ''}</Label>
      </div>
      <Bar value={i / cards.length} color="var(--accent)" className="mb-6" label="progress" />

      <button
        onClick={() => setFlipped((f) => !f)}
        className="block min-h-72 w-full cursor-pointer rounded-md border border-line bg-panel p-8 text-left transition hover:border-ink md:p-10"
        aria-label={flipped ? 'Show front' : 'Show answer'}
      >
        <Label className="mb-4">{flipped ? 'Answer' : 'Question'}</Label>
        <p className="text-2xl font-semibold leading-snug tracking-tight">{card.front}</p>
        {flipped ? (
          <p className="mt-6 border-t border-line pt-6 text-lg leading-relaxed text-ink-2">{card.back}</p>
        ) : (
          <p className="mt-10 text-sm text-muted">Tap or press space to flip</p>
        )}
      </button>

      {error != null && (
        <div className="mt-4">
          <ErrorBox error={error} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 gap-2">
        {RATINGS.map(({ r, label, hint, cls }) => (
          <button
            key={r}
            disabled={!flipped || busy}
            onClick={() => void rate(r)}
            className={`flex h-16 cursor-pointer flex-col items-center justify-center rounded-md border border-line bg-panel transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
          >
            <span className="font-semibold">{label}</span>
            <span className="font-mono text-[10px] text-muted">
              {r} · {hint}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Space flips · 1–4 rates</p>
    </div>
  )
}

/** End of a batch: looks ahead for more due cards ("Again" cards come straight back) so continuing is one click. */
function Finished({ counts, classId, onMore }: { counts: Record<Rating, number>; classId: string; onMore: () => Promise<void> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const more = useApi(() => api.due(classId, 20), [classId, total])
  const n = more.data?.length ?? 0
  return (
    <div className="dotgrid rounded-md border border-line bg-panel p-10 text-center">
      <div className="font-mono text-5xl font-bold">{total}</div>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">{total ? 'Done for now' : 'Nothing due'}</h2>
      <p className="mt-2 text-ink-2">
        {total ? `Again ${counts[1]} · Hard ${counts[2]} · Good ${counts[3]} · Easy ${counts[4]}` : 'No cards are due. Come back later, or practise questions.'}
        {n > 0 && <> · {n} more due now</>}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {n > 0 ? (
          <Button variant="accent" onClick={() => void onMore()}>
            Continue · {n} card{n === 1 ? '' : 's'}
          </Button>
        ) : (
          <Button onClick={() => void onMore()} disabled={more.loading}>
            {more.loading ? 'Checking…' : 'Check for more'}
          </Button>
        )}
        <ButtonLink variant="ink" to={`/c/${classId}/practice`}>
          Practice questions
        </ButtonLink>
        <ButtonLink to={`/c/${classId}/today`}>Today</ButtonLink>
      </div>
    </div>
  )
}
