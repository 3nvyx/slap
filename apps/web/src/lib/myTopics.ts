import { useSyncExternalStore } from 'react'

/** A topic the student added to a course's exam topics by hand, kept in this browser (there are no accounts).
 *  The page shows these above the topics it ranks from the lectures. */
export interface MyTopic {
  id: string
  name: string
  createdAt: string
}

const keyOf = (classId: string) => `slap.examTopics.${classId}`
const listeners = new Set<() => void>()
const cache = new Map<string, MyTopic[]>()
const NONE: MyTopic[] = []

function read(classId: string): MyTopic[] {
  const hit = cache.get(classId)
  if (hit) return hit
  let list: MyTopic[] = []
  try {
    const raw = localStorage.getItem(keyOf(classId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    list = Array.isArray(parsed) ? parsed.filter((t): t is MyTopic => !!t && typeof t.id === 'string' && typeof t.name === 'string') : []
  } catch {
    list = []
  }
  cache.set(classId, list)
  return list
}

function write(classId: string, next: MyTopic[]) {
  cache.set(classId, next)
  try {
    localStorage.setItem(keyOf(classId), JSON.stringify(next))
  } catch {
    /* storage blocked: the list still lives for this page view */
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The student's own topics for a course, newest first. Empty on the server and until the browser has taken the page over. */
export function useMyTopics(classId: string): MyTopic[] {
  return useSyncExternalStore(subscribe, () => read(classId), () => NONE)
}

export function addMyTopic(classId: string, name: string) {
  const n = name.trim()
  if (!n) return
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  write(classId, [{ id, name: n, createdAt: new Date().toISOString() }, ...read(classId)])
}

export function removeMyTopic(classId: string, id: string) {
  write(classId, read(classId).filter((t) => t.id !== id))
}
