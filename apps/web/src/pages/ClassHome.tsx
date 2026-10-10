import type { LectureSummary } from '@slap/contracts'
import { QRCodeSVG } from 'qrcode.react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useClass } from '../components/ClassLayout'
import { AnnouncementList } from '../components/Announcements'
import { Button, cx, Empty, ErrorBox, inputCls, Label, PageTitle, Panel, Pill, textareaCls } from '../components/ui'
import { api } from '../lib/api'
import { useMicStreamer } from '../lib/micStream'
import { examInfo, fmtDate, fmtTime } from '../lib/format'
import { LANGUAGES } from '../lib/languages'
import type { ClassDevice, ClassLive } from '../lib/types'
import { deviceLabel, useAction, useMyDevices } from '../lib/devices'
import { useApi } from '../lib/useApi'
import { PairForm } from './Devices'

export function ClassHome() {
  const { classId, detail, guest, reloadClass } = useClass()
  const cls = detail.class
  const owner = cls.role === 'owner'
  const live = detail.lectures.find((l) => l.status === 'live')
  const exam = examInfo(detail.nextExam)
  const lectures = [...detail.lectures].sort((a, b) => b.date.localeCompare(a.date))
  const latestReady = lectures.find((l) => l.status === 'ready')
  const announcements = useApi(() => api.announcements(classId), [classId, lectures.filter((l) => l.status === 'ready').length])

  return (
    <div>
      <PageTitle kicker={`${cls.code} · ${cls.role}`} title={cls.name}>
        {exam && (
          <div className="rounded-md border border-line bg-panel px-4 py-2 text-right">
            <Label>Next: {exam.name}</Label>
            <div className="font-mono text-lg">
              {fmtDate(exam.date)}
              {exam.days != null && exam.days >= 0 && <span className="ml-2 text-sm text-muted">in {exam.days}d</span>}
            </div>
          </div>
        )}
      </PageTitle>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <SessionPanel classId={classId} owner={owner} guest={guest} live={live} liveInfo={detail.live ?? null} device={detail.device} onChange={reloadClass} latestReady={latestReady} />
          <Panel title={`Lectures · ${lectures.length}`}>
            {lectures.length === 0 ? (
              <Empty>No lectures yet. {owner ? 'Start a session, or import a transcript below.' : 'They appear here once the lecturer records one.'}</Empty>
            ) : (
              <ol className="divide-y divide-line">
                {lectures.map((l) => (
                  <LectureRow key={l.id} classId={classId} l={l} />
                ))}
              </ol>
            )}
          </Panel>
          {announcements.data && announcements.data.length > 0 && (
            <Panel title={`Announcements · ${announcements.data.length}`}>
              <AnnouncementList items={announcements.data} classId={classId} limit={6} />
            </Panel>
          )}
          {owner && <ImportPanel classId={classId} onDone={reloadClass} />}
        </div>

        <div className="space-y-6">
          <JoinPanel code={cls.code} classId={classId} owner={owner} guestAccess={!!cls.guestAccess} onChange={reloadClass} />
          {guest ? (
            <Panel title="Device">
              <div className="flex items-center gap-2 text-sm">
                <Pill status={detail.device.paired ? (detail.device.state ?? 'idle') : 'unpaired'} />
                <span>{detail.device.paired ? `${detail.device.name ?? 'A device'} records into this course` : 'No device paired'}</span>
              </div>
            </Panel>
          ) : (
            <DevicePanel classId={classId} owner={owner} device={detail.device} onChange={reloadClass} />
          )}
          {owner && <UploadPanel classId={classId} onDone={reloadClass} />}
          <Panel title="Documents">
            {detail.documents.length === 0 ? (
              <p className="text-sm text-muted">No syllabus or book chapter yet.</p>
            ) : (
              <ul className="space-y-2">
                {detail.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{d.title}</span>
                    <span className="label">{d.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function LectureRow({ classId, l }: { classId: string; l: LectureSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <span className="w-16 shrink-0 font-mono text-xs text-muted">{fmtDate(l.date)}</span>
      <Link to={l.status === 'live' ? `/live/${l.id}` : `/c/${classId}/lecture/${l.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
        {l.title}
      </Link>
      {l.durationS ? <span className="font-mono text-xs text-muted">{fmtTime(l.durationS)}</span> : null}
      <Pill status={l.status} />
    </li>
  )
}

/** "3 watching · EN, ES" while a lecture is live (in-memory viewer counts from the API). */
function Watching({ info }: { info: ClassLive }) {
  const names = info.languages.map((code) => LANGUAGES.find((l) => l.code === code)?.native ?? code.toUpperCase())
  return (
    <span className="text-muted">
      <span className="font-mono text-ink">{info.viewers}</span> watching{names.length > 0 && <> · {names.join(', ')}</>}
    </span>
  )
}

function SessionPanel({
  classId,
  owner,
  guest,
  live,
  liveInfo,
  device,
  onChange,
  latestReady,
}: {
  classId: string
  owner: boolean
  guest: boolean
  live?: LectureSummary
  liveInfo: ClassLive | null
  device: ClassDevice
  onChange: () => Promise<void>
  latestReady?: LectureSummary
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [title, setTitle] = useState('')
  const [useMic, setUseMic] = useState(false)
  const mic = useMicStreamer(live?.id ?? null, owner && useMic && !!live)
  const navigate = useNavigate()

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onChange()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dotgrid overflow-hidden rounded-md border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-6 p-5 md:p-6">
        <div className="min-w-0 flex-1">
          <Label>Session</Label>
          {live ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <Pill status="live" />
                <span className="truncate text-lg font-semibold">{live.title}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link className="underline" to={`/live/${live.id}`}>
                  Open captions
                </Link>
                {liveInfo && liveInfo.lectureId === live.id && <Watching info={liveInfo} />}
                <span className="text-muted">Recording light on · audio never stored</span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-lg font-semibold">Not recording</div>
              <div className="mt-1 text-sm text-muted">
                Device {device.paired ? <>{device.name ? `${device.name} · ` : ''}{device.state ?? 'idle'}</> : 'not recording into this course'}. {owner ? 'Double-slap the device or press start.' : 'Captions start when the lecturer begins.'}
              </div>
              {owner && (
                <input className={inputCls + ' mt-3 max-w-sm'} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Lecture title" />
              )}
            </>
          )}
        </div>
        {owner &&
          (live ? (
            <Button
              variant="ink"
              size="lg"
              className="min-w-40"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setUseMic(false)
                await api.stopLecture(live.id)
                  navigate(`/c/${classId}/lecture/${live.id}`)
                })
              }
            >
              <span className="size-3 rounded-[2px] bg-accent" /> {busy ? 'Stopping…' : 'Stop'}
            </Button>
          ) : (
            <Button variant="accent" size="lg" className="min-w-48" disabled={busy} onClick={() => void act(() => api.startSession(classId, title.trim() || undefined))}>
              <span className="size-3 rounded-full bg-white" /> {busy ? 'Starting…' : 'Start session'}
            </Button>
          ))}
      </div>
      {owner && (
        <MicRow
          on={useMic}
          onToggle={() => setUseMic((v) => !v)}
          live={!!live}
          state={mic.state}
          level={mic.level}
          error={mic.error}
          devicePaired={device.paired}
        />
      )}
      {!guest && <PartnerRow classId={classId} latestReady={latestReady} />}
      {error != null && (
        <div className="px-5 pb-5">
          <ErrorBox error={error} />
        </div>
      )}
    </section>
  )
}

/** Learning-partner availability: it needs at least one lecture with a ready study bundle. */
function PartnerRow({ classId, latestReady }: { classId: string; latestReady?: LectureSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-panel/80 px-5 py-3 md:px-6">
      <span className={'inline-block size-2 shrink-0 rounded-full ' + (latestReady ? 'bg-accent' : 'bg-muted')} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">Learning partner</div>
        <div className="truncate text-xs text-muted">
          {latestReady ? <>Spoken quiz on “{latestReady.title}”, graded as you go.</> : 'Opens once a lecture’s study bundle is ready.'}
        </div>
      </div>
      {latestReady && (
        <Link to={`/c/${classId}/partner`} className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-bg px-3 text-sm font-medium hover:bg-panel-2">
          Practice out loud →
        </Link>
      )}
    </div>
  )
}

function MicRow({
  on,
  onToggle,
  live,
  state,
  level,
  error,
  devicePaired,
}: {
  on: boolean
  onToggle: () => void
  live: boolean
  state: string
  level: number
  error: string | null
  devicePaired: boolean
}) {
  const active = on && live && state === 'live'
  const label = !on
    ? live
      ? 'Off'
      : 'Arms when a session starts'
    : !live
      ? 'Armed: starts with the next session'
      : state === 'starting'
        ? 'Starting…'
        : state === 'reconnecting'
          ? 'Reconnecting…'
          : state === 'error'
            ? 'Error'
            : 'Mic live: streaming this laptop’s audio'
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line bg-panel/80 px-5 py-3 md:px-6">
      <button
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={'relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition ' + (on ? 'bg-accent' : 'bg-panel-2 ring-1 ring-line')}
      >
        <span className={'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ' + (on ? 'left-[22px]' : 'left-0.5')} />
        <span className="sr-only">Use laptop microphone</span>
      </button>
      <div className="min-w-0">
        <div className="text-sm font-medium">Use laptop microphone</div>
        <div className={'text-xs ' + (active ? 'font-semibold text-accent' : state === 'error' && on ? 'text-bad' : 'text-muted')}>
          {active && <span className="pulse mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" />}
          {label}
          {!on && devicePaired ? ' · use it when the device isn’t available' : ''}
        </div>
        {on && error && <div className="text-xs text-bad">{error}</div>}
      </div>
      {on && live && state !== 'error' && (
        <div className="ml-auto flex h-6 items-end gap-0.5" aria-label="Microphone level" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level}>
          {Array.from({ length: 16 }, (_, i) => {
            const lit = level * 16 > i
            return <span key={i} className={'w-1.5 rounded-[1px] transition-colors duration-75 ' + (lit ? (i > 12 ? 'bg-bad' : 'bg-accent') : 'bg-panel-2')} style={{ height: `${30 + i * 4.4}%` }} />
          })}
        </div>
      )}
    </div>
  )
}

/** The caller's device for this course: its state, a switch to this course, or the pair form when none is paired.
 *  Students see the status only; the pair form opens on request so it is not in the way. */
function DevicePanel({ classId, owner, device, onChange }: { classId: string; owner: boolean; device: ClassDevice; onChange: () => Promise<void> }) {
  const devices = useMyDevices()
  const [pairing, setPairing] = useState(false)
  const a = useAction()
  const mine = devices.data ?? []
  const here = mine.find((d) => d.activeClass?.id === classId)
  const other = here ? undefined : mine[0]
  const reload = async () => {
    await devices.reload()
    await onChange()
  }

  let body
  if (devices.data === undefined) {
    body = devices.error ? <ErrorBox error={devices.error} onRetry={() => void devices.reload()} /> : <p className="text-sm text-muted">Loading…</p>
  } else if (here) {
    body = (
      <div className="flex items-center gap-2 text-sm">
        <Pill status={here.state} />
        <span className="min-w-0 truncate">{deviceLabel(here)} records into this course</span>
      </div>
    )
  } else if (other) {
    const busy = other.state === 'recording'
    body = (
      <>
        <div className="flex items-center gap-2 text-sm">
          <Pill status={other.state} />
          <span className="min-w-0 truncate">
            {deviceLabel(other)} {other.activeClass ? <>records into <span className="font-mono">{other.activeClass.code}</span></> : 'has no course picked'}
          </span>
        </div>
        <Button
          variant="ink"
          className="mt-4 w-full"
          disabled={a.busy || busy}
          onClick={() => void a.run(async () => {
            await api.setActiveClass(other.id, classId)
            await reload()
          })}
        >
          {a.busy ? 'Switching…' : 'Record into this course'}
        </Button>
        {busy && <p className="mt-2 text-xs text-muted">It is recording now. Stop that lecture first.</p>}
        {a.error != null && (
          <div className="mt-3">
            <ErrorBox error={a.error} />
          </div>
        )}
      </>
    )
  } else {
    body = (
      <div className="flex items-center gap-2 text-sm">
        <Pill status={device.paired ? (device.state ?? 'idle') : 'unpaired'} />
        <span>{device.paired ? `${device.name ?? 'A member’s device'} records into this course` : 'No device paired'}</span>
      </div>
    )
  }
  const showForm = devices.data !== undefined && (pairing || (owner && mine.length === 0))

  return (
    <Panel
      title="Device"
      action={
        devices.data !== undefined && !showForm ? (
          <button className="cursor-pointer text-xs text-muted underline hover:text-ink" onClick={() => setPairing(true)}>
            {mine.length > 0 ? 'Pair another' : 'Pair a device'}
          </button>
        ) : null
      }
    >
      {body}
      {showForm && (
        <div className="mt-4">
          <PairForm
            classId={classId}
            onPaired={async () => {
              setPairing(false)
              await reload()
            }}
            onCancel={pairing ? () => setPairing(false) : undefined}
          />
        </div>
      )}
    </Panel>
  )
}

function JoinPanel({ code, classId, owner, guestAccess, onChange }: { code: string; classId: string; owner: boolean; guestAccess: boolean; onChange: () => Promise<void> }) {
  const url = `${window.location.origin}/j/${code}`
  const short = url.replace(/^https?:\/\//, '')
  const [copied, setCopied] = useState(false)
  const a = useAction()
  return (
    <Panel title="Join captions">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-md bg-white p-3">
          <QRCodeSVG value={url} size={176} level="M" marginSize={0} />
        </div>
        <div className="w-full text-center">
          <div className="break-all font-mono text-sm font-semibold">{short}</div>
          <div className="mt-3 flex justify-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">
            No sign-in needed. The link shows live captions{guestAccess ? ', and anyone can browse the notes, graph and exam topics.' : '.'}
          </p>
        </div>
      </div>
      {owner && (
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <button
            role="switch"
            aria-checked={guestAccess}
            disabled={a.busy}
            onClick={() => void a.run(async () => {
              await api.setGuestAccess(classId, !guestAccess)
              await onChange()
            })}
            className={cx('relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition disabled:opacity-50', guestAccess ? 'bg-accent' : 'bg-panel-2 ring-1 ring-line')}
          >
            <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', guestAccess ? 'left-[22px]' : 'left-0.5')} />
            <span className="sr-only">Guest access</span>
          </button>
          <div className="min-w-0">
            <div className="text-sm font-medium">Guest access</div>
            <div className="text-xs text-muted">Let anyone with the link read the notes without an account (for judges and visitors). They can’t practise or review.</div>
            {a.error != null && <div className="mt-1 text-xs text-bad">{String(a.error instanceof Error ? a.error.message : a.error)}</div>}
          </div>
        </div>
      )}
    </Panel>
  )
}

function UploadPanel({ classId, onDone }: { classId: string; onDone: () => Promise<void> }) {
  const [kind, setKind] = useState<'book' | 'syllabus'>('book')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [msg, setMsg] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    setMsg('')
    try {
      const r = await api.uploadDocument(classId, kind, file)
      setMsg(`Uploaded. Parsing (job ${r.jobId}).`)
      setFile(null)
      ;(e.target as HTMLFormElement).reset()
      await onDone()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Upload book chapter / syllabus">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-panel-2 p-1">
          {(['book', 'syllabus'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={'h-8 cursor-pointer rounded-[4px] text-sm capitalize ' + (kind === k ? 'bg-panel font-medium shadow-sm' : 'text-muted')}
            >
              {k === 'book' ? 'Book chapter' : 'Syllabus'}
            </button>
          ))}
        </div>
        <input
          type="file"
          accept="application/pdf,.pdf,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-panel file:px-3 file:text-sm"
          aria-label="Document file"
        />
        {error != null && <ErrorBox error={error} />}
        {msg && <p className="text-sm text-good">{msg}</p>}
        <Button className="w-full" disabled={busy || !file}>
          {busy ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
    </Panel>
  )
}

function ImportPanel({ classId, onDone }: { classId: string; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const lec = await api.importLecture(classId, { title: title.trim(), date, transcript })
      await onDone()
      navigate(`/c/${classId}/lecture/${lec.id}`)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Import transcript" action={<Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</Button>}>
      {!open ? (
        <p className="text-sm text-muted">Seed past lectures from plain text or WebVTT. The study bundle runs after import.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <input className={inputCls} placeholder="Lecture title" value={title} onChange={(e) => setTitle(e.target.value)} required aria-label="Title" />
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
          </div>
          <textarea className={textareaCls + ' h-56 font-mono text-xs'} placeholder={'Paste transcript (plain text or WEBVTT)…'} value={transcript} onChange={(e) => setTranscript(e.target.value)} required aria-label="Transcript" />
          {error != null && <ErrorBox error={error} />}
          <Button variant="ink" disabled={busy || !transcript.trim() || !title.trim()}>
            {busy ? 'Importing…' : 'Import lecture'}
          </Button>
        </form>
      )}
    </Panel>
  )
}
