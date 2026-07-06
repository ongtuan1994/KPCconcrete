/* Optional Supabase backend for cross-browser / cross-device sync.

   The whole app was localStorage-only (data lived in one browser). To share data
   across browsers, each localStorage "store" (createdDocs, attendance, …) is
   mirrored to ONE JSON blob row in a Supabase table (`app_state`), with realtime
   push so other open tabs update live.

   Configure by setting two env vars (Vite exposes only VITE_-prefixed ones):
     VITE_SUPABASE_URL      = https://<project>.supabase.co
     VITE_SUPABASE_ANON_KEY = <anon public key>
   When they are ABSENT the client is null and every sync call is a no-op, so the
   app keeps working exactly as before (localStorage only). See SUPABASE_SETUP.md. */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null
export const SUPABASE_ENABLED = !!supabase

const TABLE = 'app_state'

export interface RemoteSync<T> {
  /** Fetch the shared row (or seed it from local), then live-subscribe. */
  start: () => void
  /** Debounced upsert of the blob to the shared row. */
  push: (data: T) => void
}

/** Two-way sync of a JSON blob kept in `app_state` row `id = rowId`.
    No-op (safe) when Supabase isn't configured. */
export function createRemoteSync<T>(rowId: string, onRemote: (data: T) => void, getLocal: () => T): RemoteSync<T> {
  if (!supabase) return { start: () => {}, push: () => {} }
  const sb = supabase
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: T | null = null
  let lastPushAt = 0

  const flush = () => {
    if (pending === null) return
    const doc = pending
    pending = null
    lastPushAt = Date.now()
    sb.from(TABLE)
      .upsert({ id: rowId, doc, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn(`[supabase] push ${rowId}:`, error.message) })
  }

  const push = (data: T) => {
    pending = data
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 600)
  }

  const start = () => {
    sb.from(TABLE).select('doc').eq('id', rowId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.warn(`[supabase] load ${rowId}:`, error.message); return }
        if (data?.doc) onRemote(data.doc as T)
        else push(getLocal()) /* first run — seed the shared row from this browser */
      })
    sb.channel(`app_state:${rowId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `id=eq.${rowId}` }, (payload) => {
        const doc = (payload.new as { doc?: T } | null)?.doc
        /* Ignore the echo of our own just-pushed write. */
        if (doc && Date.now() - lastPushAt > 1000) onRemote(doc)
      })
      .subscribe()
  }

  return { start, push }
}
