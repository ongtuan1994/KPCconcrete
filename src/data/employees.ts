/* Employee roster — names sourced from the company's printed sheets. To attach
   a photo, drop a file at /public/staff/{id}.jpg (id from the rows below).
   Fill in startDate (ISO YYYY-MM-DD) to enable the years-of-service display. */

export type Department =
  | 'manager'
  | 'accounting'
  | 'production'
  | 'labor'
  | 'transport'

export const DEPARTMENT_LABEL: Record<Department, { th: string; en: string }> = {
  manager:    { th: 'ผู้จัดการ',          en: 'Manager' },
  accounting: { th: 'บัญชี',             en: 'Accounting' },
  production: { th: 'ฝ่ายผลิต',          en: 'Production' },
  labor:      { th: 'แรงงาน',            en: 'Labor' },
  transport:  { th: 'ฝ่ายขนส่งรถโม่',   en: 'Transport — Mixer Truck' },
}

export interface Employee {
  id: string
  name: string
  nickname?: string
  /** Job title / role, e.g. "ผู้จัดการ", "พนักงานผลิต", "พนักงานจัดส่ง". */
  role: string
  department: Department
  /** ISO date string when employment began. Optional — when omitted the
      "อายุงาน" column shows "—". */
  startDate?: string
  /** Phone number for the employee, e.g. "081-234-5678". */
  phone?: string
  /** Path to a portrait photo (e.g. "/staff/E001.jpg"). Falls back to an
      initials avatar when omitted or the file is missing. */
  photoUrl?: string
}

export const EMPLOYEES: Employee[] = [
  /* Management */
  { id: 'E001', name: 'นายสหรัฐ เพ็ชรฉิม',  nickname: 'พี่เป็น', role: 'ผู้จัดการ',     department: 'manager' },

  /* Accounting */
  { id: 'E002', name: 'น.ส.เพียงแข ดันยูชน', nickname: 'ไหม',    role: 'บัญชี',         department: 'accounting' },

  /* Production — Thai staff */
  { id: 'E003', name: 'นายชัยวัฒน์ ขุนเพ็ชร', nickname: 'บริ้ง',   role: 'พนักงานผลิต', department: 'production' },
  { id: 'E004', name: 'นายกฤษฎา ปื่นเกตุ',   nickname: 'พีช',     role: 'พนักงานผลิต', department: 'production' },
  { id: 'E005', name: 'นายธนกร โลวีรกุล',    nickname: 'กร',      role: 'พนักงานผลิต', department: 'production' },

  /* Labor — foreign workers */
  { id: 'E006', name: 'YE HTAY AUNG YE HTAY', nickname: 'ตาด้า',   role: 'แรงงาน', department: 'labor' },
  { id: 'E007', name: 'MIN ZAW',              nickname: 'มินซอ',  role: 'แรงงาน', department: 'labor' },
  { id: 'E008', name: 'SAN AYE',              nickname: 'เอ้ย',    role: 'แรงงาน', department: 'labor' },
  { id: 'E009', name: 'NWAY MOE THU TU',      nickname: 'โมตู',   role: 'แรงงาน', department: 'labor' },
  { id: 'E010', name: 'SAY MAR OO',           nickname: 'เทมาอู้', role: 'แรงงาน', department: 'labor' },
  { id: 'E011', name: 'THET TUN OO',          nickname: 'ชาย',    role: 'แรงงาน', department: 'labor' },

  /* Transport — mixer truck drivers (cross-linked with VEHICLES) */
  { id: 'E012', name: 'นายมนตรี ธนบัตร',     nickname: 'พี่เปี้ยม', role: 'หัวหน้าพนักงานจัดส่ง', department: 'transport' },
  { id: 'E013', name: 'นายศุภชัย ซื่อเลื่อม', nickname: 'โอ๊ต',    role: 'พนักงานจัดส่ง',          department: 'transport' },
  { id: 'E014', name: 'นายเจนภพ เย็นกลาง',                       role: 'พนักงานจัดส่ง',          department: 'transport' },
  { id: 'E015', name: 'นายพงศกร พรหมจรรย์',                      role: 'พนักงานจัดส่ง',          department: 'transport' },
]

/** Calculate years-of-service from startDate to `asOf` (default today). Returns
    a human-readable Thai string like "2 ปี 4 เดือน" or null when startDate is
    missing / invalid / in the future. */
export function yearsOfService(startDate: string | undefined, asOf: Date = new Date()): string | null {
  if (!startDate) return null
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return null
  const ms = asOf.getTime() - start.getTime()
  if (ms < 0) return null
  const totalMonths = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.4375))
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  if (y === 0 && m === 0) return 'น้อยกว่า 1 เดือน'
  if (y === 0) return `${m} เดือน`
  if (m === 0) return `${y} ปี`
  return `${y} ปี ${m} เดือน`
}

/** Initials for the avatar fallback. Picks the first two non-title characters
    of the name (skipping Thai title prefixes like นาย, น.ส.). */
export function employeeInitials(name: string): string {
  const stripped = name.replace(/^(นาย|นางสาว|น\.ส\.|นาง|ดร\.|คุณ)\s*/, '')
  /* For Latin-script names (foreign workers), use the first letter of the
     first two words. For Thai names, use the first 2 characters. */
  if (/^[A-Za-z]/.test(stripped)) {
    const parts = stripped.split(/\s+/).filter(Boolean)
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  }
  return stripped.slice(0, 2)
}
