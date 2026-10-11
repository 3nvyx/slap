// Device UI. A device that is on records, with no pairing and no course to pick first: its recording is a "new
// recording" until someone puts it into a course, while it runs (the Devices card) or afterwards (the New
// recordings card). Shared by the class list and the class home device panel.
import type { ClassSummary, InboxLecture } from '@slap/contracts'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button, ButtonLink, Dot, ErrorBox, inputCls, Label, Panel, Pill } from './ui'
import { api } from '../lib/api'
import { deviceLabel, useAction } from '../lib/devices'
import { fmtDate, fmtTime } from '../lib/format'
import type { ApiState } from '../lib/useApi'
import type { DeviceSummary } from '../lib/types'

/** Shown when no device is connected to the server. */
export function NoDeviceOnline() {
  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <Pill status="offline" />
        <span>No device online</span>
      </div>
      <p className="mt-2 text-xs text-muted">Shake a Slap to switch it on. It starts recording by itself and shows up here.</p>
    </>
  )
}

/** Home: every device that is online, each with the course its recording goes into (optional: pick or create one).
 *  `devices` is the page's `useOnlineDevices()`, so the page can use the same list. */
/** `liveId`: the lecture being captioned right now, if any; the card's button opens its captions page. */
export function OnlineDevicesCard({ devices, classes, liveId, onClassesChanged }: { devices: ApiState<DeviceSummary[]>; classes: ClassSummary[]; liveId?: string | null; onClassesChanged: () => Promise<void> }) {
  const list = devices.data ?? []
  const reload = async () => {
    await devices.reload()
    await onClassesChanged()
  }

  return (
    <Panel
      title="Devices"
      action={
        liveId ? (
          <ButtonLink to={`/live/${liveId}`} variant="accent" size="sm">
            <Dot live /> Live captions
          </ButtonLink>
        ) : (
          <Button size="sm" disabled title="Nothing is recording right now">
            <Dot /> Live captions
          </Button>
        )
      }
    >
      {devices.data === undefined ? (
        devices.error ? <ErrorBox error={devices.error} onRetry={() => void devices.reload()} /> : <p className="text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <NoDeviceOnline />
      ) : (
        <div className="space-y-5">
          {list.map((d) => (
            <DeviceRow key={d.id} device={d} classes={classes} onChange={reload} />
          ))}
        </div>
      )}
    </Panel>
  )
}

const NEW = '__new'

function DeviceRow({ device: d, classes, onChange }: { device: DeviceSummary; classes: ClassSummary[]; onChange: () => Promise<void> }) {
  const a = useAction()
  const [creating, setCreating] = useState(false)
  const recording = d.state === 'recording'
  const active = d.activeClass

  const choose = (classId: string) => {
    if (classId === NEW) {
      setCreating(true)
      return
    }
    setCreating(false)
    void a.run(async () => {
      await api.setActiveClass(d.id, classId)
      await onChange()
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <Pill status={d.state} />
        <span className="min-w-0 flex-1 truncate font-medium">{deviceLabel(d)}</span>
      </div>
      <label className="mt-4 block" htmlFor={`active-${d.id}`}>
        <Label>Recording into</Label>
      </label>
      <select
        id={`active-${d.id}`}
        className={inputCls + ' mt-2 cursor-pointer'}
        value={creating ? NEW : (active?.id ?? '')}
        disabled={a.busy || !recording || !!active}
        onChange={(e) => choose(e.target.value)}
      >
        {!active && <option value="">New recordings · choose a course later</option>}
        {active && !classes.some((c) => c.id === active.id) && (
          <option value={active.id}>
            {active.code} · {active.name}
          </option>
        )}
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} · {c.name}
          </option>
        ))}
        <option value={NEW}>Create a new course…</option>
      </select>
      {recording && active && <p className="mt-2 text-xs text-muted">Recording now. Hold REC on the device for 2 seconds to end and save.</p>}
      {recording && !active && !creating && <p className="mt-2 text-xs text-muted">Recording now. Pick a course here, or leave it and file the transcript afterwards.</p>}
      {!recording && <p className="mt-2 text-xs text-muted">Saved. The device is going to sleep; shake it to record again.</p>}
      {creating && (
        <CreateCourse
          onCancel={() => setCreating(false)}
          onCreated={async (classId) => {
            await api.setActiveClass(d.id, classId)
            setCreating(false)
            await onChange()
          }}
        />
      )}
      {active && !creating && (
        <Link to={`/c/${active.id}`} className="mt-3 inline-block text-sm underline">
          Open {active.code} →
        </Link>
      )}
      {a.error != null && (
        <div className="mt-3">
          <ErrorBox error={a.error} />
        </div>
      )}
    </div>
  )
}

/** One device recording waiting for a course. */
function InboxRow({ rec, classes, onChange }: { rec: InboxLecture; classes: ClassSummary[]; onChange: () => Promise<void> }) {
  const a = useAction()
  const [classId, setClassId] = useState('')
  const live = rec.status === 'live'
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        {live && <Pill status="recording" />}
        {live ? (
          <Link to={`/live/${rec.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline" title="Open the live captions">
            {rec.title}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium">{rec.title}</span>
        )}
        <span className="shrink-0 font-mono text-xs text-muted">{fmtTime(rec.durationS)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {fmtDate(rec.date)}
        {rec.deviceName ? ` · ${rec.deviceName}` : ''}
      </p>
      {rec.preview && <p className="mt-2 line-clamp-2 text-sm text-ink-2">{rec.preview}</p>}
      <div className="mt-3 flex gap-2">
        <select className={inputCls + ' min-w-0 flex-1 cursor-pointer'} value={classId} disabled={a.busy} onChange={(e) => setClassId(e.target.value)} aria-label={`Course for ${rec.title}`}>
          <option value="" disabled>
            Add to a course…
          </option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
        <Button
          variant="ink"
          size="sm"
          disabled={a.busy || !classId}
          onClick={() => void a.run(async () => {
            await api.assignLecture(rec.id, classId)
            await onChange()
          })}
        >
          {a.busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {!live && (
        <button
          type="button"
          className="mt-2 cursor-pointer text-xs text-muted underline"
          disabled={a.busy}
          onClick={() => {
            if (window.confirm(`Discard "${rec.title}"? Its transcript is deleted.`)) void a.run(async () => { await api.discardRecording(rec.id); await onChange() })
          }}
        >
          Discard
        </button>
      )}
      {a.error != null && (
        <div className="mt-3">
          <ErrorBox error={a.error} />
        </div>
      )}
    </div>
  )
}

/** Home: transcripts the device made that are not in a course yet, each with a course picker. */
export function NewRecordingsCard({ inbox, classes, onChange }: { inbox: ApiState<InboxLecture[]>; classes: ClassSummary[]; onChange: () => Promise<void> }) {
  const list = inbox.data ?? []
  const reload = async () => {
    await inbox.reload()
    await onChange()
  }
  return (
    <Panel title="New Recordings">
      {inbox.data === undefined ? (
        inbox.error ? <ErrorBox error={inbox.error} onRetry={() => void inbox.reload()} /> : <p className="text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">Nothing waiting. A transcript shows up here when a Slap finishes recording.</p>
      ) : (
        <div className="space-y-6">
          {list.map((r) => (
            <InboxRow key={r.id} rec={r} classes={classes} onChange={reload} />
          ))}
        </div>
      )}
    </Panel>
  )
}

/** Creates a course and puts the device's recording into it. */
function CreateCourse({ onCreated, onCancel }: { onCreated: (classId: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const a = useAction()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void a.run(async () => onCreated((await api.createClass(name.trim(), code.trim().toUpperCase())).id))
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-line bg-bg p-3">
      <input className={inputCls} placeholder="Course name, e.g. Machine Learning" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Course name" />
      <input className={inputCls + ' font-mono uppercase'} placeholder="Short code, e.g. CS229" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={12} aria-label="Course code" />
      {a.error != null && <ErrorBox error={a.error} />}
      <div className="flex items-center gap-3">
        <Button variant="ink" size="sm" disabled={a.busy || !name.trim() || !code.trim()}>
          {a.busy ? 'Creating…' : 'Create and record into it'}
        </Button>
        <button type="button" className="cursor-pointer text-xs text-muted underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
