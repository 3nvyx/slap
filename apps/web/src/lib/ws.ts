import { useEffect, useRef, useState } from 'react'

export type SocketState = 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface ReconnectingSocketOptions {
  /** null disables the socket. Changing the url reconnects from scratch. */
  url: string | null
  /** Called on every (re)connect; `attempt` is 0 for the first connection. */
  onOpen?: (send: (msg: unknown) => void, attempt: number) => void
  onMessage: (data: unknown) => void
  /** Heartbeat message sent every `heartbeatMs` while open (Cloudflare closes idle sockets). */
  heartbeat?: unknown
  heartbeatMs?: number
  maxBackoffMs?: number
}

/** WebSocket with bounded exponential backoff + jitter, heartbeat and reconnect on tab return / network back. */
export function useReconnectingSocket(opts: ReconnectingSocketOptions): { state: SocketState; send: (msg: unknown) => void } {
  const { url, heartbeatMs = 25_000, maxBackoffMs = 10_000 } = opts
  const [state, setState] = useState<SocketState>(url ? 'connecting' : 'closed')
  const handlers = useRef(opts)
  handlers.current = opts
  const wsRef = useRef<WebSocket | null>(null)

  const send = (msg: unknown) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  useEffect(() => {
    if (!url) {
      setState('closed')
      return
    }
    let disposed = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let beatTimer: ReturnType<typeof setInterval> | undefined

    const connect = () => {
      if (disposed) return
      clearTimeout(retryTimer)
      setState(attempt === 0 ? 'connecting' : 'reconnecting')
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        scheduleRetry()
        return
      }
      wsRef.current = ws
      ws.onopen = () => {
        if (disposed) return
        setState('open')
        const sendNow = (msg: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))
        handlers.current.onOpen?.(sendNow, attempt)
        attempt = 0
        clearInterval(beatTimer)
        const beat = handlers.current.heartbeat
        if (beat !== undefined) beatTimer = setInterval(() => sendNow(beat), heartbeatMs)
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return
        try {
          handlers.current.onMessage(JSON.parse(ev.data))
        } catch {
          /* ignore malformed frames */
        }
      }
      ws.onclose = () => {
        clearInterval(beatTimer)
        if (wsRef.current === ws) wsRef.current = null
        if (!disposed) scheduleRetry()
      }
      ws.onerror = () => ws.close()
    }

    const scheduleRetry = () => {
      attempt++
      setState('reconnecting')
      const base = Math.min(maxBackoffMs, 500 * 2 ** Math.min(attempt - 1, 6))
      retryTimer = setTimeout(connect, base / 2 + Math.random() * (base / 2))
    }

    // Reconnect immediately when the tab comes back or the network returns.
    const kick = () => {
      if (document.visibilityState !== 'visible') return
      if (!wsRef.current || wsRef.current.readyState > WebSocket.OPEN) {
        attempt = Math.max(attempt, 1)
        connect()
      }
    }
    document.addEventListener('visibilitychange', kick)
    window.addEventListener('online', kick)

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(beatTimer)
      document.removeEventListener('visibilitychange', kick)
      window.removeEventListener('online', kick)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [url, heartbeatMs, maxBackoffMs])

  return { state, send }
}
