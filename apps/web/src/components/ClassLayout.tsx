import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { ClassDetail } from '../lib/types'
import { useApi } from '../lib/useApi'
import { TopBar } from './Shell'
import { cx, Dot, ErrorBox, Label, Spinner } from './ui'

export interface ClassContext {
  classId: string
  detail: ClassDetail
  reloadClass: () => Promise<void>
}

export function useClass() {
  return useOutletContext<ClassContext>()
}

const NAV = [
  { to: '', label: 'Lectures', key: '01', end: true },
  { to: 'graph', label: 'Graph', key: '02' },
  { to: 'review', label: 'Review', key: '03' },
  { to: 'practice', label: 'Practice', key: '04' },
  { to: 'partner', label: 'Partner', key: '05' },
  { to: 'exam-topics', label: 'Exam topics', key: '06' },
  { to: 'today', label: 'Today', key: '07' },
]

export function DeviceChip({ device }: { device: ClassDetail['device'] }) {
  const state = device.paired ? (device.state ?? 'idle') : 'unpaired'
  const live = state === 'recording'
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2">
      <Dot live={live} className={state === 'error' ? '!bg-bad' : state === 'idle' ? '!bg-good' : undefined} />
      <div className="min-w-0">
        <div className="label leading-none">Device</div>
        <div className="mt-1 text-sm font-medium capitalize leading-none">{live ? 'Recording' : device.paired ? state : 'None here'}</div>
      </div>
    </div>
  )
}

export function ClassLayout() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const detail = useApi(() => api.classDetail(classId), [classId])
  const me = useApi(() => api.me(), [])

  // Keep the device chip and live status fresh.
  const reloadDetail = detail.reload
  useEffect(() => {
    const t = setInterval(() => void reloadDetail(), 8000)
    return () => clearInterval(t)
  }, [reloadDetail])

  return (
    <div className="min-h-dvh">
      <TopBar>
        <span className="hidden h-6 w-px bg-line sm:block" />
        <label className="sr-only" htmlFor="class-switch">
          Class
        </label>
        <select
          id="class-switch"
          className="h-9 min-w-0 max-w-[22rem] truncate rounded-md border border-line bg-panel px-2 text-sm font-medium"
          value={classId}
          onChange={(e) => (e.target.value === '__all' ? navigate('/classes') : navigate(`/c/${e.target.value}`))}
        >
          {!me.data && <option value={classId}>{detail.data?.class.name ?? 'Loading…'}</option>}
          {me.data?.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
          <option value="__all">All classes…</option>
        </select>
      </TopBar>

      <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row">
        <aside className="border-b border-line md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:w-56 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto p-3 md:flex-col md:gap-0.5 md:p-4">
            <Label className="mb-2 hidden md:block">{detail.data ? detail.data.class.code : 'Class'}</Label>
            {NAV.map((n) => (
              <NavLink
                key={n.label}
                to={n.to ? `/c/${classId}/${n.to}` : `/c/${classId}`}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                    isActive ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-panel-2',
                  )
                }
              >
                <span className="hidden font-mono text-[10px] opacity-60 md:inline">{n.key}</span>
                {n.label}
              </NavLink>
            ))}
            {detail.data && (
              <div className="ml-auto md:ml-0 md:mt-6">
                <DeviceChip device={detail.data.device} />
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
          {detail.data ? (
            <Outlet context={{ classId, detail: detail.data, reloadClass: detail.reload } satisfies ClassContext} />
          ) : detail.error ? (
            <ErrorBox error={detail.error} onRetry={detail.reload} />
          ) : (
            <Spinner label="Loading class" />
          )}
        </main>
      </div>
    </div>
  )
}
