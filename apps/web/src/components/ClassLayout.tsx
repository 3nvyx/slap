import { useEffect } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ClassDetail } from '../lib/types'
import { useApi } from '../lib/useApi'
import { loginPath } from './RequireAuth'
import { TopBar } from './Shell'
import { ButtonLink, cx, Dot, ErrorBox, Label, Spinner } from './ui'

export interface ClassContext {
  classId: string
  detail: ClassDetail
  /** Read-only visitor of a guest-access class: no cards, practice, recall or mastery. */
  guest: boolean
  reloadClass: () => Promise<void>
}

export function useClass() {
  return useOutletContext<ClassContext>()
}

/** `account`: needs a signed-in member (guests are sent to sign in and come back here). `owner`: lecturer only. */
const NAV: Array<{ to: string; label: string; key: string; end?: boolean; account?: boolean; owner?: boolean }> = [
  { to: '', label: 'Lectures', key: '01', end: true },
  { to: 'graph', label: 'Graph', key: '02' },
  { to: 'review', label: 'Review', key: '03', account: true },
  { to: 'practice', label: 'Practice', key: '04', account: true },
  { to: 'partner', label: 'Partner', key: '05', account: true },
  { to: 'exam-topics', label: 'Exam topics', key: '06' },
  { to: 'today', label: 'Today', key: '07', account: true },
  { to: 'pretest', label: 'Pretest', key: '08', account: true },
  { to: 'lecturer', label: 'Lecturer', key: '09', account: true, owner: true },
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
  const location = useLocation()
  const { user, isPending } = useAuth()
  // The API decides who may read the class: members always, guests when the class allows it.
  const detail = useApi(() => api.classDetail(classId), [classId, user?.id], { enabled: !isPending })
  const me = useApi(() => api.me(), [user?.id], { enabled: !!user })

  // Keep the device chip and live status fresh.
  const reloadDetail = detail.reload
  useEffect(() => {
    if (isPending) return
    const t = setInterval(() => void reloadDetail(), 8000)
    return () => clearInterval(t)
  }, [reloadDetail, isPending])

  const guest = detail.data?.class.role === 'guest'
  const here = location.pathname + location.search + location.hash

  // Not readable without an account: go sign in and come back.
  if (!isPending && !user && detail.error instanceof ApiError && (detail.error.status === 401 || detail.error.status === 403)) {
    return <Navigate to={loginPath(here)} replace />
  }

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
          {(!me.data || !me.data.classes.some((c) => c.id === classId)) && (
            <option value={classId}>
              {detail.data ? `${detail.data.class.code} · ${detail.data.class.name}` : 'Loading…'}
            </option>
          )}
          {me.data?.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
          {user && <option value="__all">All classes…</option>}
        </select>
      </TopBar>

      {guest && detail.data && (
        <div className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm md:px-6">
            <span className="label">Guest</span>
            <span className="min-w-0 flex-1 text-ink-2">
              You’re browsing <span className="font-medium text-ink">{detail.data.class.code}</span> read-only. Sign in to review cards, practise and track what you know.
            </span>
            <ButtonLink variant="ink" to={loginPath(here)} className="!h-8 !px-3">
              Sign in
            </ButtonLink>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row">
        <aside className="border-b border-line md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:w-56 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto p-3 md:flex-col md:gap-0.5 md:p-4">
            <Label className="mb-2 hidden md:block">{detail.data ? detail.data.class.code : 'Class'}</Label>
            {NAV.filter((n) => !n.owner || detail.data?.class.role === 'owner').map((n) => {
              const target = n.to ? `/c/${classId}/${n.to}` : `/c/${classId}`
              const locked = guest && n.account
              return (
                <NavLink
                  key={n.label}
                  to={locked ? loginPath(target) : target}
                  end={n.end}
                  title={locked ? 'Sign in to use this' : undefined}
                  className={({ isActive }) =>
                    cx(
                      'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                      isActive && !locked ? 'bg-ink text-bg' : locked ? 'text-muted hover:bg-panel-2' : 'text-ink-2 hover:bg-panel-2',
                    )
                  }
                >
                  <span className="hidden font-mono text-[10px] opacity-60 md:inline">{n.key}</span>
                  {n.label}
                  {locked && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wider opacity-70" aria-hidden>
                      sign in
                    </span>
                  )}
                </NavLink>
              )
            })}
            {detail.data && (
              <div className="ml-auto md:ml-0 md:mt-6">
                <DeviceChip device={detail.data.device} />
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
          {detail.data ? (
            <Outlet context={{ classId, detail: detail.data, guest, reloadClass: detail.reload } satisfies ClassContext} />
          ) : detail.error ? (
            <div className="space-y-4">
              <ErrorBox error={detail.error} onRetry={detail.reload} />
              {user && detail.error instanceof ApiError && detail.error.status === 403 && (
                <p className="text-sm text-muted">
                  You’re not a member of this class. Join it with its code from{' '}
                  <ButtonLink to="/classes" className="!h-7 !px-2 align-middle">
                    your classes
                  </ButtonLink>
                  .
                </p>
              )}
            </div>
          ) : (
            <Spinner label="Loading class" />
          )}
        </main>
      </div>
    </div>
  )
}
