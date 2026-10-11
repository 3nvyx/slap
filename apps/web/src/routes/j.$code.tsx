import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router'
import { ButtonLink, ErrorBox, Label, Logo, Spinner } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useApi } from '../lib/useApi'

const POLL_MS = 5000

export default function JoinPage() {
  const { code = '' } = useParams()
  const join = useApi(() => api.join(code), [code])

  // Students often scan before the lecturer presses start: keep checking and open the captions by ourselves.
  const waiting = !!join.data && !join.data.live
  const reload = join.reload
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => void reload(), POLL_MS)
    return () => clearInterval(t)
  }, [waiting, reload])

  if (join.data?.live && join.data.lectureId) return <Navigate to={`/live/${join.data.lectureId}`} replace />

  return (
    <div className="dotgrid grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-md border border-line bg-panel p-8">
        <a href="/">
          <Logo className="text-lg" />
        </a>
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
                <span className="font-medium text-ink">{join.data.className}</span> isn’t recording. Keep this page open: captions open here by themselves as soon as the lecturer starts.
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span className="pulse inline-block size-1.5 rounded-full bg-accent" /> Checking every few seconds
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ButtonLink variant="ink" to={`/c/${join.data.classId}`}>
                  Open class notes
                </ButtonLink>
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
