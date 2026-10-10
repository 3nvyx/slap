import type { OutlineSection, Segment, StudyBundleStatus } from '@slap/contracts'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { ConceptText, useConceptMatcher } from '../components/ConceptText'
import { Async, Button, ButtonLink, cx, Empty, ErrorBox, Label, Pill } from '../components/ui'
import { api } from '../lib/api'
import { fmtDate, fmtTime } from '../lib/format'
import type { LectureDetail } from '../lib/types'
import { useApi } from '../lib/useApi'

export function LecturePage() {
  const { id = '' } = useParams()
  const lecture = useApi(() => api.lecture(id), [id])
  return (
    <Async state={lecture} label="Loading lecture">
      {(data) => <LectureView data={data} reload={lecture.reload} />}
    </Async>
  )
}

interface Section {
  title: string
  start: number
  end: number
  summary?: string
  segments: Segment[]
}

function sectionsFor(segments: Segment[], outline: OutlineSection[]): Section[] {
  const segs = [...segments].sort((a, b) => a.idx - b.idx)
  if (outline.length === 0) return [{ title: 'Transcript', start: segs[0]?.start ?? 0, end: segs[segs.length - 1]?.end ?? 0, segments: segs }]
  const secs: Section[] = outline.map((o) => ({ ...o, segments: [] }))
  for (const s of segs) {
    let i = secs.findIndex((o) => s.start >= o.start && s.start < o.end)
    if (i < 0) i = s.start < secs[0].start ? 0 : secs.length - 1
    secs[i].segments.push(s)
  }
  return secs
}

/** Diarization: speaker 0 (or missing) is the lecturer, 1+ are students. */
const isStudent = (s: Segment) => (s.speaker ?? 0) >= 1

/** Paragraphs of up to `size` segments, broken wherever the speaker switches between lecturer and student. */
function paragraphs(segs: Segment[], size = 4): Segment[][] {
  const out: Segment[][] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.length < size && isStudent(last[0]) === isStudent(s)) last.push(s)
    else out.push([s])
  }
  return out
}

function LectureView({ data, reload }: { data: LectureDetail; reload: () => Promise<void> }) {
  const { classId, detail } = useClass()
  const { lecture } = data
  const owner = detail.class.role === 'owner'
  const matcher = useConceptMatcher(data.concepts)
  const sections = useMemo(() => sectionsFor(data.segments, data.outline), [data.segments, data.outline])
  const location = useLocation()
  const [activeSeg, setActiveSeg] = useState<number | null>(null)

  // Deep link: #seg-<id> scrolls to and flashes that segment.
  useEffect(() => {
    const m = location.hash.match(/^#seg-(\d+)/)
    if (!m) return
    const el = document.getElementById(`seg-${m[1]}`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setActiveSeg(Number(m[1]))
    }
  }, [location.hash, data.segments])

  const scrollTo = (domId: string) => document.getElementById(domId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Link to={`/c/${classId}`} className="text-muted hover:text-ink">
          ← Lectures
        </Link>
      </div>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3">
            <span className="label">{fmtDate(lecture.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            {lecture.durationS ? <span className="label">{fmtTime(lecture.durationS)}</span> : null}
            <Pill status={lecture.status} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{lecture.title}</h1>
        </div>
        <div className="flex gap-2">
          {lecture.status === 'live' && (
            <ButtonLink variant="accent" to={`/live/${lecture.id}`}>
              Open live captions
            </ButtonLink>
          )}
          <ButtonLink variant="ink" to={`/recall/${lecture.id}`}>
            Recall check
          </ButtonLink>
        </div>
      </header>

      {lecture.status !== 'ready' && lecture.status !== 'live' && <BundleBanner lectureId={lecture.id} owner={owner} onDone={reload} />}

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <nav className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          <Label className="mb-3">Outline</Label>
          {data.outline.length === 0 ? (
            <p className="text-sm text-muted">{lecture.status === 'ready' ? 'No outline.' : 'Outline appears when the study bundle is ready.'}</p>
          ) : (
            <ol className="space-y-1 border-l border-line">
              {data.outline.map((o, i) => (
                <li key={i}>
                  <button onClick={() => scrollTo(`sec-${i}`)} className="-ml-px block w-full cursor-pointer border-l-2 border-transparent py-1.5 pl-3 text-left text-sm hover:border-accent">
                    <span className="block font-mono text-[11px] text-muted">{fmtTime(o.start)}</span>
                    <span className="block leading-snug">{o.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </nav>

        <article className="min-w-0 max-w-3xl">
          {data.summary && (
            <section className="mb-8 rounded-md border border-line bg-panel p-5">
              <Label className="mb-2">Summary</Label>
              <p className="leading-relaxed">{data.summary}</p>
            </section>
          )}

          {data.questionsAsked && data.questionsAsked.length > 0 && (
            <section className="mb-8">
              <Label className="mb-3">Questions asked in class · {data.questionsAsked.length}</Label>
              <ul className="space-y-2">
                {data.questionsAsked.map((q) => (
                  <li key={q.segmentId}>
                    <a
                      href={`#seg-${q.segmentId}`}
                      onClick={(e) => {
                        // Same hash twice doesn't fire a navigation; scroll and flash directly.
                        const el = document.getElementById(`seg-${q.segmentId}`)
                        if (!el) return
                        e.preventDefault()
                        window.history.replaceState(null, '', `#seg-${q.segmentId}`)
                        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
                        setActiveSeg(null)
                        requestAnimationFrame(() => setActiveSeg(q.segmentId))
                      }}
                      className="flex items-baseline gap-3 rounded-md border border-line bg-panel px-4 py-3 text-sm hover:border-ink"
                    >
                      <span className="w-12 shrink-0 font-mono text-xs text-muted">{fmtTime(q.start)}</span>
                      <span className="min-w-0 flex-1">“{q.text}”</span>
                      <span className="shrink-0 text-xs underline">in transcript</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.announcements.length > 0 && (
            <section className="mb-8">
              <Label className="mb-3">Announcements</Label>
              <ul className="space-y-2">
                {data.announcements.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-3 rounded-md border border-line bg-panel px-4 py-3 text-sm">
                    <span className={cx('font-mono text-[10px] uppercase tracking-wider', a.kind === 'exam' || a.kind === 'deadline' ? 'text-accent' : 'text-muted')}>{a.kind}</span>
                    <span className="min-w-0 flex-1">{a.text}</span>
                    {a.when && <span className="font-mono text-xs text-muted">{fmtDate(a.when)}</span>}
                    {a.segmentId != null && (
                      <a href={`#seg-${a.segmentId}`} className="text-xs underline">
                        in transcript
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-4 flex items-center justify-between">
              <Label>Transcript</Label>
              {data.concepts.length > 0 && <span className="text-xs text-muted">Hover a highlighted term for its note</span>}
            </div>
            {data.segments.length === 0 ? (
              <Empty>No transcript yet.</Empty>
            ) : (
              sections.map((sec, si) => (
                <div key={si} id={`sec-${si}`} className="mb-10 scroll-mt-20">
                  {data.outline.length > 0 && (
                    <div className="mb-4 border-b border-line pb-2">
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-xs text-muted">{fmtTime(sec.start)}</span>
                        <h2 className="text-xl font-bold tracking-tight">{sec.title}</h2>
                      </div>
                      {sec.summary && <p className="mt-1 text-sm text-ink-2">{sec.summary}</p>}
                    </div>
                  )}
                  {paragraphs(sec.segments).map((para) => (
                    <div key={para[0].id} className="mb-5 grid grid-cols-[3.5rem_1fr] gap-3">
                      <span className="pt-1 font-mono text-xs text-muted">{fmtTime(para[0].start)}</span>
                      <p className={cx('leading-[1.75]', isStudent(para[0]) && 'border-l-2 border-accent pl-3 text-ink-2')}>
                        {para.map((s) => (
                          <span key={s.id} id={`seg-${s.id}`} className={cx('scroll-mt-24 rounded-sm', activeSeg === s.id && 'flash')}>
                            {isStudent(s) && (
                              <span
                                className="mr-2 inline-flex h-5 -translate-y-px items-center rounded-sm bg-ink px-1.5 align-middle font-mono text-[10px] uppercase tracking-wider text-bg"
                                title={`Speaker ${s.speaker}`}
                              >
                                Student
                              </span>
                            )}
                            <ConceptText text={s.text} matcher={matcher} classId={classId} />{' '}
                          </span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>
        </article>
      </div>
    </div>
  )
}

function BundleBanner({ lectureId, owner, onDone }: { lectureId: string; owner: boolean; onDone: () => Promise<void> }) {
  const [status, setStatus] = useState<StudyBundleStatus | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const s = await api.bundle(lectureId)
        if (stop) return
        setStatus(s)
        setError(null)
        if (s.status === 'done') {
          await onDone()
          return
        }
        if (s.status === 'failed') return
      } catch (e) {
        if (!stop) setError(e)
      }
      if (!stop) timer = setTimeout(poll, 3000)
    }
    void poll()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [lectureId, onDone, tick])

  const steps = status ? Object.entries(status.steps) : []
  if (status?.status === 'done') return null
  return (
    <div className="mb-8 rounded-md border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {status?.status !== 'failed' && <span className="pulse size-2 rounded-full bg-accent" />}
          <span className="font-semibold">
            {status?.status === 'failed' ? 'Study bundle failed' : 'Building the study bundle'}
          </span>
          <span className="text-sm text-muted">outline, concepts, cards and questions</span>
        </div>
        {status?.status === 'failed' && owner && (
          <Button
            size="sm"
            onClick={async () => {
              try {
                await api.rerunBundle(lectureId)
                setTick((t) => t + 1)
              } catch (e) {
                setError(e)
              }
            }}
          >
            Re-run
          </Button>
        )}
      </div>
      {steps.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {steps.map(([name, s]) => (
            <Pill key={name} status={s}>
              {name} · {s}
            </Pill>
          ))}
        </div>
      )}
      {status?.error && <p className="mt-3 text-sm text-bad">{status.error}</p>}
      {error != null && (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      )}
    </div>
  )
}
