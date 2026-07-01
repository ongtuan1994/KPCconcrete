/* Employee roster — names sourced from the company's printed sheets. To attach
   a photo, drop a file at /public/staff/{id}.jpg (id from the rows below).
   Fill in startDate (ISO YYYY-MM-DD) to enable the years-of-service display. */

export type Department =
  | 'manager'
  | 'accounting'
  | 'production'
  | 'labor'
  | 'transport'
  | 'intern'

export const DEPARTMENT_LABEL: Record<Department, { th: string; en: string }> = {
  manager:    { th: 'ผู้จัดการ',          en: 'Manager' },
  accounting: { th: 'บัญชี',             en: 'Accounting' },
  production: { th: 'ฝ่ายผลิต',          en: 'Production' },
  labor:      { th: 'แรงงาน',            en: 'Labor' },
  transport:  { th: 'ฝ่ายขนส่งรถโม่',   en: 'Transport — Mixer Truck' },
  intern:     { th: 'เด็กฝึกงาน',         en: 'Intern' },
}

/** Work site / business unit the employee belongs to. */
export type Site = 'plant' | 'foundry'

export const SITE_LABEL: Record<Site, { th: string; en: string }> = {
  plant:   { th: 'แพล้นปูน', en: 'Concrete Plant' },
  foundry: { th: 'โรงหล่อ',  en: 'Foundry' },
}

/** Employee nationality (สัญชาติ). */
export type Nationality = 'ไทย' | 'พม่า'
export const NATIONALITIES: Nationality[] = ['ไทย', 'พม่า']

export interface Employee {
  id: string
  name: string
  nickname?: string
  /** Job title / role, e.g. "ผู้จัดการ", "พนักงานผลิต", "พนักงานจัดส่ง". */
  role: string
  department: Department
  /** Work site / business unit — แพล้นปูน (plant) or โรงหล่อ (foundry). */
  site?: Site
  /** Nationality (สัญชาติ) — ไทย / พม่า. */
  nationality?: Nationality
  /** ISO date string when employment began. Optional — when omitted the
      "อายุงาน" column shows "—". */
  startDate?: string
  /** Phone number for the employee, e.g. "081-234-5678". */
  phone?: string
  /** Bank for payroll transfer, e.g. "ธ.กสิกรไทย". */
  bankName?: string
  /** Bank account number for payroll, e.g. "123-4-56789-0". */
  bankAccount?: string
  /** Path to a portrait photo (e.g. "/staff/E001.jpg"). Falls back to an
      initials avatar when omitted or the file is missing. */
  photoUrl?: string
  /* Audit stamp on user-added employees (seed roster leaves these undefined). */
  createdBy?: string
  createdAt?: string
}

/** Common Thai banks for the payroll-account dropdown. */
export const THAI_BANKS = [
  'ธ.กสิกรไทย',
  'ธ.ไทยพาณิชย์',
  'ธ.กรุงเทพ',
  'ธ.กรุงไทย',
  'ธ.กรุงศรีอยุธยา',
  'ธ.ออมสิน',
  'ธ.ทหารไทยธนชาต (ttb)',
  'ธ.ก.ส.',
] as const

export const EMPLOYEES: Employee[] = [
  /* Management */
  { id: 'E001', name: 'นายสหรัฐ เพ็ชรฉิม',  nickname: 'เบนซ์', role: 'ผู้จัดการ',     department: 'manager', site: 'foundry', nationality: 'ไทย', startDate: '2022-02-07', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '429-2-37798-5' },

  /* Accounting */
  { id: 'E002', name: 'น.ส.เพียงแข ดันยูชน', nickname: 'ใหม่',    role: 'บัญชี',         department: 'accounting', site: 'plant', nationality: 'ไทย', startDate: '2022-05-04', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '429-2-46462-7' },

  /* Production — Thai staff */
  { id: 'E003', name: 'นายชัยวัฒน์ ขุนเพ็ชร', nickname: 'บริ้ง',   role: 'พนักงานผลิต', department: 'production', site: 'plant', nationality: 'ไทย', startDate: '2022-04-16', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '791-2-07364-5' },
  { id: 'E004', name: 'นายกฤษฎา ปื่นเกตุ',   nickname: 'พีช',     role: 'พนักงานผลิต', department: 'production', site: 'plant', nationality: 'ไทย', startDate: '2022-10-10', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '791-2-07664-8' },
  { id: 'E005', name: 'นายธนกร โลวีรกุล',    nickname: 'กร',      role: 'พนักงานผลิต', department: 'production', site: 'plant', nationality: 'พม่า', startDate: '2025-08-25' },

  /* Labor — foreign workers */
  { id: 'E006', name: 'YE HTAY AUNG YE HTAY', nickname: 'ตาด้า',   role: 'แรงงาน', department: 'labor', site: 'foundry', nationality: 'พม่า', startDate: '2018-03-01' },
  { id: 'E007', name: 'MIN ZAW',              nickname: 'มินซอ',  role: 'แรงงาน', department: 'labor', site: 'foundry', nationality: 'พม่า', startDate: '2018-03-01' },
  { id: 'E008', name: 'SAN AYE',              nickname: 'เอ้ย',    role: 'แรงงาน', department: 'labor', site: 'foundry', nationality: 'พม่า', startDate: '2020-10-01' },
  { id: 'E009', name: 'NWAY MOE THU TU',      nickname: 'โมตู',   role: 'แรงงาน', department: 'labor', site: 'foundry', nationality: 'พม่า', startDate: '2018-02-01' },
  { id: 'E010', name: 'SAY MAR OO',           nickname: 'เทมาอู้', role: 'แรงงาน', department: 'labor', site: 'foundry', nationality: 'พม่า', startDate: '2018-02-01' },
  { id: 'E011', name: 'THET TUN OO',          nickname: 'ชาย',    role: 'แรงงาน', department: 'labor', site: 'foundry', nationality: 'พม่า', startDate: '2025-02-03' },

  /* Transport — mixer truck drivers (cross-linked with VEHICLES) */
  { id: 'E012', name: 'นายมนตรี ธนบัตร',     nickname: 'เบิ้ม', role: 'หัวหน้าพนักงานจัดส่ง', department: 'transport', site: 'plant', nationality: 'ไทย', startDate: '2021-03-01', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '429-2-25618-9' },
  { id: 'E013', name: 'นายศุภชัย ซื่อเลื่อม', nickname: 'โอ๊ต',    role: 'พนักงานจัดส่ง',          department: 'transport', site: 'plant', nationality: 'ไทย', startDate: '2024-08-10', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '921-9-94486-6' },
  { id: 'E014', name: 'นายเจนภพ เย็นกลาง',   nickname: 'วาน',    role: 'พนักงานจัดส่ง',          department: 'transport', site: 'plant', nationality: 'ไทย', startDate: '2025-11-01', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '760-924303-0' },
  { id: 'E015', name: 'นายพงศกร พรหมจรรย์',  nickname: 'บอย',    role: 'พนักงานจัดส่ง',          department: 'transport', site: 'plant', nationality: 'ไทย', bankName: 'ธ.ทหารไทยธนชาต (ttb)', bankAccount: '760-9-03038-7' },

  /* Interns — day-rate trainees (เด็กฝึกงาน · รายวัน) */
  { id: 'E016', name: 'กฤต',   nickname: 'กฤต',   role: 'เด็กฝึกงาน', department: 'intern', site: 'plant', nationality: 'ไทย' },
  { id: 'E017', name: 'ปาล์ม', nickname: 'ปาล์ม', role: 'เด็กฝึกงาน', department: 'intern', site: 'plant', nationality: 'ไทย' },

  /* Foundry production — Burmese (added 25/06/2569) */
  { id: 'E018', name: 'โซ่',      nickname: 'โซ่',      role: 'พนักงานผลิต', department: 'production', site: 'foundry', nationality: 'พม่า', startDate: '2026-06-25' },
  { id: 'E019', name: 'เตเลอ่าว', nickname: 'เตเลอ่าว', role: 'แรงงาน',       department: 'production', site: 'foundry', nationality: 'พม่า', startDate: '2026-06-25' },
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
