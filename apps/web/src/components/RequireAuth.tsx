import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner } from './ui'

export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`
}

/** Guests are sent to /login with a return path. */
export function RequireAuth() {
  const { user, isPending } = useAuth()
  const location = useLocation()
  if (isPending)
    return (
      <div className="mx-auto max-w-md px-6 pt-24">
        <Spinner label="Checking session" />
      </div>
    )
  if (!user) return <Navigate to={loginPath(location.pathname + location.search + location.hash)} replace />
  return <Outlet />
}
