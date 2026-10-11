import { useMemo } from 'react'
import { Link } from 'react-router'
import { AnnouncementList } from '../components/Announcements'
import { useClass } from '../components/ClassLayout'
import { Async, ButtonLink, ExamBadge, Label, MasteryBar, PageTitle, Panel } from '../components/ui'
import { api } from '../lib/api'
import { examInfo, fmtDate, pct } from '../lib/format'
import { useApi } from '../lib/useApi'
import { StudyPlanPanel } from '../components/StudyPlan'

export default function TodayPage() {
  const { classId } = useClass()
  const today = useApi(() => api.today(classId), [classId])
  const concepts = useApi(() => api.concepts(classId), [classId])
  const announcements = useApi(() => api.announcements(classId), [classId])
  const masteryOf = useMemo(() => new Map((concepts.data ?? []).map((c) => [c.id, c.mastery])), [concepts.data])

  return (
    <Async state={today} label="Planning your day">
      {(t) => {
        const exam = examInfo(t.nextExam)
        return (
          <div className="max-w-6xl">
            <PageTitle kicker={fmtDate(t.date, { weekday: 'long', month: 'long', day: 'numeric' })} title="Today" />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col justify-between rounded-md bg-ink p-6 text-bg">
                <div className="label !text-bg/60">Cards due</div>
                <div className="mt-4 font-mono text-6xl font-bold">{t.cardsDue.length}</div>
                <Link to={`/c/${classId}/review`} className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-accent font-semibold text-accent-ink">
                  {t.cardsDue.length ? 'Start review' : 'Nothing due'}
                </Link>
              </div>
              <div className="rounded-md border border-line bg-panel p-6">
                <Label>Next exam</Label>
                {exam ? (
                  <>
                    <div className="mt-4 text-2xl font-bold tracking-tight">{exam.name}</div>
                    <div className="mt-1 font-mono text-sm text-muted">{fmtDate(exam.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    {exam.days != null && (
                      <div className="mt-4 font-mono text-4xl font-semibold">
                        {exam.days}
                        <span className="ml-1 text-base text-muted">days</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm text-muted">No exam dates yet. Upload the syllabus to anchor the plan.</p>
                )}
              </div>
              <div className="rounded-md border border-line bg-panel p-6">
                <Label>Suggested practice</Label>
                <div className="mt-4 font-mono text-4xl font-semibold">{t.practice.length}</div>
                <p className="mt-1 text-sm text-muted">questions, mixed across lectures</p>
                <ButtonLink variant="ink" className="mt-5 w-full" to={`/c/${classId}/practice`}>
                  Practice now
                </ButtonLink>
              </div>
              <div className="flex flex-col rounded-md border border-line bg-panel p-6">
                <Label>Before the next lecture</Label>
                <p className="mt-4 text-sm text-ink-2">Three questions on what the syllabus says is coming, so you know what to listen for.</p>
                <ButtonLink className="mt-auto w-full pt-0" to={`/c/${classId}/pretest`}>
                  Pretest
                </ButtonLink>
              </div>
            </div>

            <StudyPlanPanel classId={classId} masteryOf={masteryOf} />

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
              {announcements.data && announcements.data.some((a) => a.when) && (
                <Panel title="Coming up">
                  <AnnouncementList items={announcements.data} classId={classId} upcomingOnly limit={5} />
                </Panel>
              )}
              <Panel title="Weak spots">
                {t.weakConcepts.length === 0 ? (
                  <p className="text-sm text-muted">No weak spots yet. Practise to find them.</p>
                ) : (
                  <ul className="space-y-4">
                    {t.weakConcepts.map((c) => (
                      <li key={c.id}>
                        <div className="mb-1.5 flex items-center gap-2">
                          <Link to={`/c/${classId}/concept/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          {c.examFlag && <ExamBadge />}
                          <span className="ml-auto font-mono text-xs text-muted">{pct(c.mastery)}</span>
                        </div>
                        <MasteryBar value={c.mastery} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Practice set">
                {t.practice.length === 0 ? (
                  <p className="text-sm text-muted">No questions yet.</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {t.practice.map((q, i) => (
                      <li key={q.id} className="flex gap-3">
                        <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1">{q.prompt}</span>
                        <span className="label shrink-0">{q.kind === 'mcq' ? 'Multiple choice' : q.kind === 'short' ? 'Short answer' : 'Relate'}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>
          </div>
        )
      }}
    </Async>
  )
}
