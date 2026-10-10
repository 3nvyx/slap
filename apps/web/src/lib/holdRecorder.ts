// Hold-to-talk recorder for the learning partner: MediaRecorder (webm/opus where supported) with a live
// 0..1 level from an AnalyserNode, a hard length cap, and the mic released after a short idle period.
import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported' | 'error'

export interface Recording {
  blob: Blob
  mime: string
  filename: string
  ms: number
  /** True when the cap stopped the recording rather than the user. */
  capped: boolean
}

const MIME_PREFERENCE = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']
const RELEASE_AFTER_MS = 30_000

export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? ''
}

function extFor(mime: string): string {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mpeg')) return 'mp3'
  return 'webm'
}

function micError(e: unknown): { state: RecorderState; message: string } {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return { state: 'denied', message: 'Microphone access is blocked. Allow it in your browser’s site settings, or type your answer below.' }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { state: 'error', message: 'No microphone found. Type your answer below.' }
  if (name === 'NotReadableError') return { state: 'error', message: 'The microphone is in use by another app.' }
  return { state: 'error', message: e instanceof Error ? e.message : String(e) }
}

/** False on insecure origins (e.g. a phone on http://<lan-ip>) and in browsers without MediaRecorder. */
function canRecord(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined'
}

export function useHoldRecorder({ maxMs = 60_000, onDone }: { maxMs?: number; onDone: (r: Recording) => void }) {
  const [state, setState] = useState<RecorderState>(() => (canRecord() ? 'idle' : 'unsupported'))
  const [level, setLevel] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(() =>
    canRecord() ? null : 'Recording needs HTTPS (or localhost) and a browser with microphone support. Type your answer below.',
  )

  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const wantRef = useRef(false)
  const cappedRef = useRef(false)
  const rafRef = useRef(0)
  const releaseRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    analyserRef.current = null
    void ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }, [])

  const getStream = useCallback(async (): Promise<MediaStream> => {
    const live = streamRef.current
    if (live && live.getAudioTracks().some((t) => t.readyState === 'live')) return live
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    streamRef.current = stream
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        void ctx.resume().catch(() => {})
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        ctx.createMediaStreamSource(stream).connect(analyser)
        ctxRef.current = ctx
        analyserRef.current = analyser
      }
    } catch {
      /* level meter is optional */
    }
    return stream
  }, [])

  const stop = useCallback((opts: { capped?: boolean } = {}) => {
    wantRef.current = false
    cappedRef.current = !!opts.capped
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  const start = useCallback(async () => {
    if (recRef.current && recRef.current.state !== 'inactive') return
    if (!canRecord()) {
      setState('unsupported')
      return
    }
    wantRef.current = true
    clearTimeout(releaseRef.current)
    setError(null)
    let stream: MediaStream
    try {
      if (!streamRef.current) setState('requesting')
      stream = await getStream()
    } catch (e) {
      wantRef.current = false
      const err = micError(e)
      setState(err.state)
      setError(err.message)
      return
    }
    // Released (or permission prompt answered) before we got the stream: don't start a stray recording.
    if (!wantRef.current) {
      setState('idle')
      releaseRef.current = setTimeout(release, RELEASE_AFTER_MS)
      return
    }
    const mime = pickMime()
    let rec: MediaRecorder
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch (e) {
      setState('error')
      setError(micError(e).message)
      return
    }
    const chunks: Blob[] = []
    const startedAt = performance.now()
    cappedRef.current = false
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data)
    }
    rec.onstop = () => {
      cancelAnimationFrame(rafRef.current)
      recRef.current = null
      setLevel(0)
      setElapsedMs(0)
      setState('idle')
      const type = rec.mimeType || mime || chunks[0]?.type || 'audio/webm'
      onDoneRef.current({
        blob: new Blob(chunks, { type }),
        mime: type,
        filename: `answer.${extFor(type)}`,
        ms: performance.now() - startedAt,
        capped: cappedRef.current,
      })
      releaseRef.current = setTimeout(release, RELEASE_AFTER_MS)
    }
    recRef.current = rec
    rec.start(250)
    setState('recording')

    const buf = new Float32Array(1024)
    let lastPaint = 0
    let smooth = 0
    const tick = (now: number) => {
      const elapsed = now - startedAt
      if (elapsed >= maxMs) {
        stop({ capped: true })
        return
      }
      const an = analyserRef.current
      if (an) {
        an.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        smooth = Math.max(Math.min(1, rms * 6), smooth * 0.85)
      }
      if (now - lastPaint > 50) {
        lastPaint = now
        setLevel(smooth)
        setElapsedMs(elapsed)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [getStream, maxMs, release, stop])

  useEffect(
    () => () => {
      wantRef.current = false
      cancelAnimationFrame(rafRef.current)
      clearTimeout(releaseRef.current)
      const rec = recRef.current
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null
        rec.stop()
      }
      release()
    },
    [release],
  )

  return { state, level, elapsedMs, error, start, stop }
}
