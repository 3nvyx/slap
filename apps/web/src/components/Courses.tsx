import type { ClassSummary } from '@slap/contracts'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { examInfo, fmtDate } from '../lib/format'
import { Button, cx, Empty, ErrorBox, inputCls, Label, Panel } from './ui'

/** The course cards, shared by Home and the Courses page. `wide` is for a full-width row (three across). */
export function CourseGrid({ courses, wide = false }: { courses: ClassSummary[]; wide?: boolean }) {
  if (courses.length === 0) return <Empty>No courses yet. Create one to start recording lectures.</Empty>
  return (
    <div className={cx('grid content-start gap-4 sm:grid-cols-2', wide && 'lg:grid-cols-3')}>
      {courses.map((c) => {
        const exam = examInfo(c.nextExam)
        return (
          <Link key={c.id} to={`/c/${c.id}`} className="group flex flex-col rounded-md border border-line bg-panel p-5 transition hover:border-ink">
            <span className="font-mono text-sm font-semibold">{c.code}</span>
            <h3 className="mt-6 flex-1 text-xl font-bold leading-tight tracking-tight">{c.name}</h3>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <Label>Lectures</Label>
                <div className="font-mono text-lg">{c.lectureCount}</div>
              </div>
              <div>
                <Label>Next exam</Label>
                <div className="font-mono text-lg">{exam ? fmtDate(exam.date) : '—'}</div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

export function CreateCourseForm({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onDone((await api.createClass(name.trim(), code.trim().toUpperCase())).id)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Create a course">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <input className={inputCls} placeholder="Machine Learning" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Course name" />
        <input className={inputCls + ' font-mono uppercase'} placeholder="Short code, e.g. CS229" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={12} aria-label="Course code" />
        <p className="text-xs text-muted">The code goes in the join link and on the device sticker. Keep it short.</p>
        {error != null && <ErrorBox error={error} />}
        <Button className="w-full" disabled={busy || !name.trim() || !code.trim()}>
          {busy ? 'Creating…' : 'Create course'}
        </Button>
      </form>
    </Panel>
  )
}
