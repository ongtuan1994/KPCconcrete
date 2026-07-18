import { VEHICLES } from './real'
import type { GoodsPaymentSite } from './createdDocs'

/** A vehicle selectable on a ค่าน้ำมัน (fuel) expense, grouped by SITE.
    - แพล้นปูน: the mixer trucks (รถโม่, VEHICLES) plus a wheel loader (รถตัก)
    - โรงหล่อ: the pickup (บง 6262) and the forklift (รถโฟล์คลิฟท์)
    `kind: 'mixer'` liters are reported under ลิตร(รถปูน); everything else under ลิตร(อื่นๆ). */
export interface FuelVehicle {
  id: string
  label: string            /* dropdown label */
  short: string            /* concise name for summaries / the detail view */
  reg: string              /* ทะเบียนรถ shown in the fuel report (plate or name) */
  driver?: string          /* พนง.ขับรถ */
  kind: 'mixer' | 'other'
}

export const FUEL_VEHICLES: Record<GoodsPaymentSite, FuelVehicle[]> = {
  แพล้นปูน: [
    ...VEHICLES.map((v) => ({ id: v.id, label: `รถ ${v.id} (${v.plate})`, short: `รถโม่ ${v.id}`, reg: v.plate, driver: v.driver, kind: 'mixer' as const })),
    { id: 'loader', label: 'รถตัก', short: 'รถตัก', reg: 'รถตัก', kind: 'other' },
  ],
  โรงหล่อ: [
    { id: 'pickup-6262', label: 'รถกระบะ (บง 6262)', short: 'รถกระบะ (บง 6262)', reg: 'บง 6262', kind: 'other' },
    { id: 'forklift', label: 'รถโฟล์คลิฟท์', short: 'รถโฟล์คลิฟท์', reg: 'โฟล์คลิฟท์', kind: 'other' },
  ],
}

/** All fuel vehicles across both SITEs, in the order they'd appear in a report. */
export const ALL_FUEL_VEHICLES: FuelVehicle[] = [...FUEL_VEHICLES['แพล้นปูน'], ...FUEL_VEHICLES['โรงหล่อ']]
export const FUEL_VEHICLE_BY_ID: Record<string, FuelVehicle> = Object.fromEntries(ALL_FUEL_VEHICLES.map((v) => [v.id, v]))

/** Concise name for a fuel record's vehicle id (falls back to the raw id). */
export const fuelVehicleLabel = (id: string) => FUEL_VEHICLE_BY_ID[id]?.short ?? `รถ ${id}`
/** ทะเบียนรถ (plate / name) for the fuel report (falls back to the raw id). */
export const fuelVehicleReg = (id: string) => FUEL_VEHICLE_BY_ID[id]?.reg ?? id
/** True when the vehicle is a mixer truck (รถโม่) — its liters go in the ลิตร(รถปูน) column. */
export const isMixerVehicle = (id: string) => FUEL_VEHICLE_BY_ID[id]?.kind === 'mixer'
