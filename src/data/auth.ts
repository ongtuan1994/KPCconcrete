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

/** The functions covered by the permission matrix, in sidebar order and grouped
    under the same section headers as the sidebar (see nav.tsx). `/my-work` is
    intentionally ungated (personal page) and therefore has no row here. */
export const RESOURCES: Resource[] = [
  { key: 'monthly-report', route: '/monthly-report', label: 'รายงานประจำเดือน / ปี', section: 'รายงาน · Reports' },
  { key: 'tax-reports', route: '/tax-reports', label: 'รายงานภาษีซื้อ / ขาย', section: 'รายงาน · Reports' },
  { key: 'general-reports', route: '/general-reports', label: 'รายงานทั่วไป', section: 'รายงาน · Reports' },
  { key: 'ledger', route: '/ledger', label: 'ลูกหนี้ / เจ้าหนี้', section: 'รายงาน · Reports' },
  { key: 'audit-report', route: '/audit-report', label: 'รายงาน Audit', section: 'รายงาน · Reports' },

  { key: 'sales-orders', route: '/sales-orders', label: 'ใบสั่งขาย', section: 'การขาย · Sales' },
  { key: 'delivery-tickets', route: '/delivery-tickets', label: 'ใบจ่ายคอนกรีต', section: 'การขาย · Sales' },
  { key: 'foundry-deliveries', route: '/foundry-deliveries', label: 'ใบส่งสินค้าโรงหล่อ', section: 'การขาย · Sales' },
  { key: 'invoices', route: '/invoices', label: 'ใบกำกับภาษี / วางบิล', section: 'การขาย · Sales' },
  { key: 'receipts', route: '/receipts', label: 'ใบเสร็จรับเงิน', section: 'การขาย · Sales' },

  { key: 'purchase-orders', route: '/purchase-orders', label: 'ใบสั่งซื้อ', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'goods-payments', route: '/goods-payments', label: 'ใบสำคัญจ่าย', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'payroll', route: '/payroll', label: 'เบิกและจ่ายเงินเดือน', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'attendance', route: '/attendance', label: 'บันทึกลงเวลางาน', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'truck-trips', route: '/truck-trips', label: 'บันทึกเที่ยวรถโม่', section: 'การซื้อ / การจ่าย · Purchasing' },
  { key: 'commission', route: '/commission', label: 'บันทึกค่าคอมมิชชั่น', section: 'การซื้อ / การจ่าย · Purchasing' },

  { key: 'stock', route: '/stock', label: 'คลังวัตถุดิบแพล้นปูน', section: 'จัดการคลัง · Inventory' },
  { key: 'foundry-stock', route: '/foundry-stock', label: 'สต๊อกสินค้าโรงหล่อ', section: 'จัดการคลัง · Inventory' },

  { key: 'customer-master', route: '/customer-master', label: 'ทะเบียนลูกค้า', section: 'ฐานข้อมูล · Database' },
  { key: 'suppliers', route: '/suppliers', label: 'ทะเบียนซัพพลายเออร์', section: 'ฐานข้อมูล · Database' },
  { key: 'pricing', route: '/pricing', label: 'ราคาสินค้า / ค่าขนส่ง', section: 'ฐานข้อมูล · Database' },
  { key: 'mix-design', route: '/mix-design', label: 'Mix Design', section: 'ฐานข้อมูล · Database' },
  { key: 'transport-pricing', route: '/transport-pricing', label: 'รถขนส่งปูน', section: 'ฐานข้อมูล · Database' },
  { key: 'employees', route: '/employees', label: 'รายชื่อพนักงาน', section: 'ฐานข้อมูล · Database' },

  { key: 'salary-structure', route: '/salary-structure', label: 'ปรับโครงสร้าง', section: 'ระบบ · System' },
  { key: 'settings', route: '/settings', label: 'ตั้งค่าระบบ', section: 'ระบบ · System' },
]

/** route → resource key, for guarding the router. */
export const ROUTE_RESOURCE: Record<string, string> = {}
for (const r of RESOURCES) ROUTE_RESOURCE[r.route] = r.key
/* Legacy direct วางบิล route shares the ใบกำกับภาษี / วางบิล gate. */
ROUTE_RESOURCE['/billing'] = 'invoices'
/* สูตรผลิตโรงหล่อ shares the Mix Design gate (both under ราคาสินค้า / ฐานข้อมูล). */
ROUTE_RESOURCE['/foundry-formula'] = 'mix-design'
/* คลังวัตถุดิบโรงหล่อ shares the คลังวัตถุดิบ gate. */
ROUTE_RESOURCE['/foundry-materials'] = 'stock'
/* ภาพรวมการทำงานแพล้นปูน reads plant stock — shares the คลังวัตถุดิบ gate. */
ROUTE_RESOURCE['/plant-operation'] = 'stock'
/* เบิกเงินกลางเดือน shares the เบิกและจ่ายเงินเดือน (payroll) gate. */
ROUTE_RESOURCE['/mid-month-advance'] = 'payroll'

/** Hard per-resource role allowlist — overrides the permission matrix. When a
    resource key is listed here, ONLY these roles may view it, no matter what the
    configurable perms say. Used for sensitive pages. */
const ALL_BUT_MANAGER: Role[] = ['Admin', 'Board', 'Auditor', 'Accountant']
export const RESOURCE_ROLE_ALLOW: Record<string, Role[]> = {
  'monthly-report': ['Admin', 'Board', 'Auditor'],
  'salary-structure': ['Admin', 'Board', 'Auditor'],
  /* Manager cannot access these sales documents. */
  'delivery-tickets': ALL_BUT_MANAGER,
  'foundry-deliveries': ALL_BUT_MANAGER,
  'invoices': ALL_BUT_MANAGER,
}
/** false only when `key` is role-locked and `role` isn't in its allowlist. */
export function roleAllowsResource(role: Role, key: string): boolean {
  const allow = RESOURCE_ROLE_ALLOW[key]
  return !allow || allow.includes(role)
}

/** Default landing route for a role: the first resource (in sidebar order) it may
    actually view — so a role locked out of the monthly report doesn't land on the
    "no access" page. Falls back to the personal ungated page. */
export function landingRouteFor(role: Role, perms: PermMatrix): string {
  for (const r of RESOURCES) {
    const lvl = perms[role]?.[r.key] ?? 'none'
    if (lvl !== 'none' && roleAllowsResource(role, r.key)) return r.route
  }
  return '/my-work'
}

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

/* Column order for the arrays below — keep in sync with RESOURCES (sidebar order):
   Reports:     monthly, tax, general, ledger, audit
   Sales:       SO, delivery, foundryDelivery, invoice, receipt
   Purchasing:  PO, goods, payroll, attendance, truckTrips, commission
   Inventory:   stock, foundryStock
   Database:    custMaster, suppliers, pricing, mixDesign, transport, employees
   System:      salaryStruct, settings */

/** Default permission matrix — a sensible reading of the supplied chart.
    Fully editable + persisted from the Settings page, so any cell can be
    corrected there without touching code. The Audit report (column 5) is
    restricted to Admin and Auditor. */
export const DEFAULT_PERMS: PermMatrix = {
  /* Admin — full access everywhere. */
  Admin: row([
    E, E, E, E, E,          // reports
    E, E, E, E, E,          // sales
    E, E, E, E, E, E,       // purchasing
    E, E,                   // inventory
    E, E, E, E, E, E,       // database
    E, E,                   // system
  ]),
  /* Board — full access (owner), except audit + system settings. */
  Board: row([
    E, E, E, E, N,          // reports (no audit)
    E, E, E, E, E,          // sales
    E, E, E, E, E, E,       // purchasing
    E, E,                   // inventory
    E, E, E, E, E, E,       // database
    E, V,                   // system (settings read-only)
  ]),
  /* Auditor — read-only across the board, plus the Audit report; no settings. */
  Auditor: row([
    V, V, V, V, E,          // reports (audit edit)
    V, V, V, V, V,          // sales
    V, V, V, V, V, V,       // purchasing
    V, V,                   // inventory
    V, V, V, V, V, V,       // database
    V, N,                   // system (no settings)
  ]),
  /* Manager — operational: edits sales + customers + time/trip/commission
     recording, views the rest; no audit, no purchasing/payments, no settings. */
  Manager: row([
    V, V, V, V, N,          // reports (no audit)
    E, E, E, V, V,          // sales (edits orders/deliveries, views invoices/receipts)
    N, N, N, E, E, E,       // purchasing (records attendance/trips/commission only)
    V, V,                   // inventory
    E, V, V, V, V, V,       // database (edits customer master)
    V, N,                   // system
  ]),
  /* Accountant — finance: edits all sales/purchasing/customers/reports,
     views inventory & HR recording + the Audit report (read-only), no settings. */
  Accountant: row([
    E, E, E, E, V,          // reports (audit view)
    E, E, E, E, E,          // sales
    E, E, E, E, E, E,       // purchasing (edits PO/payments/payroll + attendance/trips/commission recording)
    E, E,                   // inventory
    E, E, V, V, V, V,       // database (edits customers/suppliers, views pricing/HR)
    V, N,                   // system
  ]),
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

/** Bump when a permission migration must be force-applied to existing stored
    matrices (localStorage overrides code defaults, so new defaults alone don't
    reach browsers that already saved a matrix). */
const PERMS_VERSION = 2

interface AuthState {
  users: User[]
  perms: PermMatrix
  /** Username of the currently logged-in user, or null when signed out. */
  session: string | null
  /** Sign-in/out history, newest first. */
  activity: ActivityEntry[]
  /** Id of the open ActivityEntry for the live session (so logout can close it). */
  currentSessionId: string | null
  /** Version of the last-applied permission migration (see PERMS_VERSION). */
  permsVersion?: number
}

const empty: AuthState = { users: SEED_USERS, perms: DEFAULT_PERMS, session: null, activity: [], currentSessionId: null, permsVersion: PERMS_VERSION }

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
    const perms = mergePerms(v.perms)
    const storedVersion = v.permsVersion ?? 0
    /* v2 (2026-07): the Accountant role edits the payroll-entry pages —
       บันทึกลงเวลางาน / เที่ยวรถโม่ / ค่าคอมมิชชั่น. A stale stored matrix keeps
       the old "view", so force these cells once (does not re-run after v2). */
    if (storedVersion < 2 && perms.Accountant) {
      for (const k of ['attendance', 'truck-trips', 'commission']) perms.Accountant[k] = 'edit'
    }
    const next: AuthState = {
      users: v.users?.length ? v.users : SEED_USERS,
      perms,
      session: v.session ?? null,
      activity: v.activity ?? [],
      currentSessionId: v.currentSessionId ?? null,
      permsVersion: PERMS_VERSION,
    }
    if (storedVersion < PERMS_VERSION) {
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* quota */ }
    }
    return next
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
