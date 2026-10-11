import type { Card } from '@slap/contracts'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { Async, Bar, ButtonLink, Empty, ExamBadge, Label, MasteryBar } from '../components/ui'
import { api } from '../lib/api'
import { fmtTime, masteryColor, pct } from '../lib/format'
import { useApi } from '../lib/useApi'

export function ConceptPage() {
  const { conceptId = '' } = useParams()
  const { classId } = useClass()
  const detail = useApi(() => api.concept(conceptId), [conceptId])

  return (
    <Async state={detail} label="Loading note">
      {({ concept, related, mentions, cards, questionCount }) => (
        <div className="max-w-5xl">
          <div className="mb-6 text-sm">
            <Link to={`/c/${classId}/graph`} className="text-muted hover:text-ink">
              ← Graph
            </Link>
          </div>
          <header className="mb-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="label">Concept · from {concept.source === 'both' ? 'lecture + book' : concept.source}</span>
              {concept.examFlag && <ExamBadge />}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="flex items-center gap-3 text-4xl font-bold tracking-tight">
                <span className="size-4 shrink-0 rounded-full" style={{ background: masteryColor(concept.mastery) }} />
                {concept.name}
              </h1>
              <ButtonLink variant="accent" to={`/c/${classId}/practice?concept=${concept.id}`}>
                Practice this{questionCount ? ` · ${questionCount}` : ''}
              </ButtonLink>
            </div>
          </header>

          <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
            <div className="space-y-8">
              <section>
                <Label className="mb-2">Definition</Label>
                <p className="text-lg leading-relaxed">{concept.definition}</p>
              </section>

              {concept.examQuote && (
                <section className="rounded-md border-l-4 border-accent bg-panel p-5">
                  <Label className="mb-2">The lecturer said</Label>
                  <blockquote className="text-lg italic leading-relaxed">“{concept.examQuote}”</blockquote>
                </section>
              )}

              <section>
                <Label className="mb-3">Where it came up · {mentions.length}</Label>
                {mentions.length === 0 ? (
                  <p className="text-sm text-muted">Only in the book so far.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-md border border-line bg-panel">
                    {mentions.map((m, i) => (
                      <li key={i}>
                        <Link to={`/c/${classId}/lecture/${m.lectureId}#seg-${m.segmentId}`} className="block px-4 py-3 hover:bg-panel-2">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-accent">{fmtTime(m.start)}</span>
                            <span className="truncate font-medium">{m.lectureTitle}</span>
                          </div>
                          <p className="mt-1 text-sm text-ink-2">…{m.excerpt}…</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <Label className="mb-3">Cards · {cards.length}</Label>
                {cards.length === 0 ? <Empty>No cards for this concept yet.</Empty> : <div className="grid gap-3 sm:grid-cols-2">{cards.map((c) => <FlipCard key={c.id} card={c} />)}</div>}
              </section>
            </div>

            <aside className="space-y-6">
              <div className="rounded-md border border-line bg-panel p-5">
                <Label className="mb-1">Emphasis</Label>
                <Bar value={concept.emphasis} label="emphasis" />
                <div className="mb-4 mt-1 font-mono text-xs text-muted">{pct(concept.emphasis)}</div>
                <Label className="mb-1">Your mastery</Label>
                <MasteryBar value={concept.mastery} />
                <div className="mt-1 font-mono text-xs text-muted">{concept.mastery == null ? 'not practised yet' : pct(concept.mastery)}</div>
                <div className="mt-4 text-xs text-muted">{concept.mentionCount} mentions</div>
              </div>
              <div>
                <Label className="mb-3">Related</Label>
                {related.length === 0 ? (
                  <p className="text-sm text-muted">No links yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {related.map((r) => (
                      <Link key={r.id} to={`/c/${classId}/concept/${r.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-sm hover:border-ink">
                        <span className="size-2 rounded-full" style={{ background: masteryColor(r.mastery) }} />
                        {r.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
    </Async>
  )
}

function FlipCard({ card }: { card: Card }) {
  const [open, setOpen] = useState(false)
  return (
    <button onClick={() => setOpen((o) => !o)} className="min-h-28 cursor-pointer rounded-md border border-line bg-panel p-4 text-left hover:border-ink">
      <Label className="mb-2">{open ? 'Back' : 'Front'}</Label>
      <p className={open ? 'text-sm text-ink-2' : 'font-medium'}>{open ? card.back : card.front}</p>
    </button>
  )
}
