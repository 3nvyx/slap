import type { ClassSummary } from '@slap/contracts'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CourseGrid } from '../components/Courses'
import { NewRecordingsCard, OnlineDevicesCard } from '../components/Devices'
import { TopBar } from '../components/Shell'
import { Async, ButtonLink, cx, Label, PageTitle, Panel, Pill } from '../components/ui'
import { api } from '../lib/api'
import { deviceLabel, useOnlineDevices } from '../lib/devices'
import { examInfo, fmtDate } from '../lib/format'
import type { DeviceSummary, Today } from '../lib/types'
import { useApi } from '../lib/useApi'

// How many courses the dashboard asks about (one request each). Courses without a lecture have nothing to
// study yet and are skipped; the ones with the most lectures come first.
const MAX_COURSES = 8
// Rows a dashboard list shows before the rest go behind its "more" button, so the cards keep their height.
const VISIBLE_ROWS = 2
// An exam this close puts "go through the exam topics" on the to-do list.
const EXAM_SOON_DAYS = 7

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
              <div className="grid gap-x-8 gap-y-4 lg:grid-cols-[1fr_340px]">
                {recording.length > 0 && (
                  <Panel title="Recording now" className="lg:col-span-2">
                    <ul className="divide-y divide-line">
                      {recording.map((d) => (
                        <RecordingRow key={d.id} device={d} />
                      ))}
                    </ul>
                  </Panel>
                )}
                <Panel title="To do">
                  <Loaded data={study.data} empty={all.some((c) => c.lectureCount > 0) ? 'Nothing due. You are caught up.' : 'Nothing to study yet. To-dos appear once a course has a recorded lecture.'}>
                    {(s) => todosOf(s).map((t) => <TodoRow key={t.key} todo={t} />)}
                  </Loaded>
                </Panel>
                <OnlineDevicesCard devices={devices} classes={all} onClassesChanged={courses.reload} />
                <Panel title="Upcoming exams">
                  <Loaded data={study.data} empty="No exam dates yet. Add them on a course's page, or upload its syllabus.">
                    {(s) => examsOf(all, s).map((e) => <ExamRow key={e.course.id} {...e} />)}
                  </Loaded>
                </Panel>
                <NewRecordingsCard classes={all} onChange={courses.reload} />
              </div>

              <section className="mt-12">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <h2 className="text-2xl font-bold tracking-tight">Courses</h2>
                  <ButtonLink to="/courses">All courses</ButtonLink>
                </div>
                <CourseGrid courses={all} wide />
              </section>
            </>
          )}
        </Async>
      </main>
    </div>
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
