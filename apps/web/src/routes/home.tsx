import type { AssessmentKind, ClassSummary } from '@slap/contracts'
import { Check, Plus } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { CourseGrid } from '../components/Courses'
import { NewRecordingsCard, OnlineDevicesCard } from '../components/Devices'
import { TopBar } from '../components/Shell'
import { Async, Button, ButtonLink, cx, ErrorBox, inputCls, Label, PageTitle, Panel, Pill } from '../components/ui'
import { api } from '../lib/api'
import { deviceLabel, useAction, useInbox, useOnlineDevices } from '../lib/devices'
import { examInfo, fmtDate } from '../lib/format'
import { addTodo, removeTodo, useUserTodos, type UserTodo } from '../lib/todos'
import type { DeviceSummary, Today } from '../lib/types'
import { useApi } from '../lib/useApi'

// How many courses the dashboard asks about (one request each). Courses without a lecture have nothing to
// study yet and are skipped; the ones with the most lectures come first.
const MAX_COURSES = 8
// Rows a dashboard list shows before the rest go behind its "more" button, so the cards keep their height.
const VISIBLE_ROWS = 2
// An exam this close puts "go through the exam topics" on the to-do list.
const EXAM_SOON_DAYS = 7
// The recording Home last opened the captions for on its own (per browser tab).
const AUTO_OPEN_KEY = 'slap.autoOpenedLive'

/** What one course contributes to the dashboard. One that failed to load is left out, not shown as an error. */
interface CourseStudy {
  course: ClassSummary
  today: Today | null
}

async function loadStudy(courses: ClassSummary[]): Promise<CourseStudy[]> {
  const active = courses.filter((c) => c.lectureCount > 0).sort((a, b) => b.lectureCount - a.lectureCount).slice(0, MAX_COURSES)
  return Promise.all(
    active.map(async (course) => ({ course, today: await api.today(course.id).catch(() => null) })),
  )
}

interface Todo {
  key: string
  course: ClassSummary
  title: string
  detail: string
  to: string
}

function todosOf(study: CourseStudy[]): Todo[] {
  const out: Todo[] = []
  for (const { course, today } of study) {
    if (!today) continue
    const base = `/c/${course.id}`
    const due = today.cardsDue.length
    if (due) out.push({ key: `${course.id}:cards`, course, title: `Review ${due} card${due === 1 ? '' : 's'}`, detail: 'Flashcards due today', to: `${base}/review` })
    if (today.practice.length) {
      const weak = today.weakConcepts.slice(0, 2).map((c) => c.name)
      out.push({
        key: `${course.id}:practice`,
        course,
        title: `Practise ${today.practice.length} question${today.practice.length === 1 ? '' : 's'}`,
        detail: weak.length ? `Weak spots: ${weak.join(', ')}` : 'Mixed across lectures',
        to: `${base}/practice`,
      })
    }
    const exam = examInfo(today.nextExam)
    if (exam && exam.days != null && exam.days >= 0 && exam.days <= EXAM_SOON_DAYS) {
      out.push({ key: `${course.id}:exam`, course, title: 'Go through the exam topics', detail: `${exam.name} ${inDays(exam.days)}`, to: `${base}/exam-topics` })
    }
  }
  return out
}

const inDays = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)

/** The next exam of every course that has one, soonest first. The study data knows its name; the course list only its date. */
function examsOf(courses: ClassSummary[], study: CourseStudy[]) {
  const named = new Map(study.map((s) => [s.course.id, s.today?.nextExam]))
  return courses
    .map((course) => ({ course, exam: examInfo(named.get(course.id) ?? course.nextExam) }))
    .flatMap(({ course, exam }) => (exam && exam.days != null && exam.days >= 0 ? [{ course, name: exam.name, date: exam.date, days: exam.days }] : []))
    .sort((a, b) => a.days - b.days)
}

/** What to do today and the coming exams across every course, the device (and what it is recording), then the courses. */
export default function HomePage() {
  const courses = useApi(() => api.classes(), [])
  const list = courses.data
  const devices = useOnlineDevices()
  // A class is only known to be on when a device is recording it; nothing else says a session is running.
  const recording = (devices.data ?? []).filter((d) => d.state === 'recording' && d.lectureId)
  const inbox = useInbox()
  // What is being captioned right now: a device recording into a course, else a recording still in the inbox.
  const liveId = recording[0]?.lectureId ?? (inbox.data ?? []).find((r) => r.status === 'live')?.id ?? null
  // When a recording starts, the page goes to its captions by itself: once per recording, so coming back to
  // Home while it runs does not bounce you out again.
  const navigate = useNavigate()
  useEffect(() => {
    if (!liveId) return
    try {
      if (sessionStorage.getItem(AUTO_OPEN_KEY) === liveId) return
      sessionStorage.setItem(AUTO_OPEN_KEY, liveId)
    } catch {
      /* storage blocked: still open it */
    }
    void navigate(`/live/${liveId}`)
  }, [liveId, navigate])
  // The study data is asked for again only when the set of courses changes, not on every reload of the list.
  const study = useApi(() => loadStudy(list ?? []), [list?.map((c) => `${c.id}:${c.lectureCount}`).join(',')], { enabled: list !== undefined })

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <PageTitle title="Home" />
        <Async state={courses} label="Loading your courses">
          {(all) => (
            <>
              {/* Two cards a row, stretched to the same height: to-dos beside the devices, exams beside the new recordings. */}
              <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_340px]">
                {recording.length > 0 && (
                  <Panel title="Recording Now" className="lg:col-span-2">
                    <ul className="divide-y divide-line">
                      {recording.map((d) => (
                        <RecordingRow key={d.id} device={d} />
                      ))}
                    </ul>
                  </Panel>
                )}
                <TodoPanel courses={all} study={study.data} />
                <OnlineDevicesCard devices={devices} classes={all} liveId={liveId} onClassesChanged={courses.reload} />
                <ExamsPanel
                  courses={all}
                  study={study.data}
                  onChange={async () => {
                    await Promise.all([courses.reload(), study.reload()])
                  }}
                />
                <NewRecordingsCard inbox={inbox} classes={all} onChange={courses.reload} />
              </div>

              <section className="mt-16">
                <div className="mb-4 flex items-center gap-4">
                  <h2 className="text-2xl font-bold tracking-tight">Courses</h2>
                  <ButtonLink to="/courses">All courses</ButtonLink>
                  <ButtonLink to="/courses#new">
                    <Plus /> New course
                  </ButtonLink>
                </div>
                <CourseGrid courses={all} wide onDeleted={courses.reload} />
              </section>
            </>
          )}
        </Async>
      </main>
    </div>
  )
}

/** The to-do card: the student's own to-dos (added with the plus button) above the ones worked out from the study data. */
function TodoPanel({ courses, study }: { courses: ClassSummary[]; study: CourseStudy[] | undefined }) {
  const mine = useUserTodos()
  const [adding, setAdding] = useState(false)
  const rows = [...mine.map((t) => <UserTodoRow key={t.id} todo={t} courses={courses} />), ...(study ? todosOf(study).map((t) => <TodoRow key={t.key} todo={t} />) : [])]
  const empty = courses.some((c) => c.lectureCount > 0) ? 'Nothing due. You are caught up.' : 'Nothing to study yet. Add your own with the plus, or record a lecture.'
  return (
    <Panel
      title="To Do"
      action={
        <Button size="sm" variant={adding ? 'ghost' : 'outline'} aria-expanded={adding} aria-label={adding ? 'Close the new to-do form' : 'Add a to-do'} onClick={() => setAdding(!adding)}>
          <Plus className={cx('transition', adding && 'rotate-45')} />
          {adding ? 'Close' : 'Add'}
        </Button>
      }
    >
      {adding && <AddTodoForm courses={courses} onDone={() => setAdding(false)} />}
      {rows.length > 0 ? <Rows rows={rows} /> : study === undefined ? <p className="text-sm text-muted">Loading…</p> : <p className="text-sm text-muted">{empty}</p>}
    </Panel>
  )
}

/** One line to write the to-do, a course to file it under (optional), and the button that keeps it. */
function AddTodoForm({ courses, onDone }: { courses: ClassSummary[]; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    addTodo(title, classId || null)
    setTitle('')
    onDone()
  }
  return (
    <form onSubmit={submit} className="mb-4 flex flex-col gap-2 rounded-md border border-line bg-bg/60 p-3 sm:flex-row">
      <input className={inputCls + ' min-w-0 flex-1'} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need to do?" aria-label="New to-do" maxLength={200} />
      <select className={inputCls + ' cursor-pointer sm:w-40'} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Course for the new to-do">
        <option value="">No course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}
          </option>
        ))}
      </select>
      <Button type="submit" variant="ink" disabled={!title.trim()}>
        Add
      </Button>
    </form>
  )
}

/** A to-do the student wrote: the tick removes it. */
function UserTodoRow({ todo, courses }: { todo: UserTodo; courses: ClassSummary[] }) {
  const course = courses.find((c) => c.id === todo.classId)
  return (
    <li className={itemCls}>
      <div className={rowCls}>
        <span className={codeCls}>{course?.code ?? '—'}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{todo.title}</span>
          <span className="block truncate text-sm text-muted">{course ? course.name : 'Your own to-do'}</span>
        </span>
        <button
          type="button"
          onClick={() => removeTodo(todo.id)}
          aria-label={`Mark "${todo.title}" as done`}
          title="Done"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line text-transparent transition hover:border-good hover:bg-good hover:text-white"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
      </div>
    </li>
  )
}

const KINDS: Array<{ value: AssessmentKind; label: string }> = [
  { value: 'exam', label: 'Exam' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
]

/** The exams card: the next exam of every course, and a plus button that adds a date to a course from here. */
function ExamsPanel({ courses, study, onChange }: { courses: ClassSummary[]; study: CourseStudy[] | undefined; onChange: () => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  return (
    <Panel
      title="Upcoming Exams"
      action={
        courses.length > 0 && (
          <Button size="sm" variant={adding ? 'ghost' : 'outline'} aria-expanded={adding} aria-label={adding ? 'Close the new exam form' : 'Add an exam date'} onClick={() => setAdding(!adding)}>
            <Plus className={cx('transition', adding && 'rotate-45')} />
            {adding ? 'Close' : 'Add'}
          </Button>
        )
      }
    >
      {adding && <AddExamForm courses={courses} onDone={async () => { setAdding(false); await onChange() }} />}
      <Loaded data={study} empty={courses.length ? 'No exam dates yet. Add one with the plus, or upload a syllabus on the course page.' : 'No exam dates yet. Create a course first.'}>
        {(s) => examsOf(courses, s).map((e) => <ExamRow key={e.course.id} {...e} />)}
      </Loaded>
    </Panel>
  )
}

/** Which course, what kind, its name and date; saved to the course like on its own page. */
function AddExamForm({ courses, onDone }: { courses: ClassSummary[]; onDone: () => Promise<void> }) {
  const [classId, setClassId] = useState(courses[0]?.id ?? '')
  const [kind, setKind] = useState<AssessmentKind>('exam')
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const a = useAction()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!classId || !name.trim() || !date) return
    void a.run(async () => {
      await api.addAssessment(classId, { kind, name: name.trim(), date })
      await onDone()
    })
  }
  return (
    <form onSubmit={submit} className="mb-4 space-y-2 rounded-md border border-line bg-bg/60 p-3">
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <select className={inputCls + ' cursor-pointer'} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Course for the new exam">
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
        <select className={inputCls + ' cursor-pointer'} value={kind} onChange={(e) => setKind(e.target.value as AssessmentKind)} aria-label="Kind">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <input className={inputCls} autoFocus placeholder="Name, e.g. Midterm" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} aria-label="Exam name" />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Exam date" />
        <Button type="submit" variant="ink" disabled={a.busy || !classId || !name.trim() || !date}>
          {a.busy ? 'Saving…' : 'Add'}
        </Button>
      </div>
      {a.error != null && <ErrorBox error={a.error} />}
    </form>
  )
}

/** A dashboard list: a loading line until the study data is in, the rows, or the empty message. */
function Loaded<T>({ data, empty, children }: { data: T | undefined; empty: string; children: (data: T) => ReactNode[] }) {
  if (data === undefined) return <p className="text-sm text-muted">Loading…</p>
  const rows = children(data)
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return <Rows rows={rows} />
}

/** The first few rows, and a button that opens the rest underneath. */
function Rows({ rows }: { rows: ReactNode[] }) {
  const [open, setOpen] = useState(false)
  const more = rows.length - VISIBLE_ROWS
  return (
    <>
      <ul className="divide-y divide-line">{open ? rows : rows.slice(0, VISIBLE_ROWS)}</ul>
      {more > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mt-3 flex w-full cursor-pointer items-center justify-between border-t border-line pt-3 text-sm text-ink-2 transition hover:text-ink"
        >
          <span>{open ? 'Show less' : `${more} more`}</span>
          <span aria-hidden="true" className={cx('text-base leading-none transition', open && 'rotate-180')}>
            ⌄
          </span>
        </button>
      )}
    </>
  )
}

const itemCls = 'py-3 first:pt-0 last:pb-0'
const rowCls = 'group flex items-center gap-4'
const codeCls = 'w-20 shrink-0 truncate font-mono text-xs font-semibold text-ink-2'
const CourseCode = ({ course }: { course: ClassSummary }) => <span className={codeCls}>{course.code}</span>

function TodoRow({ todo }: { todo: Todo }) {
  return (
    <li className={itemCls}>
      <Link to={todo.to} className={rowCls}>
        <CourseCode course={todo.course} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium group-hover:underline">{todo.title}</span>
          <span className="block truncate text-sm text-muted">{todo.detail}</span>
        </span>
        <span aria-hidden="true" className="text-muted transition group-hover:translate-x-0.5 group-hover:text-ink">
          →
        </span>
      </Link>
    </li>
  )
}

/** A device that is recording: the course it records into (if one is chosen yet) and the way to its captions. */
function RecordingRow({ device }: { device: DeviceSummary }) {
  const course = device.activeClass
  return (
    <li className={itemCls}>
      <Link to={`/live/${device.lectureId}`} className={rowCls}>
        <span className={codeCls}>{course?.code ?? 'NEW'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium group-hover:underline">{course?.name ?? 'Not in a course yet'}</span>
          <span className="block text-sm text-muted">{deviceLabel(device)} is recording: open the captions</span>
        </span>
        <Pill status="recording" />
      </Link>
    </li>
  )
}

function ExamRow({ course, name, date, days }: { course: ClassSummary; name: string; date: string; days: number }) {
  return (
    <li className={itemCls}>
      <Link to={`/c/${course.id}/exam-topics`} className={rowCls}>
        <CourseCode course={course} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium group-hover:underline">{name}</span>
          <span className="block text-sm text-muted">{fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-xl font-semibold leading-none">{days}</span>
          <Label>{days === 1 ? 'day' : 'days'}</Label>
        </span>
      </Link>
    </li>
  )
}
