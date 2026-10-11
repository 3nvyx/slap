import type { ClassSummary } from '@slap/contracts'
import { ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { examInfo, fmtDate } from '../lib/format'
import { riseItem, Stagger } from './motion'
import { Button, cx, Empty, ErrorBox, inputCls, Label, Panel } from './ui'

const MotionLink = motion.create(Link)

/** The course cards, shared by Home and the Courses page. `wide` is for a full-width row (three across). */
export function CourseGrid({ courses, wide = false }: { courses: ClassSummary[]; wide?: boolean }) {
  if (courses.length === 0) return <Empty>No courses yet. Create one to start recording lectures.</Empty>
  return (
    <Stagger className={cx('grid content-start gap-4 sm:grid-cols-2', wide && 'lg:grid-cols-3')}>
      {courses.map((c, i) => {
        const exam = examInfo(c.nextExam)
        return (
          // A card rises a little under the pointer and gives when pressed, like a key.
          <MotionLink
            key={c.id}
            to={`/c/${c.id}`}
            variants={riseItem}
            whileHover={{ y: -3 }}
            whileTap={{ y: 0, scale: 0.985 }}
            className="group flex flex-col rounded-lg border border-line bg-panel p-5 transition-[border-color,box-shadow] duration-200 hover:border-ink/40 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-mono text-sm font-semibold">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                {c.code}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
                {String(i + 1).padStart(2, '0')}
                <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:text-ink group-hover:opacity-100" aria-hidden="true" />
              </span>
            </div>
            <h3 className="mt-6 flex-1 text-xl font-bold leading-tight tracking-[-0.025em]">{c.name}</h3>
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
          </MotionLink>
        )
      })}
    </Stagger>
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
