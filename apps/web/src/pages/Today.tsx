import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnnouncementList } from '../components/Announcements'
import { useClass } from '../components/ClassLayout'
import { Async, Button, ButtonLink, ExamBadge, Label, MasteryBar, PageTitle, Panel } from '../components/ui'
import { api } from '../lib/api'
import { examInfo, fmtDate, masteryColor, pct } from '../lib/format'
import { useApi } from '../lib/useApi'

export function TodayPage() {
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

            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
              <div className="space-y-6">
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
                          <span className="label shrink-0">{q.kind}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              </div>

              <StudyPlanPanel classId={classId} masteryOf={masteryOf} />
            </div>
          </div>
        )
      }}
    </Async>
  )
}

const KIND_LABEL: Record<string, string> = { exam: 'Exam', deadline: 'Due', lecture: 'Lecture', other: 'Note' }

/** The model-written plan: overview, class pace, key dates and the day-by-day list (regenerated on demand). */
function StudyPlanPanel({ classId, masteryOf }: { classId: string; masteryOf: Map<string, number | null | undefined> }) {
  const plan = useApi(() => api.studyPlan(classId), [classId])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const regenerate = async () => {
    setBusy(true)
    setFailed(null)
    try {
      plan.setData(await api.regenerateStudyPlan(classId))
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'could not regenerate the plan')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel
      title="Study plan"
      action={
        <Button size="sm" onClick={regenerate} disabled={busy || plan.loading}>
          {busy ? 'Writing…' : 'Regenerate'}
        </Button>
      }
    >
      {failed && <p className="mb-3 text-sm text-red-700">{failed}</p>}
      <Async state={plan} label="Writing your study plan from the syllabus, notes and class pace">
        {(p) => (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-ink-2">{p.overview}</p>
              <p className="mt-2 text-sm text-ink-2">{p.pace}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px] text-muted">
                <span className="rounded-sm bg-panel-2 px-1.5 py-0.5">{p.paceData.lecturesHeld} lectures</span>
                {p.paceData.lecturesPerWeek != null && <span className="rounded-sm bg-panel-2 px-1.5 py-0.5">{p.paceData.lecturesPerWeek}/week</span>}
                {p.paceData.currentWeek != null && (
                  <span className="rounded-sm bg-panel-2 px-1.5 py-0.5">
                    week {p.paceData.currentWeek}
                    {p.paceData.totalWeeks ? ` of ${p.paceData.totalWeeks}` : ''}
                  </span>
                )}
                <span className="rounded-sm bg-panel-2 px-1.5 py-0.5">{p.horizonDays}-day plan</span>
              </div>
            </div>

            {p.keyDates.length > 0 && (
              <div>
                <Label>Key dates</Label>
                <ul className="mt-2 divide-y divide-line">
                  {p.keyDates.map((k) => (
                    <li key={`${k.date}|${k.name}`} className="grid grid-cols-[4.5rem_1fr] gap-4 py-2.5">
                      <div>
                        <div className="font-mono text-xs">{fmtDate(k.date)}</div>
                        <div className="font-mono text-[11px] text-muted">{k.daysLeft === 0 ? 'today' : `in ${k.daysLeft}d`}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{k.name}</span>
                          <span className="label">{KIND_LABEL[k.kind] ?? k.kind}</span>
                        </div>
                        {k.note && <p className="mt-0.5 text-sm text-ink-2">{k.note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <Label>Day by day</Label>
              <ol className="mt-2 divide-y divide-line">
                {p.days.map((d, i) => (
                  <li key={d.date} className="grid grid-cols-[4.5rem_1fr] gap-4 py-4">
                    <div>
                      <div className={i === 0 ? 'font-bold' : 'font-medium'}>{i === 0 ? 'Today' : fmtDate(d.date, { weekday: 'short' })}</div>
                      <div className="font-mono text-xs text-muted">{fmtDate(d.date)}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted">{d.minutes} min</div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{d.focus}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded-sm bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">{d.cardsDue} cards</span>
                        {d.concepts.map((c) =>
                          c.id ? (
                            <Link key={c.id} to={`/c/${classId}/concept/${c.id}`} className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 text-xs hover:border-ink">
                              <span className="size-1.5 rounded-full" style={{ background: masteryColor(masteryOf.get(c.id)) }} />
                              {c.name}
                            </Link>
                          ) : (
                            <span key={c.name} className="rounded-sm border border-line px-1.5 py-0.5 text-xs">
                              {c.name}
                            </span>
                          ),
                        )}
                      </div>
                      {d.tasks.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-sm">
                          {d.tasks.map((t, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="text-muted">·</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-sm text-muted">{d.reason}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Async>
    </Panel>
  )
}
