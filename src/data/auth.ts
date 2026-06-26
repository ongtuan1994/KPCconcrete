/* Authentication + role-based access control (RBAC) store.

   Holds the user roster (username / password / role), the per-role permission
   matrix (View / Edit per function), and the current login session. Persists to
   localStorage so a logged-in session and any permission edits survive refreshes.

   The store mirrors the external-store pattern used by createdDocs.ts: a module
   singleton + useSyncExternalStore, usable both inside and outside React. */

import { useSyncExternalStore } from 'react'

/* ───────── Roles & users ───────── */

export type Role = 'Admin' | 'Board' | 'Auditor' | 'Manager' | 'Accountant'

/** Display labels for each role (Thai · English). */
export const ROLE_LABEL: Record<Role, { th: string; en: string }> = {
  Admin: { th: 'ผู้ดูแลระบบ', en: 'Admin' },
  Board: { th: 'กรรมการ', en: 'Board' },
  Auditor: { th: 'ผู้ตรวจสอบ', en: 'Auditor' },
  Manager: { th: 'ผู้จัดการ', en: 'Manager' },
  Accountant: { th: 'พนักงานบัญชี', en: 'Accountant' },
}

export const ROLES: Role[] = ['Admin', 'Board', 'Auditor', 'Manager', 'Accountant']

export interface User {
  no: number
  role: Role
  username: string
  password: string
}

/** Initial roster supplied for the plant. Passwords are plain text — this is an
    internal single-plant tool with no backend, matching the existing localStorage
    approach. Editable from the Settings page. */
export const SEED_USERS: User[] = [
  { no: 1, role: 'Admin', username: 'admin', password: '071237' },
  { no: 2, role: 'Board', username: 'pachara', password: '626262' },
  { no: 3, role: 'Auditor', username: 'tanaporn', password: '262626' },
  { no: 4, role: 'Manager', username: 'saharat', password: '123456' },
  { no: 5, role: 'Accountant', username: 'piangkhae', password: '999999' },
]

/* ───────── Resources (one row per function in the matrix) ───────── */

/** Access level for a (role, resource) pair. 'edit' implies 'view'. */
export type Level = 'none' | 'view' | 'edit'

export interface Resource {
  key: string      /* stable permission key */
  route: string    /* router path this resource gates */
  label: string    /* Thai label (matches the sidebar) */
  section: string  /* group header (Thai · English) */
}

/** The functions covered by the permission matrix, grouped like the sidebar. */
export const RESOURCES: Resource[] = [
  { key: 'monthly-report', route: '/monthly-report', label: 'รายงานประจำเดือน / ปี', section: 'รายงาน · Reports' },
  { key: 'tax-reports', route: '/tax-reports', label: 'รายงานภาษีซื้อ / ขาย', section: 'รายงาน · Reports' },
  { key: 'audit-report', route: '/audit-report', label: 'รายงาน Audit', section: 'รายงาน · Reports' },

  { key: 'sales-orders', route: '/sales-orders', label: 'ใบสั่งขาย', section: 'การขาย · Sales' },
  { key: 'delivery-tickets', route: '/delivery-tickets', label: 'ใบจ่ายคอนกรีต', section: 'การขาย · Sales' },
  { key: 'invoices', route: '/invoices', label: 'ใบกำกับภาษี / วางบิล', section: 'การขาย · Sales' },
  { key: 'receipts', route: '/receipts', label: 'ใบเสร็จรับเงิน', section: 'การขาย · Sales' },

  { key: 'purchase-orders', route: '/purchase-orders', label: 'ใบสั่งซื้อ', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'goods-payments', route: '/goods-payments', label: 'ใบทำจ่ายสินค้า/วัสดุ', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'payroll', route: '/payroll', label: 'ใบเบิก / ทำจ่ายเงินเดือน', section: 'การซื้อ / การจ่าย · Purchasing' },

  { key: 'customer-master', route: '/customer-master', label: 'ทะเบียนลูกค้า', section: 'ลูกค้า · Customers' },
  { key: 'suppliers', route: '/suppliers', label: 'ทะเบียนซัพพลายเออร์', section: 'ลูกค้า · Customers' },
  { key: 'ledger', route: '/ledger', label: 'ลูกหนี้ / เจ้าหนี้', section: 'ลูกค้า · Customers' },

  { key: 'stock', route: '/stock', label: 'คลังวัตถุดิบ', section: 'คลัง & ราคา · Inventory' },
  { key: 'pricing', route: '/pricing', label: 'ราคาสินค้า', section: 'คลัง & ราคา · Inventory' },
  { key: 'transport-pricing', route: '/transport-pricing', label: 'ราคาค่าขนส่ง', section: 'คลัง & ราคา · Inventory' },

  { key: 'employees', route: '/employees', label: 'รายชื่อพนักงาน', section: 'องค์กร · Organization' },
  { key: 'salary-structure', route: '/salary-structure', label: 'ปรับโครงสร้าง', section: 'องค์กร · Organization' },

  { key: 'settings', route: '/settings', label: 'ตั้งค่าระบบ', section: 'องค์กร · Organization' },
]

/** route → resource key, for guarding the router. */
export const ROUTE_RESOURCE: Record<string, string> = {}
for (const r of RESOURCES) ROUTE_RESOURCE[r.route] = r.key

export type PermMatrix = Record<Role, Record<string, Level>>

/* Shorthands for building the default matrix below. */
const E: Level = 'edit'
const V: Level = 'view'
const N: Level = 'none'

/** Build a per-resource level map from an ordered list matching RESOURCES. */
function row(levels: Level[]): Record<string, Level> {
  const m: Record<string, Level> = {}
  RESOURCES.forEach((r, i) => { m[r.key] = levels[i] ?? N })
  return m
}

/* Column order for the arrays below — keep in sync with RESOURCES:
   monthly, tax, audit, SO, delivery, invoice, receipt, PO, goods, payroll,
   custMaster, suppliers, ledger, stock, pricing, transport, employees, salaryStruct, settings */

/** Default permission matrix — a sensible reading of the supplied chart.
    Fully editable + persisted from the Settings page, so any cell can be
    corrected there without touching code. The 3rd column is the Audit report,
    which only Admin and Auditor may access. */
export const DEFAULT_PERMS: PermMatrix = {
  /* Admin — full access everywhere. */
  Admin: row([E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E]),
  /* Board — full access (owner), except audit + system settings. */
  Board: row([E, E, N, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, V]),
  /* Auditor — read-only across the board, plus the Audit report; no settings. */
  Auditor: row([V, V, E, V, V, V, V, V, V, V, V, V, V, V, V, V, V, V, N]),
  /* Manager — operational: edits sales + customers, views the rest,
     no audit, no purchasing/payments, no settings. */
  Manager: row([V, V, N, E, E, V, V, N, N, N, E, V, V, V, V, V, V, V, N]),
  /* Accountant — finance: edits all sales/purchasing/customers/reports,
     views inventory & HR, no audit, no settings. */
  Accountant: row([E, E, N, E, E, E, E, E, E, E, E, E, E, E, V, V, V, V, N]),
}

/* ───────── Activity log (login / logout monitoring) ───────── */

/** One sign-in session. `logoutAt` is null while the session is still open. */
export interface ActivityEntry {
  id: string
  username: string
  role: Role
  loginAt: string          /* ISO timestamp */
  logoutAt: string | null  /* ISO timestamp, or null if still signed in */
}

/* ───────── Persisted state ───────── */

const KEY = 'kpc.auth.v1'

interface AuthState {
  users: User[]
  perms: PermMatrix
  /** Username of the currently logged-in user, or null when signed out. */
  session: string | null
  /** Sign-in/out history, newest first. */
  activity: ActivityEntry[]
  /** Id of the open ActivityEntry for the live session (so logout can close it). */
  currentSessionId: string | null
}

const empty: AuthState = { users: SEED_USERS, perms: DEFAULT_PERMS, session: null, activity: [], currentSessionId: null }

/** Merge a stored permission matrix onto the defaults so newly-added resources
    (or roles) always have a level even if the stored copy predates them. */
function mergePerms(stored?: Partial<PermMatrix>): PermMatrix {
  const out = {} as PermMatrix
  for (const role of ROLES) {
    const base = { ...DEFAULT_PERMS[role] }
    const ov = stored?.[role]
    if (ov) for (const k of Object.keys(base)) if (ov[k]) base[k] = ov[k]
    out[role] = base
  }
  return out
}

function read(): AuthState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const v = JSON.parse(raw) as Partial<AuthState>
    return {
      users: v.users?.length ? v.users : SEED_USERS,
      perms: mergePerms(v.perms),
      session: v.session ?? null,
      activity: v.activity ?? [],
      currentSessionId: v.currentSessionId ?? null,
    }
  } catch {
    return empty
  }
}

let state: AuthState = read()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function commit(next: AuthState) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  notify()
}

/* ───────── Mutations ───────── */

/** Attempt a login. Returns the matched user, or null on bad credentials.
    Records a new open session entry in the activity log. */
export function login(username: string, password: string): User | null {
  const u = state.users.find(
    (x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.password === password,
  )
  if (!u) return null
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const entry: ActivityEntry = { id, username: u.username, role: u.role, loginAt: new Date().toISOString(), logoutAt: null }
  commit({ ...state, session: u.username, activity: [entry, ...state.activity], currentSessionId: id })
  return u
}

/** Change a user's password after verifying their username + current password.
    Returns null on success, or a Thai error message on failure. */
export function changePassword(username: string, oldPassword: string, newPassword: string): string | null {
  const u = state.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase())
  if (!u) return 'ไม่พบชื่อผู้ใช้นี้'
  if (u.password !== oldPassword) return 'รหัสผ่านเดิมไม่ถูกต้อง'
  if (!newPassword) return 'กรุณาระบุรหัสผ่านใหม่'
  if (newPassword === oldPassword) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'
  commit({ ...state, users: state.users.map((x) => (x.no === u.no ? { ...x, password: newPassword } : x)) })
  return null
}

/** Sign out and close the live session entry in the activity log. */
export function logout() {
  const now = new Date().toISOString()
  const activity = state.activity.map((e) =>
    e.id === state.currentSessionId && e.logoutAt === null ? { ...e, logoutAt: now } : e,
  )
  commit({ ...state, session: null, activity, currentSessionId: null })
}

/** Set the access level for one (role, resource) cell. */
export function setPerm(role: Role, resourceKey: string, level: Level) {
  commit({
    ...state,
    perms: { ...state.perms, [role]: { ...state.perms[role], [resourceKey]: level } },
  })
}

/** Replace a user's editable fields (username / password / role), keyed by `no`. */
export function updateUser(no: number, edit: Partial<Pick<User, 'username' | 'password' | 'role'>>) {
  commit({ ...state, users: state.users.map((u) => (u.no === no ? { ...u, ...edit } : u)) })
}

/** Create a new user. Assigns the next sequential `no`. Returns the created user. */
export function addUser(user: Pick<User, 'username' | 'password' | 'role'>): User {
  const no = state.users.reduce((m, u) => Math.max(m, u.no), 0) + 1
  const created: User = { no, ...user }
  commit({ ...state, users: [...state.users, created] })
  return created
}

/** Remove a user by `no`. */
export function removeUser(no: number) {
  commit({ ...state, users: state.users.filter((u) => u.no !== no) })
}

/** Restore the permission matrix to the built-in defaults. */
export function resetPerms() {
  commit({ ...state, perms: mergePerms() })
}

/* ───────── Selectors / hooks ───────── */

function useAuthState(): AuthState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => state,
    () => state,
  )
}

/** The currently logged-in user, or null. */
export function useCurrentUser(): User | null {
  const s = useAuthState()
  return s.users.find((u) => u.username === s.session) ?? null
}

export function useUsers(): User[] {
  return useAuthState().users
}

export function usePerms(): PermMatrix {
  return useAuthState().perms
}

export function useActivity(): ActivityEntry[] {
  return useAuthState().activity
}

/** Clear the entire login/logout history (keeps any live open session). */
export function clearActivity() {
  const keep = state.activity.filter((e) => e.id === state.currentSessionId && e.logoutAt === null)
  commit({ ...state, activity: keep })
}

/** Resolve the access level for a role + resource against current state. */
export function levelFor(role: Role, resourceKey: string): Level {
  return state.perms[role]?.[resourceKey] ?? 'none'
}

/** Username of the currently logged-in user, or '' when signed out.
    Usable outside React (e.g. when stamping a newly saved record). */
export function currentUserName(): string {
  return state.session ?? ''
}

/** True when the current user may flag records for audit and verify them —
    restricted to the Admin and Auditor roles. Reactive hook. */
export function useCanAudit(): boolean {
  const u = useCurrentUser()
  return u?.role === 'Admin' || u?.role === 'Auditor'
}

/** Can the current user view / edit a given resource? Reactive hook version. */
export function useCan(resourceKey: string): { view: boolean; edit: boolean } {
  const s = useAuthState()
  const user = s.users.find((u) => u.username === s.session)
  if (!user) return { view: false, edit: false }
  const lvl = s.perms[user.role]?.[resourceKey] ?? 'none'
  return { view: lvl === 'view' || lvl === 'edit', edit: lvl === 'edit' }
}
