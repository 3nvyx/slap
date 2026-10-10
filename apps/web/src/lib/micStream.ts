// Laptop-microphone fallback for when the device isn't available: capture the browser mic, downsample to
// 16 kHz mono int16 LE and send 3,200-byte (100 ms) binary frames to /ws/lecture/:id/audio, like the device does.
import { AUDIO_FRAME_BYTES, AUDIO_SAMPLE_RATE } from '@slap/contracts'
import { useEffect, useState } from 'react'
import { getToken } from './auth'
import { MOCK, wsUrl } from './env'

export type MicState = 'off' | 'starting' | 'live' | 'reconnecting' | 'error'

const FRAME_SAMPLES = AUDIO_FRAME_BYTES / 2 // 1600 samples = 100 ms at 16 kHz

// Tiny worklet: forwards each 128-sample render quantum (channel 0) to the main thread.
const WORKLET = `
class SlapTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('slap-tap', SlapTap)
`

/** Streaming box-filter downsampler from the context rate to 16 kHz, emitting 1,600-sample int16 LE frames. */
function makeEncoder(inputRate: number, onFrame: (buf: ArrayBuffer) => void) {
  const ratio = inputRate / AUDIO_SAMPLE_RATE
  let pos = 0 // fractional read position into the current chunk
  let frame = new DataView(new ArrayBuffer(AUDIO_FRAME_BYTES))
  let filled = 0
  return (chunk: Float32Array) => {
    while (pos < chunk.length) {
      const start = Math.floor(pos)
      const end = Math.min(chunk.length, Math.max(start + 1, Math.floor(pos + ratio)))
      let sum = 0
      for (let i = start; i < end; i++) sum += chunk[i]
      const s = Math.max(-1, Math.min(1, sum / (end - start)))
      frame.setInt16(filled * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      if (++filled === FRAME_SAMPLES) {
        onFrame(frame.buffer as ArrayBuffer)
        frame = new DataView(new ArrayBuffer(AUDIO_FRAME_BYTES))
        filled = 0
      }
      pos += ratio
    }
    pos -= chunk.length
  }
}

/** While `enabled`, streams the laptop mic to the lecture's audio socket. Returns state, 0..1 level and error. */
export function useMicStreamer(lectureId: string | null, enabled: boolean) {
  const [state, setState] = useState<MicState>('off')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !lectureId) {
      setState('off')
      setLevel(0)
      return
    }
    let disposed = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let peak = 0
    const meter = setInterval(() => {
      setLevel(Math.min(1, peak * 1.6))
      peak *= 0.5
    }, 80)

    const send = (buf: ArrayBuffer) => {
      if (MOCK) return
      if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < AUDIO_FRAME_BYTES * 50) ws.send(buf)
    }

    const connect = async () => {
      if (disposed) return
      if (MOCK) {
        setState('live') // mock: pretend the socket is open
        return
      }
      const token = await getToken()
      if (disposed) return
      const sock = new WebSocket(wsUrl(`/ws/lecture/${encodeURIComponent(lectureId)}/audio?token=${encodeURIComponent(token ?? '')}`))
      sock.binaryType = 'arraybuffer'
      ws = sock
      sock.onopen = () => {
        if (disposed) return
        attempt = 0
        setState('live')
        setError(null)
      }
      sock.onclose = (ev) => {
        if (disposed || ws !== sock) return
        ws = null
        attempt++
        setState('reconnecting')
        if (ev.reason) setError(ev.reason)
        const delay = Math.min(8000, 500 * 2 ** Math.min(attempt - 1, 4))
        retry = setTimeout(() => void connect(), delay)
      }
      sock.onerror = () => sock.close()
    }

    const start = async () => {
      setState('starting')
      setError(null)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        if (disposed) return
        ctx = new AudioContext()
        const encode = makeEncoder(ctx.sampleRate, send)
        const onChunk = (chunk: Float32Array) => {
          let sum = 0
          for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
          peak = Math.max(peak, Math.sqrt(sum / chunk.length) * 4)
          encode(chunk)
        }
        const source = ctx.createMediaStreamSource(stream)
        if (ctx.audioWorklet) {
          const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
          await ctx.audioWorklet.addModule(url)
          URL.revokeObjectURL(url)
          if (disposed) return
          const node = new AudioWorkletNode(ctx, 'slap-tap')
          node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data)
          // Route through a muted gain to the destination so the graph is always pulled.
          const mute = ctx.createGain()
          mute.gain.value = 0
          source.connect(node).connect(mute).connect(ctx.destination)
        } else {
          // Fallback for browsers without AudioWorklet.
          const proc = ctx.createScriptProcessor(4096, 1, 1)
          proc.onaudioprocess = (e) => onChunk(e.inputBuffer.getChannelData(0).slice(0))
          source.connect(proc)
          proc.connect(ctx.destination) // ScriptProcessor only runs while connected; it outputs silence
        }
        await connect()
      } catch (e) {
        if (disposed) return
        setState('error')
        setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : e instanceof Error ? e.message : String(e))
      }
    }
    void start()

    return () => {
      disposed = true
      clearTimeout(retry)
      clearInterval(meter)
      const sock = ws
      ws = null
      if (sock) {
        sock.onclose = null
        sock.close(1000, 'mic off')
      }
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => {})
      setLevel(0)
    }
  }, [enabled, lectureId])

  return { state, level, error }
}
