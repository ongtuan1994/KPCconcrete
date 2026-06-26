/* Tracks which notifications the user has dismissed (clicked).

   Each notification carries a `signature` describing its current state (e.g. the
   pending count). A notice is hidden once its signature has been marked seen, and
   re-appears automatically when the signature changes (new activity). Persisted
   to localStorage so a dismissal survives refreshes. */

import { useSyncExternalStore } from 'react'

const KEY = 'kpc.notiSeen.v1'

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

let state: Record<string, string> = read()
const listeners = new Set<() => void>()

function commit(next: Record<string, string>) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  listeners.forEach((l) => l())
}

/** Mark a notification (by id) as seen at its current signature. */
export function markNotiSeen(id: string, signature: string) {
  if (state[id] === signature) return
  commit({ ...state, [id]: signature })
}

export function useNotiSeen(): Record<string, string> {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => state,
    () => state,
  )
}
