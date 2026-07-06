import { STOCK_MATERIALS, type StockMaterial, type DeliveryTicket } from './real'
import { MIX_BY_CODE } from './mixDesign'
import type { Tone } from '../components/ui'
import type { CreatedDocs } from './createdDocs'

/* Estimated raw-material consumption per 1 m³ of concrete (ตัน). Used to auto-
   issue stock when a ใบจ่ายคอนกรีต is created. Admixtures vary by mix and are
   not auto-deducted. Cement is charged to SCG or ดอกบัว by the product code. */
export const MIX_PER_M3 = { cement: 0.32, SAN: 0.80, AGG: 1.05 } as const

/** R2/P2 = ปูนดอกบัว (CEM-2) ; RO/PO = ปูน SCG (CEM-1). */
export const cementCodeOf = (prod: string): 'CEM-1' | 'CEM-2' => (/^KPC[RP]2/.test(prod) ? 'CEM-2' : 'CEM-1')

const r2 = (n: number) => Math.round(n * 100) / 100

/** Raw-material lines consumed by one delivery ticket — uses the real mix design
    for the product when available (kg → ตัน), else the per-m³ estimate. */
export function ticketConsumption(t: DeliveryTicket): { code: string; qty: number }[] {
  const m3 = t.m3 || 0
  if (m3 <= 0) return []
  const mix = MIX_BY_CODE[t.prod]
  const lines = [
    { code: cementCodeOf(t.prod), qty: r2(m3 * (mix ? mix.cement / 1000 : MIX_PER_M3.cement)) },
    { code: 'SAN', qty: r2(m3 * (mix ? mix.sand / 1000 : MIX_PER_M3.SAN)) },
    { code: 'AGG', qty: r2(m3 * (mix ? mix.aggregate / 1000 : MIX_PER_M3.AGG)) },
  ]
  if (mix?.plastomix) lines.push({ code: 'ADM-D', qty: r2(m3 * mix.plastomix) })
  if (mix?.pce) lines.push({ code: 'ADM-F', qty: r2(m3 * mix.pce) })
  return lines
}

/** Stock status by balance vs reorder point — the shared เขียว/เหลือง/แดง scheme:
    พอเพียง (success) · ใกล้หมด (warning) · ติดลบ/หมด (danger). */
export function stockStatus(m: { balance: number; reorder: number }): { th: string; en: string; tone: Tone } {
  if (m.balance <= 0) return { th: 'ติดลบ / หมด', en: 'Out', tone: 'danger' }
  if (m.balance < m.reorder) return { th: 'ใกล้หมด', en: 'Low', tone: 'warning' }
  return { th: 'พอเพียง', en: 'In stock', tone: 'success' }
}

/** Live plant raw-material balances — the same math as the คลังวัตถุดิบแพล้นปูน
    page with no date filter: seed + รับเข้า + approved กระทบยอด − auto-จ่ายออก by
    delivery tickets. Returns each plant material with `balance` set to the current
    effective quantity. */
export function plantLiveBalances(created: CreatedDocs): StockMaterial[] {
  const universe = STOCK_MATERIALS.filter((m) => (m.site ?? 'plant') === 'plant')
  const codes = new Set(universe.map((m) => m.code))

  const recv: Record<string, number> = {}
  for (const r of created.stockReceipts) if (codes.has(r.code)) recv[r.code] = (recv[r.code] ?? 0) + r.qty

  const adj: Record<string, number> = {}
  for (const rc of created.stockReconciles) {
    if (rc.status !== 'approved' || (rc.scope ?? 'material') !== 'material') continue
    for (const l of rc.lines) if (l.diff && codes.has(l.code)) adj[l.code] = (adj[l.code] ?? 0) + l.diff
  }

  const iss: Record<string, number> = {}
  for (const t of created.tickets) for (const c of ticketConsumption(t)) iss[c.code] = (iss[c.code] ?? 0) + c.qty

  return universe.map((m) => ({
    ...m,
    balance: r2(m.balance + (recv[m.code] ?? 0) + (adj[m.code] ?? 0) - (iss[m.code] ?? 0)),
  }))
}
