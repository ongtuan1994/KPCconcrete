/* Mixer-truck-trip fee logic — the single source of truth shared by the
   บันทึกเที่ยวรถโม่ page (TruckTrips) and the payroll form's auto-pulled
   ค่าเที่ยววิ่ง. Keep every rate change here so both stay in sync. */
import { VEHICLES, VEHICLE_MAP, type DeliveryTicket } from './real'
import { EMPLOYEES } from './employees'
import type { TruckTripEntry } from './createdDocs'

/* 001/002 = 10 ล้อ (bigger); 003/004 = 6 ล้อ. */
export const TEN_WHEEL = new Set(['001', '002'])

/* ผู้จัดการ + คนขับรถนอก ได้ค่าเที่ยวแบบเหมา (ไม่คิด เกิน20/หลัง18/หลัง22). */
export const OUTSIDE_DRIVER = 'คนขับรถนอก'
export const MANAGER_DRIVERS = EMPLOYEES.filter((e) => e.department === 'manager').map((e) => e.name)
export const SPECIAL_DRIVERS = new Set<string>([...MANAGER_DRIVERS, OUTSIDE_DRIVER])
const SPECIAL_FEE_TEN = 100
const SPECIAL_FEE_SIX = 80
const OT_BONUS = 10

/** Driver picker options: fleet drivers + ผู้จัดการ + คนขับรถนอก. */
export const DRIVER_OPTIONS = Array.from(
  new Set([...VEHICLES.map((v) => v.driver), ...MANAGER_DRIVERS, OUTSIDE_DRIVER]),
)

export function isSpecialDriver(driver: string | undefined): boolean {
  return !!driver && SPECIAL_DRIVERS.has(driver)
}

/** Base per-trip rate: 10 ล้อ 35 (40 if เกิน 20 กม.) · 6 ล้อ 25 (30 if เกิน 20 กม.). */
function tripBase(vehicle: string, over20: boolean): number {
  if (TEN_WHEEL.has(vehicle)) return over20 ? 40 : 35
  return over20 ? 30 : 25
}

/** Per-trip fee for one delivery ticket. Special drivers get the flat rate;
    others get the wheel/distance base plus +10 หลัง 18:00 / +10 หลัง 22:00. */
export function rowFee(vehicle: string | undefined, e: TruckTripEntry, driver?: string): number {
  if (!vehicle) return 0
  if (isSpecialDriver(driver)) return TEN_WHEEL.has(vehicle) ? SPECIAL_FEE_TEN : SPECIAL_FEE_SIX
  return tripBase(vehicle, !!e.over20) + (e.ot18 ? OT_BONUS : 0) + (e.ot22 ? OT_BONUS : 0)
}

/** Delivery-ticket date "DD/MM/YY" (พ.ศ.) → ISO "YYYY-MM-DD" (ค.ศ.). 69 → 2026. */
export function ticketISO(date: string): string {
  const [dd, mm, yy] = date.split('/')
  if (!dd || !mm || !yy) return ''
  return `${1957 + Number(yy)}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

/** Strip a Thai title prefix so an employee name (e.g. "นายมนตรี ธนบัตร")
    matches the truck's driver name (e.g. "มนตรี ธนบัตร"), which is stored
    without the title in VEHICLES. */
function normName(s: string): string {
  return s.replace(/^(นางสาว|นาง|นาย|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง)\s*/, '').trim()
}

/** Total ค่าเที่ยววิ่ง earned by one driver (matched by name, title-insensitive)
    over an ISO date range — summed from customer (ขายลูกค้า) tickets that name a
    truck, applying any per-ticket driver override. Auto-fills the payroll form. */
export function truckTripFeeForDriver(
  driverName: string,
  fromIso: string,
  toIso: string,
  tickets: DeliveryTicket[],
  truckTrips: Record<string, TruckTripEntry>,
): number {
  const target = normName(driverName)
  if (!target) return 0
  let fee = 0
  for (const t of tickets) {
    if (t.type !== 'ขายลูกค้า') continue
    const iso = ticketISO(t.date)
    if (!iso || (fromIso && iso < fromIso) || (toIso && iso > toIso)) continue
    const vehicle = t.vehicle
    if (!vehicle) continue
    const e = truckTrips[t.dtNo] ?? {}
    const driver = e.driver ?? VEHICLE_MAP[vehicle]?.driver ?? ''
    if (normName(driver) !== target) continue
    fee += rowFee(vehicle, e, driver)
  }
  return Math.round(fee * 100) / 100
}
