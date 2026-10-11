import { Check, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useClass } from '../components/ClassLayout'
import { Async, Bar, Button, ButtonLink, cx, Empty, ExamBadge, inputCls, Label, MasteryBar, PageTitle, Panel } from '../components/ui'
import { api } from '../lib/api'
import { pct } from '../lib/format'
import { addMyTopic, removeMyTopic, useMyTopics } from '../lib/myTopics'
import { useApi } from '../lib/useApi'

export default function ExamTopicsPage() {
  const { classId } = useClass()
  const topics = useApi(() => api.examTopics(classId), [classId])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const quotes = useMemo(() => new Map((concepts.data ?? []).map((c) => [c.id, c.examQuote])), [concepts.data])
  const mine = useMyTopics(classId)
  const [adding, setAdding] = useState(false)

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle kicker="What to study first" title="Exam topics">
        <div className="flex items-center gap-2">
          <ButtonLink to={`/c/${classId}/exam-sheet`}>One-page sheet</ButtonLink>
          <Button variant={adding ? 'ghost' : 'outline'} aria-expanded={adding} aria-label={adding ? 'Close the new topic form' : 'Add a topic'} onClick={() => setAdding(!adding)}>
            <Plus className={cx('transition', adding && 'rotate-45')} />
            {adding ? 'Close' : 'Add'}
          </Button>
        </div>
      </PageTitle>
      <p className="mb-8 max-w-2xl border-l-2 border-accent pl-3 text-sm text-ink-2">
        Heuristic: concepts ranked by how much the lecturer stressed them (explicit “this will be on the exam”, how often and how long each came up), weighted towards the ones you haven’t mastered. A guide, not a prediction.
      </p>
      {adding && <AddTopicForm classId={classId} onDone={() => setAdding(false)} />}
      {mine.length > 0 && (
        <Panel title="Your topics" className="mb-6">
          <ul className="divide-y divide-line">
            {mine.map((t) => (
              <li key={t.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <button
                  type="button"
                  onClick={() => removeMyTopic(classId, t.id)}
                  aria-label={`Mark "${t.name}" as done`}
                  title="Done"
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-transparent transition hover:border-good hover:bg-good hover:text-white"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
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

/** One line to name the topic; it is kept in this browser for this course. */
function AddTopicForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    addMyTopic(classId, name)
    setName('')
    onDone()
  }
  return (
    <form onSubmit={submit} className="mb-6 flex gap-2 rounded-md border border-line bg-bg/60 p-3">
      <input className={inputCls + ' min-w-0 flex-1'} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Topic to make sure you study, e.g. Bayes’ rule" aria-label="New topic" maxLength={80} />
      <Button type="submit" variant="ink" disabled={!name.trim()}>
        Add
      </Button>
    </form>
  )
}
