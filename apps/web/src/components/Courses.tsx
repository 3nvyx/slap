import type { ClassSummary } from '@slap/contracts'
import { Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link } from 'react-router'
import { api, errorMessage } from '../lib/api'
import { examInfo, fmtDate } from '../lib/format'
import { riseItem, Stagger } from './motion'
import { Button, cx, Empty, ErrorBox, glowCls, inputCls, Label, Panel } from './ui'

const MotionLink = motion.create(Link)

/** The course cards, shared by Home and the Courses page. `wide` is for a full-width row (three across). */
/** `onDeleted`: called after a course's bin button has removed it, so the list is asked for again. */
export function CourseGrid({ courses, wide = false, onDeleted }: { courses: ClassSummary[]; wide?: boolean; onDeleted?: () => Promise<void> | void }) {
  if (courses.length === 0) return <Empty>No courses yet. Create one to start recording lectures.</Empty>
  return (
    <Stagger className={cx('grid content-start gap-4 sm:grid-cols-2', wide && 'lg:grid-cols-3')}>
      {courses.map((c) => {
        const exam = examInfo(c.nextExam)
        return (
          // A card rises a little under the pointer and gives when pressed, like a key.
          <MotionLink
            key={c.id}
            to={`/c/${c.id}`}
            variants={riseItem}
            whileHover={{ y: -3 }}
            whileTap={{ y: 0, scale: 0.985 }}
            className={cx(
              'group flex flex-col rounded-lg border border-line bg-panel p-5 transition-[border-color,box-shadow] duration-200 hover:border-ink/40 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.45)]',
              glowCls,
              'dark:hover:border-white/60',
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3 dark:border-white/20">
              <span className="flex items-center gap-2 font-mono text-sm font-semibold">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                {c.code}
              </span>
              <DeleteCourseButton course={c} onDeleted={onDeleted} />
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

/** `autoFocus`: the name field takes the cursor and the panel scrolls into view (the "New course" button on Home opens it so). */
export function CreateCourseForm({ onDone, autoFocus }: { onDone: (id: string) => void; autoFocus?: boolean }) {
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    nameRef.current?.focus()
    nameRef.current?.scrollIntoView({ block: 'center' })
  }, [autoFocus])
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
    <Panel title="Create a course" className={cx(autoFocus && 'dark:border-accent/70 border-accent/70')}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <input ref={nameRef} className={inputCls} placeholder="Machine Learning" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Course name" />
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

/** The bin on a course card. It asks first: the course goes with its lectures, notes, cards and dates. */
function DeleteCourseButton({ course, onDeleted }: { course: ClassSummary; onDeleted?: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false)
  const remove = async (e: MouseEvent) => {
    // The card around the button is a link to the course; the click must not follow it.
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`Delete "${course.name}"? Its lectures, notes, flashcards and exam dates are deleted too.`)) return
    setBusy(true)
    try {
      await api.deleteClass(course.id)
      await onDeleted?.()
    } catch (err) {
      window.alert(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={(e) => void remove(e)}
      disabled={busy}
      aria-label={`Delete ${course.name}`}
      title="Delete this course"
      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted transition hover:bg-bad/15 hover:text-bad disabled:opacity-50"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </button>
  )
}
