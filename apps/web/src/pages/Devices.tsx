// Device ownership UI: a device belongs to the signed-in user and records into its active class.
// Shared by the class list ("Your device" card) and the class home device panel.
import type { ClassSummary } from '@slap/contracts'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, ErrorBox, inputCls, Label, Panel, Pill } from '../components/ui'
import { api } from '../lib/api'
import { deviceLabel, useAction, useMyDevices } from '../lib/devices'
import type { DeviceSummary } from '../lib/types'

/** 6-character pair code form. `classId` makes that class the active class. */
export function PairForm({ classId, onPaired, onCancel }: { classId?: string; onPaired: () => Promise<void>; onCancel?: () => void }) {
  const [code, setCode] = useState('')
  const a = useAction()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await a.run(() => api.pairDevice(code.trim().toUpperCase(), classId))) {
      setCode('')
      await onPaired()
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm text-ink-2" htmlFor={classId ? `pair-code-${classId}` : 'pair-code'}>
        Enter the 6-character code shown on the device’s screen.
      </label>
      <div className="flex gap-2">
        <input
          id={classId ? `pair-code-${classId}` : 'pair-code'}
          className={inputCls + ' font-mono text-lg uppercase tracking-[0.3em]'}
          placeholder="AB12CD"
          value={code}
          maxLength={6}
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
        />
        <Button variant="ink" disabled={a.busy || code.length !== 6}>
          {a.busy ? 'Pairing…' : 'Pair'}
        </Button>
      </div>
      {a.error != null && <ErrorBox error={a.error} />}
      {onCancel && (
        <button type="button" className="cursor-pointer text-xs text-muted underline" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  )
}

/** `/classes`: pair a device, or pick the course it records into (or create one). */
export function YourDeviceCard({ classes, onClassesChanged }: { classes: ClassSummary[]; onClassesChanged: () => Promise<void> }) {
  const devices = useMyDevices()
  const [pairing, setPairing] = useState(false)
  const list = devices.data ?? []
  const reload = async () => {
    await devices.reload()
    await onClassesChanged()
  }

  return (
    <Panel
      title="Your device"
      action={
        list.length > 0 && !pairing ? (
          <button className="cursor-pointer text-xs text-muted underline hover:text-ink" onClick={() => setPairing(true)}>
            Pair another
          </button>
        ) : null
      }
    >
      {devices.data === undefined ? (
        devices.error ? <ErrorBox error={devices.error} onRetry={() => void devices.reload()} /> : <p className="text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm">
            <Pill status="unpaired" />
            <span>No device paired</span>
          </div>
          <PairForm onPaired={reload} />
        </>
      ) : (
        <div className="space-y-5">
          {list.map((d) => (
            <DeviceRow key={d.id} device={d} classes={classes} onChange={reload} />
          ))}
          {pairing && (
            <div className="border-t border-line pt-4">
              <PairForm
                onPaired={async () => {
                  setPairing(false)
                  await reload()
                }}
                onCancel={() => setPairing(false)}
              />
            </div>
          )}
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

  const unpair = () => {
    if (!window.confirm(`Unpair ${deviceLabel(d)}? It will show a pair code again.`)) return
    void a.run(async () => {
      await api.unpairDevice(d.id)
      await onChange()
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        <Pill status={d.state} />
        <span className="min-w-0 flex-1 truncate font-medium">{deviceLabel(d)}</span>
        <button className="cursor-pointer text-xs text-muted underline hover:text-ink disabled:opacity-45" onClick={unpair} disabled={a.busy || recording}>
          Unpair
        </button>
      </div>
      <label className="mt-4 block" htmlFor={`active-${d.id}`}>
        <Label>Recording into</Label>
      </label>
      <select
        id={`active-${d.id}`}
        className={inputCls + ' mt-2 cursor-pointer'}
        value={creating ? NEW : (active?.id ?? '')}
        disabled={a.busy || recording}
        onChange={(e) => choose(e.target.value)}
      >
        {!active && (
          <option value="" disabled>
            Pick a course…
          </option>
        )}
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
      {recording && <p className="mt-2 text-xs text-muted">Recording now. Stop the lecture to switch courses.</p>}
      {!active && !creating && <p className="mt-2 text-xs text-muted">The device ignores a slap until you pick a course.</p>}
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

/** Creates a course and makes it the device's active class. */
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
