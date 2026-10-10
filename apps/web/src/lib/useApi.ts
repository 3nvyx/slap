import { useCallback, useEffect, useRef, useState } from 'react'

export interface ApiState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => Promise<void>
  setData: (updater: T | ((prev: T | undefined) => T)) => void
}

/** Runs `fn` when deps change; keeps the last data while reloading (no flicker on polls). */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[], opts: { enabled?: boolean } = {}): ApiState<T> {
  const enabled = opts.enabled ?? true
  const [data, setDataState] = useState<T | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(enabled)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const gen = useRef(0)

  const reload = useCallback(async () => {
    const my = ++gen.current
    setLoading(true)
    try {
      const result = await fnRef.current()
      if (my === gen.current) {
        setDataState(result)
        setError(null)
      }
    } catch (err) {
      if (my === gen.current) setError(err)
    } finally {
      if (my === gen.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setDataState(undefined)
    void reload()
    return () => {
      gen.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled])

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater))
  }, [])

  return { data, error, loading, reload, setData }
}
