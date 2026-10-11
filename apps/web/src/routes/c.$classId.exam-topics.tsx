import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { Async, Bar, ButtonLink, Empty, ExamBadge, Label, MasteryBar, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { pct } from '../lib/format'
import { useApi } from '../lib/useApi'

export function ExamTopicsPage() {
  const { classId } = useClass()
  const topics = useApi(() => api.examTopics(classId), [classId])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const quotes = useMemo(() => new Map((concepts.data ?? []).map((c) => [c.id, c.examQuote])), [concepts.data])

  return (
    <div className="max-w-4xl">
      <PageTitle kicker="What to study first" title="Exam topics">
        <ButtonLink to={`/c/${classId}/exam-sheet`}>One-page sheet</ButtonLink>
      </PageTitle>
      <p className="mb-8 max-w-2xl border-l-2 border-accent pl-3 text-sm text-ink-2">
        Heuristic: concepts ranked by how much the lecturer stressed them (explicit “this will be on the exam”, how often and how long each came up), weighted towards the ones you haven’t mastered. A guide, not a prediction.
      </p>
      <Async state={topics} label="Ranking topics">
        {(list) =>
          list.length === 0 ? (
            <Empty>No concepts yet.</Empty>
          ) : (
            <ol className="divide-y divide-line rounded-md border border-line bg-panel">
              {[...list]
                .sort((a, b) => b.score - a.score)
                .map((t, i) => {
                  const quote = quotes.get(t.conceptId)
                  return (
                    <li key={t.conceptId} className="grid gap-4 p-5 md:grid-cols-[3rem_1fr_220px]">
                      <span className="font-mono text-2xl font-semibold text-muted">{String(i + 1).padStart(2, '0')}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/c/${classId}/concept/${t.conceptId}`} className="text-lg font-bold tracking-tight hover:underline">
                            {t.name}
                          </Link>
                          {t.examFlag && <ExamBadge />}
                        </div>
                        {quote && <p className="mt-2 border-l-2 border-line pl-3 text-sm italic text-ink-2">“{quote}”</p>}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 flex justify-between">
                            <Label>Emphasis</Label>
                            <span className="font-mono text-xs text-muted">{pct(t.emphasis)}</span>
                          </div>
                          <Bar value={t.emphasis} label="emphasis" />
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between">
                            <Label>Mastery</Label>
                            <span className="font-mono text-xs text-muted">{t.mastery == null ? 'new' : pct(t.mastery)}</span>
                          </div>
                          <MasteryBar value={t.mastery} />
                        </div>
                      </div>
                    </li>
                  )
                })}
            </ol>
          )
        }
      </Async>
    </div>
  )
}
