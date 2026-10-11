import type { Card, Concept, Rating } from '@slap/contracts'
import { RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useClass } from '../components/ClassLayout'
import { EASE_OUT } from '../components/motion'
import { Bar, Button, ButtonLink, cx, ErrorBox, inputCls, Label, PageTitle, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'

const RATINGS: Array<{ r: Rating; label: string; hint: string; cls: string }> = [
  { r: 1, label: 'Again', hint: 'forgot', cls: 'border-bad/60 hover:bg-bad/10' },
  { r: 2, label: 'Hard', hint: 'struggled', cls: '' },
  { r: 3, label: 'Good', hint: 'recalled', cls: '' },
  { r: 4, label: 'Easy', hint: 'instant', cls: 'border-good/60 hover:bg-good/10' },
]

// A concept's deck is all of its cards, so it asks for more than the due queue does.
const DUE_BATCH = 20
const CONCEPT_BATCH = 50

/** Flashcards. With no concept chosen it is the due queue (spaced repetition); `?concept=<id>` is that
 *  concept's whole deck, due or not, so a student can drill one concept whenever they like. */
export default function ReviewPage() {
  const { classId } = useClass()
  const [params, setParams] = useSearchParams()
  const conceptId = params.get('concept') ?? undefined
  // Going through a concept's deck again gives the same cards, so the round is what restarts the session.
  const [round, setRound] = useState(0)
  const due = useApi(() => api.due(classId, conceptId ? CONCEPT_BATCH : DUE_BATCH, conceptId), [classId, conceptId])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const names = useMemo(() => new Map((concepts.data ?? []).map((c: Concept) => [c.id, c.name])), [concepts.data])
  const byName = useMemo(() => [...(concepts.data ?? [])].sort((x, y) => x.name.localeCompare(y.name)), [concepts.data])
  const pick = (id: string) => setParams(id ? { concept: id } : {}, { replace: true })
  const reloadDue = due.reload
  const more = useCallback(async () => {
    await reloadDue()
    if (conceptId) setRound((r) => r + 1)
  }, [reloadDue, conceptId])

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle kicker="Flashcards · spaced repetition" title="Review">
        <label className="flex items-center gap-2">
          <span className="label">Deck</span>
          <select className={cx(inputCls, 'w-auto max-w-[15rem] truncate')} value={conceptId ?? ''} onChange={(e) => pick(e.target.value)}>
            <option value="">All due cards</option>
            {byName.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </PageTitle>
      {due.error ? (
        <ErrorBox error={due.error} onRetry={due.reload} />
      ) : !due.data ? (
        <Spinner label="Loading cards" />
      ) : (
        <ReviewSession
          key={`${conceptId ?? ''}:${round}:${due.data.map((c) => c.id).join()}`}
          cards={due.data}
          names={names}
          classId={classId}
          concept={conceptId ? { id: conceptId, name: names.get(conceptId) ?? 'this concept' } : undefined}
          onMore={more}
          onAll={() => pick('')}
        />
      )}
    </div>
  )
}

interface SessionProps {
  cards: Card[]
  names: Map<string, string>
  classId: string
  /** Set when one concept's deck is being reviewed instead of the due queue. */
  concept?: { id: string; name: string }
  onMore: () => Promise<void>
  onAll: () => void
}

function ReviewSession({ cards, names, classId, concept, onMore, onAll }: SessionProps) {
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
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

  if (cards.length === 0 || !card) return <Finished counts={counts} classId={classId} concept={concept} empty={cards.length === 0} onMore={onMore} onAll={onAll} />

  const left = cards.length - i - 1

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Label>
          Card {i + 1} / {cards.length}
        </Label>
        <Label className="truncate">{names.get(card.conceptId) ?? ''}</Label>
      </div>
      <Bar value={i / cards.length} color="var(--accent)" className="mb-6" label="progress" />

      {/* The deck: the card on top turns over in place; the edges under it are the cards still to come. */}
      <div className="relative mb-8">
        {left > 1 && <div aria-hidden="true" className="absolute inset-x-6 top-4 -bottom-4 rounded-lg border border-line bg-panel opacity-50" />}
        {left > 0 && <div aria-hidden="true" className="absolute inset-x-3 top-2 -bottom-2 rounded-lg border border-line bg-panel opacity-80" />}
        <motion.div key={card.id} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={EASE_OUT} className="relative perspective-distant">
          <motion.button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            className="grid w-full cursor-pointer rounded-lg text-left transform-3d"
          >
            <Face side="Front" shown={!flipped} hint="Tap the card or press space to turn it over">
              <p className="text-2xl font-semibold leading-snug tracking-tight">{card.front}</p>
            </Face>
            <Face side="Back" shown={flipped} hint="How well did you know it? Rate it below" className="rotate-y-180">
              <p className="text-sm text-muted">{card.front}</p>
              <p className="mt-4 border-t border-line pt-4 text-lg leading-relaxed">{card.back}</p>
            </Face>
          </motion.button>
        </motion.div>
      </div>

      {error != null && (
        <div className="mb-4">
          <ErrorBox error={error} />
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {RATINGS.map(({ r, label, hint, cls }) => (
          <button
            key={r}
            disabled={!flipped || busy}
            onClick={() => void rate(r)}
            className={`flex h-16 cursor-pointer flex-col items-center justify-center rounded-md border border-line bg-panel transition hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
          >
            <span className="font-semibold">{label}</span>
            <span className="font-mono text-[11px] text-muted">
              {r} · {hint}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Space turns the card · 1–4 rates it</p>
    </div>
  )
}

/** One side of the flashcard. Both sides share one grid cell, so the card is as tall as its longer side
 *  and does not change size as it turns. The side facing away is hidden from screen readers too. */
function Face({ side, shown, hint, className, children }: { side: 'Front' | 'Back'; shown: boolean; hint: string; className?: string; children: ReactNode }) {
  return (
    <div aria-hidden={!shown} className={cx('col-start-1 row-start-1 flex min-h-72 flex-col rounded-lg border border-line bg-panel p-8 backface-hidden md:p-10', className)}>
      <div className="mb-6 flex items-center justify-between">
        <span className={cx('inline-flex h-5 items-center rounded-sm px-1.5 font-mono text-[10px] uppercase tracking-wider', side === 'Back' ? 'bg-accent text-accent-ink' : 'bg-ink text-bg')}>{side}</span>
        <Label>Flashcard</Label>
      </div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
      <p className="mt-8 flex items-center gap-2 text-sm text-muted">
        <RefreshCw className="size-3.5" aria-hidden="true" />
        {hint}
      </p>
    </div>
  )
}

/** End of a batch. For the due queue it looks ahead for more due cards ("Again" cards come straight back) so
 *  continuing is one click; for a concept's deck it offers another pass or the way back to the due queue. */
function Finished({ counts, classId, concept, empty, onMore, onAll }: { counts: Record<Rating, number>; classId: string; concept?: { id: string; name: string }; empty: boolean; onMore: () => Promise<void>; onAll: () => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const more = useApi(() => api.due(classId, DUE_BATCH), [classId, total], { enabled: !concept })
  const n = more.data?.length ?? 0
  const summary = `Again ${counts[1]} · Hard ${counts[2]} · Good ${counts[3]} · Easy ${counts[4]}`
  return (
    <div className="dotgrid rounded-lg border border-line bg-panel p-10 text-center">
      <div className="font-mono text-5xl font-bold">{total}</div>
      {concept ? (
        <>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">{empty ? 'No cards yet' : 'Deck done'}</h2>
          <p className="mt-2 text-ink-2">{empty ? `There are no flashcards for ${concept.name} yet.` : `${concept.name} · ${summary}`}</p>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">{total ? 'Done for now' : 'Nothing due'}</h2>
          <p className="mt-2 text-ink-2">
            {total ? summary : 'No cards are due. Pick a concept above to go through its deck anyway, or practise questions.'}
            {n > 0 && <> · {n} more due now</>}
          </p>
        </>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {concept ? (
          <>
            {!empty && (
              <Button variant="accent" onClick={() => void onMore()}>
                Go through it again
              </Button>
            )}
            <Button onClick={onAll}>All due cards</Button>
          </>
        ) : n > 0 ? (
          <Button variant="accent" onClick={() => void onMore()}>
            Continue · {n} card{n === 1 ? '' : 's'}
          </Button>
        ) : (
          <Button onClick={() => void onMore()} disabled={more.loading}>
            {more.loading ? 'Checking…' : 'Check for more'}
          </Button>
        )}
        <ButtonLink variant="ink" to={`/c/${classId}/practice${concept ? `?concept=${concept.id}` : ''}`}>
          Practice questions
        </ButtonLink>
        <ButtonLink to={`/c/${classId}/today`}>Study plan</ButtonLink>
      </div>
    </div>
  )
}
