import { useSyncExternalStore } from 'react'

/** A to-do the student wrote themselves, kept in this browser (there are no accounts). The dashboard shows
 *  these above the ones it works out from the study data. */
export interface UserTodo {
  id: string
  title: string
  /** The course it belongs to, if one was picked. */
  classId: string | null
  createdAt: string
}

const KEY = 'slap.todos'
const listeners = new Set<() => void>()
let cache: UserTodo[] | null = null
const NONE: UserTodo[] = []

function read(): UserTodo[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    cache = Array.isArray(parsed) ? parsed.filter((t): t is UserTodo => !!t && typeof t.id === 'string' && typeof t.title === 'string') : []
  } catch {
    cache = []
  }
  return cache
}

function write(next: UserTodo[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: the list still lives for this page view */
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The student's own to-dos, newest first. Empty on the server and until the browser has taken the page over. */
export function useUserTodos(): UserTodo[] {
  return useSyncExternalStore(subscribe, read, () => NONE)
}

export function addTodo(title: string, classId: string | null) {
  const t = title.trim()
  if (!t) return
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  write([{ id, title: t, classId, createdAt: new Date().toISOString() }, ...read()])
}

export function removeTodo(id: string) {
  write(read().filter((t) => t.id !== id))
}
