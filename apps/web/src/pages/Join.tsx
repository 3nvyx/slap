import { Link, Navigate, useParams } from 'react-router-dom'
import { loginPath } from '../components/RequireAuth'
import { ButtonLink, ErrorBox, Label, Logo, Spinner } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'

export function JoinPage() {
  const { code = '' } = useParams()
  const join = useApi(() => api.join(code), [code])
  const { user } = useAuth()

  if (join.data?.live && join.data.lectureId) return <Navigate to={`/live/${join.data.lectureId}`} replace />

  return (
    <div className="dotgrid grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-md border border-line bg-panel p-8">
        <Link to="/">
          <Logo className="text-lg" />
        </Link>
        <Label className="mt-8">Class code</Label>
        <div className="mt-1 font-mono text-2xl font-semibold uppercase">{code}</div>
        <div className="mt-6">
          {join.error ? (
            join.error instanceof ApiError && join.error.status === 404 ? (
              <p className="text-ink-2">No class uses this code. Check the sticker on the device.</p>
            ) : (
              <ErrorBox error={join.error} onRetry={join.reload} />
            )
          ) : !join.data ? (
            <Spinner label="Looking for a live lecture" />
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">No live lecture right now</h1>
              <p className="mt-2 text-ink-2">
                <span className="font-medium text-ink">{join.data.className}</span> isn’t recording. Captions appear here as soon as the lecturer starts a session.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ButtonLink variant="ink" to={user || join.data.guestAccess ? `/c/${join.data.classId}` : loginPath(`/c/${join.data.classId}`)}>
                  {user ? 'Open class notes' : join.data.guestAccess ? 'Browse notes and graph' : 'Sign in for notes and practice'}
                </ButtonLink>
                {!user && join.data.guestAccess && (
                  <ButtonLink to={loginPath(`/c/${join.data.classId}`)}>Sign in</ButtonLink>
                )}
                <button className="h-10 cursor-pointer rounded-md px-4 text-sm text-ink-2 hover:bg-panel-2" onClick={() => void join.reload()}>
                  Check again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
