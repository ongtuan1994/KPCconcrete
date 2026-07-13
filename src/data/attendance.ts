/* Time-attendance store + fingerprint-scanner CSV import.

   Records one row per employee per day with clock-in / clock-out times. Rows are
   produced either manually or by importing CSV exports from the fingerprint
   scanner (multiple files at once). Persisted to localStorage.

   Shift is fixed for everyone: 08:00–17:00.
   - Late  = minutes clocked in after 08:00.
   - OT raw = minutes clocked out after 17:00.
   - OT net = OT raw − late (floored at 0) when both apply. */

import { useSyncExternalStore } from 'react'
import { EMPLOYEES, type Employee } from './employees'
import { createRemoteSync } from './supabase'

export const SHIFT_START_MIN = 8 * 60   /* 08:00 */
export const SHIFT_END_MIN = 17 * 60    /* 17:00 */

/** A day with only ONE scanner punch is normally read as เวลาเข้า (clock-in).
    But a lone punch at or after this time means the clock-in scan was missed —
    that single time is stored as เวลาออก (clock-out) instead, leaving เวลาเข้า
    blank for the user to fill in. 16:00: too late to be an arrival. */
export const LONE_PUNCH_OUT_MIN = 16 * 60   /* 16:00 */

/** Half-day leave (ลาครึ่งวัน):
    - 'morning' (ลาเช้า): works the afternoon → expected shift 13:00–17:00.
    - 'afternoon' (ลาบ่าย): works the morning → expected shift 08:00–12:00.
    Drives the late/OT calculation so a half-day isn't counted as late. */
export type HalfDayLeave = 'morning' | 'afternoon'

export interface AttendanceRecord {
  id: string             /* `${empId}__${date}` */
  date: string           /* ISO yyyy-mm-dd */
  empId: string          /* matched employee id, or the scanner's raw user id */
  empName: string
  clockIn?: string       /* "HH:MM" */
  clockOut?: string      /* "HH:MM" */
  leave?: HalfDayLeave   /* ลาเช้า / ลาบ่าย — half-day leave (manual entry) */
  source: 'scan' | 'manual'
}

/* Half-day shift boundaries used when a leave flag is set. */
export const HALF_DAY_AFTERNOON_START = 13 * 60  /* 13:00 — ลาเช้า: เริ่มงานบ่าย */
export const HALF_DAY_MORNING_END = 12 * 60      /* 12:00 — ลาบ่าย: เลิกงานเที่ยง */

/** Expected shift start/end (minutes) for a record, accounting for half-day
    leave. No leave → full shift 08:00–17:00. */
export function shiftBoundsFor(r: AttendanceRecord): { start: number; end: number } {
  if (r.leave === 'morning') return { start: HALF_DAY_AFTERNOON_START, end: SHIFT_END_MIN }
  if (r.leave === 'afternoon') return { start: SHIFT_START_MIN, end: HALF_DAY_MORNING_END }
  return { start: SHIFT_START_MIN, end: SHIFT_END_MIN }
}

/* ───────── time helpers ───────── */

const pad = (n: number) => String(n).padStart(2, '0')
export const hhmmToMin = (t: string): number => {
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}
const minToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

export interface AttendanceCalc { lateMin: number; otRawMin: number; otNetMin: number; workedMin: number }

/** Derive late / OT minutes for a record against the fixed 08:00–17:00 shift. */
/** ลืมขาเข้า / ลืมขาออก — which punch the employee forgot to scan. */
export type ForgotPunch = 'in' | 'out'

/** Fill a single missing punch with the standard shift boundary and report which
    side was forgotten, so the table/report can flag "ลืมลงเวลา":
      - มีแต่เวลาเข้า (ขาดออก) → เติมออก 17:00, forgot 'out' (ลืมขาออก)
      - มีแต่เวลาออก (ขาดเข้า) → เติมเข้า 08:00, forgot 'in' (ลืมขาเข้า)
    Records with both punches (incl. half-day leave) or neither are returned
    unchanged with forgot = null. */
export function resolvePunches(r: AttendanceRecord): { clockIn?: string; clockOut?: string; forgot: ForgotPunch | null } {
  const hasIn = !!r.clockIn, hasOut = !!r.clockOut
  if (hasIn && !hasOut) return { clockIn: r.clockIn, clockOut: minToHHMM(SHIFT_END_MIN), forgot: 'out' }
  if (!hasIn && hasOut) return { clockIn: minToHHMM(SHIFT_START_MIN), clockOut: r.clockOut, forgot: 'in' }
  return { clockIn: r.clockIn, clockOut: r.clockOut, forgot: null }
}

export function computeAttendance(r: AttendanceRecord): AttendanceCalc {
  const { start, end } = shiftBoundsFor(r)
  /* A forgotten punch is auto-filled with the shift boundary before computing. */
  const eff = resolvePunches(r)
  const inM = eff.clockIn ? hhmmToMin(eff.clockIn) : null
  const outM = eff.clockOut ? hhmmToMin(eff.clockOut) : null
  const lateMin = inM != null ? Math.max(0, inM - start) : 0
  const otRawMin = outM != null ? Math.max(0, outM - end) : 0
  /* Net OT = ล่วงเวลา − สาย, and it is allowed to go NEGATIVE so lateness is
     always carried as a deduction — even on days with no ล่วงเวลา at all
     (e.g. สาย 2, ล่วงเวลา 0 → OT −2; ล่วงเวลา 11, สาย 30 → OT −19).
     Only a fully empty record (no punches) yields 0. */
  const otNetMin = inM != null || outM != null ? otRawMin - lateMin : 0
  const workedMin = inM != null && outM != null ? Math.max(0, outM - inM) : 0
  return { lateMin, otRawMin, otNetMin, workedMin }
}

/* ───────── persisted state ───────── */

const KEY = 'kpc.attendance.v1'

function read(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as AttendanceRecord[]) : []
  } catch {
    return []
  }
}

let state: AttendanceRecord[] = read()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

let pushRemote: (data: AttendanceRecord[]) => void = () => {}
function commit(next: AttendanceRecord[]) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  notify()
  pushRemote(state)
}

/* Cross-browser sync via Supabase (no-op when not configured). */
const remote = createRemoteSync<AttendanceRecord[]>(
  'attendance',
  (data) => {
    state = Array.isArray(data) ? data : []
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
    notify()
  },
  () => state,
)
pushRemote = remote.push
remote.start()

export function useAttendance(): AttendanceRecord[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => state,
    () => state,
  )
}

/** Insert or replace a manual record (keyed by employee + date). */
export function upsertManual(rec: Omit<AttendanceRecord, 'id' | 'source'>) {
  const id = `${rec.empId}__${rec.date}`
  const next = state.filter((r) => r.id !== id)
  commit([{ ...rec, id, source: 'manual' }, ...next])
}

export function removeAttendance(id: string) {
  commit(state.filter((r) => r.id !== id))
}

export function clearAttendance() {
  commit([])
}

/* ───────── scan-name → employee mapping (user-editable aliases) ─────────
   The fingerprint scanner's enrolled names don't always match the roster, and a
   brand-new employee will scan under a name the system can't resolve. The mapping
   tab lets staff attach such a scanner identity to the right employee; the alias
   is persisted so future imports (and existing unmatched rows) resolve to that
   person. Wins over the built-in SCAN_ALIAS + name heuristics. */

/** A user-defined mapping from a scanner identity to an employee. */
export interface ScanAlias {
  scanName: string   /* raw scanner name as it appears in the file (display + key) */
  userId?: string    /* raw scanner user id, when the file carries one */
  empId: string      /* assigned employee id */
}
/** A distinct scanner identity seen while importing — surfaced on the mapping tab
    so it can be assigned even after the punches were grouped into records. */
export interface ScanIdentity {
  key: string        /* identityKey(userId, name) */
  userId: string
  name: string
  lastSeen: string   /* ISO date last seen in an import ('' when only registered) */
}
interface ScanMap { aliases: ScanAlias[]; identities: ScanIdentity[] }

const SCAN_MAP_KEY = 'kpc.attendanceScan.v1'
function readScanMap(): ScanMap {
  try {
    const raw = localStorage.getItem(SCAN_MAP_KEY)
    if (!raw) return { aliases: [], identities: [] }
    const v = JSON.parse(raw)
    return { aliases: Array.isArray(v?.aliases) ? v.aliases : [], identities: Array.isArray(v?.identities) ? v.identities : [] }
  } catch {
    return { aliases: [], identities: [] }
  }
}
let scanMap: ScanMap = readScanMap()
const scanListeners = new Set<() => void>()
const notifyScan = () => scanListeners.forEach((l) => l())
let pushScanRemote: (data: ScanMap) => void = () => {}
function commitScan(next: ScanMap) {
  scanMap = next
  try { localStorage.setItem(SCAN_MAP_KEY, JSON.stringify(scanMap)) } catch { /* quota */ }
  notifyScan()
  pushScanRemote(scanMap)
}
const scanRemote = createRemoteSync<ScanMap>(
  'attendanceScan',
  (data) => {
    scanMap = { aliases: Array.isArray(data?.aliases) ? data.aliases : [], identities: Array.isArray(data?.identities) ? data.identities : [] }
    try { localStorage.setItem(SCAN_MAP_KEY, JSON.stringify(scanMap)) } catch { /* quota */ }
    notifyScan()
  },
  () => scanMap,
)
pushScanRemote = scanRemote.push
scanRemote.start()

export function useScanMap(): ScanMap {
  return useSyncExternalStore(
    (l) => { scanListeners.add(l); return () => scanListeners.delete(l) },
    () => scanMap,
    () => scanMap,
  )
}

/** Stable key for a scanner identity — prefers the (normalised) name, which is
    what the reference sheet + heuristics use; falls back to the user id. */
export function identityKey(userId: string, name: string): string {
  const nm = normName(name)
  if (nm) return `nm:${nm}`
  const uid = (userId || '').trim().toLowerCase()
  return uid ? `id:${uid}` : ''
}

/** The employee a user alias assigns to this scanner identity, if any. */
function aliasEmpFor(userId: string, name: string, employees: Employee[]): Employee | undefined {
  const key = identityKey(userId, name)
  if (!key) return undefined
  const a = scanMap.aliases.find((x) => identityKey(x.userId ?? '', x.scanName) === key)
  return a ? employees.find((e) => e.id === a.empId) : undefined
}

/** Current match for a scanner identity + how it was resolved. 'manual' = user
    alias, 'auto' = built-in alias / id / name heuristic, 'none' = unmatched. */
export function matchScanIdentity(userId: string, name: string, employees: Employee[]): { empId?: string; via: 'manual' | 'auto' | 'none' } {
  const manual = aliasEmpFor(userId, name, employees)
  if (manual) return { empId: manual.id, via: 'manual' }
  const auto = resolveEmployee(userId, name, employees)
  return auto ? { empId: auto.id, via: 'auto' } : { via: 'none' }
}

/** Upsert a scanner identity into the registry (keeps the newest lastSeen). */
function registerIdentity(list: ScanIdentity[], id: { key: string; userId: string; name: string; lastSeen: string }): ScanIdentity[] {
  const ex = list.find((x) => x.key === id.key)
  if (!ex) return [id, ...list]
  return list.map((x) => x.key === id.key
    ? { ...x, userId: x.userId || id.userId, name: x.name || id.name, lastSeen: id.lastSeen > x.lastSeen ? id.lastSeen : x.lastSeen }
    : x)
}

/** Re-key existing UNMATCHED scan rows for `key` onto the assigned employee, so a
    new mapping also fixes already-imported days. On a date collision with an
    existing (matched) record the unmatched duplicate is dropped. */
function rekeyRecords(key: string, empId: string, empName: string) {
  const existingIds = new Set(state.map((r) => r.id))
  let changed = false
  const next: AttendanceRecord[] = []
  for (const r of state) {
    if (r.source === 'scan' && r.empId !== empId && identityKey(r.empId, r.empName) === key) {
      const newId = `${empId}__${r.date}`
      if (newId !== r.id && existingIds.has(newId)) { changed = true; continue }
      next.push({ ...r, id: newId, empId, empName })
      changed = true
    } else {
      next.push(r)
    }
  }
  if (changed) commit(next)
}

/** Assign (or reassign) a scanner identity to an employee. Persists the alias and
    re-keys existing unmatched rows for that identity. */
export function setScanAlias(scanName: string, userId: string, empId: string, empName: string) {
  const key = identityKey(userId, scanName)
  if (!key || !empId) return
  const aliases = [
    { scanName, userId: userId || undefined, empId },
    ...scanMap.aliases.filter((a) => identityKey(a.userId ?? '', a.scanName) !== key),
  ]
  const identities = registerIdentity(scanMap.identities, { key, userId, name: scanName, lastSeen: '' })
  commitScan({ aliases, identities })
  rekeyRecords(key, empId, empName)
}

/** Remove a user alias (falls back to auto matching for future imports). */
export function clearScanAlias(key: string) {
  commitScan({ ...scanMap, aliases: scanMap.aliases.filter((a) => identityKey(a.userId ?? '', a.scanName) !== key) })
}

/* ───────── fingerprint CSV parsing ───────── */

export interface ScanPunch { userId: string; name: string; at: Date }
export interface ImportSummary { files: number; punches: number; records: number; unmatched: number; errors: string[] }

function detectDelimiter(line: string): string {
  const c = { ',': 0, '\t': 0, ';': 0 }
  for (const ch of line) if (ch in c) (c as Record<string, number>)[ch]++
  return (['\t', ';', ','] as const).reduce((best, d) => (c[d] > c[best] ? d : best), ',')
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function buildDate(y: number, mo: number, d: number, h: number, mi: number, se: number, ampm: string): Date | null {
  if (y > 2400) y -= 543 /* Buddhist year → Gregorian */
  if (y < 100) y += 2000
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  const dt = new Date(y, mo - 1, d, h, mi, se)
  return Number.isNaN(dt.getTime()) ? null : dt
}

/** Parse a timestamp in the common scanner formats (ISO or dd/mm/yyyy, optional time / AM-PM). */
function parseDateTime(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  const ap = s.match(/\b(AM|PM)\b/i)
  const ampm = ap ? ap[1].toUpperCase() : ''
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return buildDate(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), ampm)
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return buildDate(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), ampm)
  return null
}

const isTimeTok = (s: string) => /^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i.test(s.trim())
const isDateTok = (s: string) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(s.trim())
const hasDateTime = (s: string) => /\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}.*\d{1,2}:\d{2}/.test(s)

/** Extract ALL timestamps from a row. A row may carry one punch (event-log
    format) or two — clock-in AND clock-out — when a single row summarises a day
    (e.g. columns Date, In, Out). Returns every timestamp found so grouping can
    pick the earliest as in and the latest as out. */
function rowTimestamps(cells: string[], dtIdx: number, dateIdx: number, timeIdx: number, inIdx: number, outIdx: number): Date[] {
  const out: Date[] = []
  const push = (d: Date | null) => { if (d) out.push(d) }

  /* Explicit In / Out time columns combined with a date column (only when the
     cell actually looks like a time, so text states aren't read as midnight). */
  if (dateIdx >= 0 && (inIdx >= 0 || outIdx >= 0) && cells[dateIdx]) {
    if (inIdx >= 0 && isTimeTok(cells[inIdx] ?? '')) push(parseDateTime(`${cells[dateIdx]} ${cells[inIdx]}`))
    if (outIdx >= 0 && isTimeTok(cells[outIdx] ?? '')) push(parseDateTime(`${cells[dateIdx]} ${cells[outIdx]}`))
    if (out.length) return out
  }
  /* A single combined datetime column. */
  if (dtIdx >= 0 && cells[dtIdx]) { push(parseDateTime(cells[dtIdx])); if (out.length) return out }
  /* Date + single time column. */
  if (dateIdx >= 0 && timeIdx >= 0 && cells[dateIdx] && isTimeTok(cells[timeIdx] ?? '')) { push(parseDateTime(`${cells[dateIdx]} ${cells[timeIdx]}`)); if (out.length) return out }

  /* Fallback — scan the whole row. */
  const combos = cells.filter(hasDateTime)
  if (combos.length) { for (const c of combos) push(parseDateTime(c)); if (out.length) return out }
  const dateTok = cells.find(isDateTok)
  const timeToks = cells.filter(isTimeTok)
  if (dateTok && timeToks.length) { for (const t of timeToks) push(parseDateTime(`${dateTok} ${t}`)); if (out.length) return out }
  if (dateTok) push(parseDateTime(dateTok))
  return out
}

const findIdx = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h))

/** Parse one scanner CSV file's text into punch events. */
function parseFile(text: string): ScanPunch[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []
  const delim = detectDelimiter(lines[0])
  const rows = lines.map((l) => splitLine(l, delim))

  /* Header row if the first line carries known column words and no datetime value. */
  const first = rows[0]
  const looksHeader = first.some((c) => /name|time|date|no|id|ชื่อ|เวลา|วันที่|รหัส/i.test(c)) && !first.some(hasDateTime)
  const headers = looksHeader ? first.map((h) => h.toLowerCase()) : []
  const dataRows = looksHeader ? rows.slice(1) : rows

  let idIdx = -1, nameIdx = -1, dtIdx = -1, dateIdx = -1, timeIdx = -1, inIdx = -1, outIdx = -1
  if (looksHeader) {
    /* Prefer a real user-id column; only fall back to a plain "No." sequence. */
    idIdx = findIdx(headers, /ac.?no|enroll|user.?id|person|pin|รหัส|^id$/)
    if (idIdx < 0) idIdx = findIdx(headers, /^no\.?$|number/)
    nameIdx = findIdx(headers, /name|ชื่อ/)
    dtIdx = findIdx(headers, /date.?time|timestamp|วันเวลา/)
    dateIdx = findIdx(headers, /^date$|วันที่/)
    timeIdx = findIdx(headers, /^time$|^เวลา$/)
    /* Explicit clock-in / clock-out columns (summary-per-day exports). */
    inIdx = findIdx(headers, /^(in|clock.?in|check.?in|time.?in|on.?duty)$|เวลาเข้า|เข้างาน|เข้า/)
    outIdx = findIdx(headers, /^(out|clock.?out|check.?out|time.?out|off.?duty)$|เวลาออก|ออกงาน|ออก/)
    /* A lone "Time" column usually holds the full timestamp (no separate date). */
    if (dtIdx < 0 && dateIdx < 0 && timeIdx >= 0) { dtIdx = timeIdx; timeIdx = -1 }
  }

  const punches: ScanPunch[] = []
  for (const cells of dataRows) {
    if (cells.length === 0 || cells.every((c) => !c)) continue
    const stamps = rowTimestamps(cells, dtIdx, dateIdx, timeIdx, inIdx, outIdx)
    if (stamps.length === 0) continue
    const userId = (idIdx >= 0 ? cells[idIdx] : cells[0]) || ''
    const name = (nameIdx >= 0 ? cells[nameIdx] : '') || ''
    if (!userId && !name) continue
    for (const at of stamps) punches.push({ userId: userId.trim(), name: name.trim(), at })
  }
  return punches
}

/* ───────── employee resolution + import ───────── */

/** Normalise a name for matching: lowercase, drop Thai/Eng titles + spaces. */
function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '')
    .replace(/\s+/g, '')
}

/* Explicit fingerprint-scanner → employee map (the device's enrolled names don't
   all match the roster / nicknames). Keyed by the raw scanner name on the left of
   the company's reference sheet; normalised at load so spacing/case/titles don't
   matter. This is authoritative — it wins over the name heuristic below. */
const SCAN_ALIAS_RAW: Record<string, string> = {
  'TA TA': 'E006',      // YE HTAY AUNG YE HTAY
  'มินซอ1': 'E007',     // MIN ZAW
  'SAY AYE': 'E008',    // SAN AYE
  'MOE THU': 'E009',    // NWAY MOE THU TU
  'TAMAO': 'E010',      // SAY MAR OO
  'ชาย': 'E011',        // THET TUN OO
  'เพียงแข': 'E002',    // น.ส.เพียงแข ดันยูชน
  'สหรัฐ': 'E001',      // นายสหรัฐ เพ็ชรฉิม
  'พีท': 'E004',        // นายกฤษฎา ปื่นเกตุ
  'บริ้ง': 'E003',      // นายชัยวัฒน์ ขุนเพ็ชร
  'กร': 'E005',         // นายธนกร โลวีรกุล
  'พี่เบื้ม': 'E012',   // นายมนตรี ธนบัตร (สะกดตามเครื่องแสกน)
  'พี่เบิ้ม': 'E012',   // เผื่ออีกสะกดหนึ่ง
  'โอ๊ต': 'E013',       // นายศุภชัย ซื่อเลื่อม
  'วาย': 'E014',        // นายเจนภพ เย็นกลาง
  'บอย': 'E015',        // นายพงศกร พรหมจรรย์
  'กฤต': 'E016',        // เด็กฝึกงาน กฤต
  'ปาล์ม': 'E017',      // เด็กฝึกงาน ปาล์ม
}
const SCAN_ALIAS: Record<string, string> = Object.fromEntries(
  Object.entries(SCAN_ALIAS_RAW).map(([k, v]) => [normName(k), v]),
)

function resolveEmployee(userId: string, name: string, employees: Employee[]): Employee | undefined {
  /* 0. User-defined mapping (จับคู่ชื่อสแกน tab) — wins over everything below. */
  const manual = aliasEmpFor(userId, name, employees)
  if (manual) return manual
  /* 1. Explicit scanner-name alias (from the reference sheet) — authoritative. */
  const aliasId = SCAN_ALIAS[normName(name)]
  if (aliasId) {
    const e = employees.find((x) => x.id === aliasId)
    if (e) return e
  }
  const uid = userId.trim().toLowerCase()
  if (uid) {
    /* Exact employee id, then numeric enroll id (E001 ↔ 1). */
    let e = employees.find((x) => x.id.toLowerCase() === uid)
    if (e) return e
    const n = parseInt(userId, 10)
    if (!Number.isNaN(n)) {
      e = employees.find((x) => parseInt(x.id.replace(/\D/g, ''), 10) === n)
      if (e) return e
    }
  }
  /* Name matching — tolerant of titles, spacing and partial names. */
  const nm = normName(name)
  if (nm.length >= 2) {
    let e = employees.find((x) => normName(x.name) === nm || (x.nickname && normName(x.nickname) === nm))
    if (e) return e
    e = employees.find((x) => { const en = normName(x.name); return en.includes(nm) || nm.includes(en) || (x.nickname && normName(x.nickname).includes(nm)) })
    if (e) return e
  }
  return undefined
}

const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Import one or more scanner CSV files: parse punches, group by employee+day
    (earliest = in, latest = out), and save straight into the store. Existing
    days are NEVER cleared; a day that re-appears in a new scan OVERWRITES the
    stored record (duplicate → replace), and days absent from the import are
    left untouched. */
export function importScanFiles(files: { name: string; text: string }[], employees: Employee[] = EMPLOYEES): ImportSummary {
  const errors: string[] = []
  const allPunches: ScanPunch[] = []
  for (const f of files) {
    try {
      const p = parseFile(f.text)
      if (p.length === 0) errors.push(`${f.name}: ไม่พบรายการเวลาที่อ่านได้`)
      allPunches.push(...p)
    } catch {
      errors.push(`${f.name}: อ่านไฟล์ไม่สำเร็จ`)
    }
  }

  /* Drop placeholder 00:00 punches: the scanner emits midnight for a day the
     employee never scanned (absent) — ignore those so no record is created. */
  const usablePunches = allPunches.filter((p) => p.at.getHours() !== 0 || p.at.getMinutes() !== 0)

  /* Group punches → per employee per day. */
  const byKey = new Map<string, { date: string; empId: string; empName: string; min: Date; max: Date }>()
  const unmatchedIds = new Set<string>()
  /* Every distinct scanner identity encountered → registered for the mapping tab. */
  const seenIdent = new Map<string, ScanIdentity>()
  for (const p of usablePunches) {
    const emp = resolveEmployee(p.userId, p.name, employees)
    if (!emp) unmatchedIds.add(p.userId || p.name)
    const empId = emp?.id ?? p.userId
    const empName = emp?.name ?? p.name ?? p.userId
    const date = isoDate(p.at)
    const ikey = identityKey(p.userId, p.name)
    if (ikey) {
      const ex = seenIdent.get(ikey)
      if (!ex) seenIdent.set(ikey, { key: ikey, userId: p.userId, name: p.name, lastSeen: date })
      else if (date > ex.lastSeen) ex.lastSeen = date
    }
    const key = `${empId}__${date}`
    const g = byKey.get(key)
    if (!g) byKey.set(key, { date, empId, empName, min: p.at, max: p.at })
    else { if (p.at < g.min) g.min = p.at; if (p.at > g.max) g.max = p.at }
  }

  /* Save into the store without clearing. A day already present is OVERWRITTEN
     by the freshly-imported scan (duplicate → replace); days not in this import
     are left as-is. Within this import, split files for the same day were already
     combined above via min/max, so `g` holds that day's earliest-in/latest-out. */
  const next = [...state]
  let recordCount = 0
  for (const g of byKey.values()) {
    const id = `${g.empId}__${g.date}`
    const minMin = g.min.getHours() * 60 + g.min.getMinutes()
    const maxMin = g.max.getHours() * 60 + g.max.getMinutes()
    let inHHMM: string | undefined
    let outHHMM: string | undefined
    if (g.max > g.min) {
      /* Two or more punches that day → earliest = in, latest = out. */
      inHHMM = minToHHMM(minMin)
      outHHMM = minToHHMM(maxMin)
    } else if (minMin >= LONE_PUNCH_OUT_MIN) {
      /* Single punch at/after 16:00 → missed clock-in; record it as เวลาออก. */
      outHHMM = minToHHMM(minMin)
    } else {
      /* Single punch before 16:00 → treat as เวลาเข้า (the usual case). */
      inHHMM = minToHHMM(minMin)
    }
    const existing = next.find((r) => r.id === id)
    if (existing) {
      existing.clockIn = inHHMM
      existing.clockOut = outHHMM
      existing.empName = g.empName
      existing.source = 'scan'
    } else {
      next.unshift({ id, date: g.date, empId: g.empId, empName: g.empName, clockIn: inHHMM, clockOut: outHHMM, source: 'scan' })
    }
    recordCount++
  }
  commit(next)

  /* Register every scanner identity seen so the mapping tab can list them. */
  if (seenIdent.size) {
    let ids = scanMap.identities
    for (const id of seenIdent.values()) ids = registerIdentity(ids, id)
    commitScan({ ...scanMap, identities: ids })
  }

  return { files: files.length, punches: usablePunches.length, records: recordCount, unmatched: unmatchedIds.size, errors }
}
