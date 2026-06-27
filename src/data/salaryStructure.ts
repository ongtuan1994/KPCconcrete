/* Standing salary structure per employee — seeded from the real May 2569
   payroll sheets (เงินเดือน / ประสบการณ์ / ปกส.). Editable values saved through
   the "ปรับโครงสร้าง" page (createdDocs.salaryStructures) override this seed.

   OT rate is บาท/นาที. Burmese day-rate workers (E006–E011) carry their real
   per-worker OT rate from the wage sheet; everyone else uses the default. */

import type { SalaryStructure } from './createdDocs'

export const DEFAULT_OT_RATE = 1.5

/** Daily wage used for the OT calculation: the explicit เงินรายวัน when set,
    otherwise derived from the monthly เงินเดือน ÷ 30. */
export function dailyWageFor(s: { dailyWage: number; baseSalary: number }): number {
  if (s.dailyWage > 0) return s.dailyWage
  if (s.baseSalary > 0) return s.baseSalary / 30
  return 0
}

/** OT rate (บาท/นาที) = เงินรายวัน ÷ 480 (8 ชม. × 60 นาที) × 1.5, truncated to
    2 decimals WITHOUT rounding up. Returns 0 when no wage is set. */
export function computeOtRate(s: { dailyWage: number; baseSalary: number }): number {
  const rate = (dailyWageFor(s) / 480) * 1.5
  return Math.floor(rate * 100) / 100
}

export const SALARY_STRUCTURE_SEED: Record<string, SalaryStructure> = {
  /* Thai staff — แพล้นปูน / สำนักงาน (รายเดือน) */
  E001: { baseSalary: 13000, dailyWage: 0, experiencePay: 4500, socialSecurity: 650, otRatePerMinute: DEFAULT_OT_RATE },
  E002: { baseSalary: 12000, dailyWage: 0, experiencePay: 5500, socialSecurity: 600, otRatePerMinute: DEFAULT_OT_RATE },
  E003: { baseSalary: 11000, dailyWage: 0, experiencePay: 3500, socialSecurity: 550, otRatePerMinute: DEFAULT_OT_RATE },
  E004: { baseSalary: 10500, dailyWage: 0, experiencePay: 3000, socialSecurity: 525, otRatePerMinute: DEFAULT_OT_RATE },
  E005: { baseSalary: 9600,  dailyWage: 0, experiencePay: 0,    socialSecurity: 0,   otRatePerMinute: DEFAULT_OT_RATE },

  /* Labour — Burmese day-rate workers (เงินรายวัน; ไม่มีเงินเดือนรายเดือน) */
  E006: { baseSalary: 0, dailyWage: 550, experiencePay: 0, socialSecurity: 360, otRatePerMinute: 1.71 },
  E007: { baseSalary: 0, dailyWage: 400, experiencePay: 0, socialSecurity: 360, otRatePerMinute: 1.25 },
  E008: { baseSalary: 0, dailyWage: 400, experiencePay: 0, socialSecurity: 360, otRatePerMinute: 1.25 },
  E009: { baseSalary: 0, dailyWage: 380, experiencePay: 0, socialSecurity: 360, otRatePerMinute: 1.18 },
  E010: { baseSalary: 0, dailyWage: 380, experiencePay: 0, socialSecurity: 360, otRatePerMinute: 1.18 },
  E011: { baseSalary: 0, dailyWage: 450, experiencePay: 0, socialSecurity: 360, otRatePerMinute: 1.40 },

  /* Transport — mixer-truck drivers (ฝ่ายขนส่งรถโม่ · รายเดือน) */
  E012: { baseSalary: 12000, dailyWage: 0, experiencePay: 3000, socialSecurity: 600, otRatePerMinute: DEFAULT_OT_RATE },
  E013: { baseSalary: 10500, dailyWage: 0, experiencePay: 1500, socialSecurity: 525, otRatePerMinute: DEFAULT_OT_RATE },
  E014: { baseSalary: 10500, dailyWage: 0, experiencePay: 1500, socialSecurity: 525, otRatePerMinute: DEFAULT_OT_RATE },
  E015: { baseSalary: 10500, dailyWage: 0, experiencePay: 1500, socialSecurity: 0,   otRatePerMinute: DEFAULT_OT_RATE },

  /* Interns — day-rate trainees (เด็กฝึกงาน · รายวัน 100 บาท/วัน) */
  E016: { baseSalary: 0, dailyWage: 100, experiencePay: 0, socialSecurity: 0, otRatePerMinute: 0.31 },
  E017: { baseSalary: 0, dailyWage: 100, experiencePay: 0, socialSecurity: 0, otRatePerMinute: 0.31 },
}

/** Effective structure for an employee: per-employee override → seed → defaults.
    Spread over defaults so older overrides missing newer fields stay valid. */
export function salaryStructureFor(id: string, overrides: Record<string, SalaryStructure>): SalaryStructure {
  const base = overrides[id] ?? SALARY_STRUCTURE_SEED[id]
  const defaults = { baseSalary: 0, dailyWage: 0, experiencePay: 0, socialSecurity: 0, otRatePerMinute: DEFAULT_OT_RATE }
  return base ? { ...defaults, ...base } : defaults
}

/** True when the employee has real structure data (an override or a seed entry). */
export function hasSalaryStructure(id: string, overrides: Record<string, SalaryStructure>): boolean {
  return !!(overrides[id] || SALARY_STRUCTURE_SEED[id])
}
