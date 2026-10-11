// Class home "Exams and quizzes" panel: the dates entered by hand. Next to the dates read from an uploaded
// syllabus they set the next exam, and the study plan (Today) works back from them.
import type { AssessmentKind } from '@slap/contracts'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, ErrorBox, inputCls, Panel } from './ui'
import { api } from '../lib/api'
import { useAction } from '../lib/devices'
import { daysUntil, fmtDate } from '../lib/format'
import { useApi } from '../lib/useApi'

const KINDS: Array<{ value: AssessmentKind; label: string }> = [
  { value: 'exam', label: 'Exam' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
]

export function DatesPanel({ classId, onChange }: { classId: string; onChange: () => Promise<void> }) {
  const dates = useApi(() => api.assessments(classId), [classId])
  const [kind, setKind] = useState<AssessmentKind>('exam')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const a = useAction()

  const changed = async () => {
    await dates.reload()
    await onChange()
  }
  const add = (e: FormEvent) => {
    e.preventDefault()
    void a.run(async () => {
      await api.addAssessment(classId, { kind, name: name.trim(), date })
      setName('')
      setDate('')
      await changed()
    })
  }
  const remove = (id: string) =>
    void a.run(async () => {
      await api.removeAssessment(id)
      await changed()
    })

  return (
    <Panel title="Exams and quizzes">
      {dates.error != null && dates.data === undefined ? (
        <ErrorBox error={dates.error} onRetry={() => void dates.reload()} />
      ) : !dates.data || dates.data.length === 0 ? (
        <p className="text-sm text-muted">No dates yet. Add the next quiz or exam and the study plan works back from it.</p>
      ) : (
        <ul className="divide-y divide-line">
          {dates.data.map((d) => {
            const days = daysUntil(d.date)
            return (
              <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-14 shrink-0 font-mono text-xs text-muted">{fmtDate(d.date)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                <span className="label capitalize">{days != null && days >= 0 ? `${d.kind} · ${days}d` : d.kind}</span>
                <button type="button" className="cursor-pointer px-1 text-muted hover:text-ink" disabled={a.busy} onClick={() => remove(d.id)} aria-label={`Remove ${d.name}`}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 space-y-2 border-t border-line pt-4">
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <select className={inputCls + ' cursor-pointer'} value={kind} onChange={(e) => setKind(e.target.value as AssessmentKind)} aria-label="Kind">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder="Name, e.g. Midterm" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} aria-label="Name" />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
          <Button disabled={a.busy || !name.trim() || !date}>{a.busy ? 'Saving…' : 'Add date'}</Button>
        </div>
        {a.error != null && <ErrorBox error={a.error} />}
      </form>
      <p className="mt-3 text-xs text-muted">
        Dates in an uploaded syllabus count too.{' '}
        <Link to={`/c/${classId}/today`} className="underline">
          Open the study plan →
        </Link>
      </p>
    </Panel>
  )
}
