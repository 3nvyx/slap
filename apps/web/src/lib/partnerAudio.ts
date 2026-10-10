// One shared HTMLAudioElement for the partner's voice. iOS/Safari unlock playback per element once a user
// gesture has played it, so every clip reuses the same element; extra elements only warm the HTTP cache.
// A reply can be two clips (feedback, then the next question): they play back to back as one utterance.
import { useCallback, useEffect, useRef, useState } from 'react'
import { audioSrc } from './api'

/** `interrupted`: a newer play() or stop() took over; callers ignore it. */
export type PlayResult = 'played' | 'blocked' | 'error' | 'interrupted'

/** The clips of one partner reply, in playback order. */
export function replyClips(reply: { feedbackAudioUrl?: string | null; audioUrl?: string | null }): string[] {
  return [reply.feedbackAudioUrl, reply.audioUrl].filter((u): u is string => !!u)
}

export function useAudioPlayer(onEnded?: () => void) {
  const elRef = useRef<HTMLAudioElement | null>(null)
  const preloads = useRef(new Map<string, HTMLAudioElement>())
  const queue = useRef<string[]>([])
  const genRef = useRef(0)
  const active = useRef(false)
  const [playing, setPlaying] = useState(false)
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded

  /** Start fetching an audio URL as soon as it is known (the browser cache serves the real play). */
  const preload = useCallback((url: string | null | undefined) => {
    if (!url || preloads.current.has(url)) return
    const a = new Audio()
    a.preload = 'auto'
    a.src = audioSrc(url)
    a.load()
    preloads.current.set(url, a)
    if (preloads.current.size > 6) {
      const first = preloads.current.keys().next().value
      if (first) preloads.current.delete(first)
    }
  }, [])

  const el = useCallback(() => {
    if (elRef.current) return elRef.current
    const a = new Audio()
    a.preload = 'auto'
    const finish = () => {
      active.current = false
      setPlaying(false)
      endedRef.current?.()
    }
    // Next clip in the queue, or the end of the utterance. A clip that fails mid-stream is skipped.
    const advance = () => {
      if (!active.current) return
      const next = queue.current.shift()
      if (!next) return finish()
      preload(queue.current[0])
      a.src = audioSrc(next)
      a.play().catch((e: unknown) => {
        // A load failure also fires 'error' (handled there); an abort means stop() or a new play() took over.
        if (!a.error && !(e instanceof DOMException && e.name === 'AbortError')) advance()
      })
    }
    a.addEventListener('playing', () => setPlaying(true))
    a.addEventListener('ended', advance)
    a.addEventListener('error', () => {
      if (a.error) advance()
    })
    elRef.current = a
    return a
  }, [preload])

  /** Plays the clips in order. Resolves when the first one actually starts (or fails). */
  const play = useCallback(
    async (urls: string[]): Promise<PlayResult> => {
      const a = el()
      a.pause()
      queue.current = []
      active.current = false
      for (let i = 0; i < urls.length; i++) {
        a.src = audioSrc(urls[i])
        a.currentTime = 0
        // While this clip plays, warm the cache for the next one.
        preload(urls[i + 1])
        const gen = ++genRef.current
        try {
          await a.play()
          if (gen !== genRef.current) return 'interrupted'
          // Only now hand the rest to the 'ended' chain, so a failed start is retried here, not twice.
          queue.current = urls.slice(i + 1)
          active.current = true
          return 'played'
        } catch (e) {
          if (gen !== genRef.current || (e instanceof DOMException && e.name === 'AbortError')) return 'interrupted'
          if (e instanceof DOMException && e.name === 'NotAllowedError') {
            setPlaying(false)
            return 'blocked'
          }
          // Anything else (expired or unsupported clip): try the next one.
        }
      }
      setPlaying(false)
      return 'error'
    },
    [el, preload],
  )

  const stop = useCallback(() => {
    genRef.current++
    queue.current = []
    active.current = false
    elRef.current?.pause()
    setPlaying(false)
  }, [])

  useEffect(
    () => () => {
      queue.current = []
      active.current = false
      const a = elRef.current
      if (a) {
        a.pause()
        a.removeAttribute('src')
        a.load()
      }
      preloads.current.clear()
    },
    [],
  )

  return { playing, play, preload, stop }
}
