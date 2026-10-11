import type { PretestQuestion } from '@slap/contracts'
import { useState } from 'react'
import { useClass } from '../components/ClassLayout'
import { Async, Button, ButtonLink, Empty, Label, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { fmtDate } from '../lib/format'
import { useApi } from '../lib/useApi'
import { AnswerCard } from './c.$classId.practice'

/** Three questions on what the syllabus says the next lecture covers: a warm-up, not a test. */
export default function PretestPage() {
  const { classId, detail } = useClass()
  const pretest = useApi(() => api.pretest(classId), [classId])
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [busy, setBusy] = useState(false)
  const hasSyllabus = detail.documents.some((d) => d.kind === 'syllabus')

  const regenerate = async () => {
    setBusy(true)
    try {
      pretest.setData(await api.regeneratePretest(classId))
      setScore({ correct: 0, total: 0 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageTitle kicker="Before the next lecture · warm-up, not a test" title="Pretest">
        {score.total > 0 && (
          <div className="rounded-md border border-line bg-panel px-4 py-2 text-right">
            <Label>So far</Label>
            <div className="font-mono text-2xl font-semibold">
              {score.correct}
              <span className="text-muted">/{score.total}</span>
            </div>
          </div>
        )}
      </PageTitle>

      <Async state={pretest} label="Reading the syllabus">
        {(p) =>
          !p.week ? (
            <Empty>
              {hasSyllabus ? (
                'Nothing left on the syllabus to pretest.'
              ) : (
                <>
                  The pretest comes from the syllabus’s weekly topics. Upload the syllabus on the class page.
                  <div className="mt-4">
                    <ButtonLink variant="ink" to={`/c/${classId}`}>
                      Class page
                    </ButtonLink>
                  </div>
                </>
              )}
            </Empty>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border border-line bg-panel p-5">
                <Label>
                  Coming up · week {p.week.week}
                  {p.week.date ? ` · ${fmtDate(p.week.date, { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.week.topics.map((t) => (
                    <span key={t} className="rounded-md border border-line bg-bg px-2.5 py-1 text-sm font-medium">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-ink-2">Answer from what you already know. Wrong answers are fine: they tell you what to listen for in the lecture.</p>
              </div>
              {p.questions.map((q: PretestQuestion, i) => (
                <AnswerCard
                  key={q.id}
                  n={i + 1}
                  q={q}
                  header={
                    <>
                      <span className="label">{q.kind === 'mcq' ? 'Multiple choice' : 'Short answer'}</span>
                      <span className="ml-auto text-xs text-muted">{q.topic}</span>
                    </>
                  }
                  grade={(answer) => api.pretestAttempt(classId, q.id, answer)}
                  onGraded={(a) => setScore((s) => ({ correct: s.correct + (a.correct ? 1 : 0), total: s.total + 1 }))}
                />
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-sm text-muted">{score.total === p.questions.length ? 'Done. Now go to the lecture and listen for these.' : ''}</span>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void regenerate()}>
                    {busy ? 'Writing…' : 'New questions'}
                  </Button>
                  <ButtonLink variant="ink" to={`/c/${classId}/today`}>
                    Today
                  </ButtonLink>
                </div>
              </div>
            </div>
          )
        }
      </Async>
    </div>
  )
}
