// The Today page's study plan: what each exam and quiz covers, then the day-by-day tasks. The model writes it
// (apps/api pipeline/studyPlan.ts) as typed tasks, so every task opens the page that does it.
import type { StudyPlan, StudyPlanExam, StudyPlanTask, StudyTaskKind } from '@slap/contracts'
import { useState } from 'react'
import { Link } from 'react-router'
import { Async, Button, Label, MasteryBar, Panel } from './ui'
import { api } from '../lib/api'
import { fmtDate, masteryColor, pct } from '../lib/format'
import { useApi } from '../lib/useApi'

type Mastery = Map<string, number | null | undefined>

const DATE_LABEL: Record<string, string> = { exam: 'Exam', deadline: 'Due', lecture: 'Lecture', other: 'Note' }
/** Retrieval kinds are filled, reading kinds outlined: most of a day should be filled. */
const KIND: Record<StudyTaskKind, { label: string; retrieval: boolean }> = {
  recall: { label: 'Recall', retrieval: true },
  practice: { label: 'Practice', retrieval: true },
  cards: { label: 'Cards', retrieval: true },
  pretest: { label: 'Pretest', retrieval: true },
  notes: { label: 'Notes', retrieval: false },
  material: { label: 'Reading', retrieval: false },
}
const FIRST_DAYS = 7

/** The page that does a task. */
function taskHref(classId: string, t: StudyPlanTask): string {
  const base = `/c/${classId}`
  const concept = t.concepts.find((c) => c.id)?.id
  switch (t.kind) {
    case 'recall':
      return t.lecture ? `/recall/${t.lecture.id}` : `${base}/practice`
    case 'cards':
      return `${base}/review`
    case 'practice':
      return t.lecture ? `${base}/practice?lecture=${t.lecture.id}` : concept ? `${base}/practice?concept=${concept}` : `${base}/practice`
    case 'notes':
      return t.lecture ? `${base}/lecture/${t.lecture.id}` : base
    case 'pretest':
      return `${base}/pretest`
    case 'material':
      return base // uploads are listed on the course page
  }
}

export function StudyPlanPanel({ classId, masteryOf }: { classId: string; masteryOf: Mastery }) {
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
      <Async state={plan} label="Writing your study plan from the lectures, uploads and exam dates">
        {(p) => <Plan plan={p} classId={classId} masteryOf={masteryOf} />}
      </Async>
    </Panel>
  )
}

function Plan({ plan: p, classId, masteryOf }: { plan: StudyPlan; classId: string; masteryOf: Mastery }) {
  const [all, setAll] = useState(false)
  const otherDates = p.keyDates.filter((k) => k.kind !== 'exam' || !p.exams.some((e) => e.date === k.date))
  const days = all ? p.days : p.days.slice(0, FIRST_DAYS)
  const chip = 'rounded-sm bg-panel-2 px-1.5 py-0.5'
  return (
    <div className="@container space-y-8">
      <div className="max-w-3xl">
        <p className="text-sm text-ink-2">{p.overview}</p>
        <p className="mt-2 text-sm text-ink-2">{p.pace}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[11px] text-muted">
          <span className={chip}>{p.paceData.lecturesHeld} lectures</span>
          {p.paceData.lecturesPerWeek != null && <span className={chip}>{p.paceData.lecturesPerWeek}/week</span>}
          {p.paceData.currentWeek != null && (
            <span className={chip}>
              week {p.paceData.currentWeek}
              {p.paceData.totalWeeks ? ` of ${p.paceData.totalWeeks}` : ''}
            </span>
          )}
          {p.materials.map((m) => (
            <span key={m.id} className={chip}>
              {m.kind}: {m.title}
            </span>
          ))}
          <span className={chip}>{p.horizonDays}-day plan</span>
        </div>
      </div>

      <div>
        <Label>What each exam covers</Label>
        {p.exams.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No exam or quiz dates yet, so this is steady practice. Add a date on the{' '}
            <Link to={`/c/${classId}`} className="underline">
              course page
            </Link>{' '}
            and the plan works back from it.
          </p>
        ) : (
          <div className="mt-2 grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {p.exams.map((e) => (
              <ExamCard key={`${e.date}|${e.name}`} exam={e} classId={classId} />
            ))}
          </div>
        )}
      </div>

      {otherDates.length > 0 && (
        <div>
          <Label>Other dates</Label>
          <ul className="mt-2 divide-y divide-line">
            {otherDates.map((k) => (
              <li key={`${k.date}|${k.name}`} className="grid grid-cols-[4.5rem_1fr] gap-4 py-2.5">
                <div>
                  <div className="font-mono text-xs">{fmtDate(k.date)}</div>
                  <div className="font-mono text-[11px] text-muted">{k.daysLeft === 0 ? 'today' : `in ${k.daysLeft}d`}</div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{k.name}</span>
                    <span className="label capitalize">{DATE_LABEL[k.kind] ?? k.kind}</span>
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
        <ol className="mt-2 space-y-3">
          {days.map((d, i) => (
            <li key={d.date} className={`rounded-md border p-4 ${i === 0 ? 'border-ink' : 'border-line'}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={i === 0 ? 'font-bold' : 'font-medium'}>{i === 0 ? 'Today' : fmtDate(d.date, { weekday: 'long' })}</span>
                <span className="font-mono text-xs text-muted">{fmtDate(d.date)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{d.focus}</span>
                <span className="font-mono text-xs text-muted">{d.minutes} min</span>
              </div>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {d.tasks.map((t, j) => (
                  <TaskRow key={j} task={t} classId={classId} masteryOf={masteryOf} />
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">{d.reason}</p>
            </li>
          ))}
        </ol>
        {p.days.length > FIRST_DAYS && (
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setAll((a) => !a)}>
            {all ? `Show the first ${FIRST_DAYS} days` : `Show all ${p.days.length} days`}
          </Button>
        )}
      </div>
    </div>
  )
}

function ExamCard({ exam: e, classId }: { exam: StudyPlanExam; classId: string }) {
  const shown = e.concepts.slice(0, 8)
  return (
    <div className="rounded-md border border-line bg-bg p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">{e.name}</span>
          <span className="label capitalize">{e.kind}</span>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted">
          {fmtDate(e.date)} · {e.daysLeft === 0 ? 'today' : `in ${e.daysLeft}d`}
        </span>
      </div>
      {e.readiness != null && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between font-mono text-[11px] text-muted">
            <span>Ready</span>
            <span>{pct(e.readiness)}</span>
          </div>
          <MasteryBar value={e.readiness} />
        </div>
      )}
      {e.strategy && <p className="mt-3 text-sm text-ink-2">{e.strategy}</p>}
      {shown.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {shown.map((c) => (
            <ConceptChip key={c.id} classId={classId} id={c.id} name={c.name} mastery={c.mastery} />
          ))}
          {e.concepts.length > shown.length && <span className="px-1 py-0.5 text-xs text-muted">+{e.concepts.length - shown.length} more</span>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">No concept notes match this yet.</p>
      )}
      {e.lectures.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Taught in{' '}
          {e.lectures.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ', '}
              <Link to={`/c/${classId}/lecture/${l.id}`} className="underline">
                {l.title}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function TaskRow({ task: t, classId, masteryOf }: { task: StudyPlanTask; classId: string; masteryOf: Mastery }) {
  const k = KIND[t.kind]
  const detail = [t.lecture?.title, t.material && `${t.material.kind}: ${t.material.title}`, t.exam && `for ${t.exam}`].filter(Boolean).join(' · ')
  return (
    <li className="grid grid-cols-[4.75rem_1fr_auto] items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 inline-flex h-5 items-center justify-center rounded-sm font-mono text-[10px] uppercase tracking-wider ${k.retrieval ? 'bg-ink text-bg' : 'border border-line text-muted'}`}
      >
        {k.label}
      </span>
      <div className="min-w-0">
        <Link to={taskHref(classId, t)} className="font-medium hover:underline">
          {t.title} <span className="text-muted">→</span>
        </Link>
        {detail && <div className="mt-0.5 text-xs text-muted">{detail}</div>}
        {t.concepts.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {t.concepts.map((c) => (
              <ConceptChip key={c.id ?? c.name} classId={classId} id={c.id} name={c.name} mastery={c.id ? masteryOf.get(c.id) : undefined} />
            ))}
          </div>
        )}
      </div>
      <span className="mt-0.5 font-mono text-xs text-muted">{t.minutes} min</span>
    </li>
  )
}

function ConceptChip({ classId, id, name, mastery }: { classId: string; id: string | null; name: string; mastery: number | null | undefined }) {
  if (!id) return <span className="rounded-sm border border-line px-1.5 py-0.5 text-xs">{name}</span>
  return (
    <Link to={`/c/${classId}/concept/${id}`} className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 text-xs hover:border-ink">
      <span className="size-1.5 rounded-full" style={{ background: masteryColor(mastery) }} />
      {name}
    </Link>
  )
}
