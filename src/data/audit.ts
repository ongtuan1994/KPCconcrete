/* Audit request store.

   Auditors (and Admins) flag individual transactions across the Sales,
   Purchasing and Customers menus via a magnifier button. Each flagged record is
   collected here as an "audit request" shown on the รายงาน Audit page, where it
   can be marked Verified once reviewed. Persisted to localStorage. */

import { useSyncExternalStore } from 'react'
import { currentUserName } from './auth'

export type AuditCategory = 'sales' | 'purchasing' | 'customers'

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  sales: 'การขาย · Sales',
  purchasing: 'การซื้อ / การจ่าย · Purchasing',
  customers: 'ลูกค้า · Customers',
}

/** The descriptor a page passes when flagging a row for audit. */
export interface AuditItemInput {
  category: AuditCategory
  group: string   /* record type, e.g. 'ใบกำกับภาษี' */
  ref: string     /* document no. / entity id */
  label: string   /* primary display label */
  sub: string     /* context line — customer · amount · date */
  route: string   /* page to open when viewing the record */
}

export interface AuditItem extends AuditItemInput {
  key: string            /* stable identity: category|group|ref */
  addedBy: string        /* auditor who requested the check */
  addedAt: string        /* ISO timestamp */
  verified: boolean
  verifiedBy?: string
  verifiedAt?: string
  /* "ส่งคำขอ" — request forwarded to the Accountant role. */
  requested?: boolean
  requestedBy?: string
  requestedAt?: string
}

/** Stable identity for a flagged record so it isn't added twice. */
export function auditKey(i: AuditItemInput): string {
  return `${i.category}|${i.group}|${i.ref}`
}

const KEY = 'kpc.audit.v1'

function read(): AuditItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as AuditItem[]) : []
  } catch {
    return []
  }
}

let state: AuditItem[] = read()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function commit(next: AuditItem[]) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  notify()
}

/** Add a record to the audit list (no-op if already flagged). */
export function addAuditItem(input: AuditItemInput) {
  const key = auditKey(input)
  if (state.some((i) => i.key === key)) return
  const item: AuditItem = { ...input, key, addedBy: currentUserName(), addedAt: new Date().toISOString(), verified: false }
  commit([item, ...state])
}

/** Remove a record from the audit list by key. */
export function removeAuditItem(key: string) {
  commit(state.filter((i) => i.key !== key))
}

/** Add a free-text audit note (not tied to a source document). Generates a
    unique ref so each note is its own row. */
export function addAuditNote(input: { category: AuditCategory; title: string; text: string }) {
  const ref = `NOTE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
  addAuditItem({
    category: input.category,
    group: 'บันทึกอิสระ',
    ref,
    label: input.title.trim() || 'บันทึกตรวจสอบ',
    sub: input.text.trim(),
    route: '/audit-report',
  })
}

/** Mark a flagged record verified (or clear the verification). */
export function setAuditVerified(key: string, verified: boolean) {
  commit(state.map((i) =>
    i.key === key
      ? { ...i, verified, verifiedBy: verified ? currentUserName() : undefined, verifiedAt: verified ? new Date().toISOString() : undefined }
      : i,
  ))
}

export function clearVerifiedAuditItems() {
  commit(state.filter((i) => !i.verified))
}

/** Forward all pending (unverified) items as a request to the Accountant role.
    Stamps requestedBy/At so the accountant's notification reflects it.
    Returns the number of items included in the request. */
export function sendAuditRequest(): number {
  const by = currentUserName()
  const at = new Date().toISOString()
  let count = 0
  const next = state.map((i) => {
    if (i.verified) return i
    count += 1
    return { ...i, requested: true, requestedBy: by, requestedAt: at }
  })
  if (count > 0) commit(next)
  return count
}

/** Count of items currently requested for the Accountant to act on. */
export function pendingRequestCount(): number {
  return state.filter((i) => i.requested && !i.verified).length
}

export function useAuditItems(): AuditItem[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => state,
    () => state,
  )
}

/** Non-reactive check used by the magnifier button to show its active state. */
export function isAudited(key: string): boolean {
  return state.some((i) => i.key === key)
}
