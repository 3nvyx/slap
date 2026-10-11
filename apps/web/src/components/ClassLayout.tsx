import { useEffect, useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router'
import { api } from '../lib/api'
import { MOCK } from '../lib/env'
import type { ClassDetail } from '../lib/types'
import { useApi } from '../lib/useApi'
import { LogoArt } from './LogoArt'
import { cx, Dot, ErrorBox, Logo, Spinner } from './ui'

export interface ClassContext {
  classId: string
  detail: ClassDetail
  reloadClass: () => Promise<void>
}

export function useClass() {
  return useOutletContext<ClassContext>()
}

const NAV: Array<{ to: string; label: string; key: string; end?: boolean }> = [
  { to: '', label: 'Lectures', key: '01', end: true },
  { to: 'graph', label: 'Graph', key: '02' },
  { to: 'review', label: 'Review', key: '03' },
  { to: 'practice', label: 'Practice', key: '04' },
  { to: 'partner', label: 'Partner', key: '05' },
  { to: 'exam-topics', label: 'Exam topics', key: '06' },
  { to: 'today', label: 'Today', key: '07' },
  { to: 'pretest', label: 'Pretest', key: '08' },
  { to: 'lecturer', label: 'Lecturer', key: '09' },
]

export function DeviceChip({ device, folded }: { device: ClassDetail['device']; folded?: boolean }) {
  const state = device?.state ?? 'offline'
  const live = state === 'recording'
  const text = live ? 'Recording' : device ? state : 'None here'
  return (
    <div className={cx('flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2', folded && 'md:justify-center md:px-0 md:py-3')} title={folded ? `Device: ${text}` : undefined}>
      <Dot live={live} className={state === 'error' ? '!bg-bad' : state === 'idle' ? '!bg-good' : undefined} />
      <div className={cx('min-w-0', folded && 'md:sr-only')}>
        <div className="label leading-none">Device</div>
        <div className="mt-1 text-sm font-medium capitalize leading-none">{text}</div>
      </div>
    </div>
  )
}

// Whether the side bar is folded to a narrow rail (desktop only). Kept per browser; open on the server and until it is read.
const SIDEBAR_KEY = 'slap.sidebar'
const sidebarListeners = new Set<() => void>()
let sidebarFolded: boolean | undefined
let sidebarToggled = false // the width animates on a press, not when the stored choice is applied on load
function readFolded(): boolean {
  if (sidebarFolded === undefined) {
    try {
      sidebarFolded = localStorage.getItem(SIDEBAR_KEY) === 'folded'
    } catch {
      sidebarFolded = false // storage blocked
    }
  }
  return sidebarFolded
}
function setFolded(folded: boolean) {
  sidebarFolded = folded
  sidebarToggled = true
  try {
    localStorage.setItem(SIDEBAR_KEY, folded ? 'folded' : 'open')
  } catch {
    /* storage blocked */
  }
  sidebarListeners.forEach((fn) => fn())
}
function subscribeFolded(fn: () => void) {
  sidebarListeners.add(fn)
  return () => void sidebarListeners.delete(fn)
}

export function ClassLayout() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const detail = useApi(() => api.classDetail(classId), [classId])
  const classes = useApi(() => api.classes(), [])
  const folded = useSyncExternalStore(subscribeFolded, readFolded, () => false)

  // Keep the device chip and live status fresh.
  const reloadDetail = detail.reload
  useEffect(() => {
    const t = setInterval(() => void reloadDetail(), 8000)
    return () => clearInterval(t)
  }, [reloadDetail])

  // The side bar replaces the top bar inside a class. On a phone it is a strip across the top and never folds,
  // so every "folded" style below is md: only.
  return (
    <div className="min-h-dvh md:flex">
      <aside
        id="class-sidebar"
        className={cx(
          'border-b border-line md:sticky md:top-0 md:flex md:h-dvh md:shrink-0 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r',
          folded ? 'md:w-14' : 'md:w-56',
          sidebarToggled && 'md:transition-[width] md:duration-200 motion-reduce:transition-none',
        )}
      >
        <div className={cx('flex flex-wrap items-center gap-3 px-3 pt-3', folded ? 'md:flex-col md:px-2 md:pt-4' : 'md:px-4 md:pt-4')}>
          <Link to="/" aria-label="Slap home" className="shrink-0">
            <Logo className={cx('text-lg', folded && 'md:hidden')} />
            {folded && <LogoArt className="hidden h-7 w-auto md:block" />}
          </Link>
          {MOCK && <span className={cx('rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-bg', folded && 'md:hidden')}>mock</span>}
          <button
            type="button"
            onClick={() => setFolded(!folded)}
            aria-expanded={!folded}
            aria-controls="class-sidebar"
            aria-label={folded ? 'Open the side bar' : 'Fold the side bar'}
            title={folded ? 'Open the side bar' : 'Fold the side bar'}
            className={cx('hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-2 transition hover:bg-panel-2 hover:text-ink md:inline-flex', !folded && 'md:ml-auto')}
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
              <path d="M6 2.75v10.5" />
            </svg>
          </button>
          <label className="sr-only" htmlFor="class-switch">
            Class
          </label>
          <select
            id="class-switch"
            className={cx('h-9 min-w-0 flex-1 truncate rounded-md border border-line bg-panel px-2 text-sm font-medium md:basis-full', folded && 'md:hidden')}
            value={classId}
            onChange={(e) => (e.target.value === '__all' ? navigate('/courses') : navigate(`/c/${e.target.value}`))}
          >
            {(!classes.data || !classes.data.some((c) => c.id === classId)) && (
              <option value={classId}>
                {detail.data ? `${detail.data.class.code} · ${detail.data.class.name}` : 'Loading…'}
              </option>
            )}
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
            <option value="__all">All courses…</option>
          </select>
        </div>

        <nav className={cx('flex gap-1 overflow-x-auto p-3 md:flex-1 md:flex-col md:gap-0.5 md:overflow-x-visible', folded ? 'md:p-2' : 'md:p-4')}>
          {NAV.map((n) => (
            <NavLink
              key={n.label}
              to={n.to ? `/c/${classId}/${n.to}` : `/c/${classId}`}
              end={n.end}
              title={folded ? n.label : undefined}
              className={({ isActive }) =>
                cx(
                  'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                  folded && 'md:justify-center md:px-0',
                  isActive ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-panel-2',
                )
              }
            >
              <span className={cx('hidden font-mono md:inline', folded ? 'text-xs' : 'text-[10px] opacity-60')}>{n.key}</span>
              <span className={cx(folded && 'md:sr-only')}>{n.label}</span>
            </NavLink>
          ))}
          {detail.data && (
            <div className="ml-auto md:ml-0 md:mt-6">
              <DeviceChip device={detail.data.device} folded={folded} />
            </div>
          )}
          <Link
            to="/home"
            title={folded ? 'Home' : undefined}
            className={cx(
              'hidden items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-2 transition hover:bg-panel-2 md:mt-auto md:flex',
              folded && 'md:justify-center md:px-0',
            )}
          >
            <span aria-hidden="true">←</span>
            <span className={cx(folded && 'md:sr-only')}>Home</span>
          </Link>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          {detail.data ? (
            <Outlet context={{ classId, detail: detail.data, reloadClass: detail.reload } satisfies ClassContext} />
          ) : detail.error ? (
            <ErrorBox error={detail.error} onRetry={detail.reload} />
          ) : (
            <Spinner label="Loading class" />
          )}
        </div>
      </main>
    </div>
  )
}
