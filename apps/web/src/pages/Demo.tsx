// `/demo` (the landing page's "Demo" button): the two courses used to show Slap. OCC Hacks is the live one:
// its device, a QR code into its captions, and every device that is recording right now. CS229 is the recorded
// example: Lecture 1 with snippets of its transcript and the course's dates. Courses are found by their code.
import type { ClassSummary, LectureSummary } from '@slap/contracts'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Shell'
import { Button, ButtonLink, ErrorBox, Label, PageTitle, Panel, Pill, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { deviceLabel, useAction, useOnlineDevices } from '../lib/devices'
import { fmtDate, fmtTime } from '../lib/format'
import type { DeviceSummary, LectureDetail } from '../lib/types'
import { useApi } from '../lib/useApi'

const LIVE_CODE = 'OCCHACKS'
const EXAMPLE_CODE = 'CS229'
const SNIPPET_CHARS = 260

export function DemoPage() {
  const classes = useApi(() => api.classes(), [])
  const devices = useOnlineDevices()
  const byCode = (code: string) => classes.data?.find((c) => c.code.toUpperCase() === code)
  const live = byCode(LIVE_CODE)
  const example = byCode(EXAMPLE_CODE)

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <PageTitle kicker="Demo" title="See Slap work" />
        {classes.data === undefined ? (
          classes.error ? <ErrorBox error={classes.error} onRetry={() => void classes.reload()} /> : <Spinner label="Loading courses" />
        ) : (
          <div className="space-y-12">
            <section>
              <SectionHead n="01" title="Live" sub="A device in the room, captions on every screen." />
              <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                {live ? <LiveCourse course={live} devices={devices.data ?? []} onChange={devices.reload} /> : <Missing code={LIVE_CODE} />}
                <RecordingNow devices={devices.data} />
              </div>
            </section>
            <section>
              <SectionHead n="02" title="Recorded" sub="What a lecture becomes once the device stops." />
              {example ? <ExampleCourse course={example} /> : <Missing code={EXAMPLE_CODE} />}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function SectionHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-3">
      <span className="font-mono text-xs text-accent">{n}</span>
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <span className="text-sm text-muted">{sub}</span>
    </div>
  )
}

function Missing({ code }: { code: string }) {
  return (
    <Panel>
      <p className="text-sm text-muted">
        The demo course <span className="font-mono">{code}</span> does not exist yet. Create it under{' '}
        <Link to="/classes" className="underline">
          All classes
        </Link>
        .
      </p>
    </Panel>
  )
}

/** The live course: where its device stands, and the way in for the audience. */
function LiveCourse({ course, devices, onChange }: { course: ClassSummary; devices: DeviceSummary[]; onChange: () => Promise<void> }) {
  const a = useAction()
  const joinUrl = `${window.location.origin}/j/${course.code}`
  const here = devices.find((d) => d.activeClass?.id === course.id)
  const free = devices.find((d) => !d.activeClass && d.state === 'recording')   // recording, not in a course yet
  const recording = here?.state === 'recording'

  return (
    <Panel>
      <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
        <div>
          <span className="font-mono text-sm font-semibold">{course.code}</span>
          <h3 className="mt-1 text-3xl font-bold tracking-tight">{course.name}</h3>
          {course.description && <p className="mt-3 max-w-xl text-ink-2">{course.description}</p>}

          <div className="mt-6 flex items-center gap-2 text-sm">
            {here ? (
              <>
                <Pill status={here.state} />
                <span className="font-medium">{deviceLabel(here)}</span>
                <span className="text-muted">{recording ? 'is recording this course.' : 'has stopped. Shake it to record again.'}</span>
              </>
            ) : devices.length ? (
              <>
                <span className="shrink-0">
                  <Pill status="offline">elsewhere</Pill>
                </span>
                <span className="text-muted">{free ? `${deviceLabel(free)} is recording, not in a course yet.` : 'Every online device is recording another course.'}</span>
              </>
            ) : (
              <>
                <span className="shrink-0">
                  <Pill status="offline" />
                </span>
                <span className="text-muted">No device online. Switch a Slap on, or start with this laptop's microphone from the course page.</span>
              </>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink variant={recording ? 'accent' : 'ink'} to={`/j/${encodeURIComponent(course.code)}`}>
              {recording ? 'Watch live captions' : 'Open the caption page'}
            </ButtonLink>
            {!here && free && (
              <Button
                disabled={a.busy}
                onClick={() =>
                  void a.run(async () => {
                    await api.setActiveClass(free.id, course.id)
                    await onChange()
                  })
                }
              >
                {a.busy ? 'Switching…' : `Use ${deviceLabel(free)} here`}
              </Button>
            )}
            <ButtonLink to={`/c/${course.id}`}>Open course</ButtonLink>
          </div>
          {a.error != null && (
            <div className="mt-4">
              <ErrorBox error={a.error} />
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-md bg-white p-3">
            <QRCodeSVG value={joinUrl} size={168} level="M" marginSize={0} />
          </div>
          <div className="text-center">
            <Label>Scan to read along</Label>
            <div className="mt-1 break-all font-mono text-xs">{joinUrl.replace(/^https?:\/\//, '')}</div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

/** Every device that is recording, whatever the course. */
function RecordingNow({ devices }: { devices: DeviceSummary[] | undefined }) {
  const recording = (devices ?? []).filter((d) => d.state === 'recording')
  return (
    <Panel title={`Recording now · ${recording.length}`}>
      {devices === undefined ? (
        <p className="text-sm text-muted">Looking for devices…</p>
      ) : recording.length === 0 ? (
        <p className="text-sm text-muted">No device is recording. One shows up here by itself as soon as it starts.</p>
      ) : (
        <ul className="divide-y divide-line">
          {recording.map((d) => (
            <li key={d.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2 text-sm">
                <Pill status="recording" />
                <span className="min-w-0 flex-1 truncate font-medium">{deviceLabel(d)}</span>
              </div>
              {d.activeClass && (
                <Link to={`/j/${encodeURIComponent(d.activeClass.code)}`} className="mt-2 block text-sm">
                  <span className="font-mono text-xs text-muted">{d.activeClass.code}</span> {d.activeClass.name}
                  <span className="ml-1 underline">Watch →</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** The first finished lecture of a course, oldest first: its "Lecture 1". */
function firstLecture(lectures: LectureSummary[]): LectureSummary | undefined {
  return [...lectures].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)).find((l) => l.status === 'ready')
}

/** What was said in each section of the outline: the section's opening sentences, cut at about SNIPPET_CHARS. */
function snippets(lecture: LectureDetail) {
  return lecture.outline.flatMap((sec) => {
    let text = ''
    let cut = false
    for (const s of lecture.segments) {
      if (s.start < sec.start || s.start >= sec.end) continue
      if (text.length >= SNIPPET_CHARS) {
        cut = true
        break
      }
      text += (text ? ' ' : '') + s.text.trim()
    }
    const concepts = sec.conceptSlugs.flatMap((slug) => lecture.concepts.find((c) => c.slug === slug) ?? []).slice(0, 3)
    return text ? [{ title: sec.title, start: sec.start, text: text + (cut ? ' …' : ''), concepts }] : []
  })
}

function ExampleCourse({ course }: { course: ClassSummary }) {
  const detail = useApi(() => api.classDetail(course.id), [course.id])
  const first = detail.data ? firstLecture(detail.data.lectures) : undefined
  const lecture = useApi(() => api.lecture(first!.id), [first?.id], { enabled: !!first })
  const dates = useApi(() => api.assessments(course.id), [course.id])
  const base = `/c/${course.id}`

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Panel>
        <span className="font-mono text-sm font-semibold">{course.code}</span>
        <h3 className="mt-1 text-3xl font-bold tracking-tight">{course.name}</h3>
        {course.description && <p className="mt-3 max-w-2xl text-ink-2">{course.description}</p>}

        {detail.data === undefined ? (
          detail.error ? <ErrorBox error={detail.error} onRetry={() => void detail.reload()} /> : <Spinner label="Loading the course" />
        ) : !first ? (
          <p className="mt-6 text-sm text-muted">This course has no finished lecture yet.</p>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-5">
              <Label>{fmtDate(first.date, { month: 'long', day: 'numeric' })}</Label>
              <h4 className="text-xl font-bold tracking-tight">{first.title}</h4>
              {first.durationS ? <span className="font-mono text-xs text-muted">{fmtTime(first.durationS)}</span> : null}
            </div>
            {lecture.data === undefined ? (
              lecture.error ? <ErrorBox error={lecture.error} onRetry={() => void lecture.reload()} /> : <Spinner label="Loading the transcript" />
            ) : (
              <>
                {lecture.data.summary && <p className="mt-3 max-w-2xl text-sm text-ink-2">{lecture.data.summary}</p>}
                <ol className="mt-6 space-y-6">
                  {snippets(lecture.data).map((s) => (
                    <li key={s.start} className="grid gap-x-4 gap-y-1 sm:grid-cols-[52px_1fr]">
                      <span className="pt-0.5 font-mono text-xs text-accent">{fmtTime(s.start)}</span>
                      <div>
                        <div className="font-semibold">{s.title}</div>
                        <blockquote className="mt-2 border-l-2 border-line pl-4 text-sm leading-relaxed text-ink-2">{s.text}</blockquote>
                        {s.concepts.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s.concepts.map((c) => (
                              <Link key={c.id} to={`${base}/concept/${c.id}`} className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] hover:border-ink">
                                {c.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
              <ButtonLink variant="ink" to={`${base}/lecture/${first.id}`}>
                Read the full transcript
              </ButtonLink>
              <ButtonLink to={`${base}/today`}>Study plan</ButtonLink>
              <ButtonLink to={base}>Open course</ButtonLink>
            </div>
          </>
        )}
      </Panel>

      <div className="space-y-6">
        <Panel title="Exams and quizzes">
          {!dates.data || dates.data.length === 0 ? (
            <p className="text-sm text-muted">No dates entered yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {dates.data.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted">{fmtDate(d.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                  <span className="label">{d.kind}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">The study plan works back from these and from the lectures held so far.</p>
        </Panel>
        <Panel title="In this course">
          <ul className="space-y-2 text-sm">
            {[
              ['Lectures and transcripts', base],
              ['Concept graph', `${base}/graph`],
              ['Flashcards', `${base}/review`],
              ['Practice questions', `${base}/practice`],
              ['Exam topics', `${base}/exam-topics`],
            ].map(([label, to]) => (
              <li key={to}>
                <Link to={to!} className="underline">
                  {label} →
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">A syllabus or a book chapter can be uploaded on the course page.</p>
        </Panel>
      </div>
    </div>
  )
}
