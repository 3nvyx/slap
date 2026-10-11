import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AnnouncementList } from '../components/Announcements'
import { useClass } from '../components/ClassLayout'
import { ButtonLink, Dot, Label, PageTitle, Panel, Pill } from '../components/ui'
import { api } from '../lib/api'
import { useCaptions } from '../lib/captions'
import { fmtDate, fmtTime } from '../lib/format'
import { LANGUAGES } from '../lib/languages'
import { useApi } from '../lib/useApi'

/** One page for the person at the front: device, who is watching, the caption tail and the questions asked. */
export default function LecturerPage() {
  const { classId, detail } = useClass()
  const live = detail.lectures.find((l) => l.status === 'live')
  const liveInfo = detail.live ?? null
  const current = live ?? null
  // Questions asked: from the live lecture while it runs, else the most recent lecture with a transcript.
  const latest = current ?? [...detail.lectures].filter((l) => l.status === 'ready').sort((a, b) => b.date.localeCompare(a.date))[0]
  const lecture = useApi(() => api.lecture(latest!.id), [latest?.id], { enabled: !!latest })
  const announcements = useApi(() => api.announcements(classId), [classId])
  const reloadLecture = lecture.reload
  useEffect(() => {
    if (!current) return
    const t = setInterval(() => void reloadLecture(), 30_000)
    return () => clearInterval(t)
  }, [current, reloadLecture])

  const device = detail.device
  const state = device?.state ?? 'offline'
  const languages = (liveInfo?.languages ?? []).map((code) => LANGUAGES.find((l) => l.code === code)?.native ?? code.toUpperCase())
  const questions = lecture.data?.questionsAsked ?? []

  return (
    <div className="max-w-5xl">
      <PageTitle kicker={`${detail.class.code} · lecturer`} title="Lecturer view">
        {current ? (
          <ButtonLink variant="accent" to={`/live/${current.id}`}>
            Open captions
          </ButtonLink>
        ) : (
          <ButtonLink variant="ink" to={`/c/${classId}`}>
            Start a session
          </ButtonLink>
        )}
      </PageTitle>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-line bg-panel p-5">
          <Label>Device</Label>
          <div className="mt-3 flex items-center gap-2">
            <Dot live={state === 'recording'} className={state === 'error' ? '!bg-bad' : state === 'idle' ? '!bg-good' : undefined} />
            <span className="text-xl font-bold capitalize tracking-tight">{device ? state : 'None'}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted">{device ? (device.name ?? 'Online') : 'Switch one on and pick this course'}</div>
        </div>
        <div className={'rounded-md p-5 ' + (current ? 'bg-ink text-bg' : 'border border-line bg-panel')}>
          <div className={'label ' + (current ? '!text-bg/60' : '')}>Session</div>
          <div className="mt-3 flex items-center gap-2">
            {current && <Pill status={liveInfo?.replay ? 'replay' : 'live'} />}
            <span className="truncate text-xl font-bold tracking-tight">{current ? current.title : 'Not recording'}</span>
          </div>
          <div className={'mt-1 text-xs ' + (current ? 'text-bg/60' : 'text-muted')}>{current ? <Elapsed since={current.date} durationS={current.durationS} /> : 'Double-slap the device or press start'}</div>
        </div>
        <div className="rounded-md border border-line bg-panel p-5">
          <Label>Watching now</Label>
          <div className="mt-3 font-mono text-4xl font-bold">{liveInfo?.viewers ?? 0}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {languages.length ? languages.map((l) => <span key={l} className="rounded-sm bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">{l}</span>) : <span className="text-xs text-muted">no one yet</span>}
          </div>
        </div>
        <div className="rounded-md border border-line bg-panel p-5">
          <Label>Lectures</Label>
          <div className="mt-3 font-mono text-4xl font-bold">{detail.lectures.length}</div>
          <div className="mt-1 text-xs text-muted">
            code <span className="font-mono">{detail.class.code}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          {current && <CaptionTail lectureId={current.id} />}
          <Panel title={`Questions asked in class${latest ? ` · ${latest.title}` : ''}`}>
            {!latest ? (
              <p className="text-sm text-muted">No lecture yet.</p>
            ) : questions.length === 0 ? (
              <p className="text-sm text-muted">{current ? 'None picked up yet; student questions appear a few minutes after they are asked.' : 'No student questions were picked up in this lecture.'}</p>
            ) : (
              <ul className="space-y-2">
                {questions.map((q) => (
                  <li key={q.segmentId}>
                    <Link to={`/c/${classId}/lecture/${latest.id}#seg-${q.segmentId}`} className="flex items-baseline gap-3 rounded-md border border-line bg-bg px-3 py-2 text-sm hover:border-ink">
                      <span className="w-12 shrink-0 font-mono text-xs text-muted">{fmtTime(q.start)}</span>
                      <span className="min-w-0 flex-1">“{q.text}”</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Recent lectures">
            {detail.lectures.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {[...detail.lectures]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 5)
                  .map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-14 shrink-0 font-mono text-xs text-muted">{fmtDate(l.date)}</span>
                      <Link to={l.status === 'live' ? `/live/${l.id}` : `/c/${classId}/lecture/${l.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        {l.title}
                      </Link>
                      <Pill status={l.status} />
                    </li>
                  ))}
              </ol>
            )}
          </Panel>
          <Panel title="Announcements you made">
            {announcements.data ? <AnnouncementList items={announcements.data} classId={classId} limit={5} /> : <p className="text-sm text-muted">Loading…</p>}
          </Panel>
        </div>
      </div>
    </div>
  )
}

/** "Live for 12:34": counts up from the session's duration so far (durationS from the API, refreshed every 8 s). */
function Elapsed({ since, durationS }: { since: string; durationS?: number }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  void since
  return <>Live for {fmtTime((durationS ?? 0) + (tick % 8))}</>
}

/** The last few captions, straight from the live socket, so the lecturer sees what the room sees. */
function CaptionTail({ lectureId }: { lectureId: string }) {
  const { state, socket } = useCaptions(lectureId, 'en')
  const finals = state.finals.slice(-3)
  return (
    <Panel
      title="What the room sees"
      action={
        <span className="flex items-center gap-2 text-xs text-muted">
          <Dot live={socket === 'open' && state.status?.state === 'recording'} />
          {socket === 'open' ? (state.status?.latencyMs != null ? `${state.status.latencyMs} ms` : 'connected') : socket}
        </span>
      }
    >
      {finals.length === 0 && !state.interim ? (
        <p className="text-sm text-muted">Waiting for the first words…</p>
      ) : (
        <div className="space-y-2 text-sm leading-relaxed">
          {finals.map((f, i) => (
            <p key={f.segmentId} className={i === finals.length - 1 ? 'text-ink' : 'text-muted'}>
              {f.text}
            </p>
          ))}
          {state.interim && <p className="font-medium text-accent">{state.interim.text}</p>}
        </div>
      )}
    </Panel>
  )
}
