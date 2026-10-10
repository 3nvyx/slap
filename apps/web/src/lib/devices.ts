// Device hooks shared by the class list and class home (pages/Devices.tsx holds the components).
import { useEffect, useState } from 'react'
import { api } from './api'
import type { DeviceSummary } from './types'
import { useApi } from './useApi'

/** The caller's devices, refreshed every 8 s for the state chip. */
export function useMyDevices() {
  const devices = useApi(() => api.devices(), [])
  const reload = devices.reload
  useEffect(() => {
    const t = setInterval(() => void reload(), 8000)
    return () => clearInterval(t)
  }, [reload])
  return devices
}

/** Runs one async action at a time and keeps its error. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

export const deviceLabel = (d: Pick<DeviceSummary, 'name'>) => d.name || 'Your Slap'
