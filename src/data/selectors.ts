/* Derived views over the real delivery-ticket data (6 months, พ.ศ.2569).
   The business issues a tax invoice by grouping a customer's delivery tickets
   for a day; this module reproduces that roll-up, plus receipts, billing notes,
   customer aggregates and dashboard figures — all from real data, month-aware. */

import { DELIVERY_TICKETS, PRODUCT_MAP, CUSTOMER_MAP, MONTHS, VEHICLES, ZONE_ROUNDTRIP_KM, type DeliveryTicket } from './real'

export { MONTHS }
export const LATEST_MONTH = MONTHS[MONTHS.length - 1].num
export const monthLabel = (m: number) => MONTHS.find((x) => x.num === m)?.label ?? ''
export const monthShort = (m: number) => MONTHS.find((x) => x.num === m)?.short ?? ''

/* ---------- formatting ---------- */
export const baht = (n: number) =>
  '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const bahtShort = (n: number) => {
  const neg = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1_000_000) return neg + '฿' + (a / 1_000_000).toFixed(2) + 'M'
  if (a >= 1_000) return neg + '฿' + (a / 1_000).toFixed(0) + 'k'
  return neg + '฿' + a.toFixed(0)
}
export const qm = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const dd = (date: string) => parseInt(date.slice(0, 2), 10) || 0
export const TODAY = '21/06/69'

/* ---------- delivery-zone & vehicle helpers ---------- */
/** Round-trip distance (km) inferred from the product code's distance band. */
export function ticketDistanceKm(t: DeliveryTicket): number {
  const c = t.prod
  if (c.includes('OV41')) return ZONE_ROUNDTRIP_KM.OV41
  if (c.includes('OV31')) return ZONE_ROUNDTRIP_KM.OV31
  if (c.includes('OV21')) return ZONE_ROUNDTRIP_KM.OV21
  if (c.includes('OS00')) return ZONE_ROUNDTRIP_KM.OS
  return 0
}

/** Deterministic vehicle fallback for seed tickets (which lack `vehicle`).
    Tickets with m3 > 3 must go to a 6-คิว truck (001/002); smaller loads
    round-robin across all four. Uses the numeric tail of dtNo as the seed
    so the assignment is stable across renders. */
export function vehicleForTicket(t: DeliveryTicket): string {
  if (t.vehicle) return t.vehicle
  const hash = (parseInt(t.ref || t.dtNo.slice(-5), 10) || 0)
  if (t.m3 > 3) return VEHICLES[hash % 2].id /* '001' or '002' */
  return VEHICLES[hash % VEHICLES.length].id
}

/* ---------- product display ---------- */
export function prodName(code: string) {
  return PRODUCT_MAP[code]?.name ?? code
}
export function prodShort(code: string) {
  const p = PRODUCT_MAP[code]
  if (!p) return code
  if (p.category === 'precast') return 'เสาเข็ม/คาน'
  /* Cement brand from product code: R2/P2 prefix = ดอกบัว, RO/PO = SCG */
  const brand = /^KPC[RP]2/.test(code) ? '(ดอกบัว)' : '(SCG)'
  if (p.category === 'lean') return `Lean ${brand}`
  return `${p.strengthKsc} ksc ${brand}`
}

/* ---------- customer master ---------- */
export function customerLegal(name: string) {
  const c = CUSTOMER_MAP[name]
  return {
    display: c?.legalName || name,
    address: c?.address && c.address !== '—' ? c.address : '—',
    taxId: c?.taxId && c.taxId !== '—' ? c.taxId : '—',
    terms: c?.terms ?? '—',
  }
}

/* ---------- invoice register (derived from real delivery tickets) ---------- */
export type InvStatus = 'paid' | 'pending' | 'overdue'
export interface InvoiceLine { code: string; name: string; unit: string; qty: number; price: number; amount: number }
export interface Invoice {
  no: string
  month: number
  date: string
  dueDate: string
  customer: string
  pay: string
  lines: InvoiceLine[]
  refs: string[]
  subtotal: number
  vat: number
  total: number
  status: InvStatus
}

function plus30(date: string) {
  const [d, m, y] = date.split('/').map((x) => parseInt(x, 10))
  let nd = d + 30, nm = m, ny = y
  if (nd > 30) { nd -= 30; nm += 1 }
  if (nm > 12) { nm -= 12; ny += 1 }
  return `${String(nd).padStart(2, '0')}/${String(nm).padStart(2, '0')}/${ny}`
}

function buildInvoices(): Invoice[] {
  const sales = DELIVERY_TICKETS.filter((t) => t.type === 'ขายลูกค้า' && t.amount > 0)
  const groups = new Map<string, DeliveryTicket[]>()
  for (const t of sales) {
    const key = `${t.month}__${t.date}__${t.customer}__${t.pay}`
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }
  const invoices: Invoice[] = []
  const seqByDay = new Map<string, number>()
  const keys = [...groups.keys()].sort((a, b) => {
    const [ma, da] = a.split('__'); const [mb, db] = b.split('__')
    return Number(ma) - Number(mb) || dd(da) - dd(db) || a.localeCompare(b)
  })
  for (const key of keys) {
    const ts = groups.get(key)!
    const [monthStr, date, customer, pay] = key.split('__')
    const month = Number(monthStr)
    const dayKey = `${monthStr}-${date.slice(0, 2)}`
    const seq = (seqByDay.get(dayKey) ?? 0) + 1
    seqByDay.set(dayKey, seq)
    const lineMap = new Map<string, InvoiceLine>()
    for (const t of ts) {
      const lk = `${t.prod}__${t.price}`
      const ex = lineMap.get(lk)
      if (ex) { ex.qty += t.m3; ex.amount += t.amount } else {
        const p = PRODUCT_MAP[t.prod]
        lineMap.set(lk, { code: t.prod, name: p?.name ?? t.prod, unit: p?.unit ?? 'คิว', qty: t.m3, price: t.price, amount: t.amount })
      }
    }
    const lines = [...lineMap.values()]
    const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
    const vat = Math.round(subtotal * 0.07 * 100) / 100
    const total = Math.round((subtotal + vat) * 100) / 100
    const no = `IV69${String(month).padStart(2, '0')}${date.slice(0, 2)}-${String(seq).padStart(4, '0')}`
    const dueDate = plus30(date)
    const paid = pay === 'เงินสด' || pay === 'โอน'
    const status: InvStatus = paid ? 'paid' : month < LATEST_MONTH ? 'overdue' : 'pending'
    invoices.push({ no, month, date, dueDate, customer, pay, lines, refs: ts.map((t) => t.ref), subtotal, vat, total, status })
  }
  return invoices.sort((a, b) => b.month - a.month || dd(b.date) - dd(a.date) || b.no.localeCompare(a.no))
}
export const INVOICES: Invoice[] = buildInvoices()

/* ---------- receipts (from paid invoices) ---------- */
export interface Receipt { no: string; month: number; date: string; customer: string; invoiceNos: string[]; amount: number; method: string }
export const RECEIPTS: Receipt[] = (() => {
  const paid = INVOICES.filter((i) => i.status === 'paid')
  const byKey = new Map<string, Invoice[]>()
  for (const inv of paid) {
    const k = `${inv.month}__${inv.date}__${inv.customer}`
    const arr = byKey.get(k) ?? []; arr.push(inv); byKey.set(k, arr)
  }
  const seqByMonth = new Map<number, number>()
  return [...byKey.entries()]
    .sort((a, b) => {
      const [ma, da] = a[0].split('__'); const [mb, db] = b[0].split('__')
      return Number(mb) - Number(ma) || dd(db) - dd(da)
    })
    .map(([k, invs]) => {
      const [monthStr, date, customer] = k.split('__')
      const month = Number(monthStr)
      const seq = (seqByMonth.get(month) ?? 0) + 1
      seqByMonth.set(month, seq)
      return {
        no: `RC69${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`,
        month, date, customer,
        invoiceNos: invs.map((i) => i.no),
        amount: invs.reduce((s, i) => s + i.total, 0),
        method: invs[0].pay,
      }
    })
})()

/* ---------- billing notes (group unpaid invoices per customer per month) ---------- */
export interface BillingNote { no: string; month: number; date: string; customer: string; invoices: Invoice[]; total: number }
export const BILLING_NOTES: BillingNote[] = (() => {
  const credit = INVOICES.filter((i) => i.status !== 'paid')
  const byKey = new Map<string, Invoice[]>()
  for (const inv of credit) {
    const k = `${inv.month}__${inv.customer}`
    const arr = byKey.get(k) ?? []; arr.push(inv); byKey.set(k, arr)
  }
  const seqByMonth = new Map<number, number>()
  return [...byKey.entries()]
    .map(([k, invs]) => {
      const [monthStr, customer] = k.split('__')
      const month = Number(monthStr)
      const seq = (seqByMonth.get(month) ?? 0) + 1
      seqByMonth.set(month, seq)
      const sorted = invs.sort((a, b) => dd(a.date) - dd(b.date))
      return {
        no: `BN69${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`,
        month, date: `__/${String(month).padStart(2, '0')}/69`,
        customer, invoices: sorted,
        total: sorted.reduce((s, i) => s + i.total, 0),
      }
    })
    .sort((a, b) => b.month - a.month || b.total - a.total)
})()

/* ---------- customer aggregates (month-aware) ---------- */
export interface CustomerAgg {
  name: string
  type: string
  tickets: number
  m3: number
  sales: number
  outstanding: number
  lastDate: string
  months: number
}
export function customerAgg(month: number | 'all'): CustomerAgg[] {
  const tix = month === 'all' ? DELIVERY_TICKETS : DELIVERY_TICKETS.filter((t) => t.month === month)
  const map = new Map<string, CustomerAgg>()
  for (const t of tix) {
    const c = map.get(t.customer) ?? { name: t.customer, type: t.type, tickets: 0, m3: 0, sales: 0, outstanding: 0, lastDate: t.date, months: 0 }
    c.tickets += 1; c.m3 += t.m3; c.sales += t.amount
    if (dd(t.date) >= dd(c.lastDate)) c.lastDate = t.date
    map.set(t.customer, c)
  }
  const invs = month === 'all' ? INVOICES : INVOICES.filter((i) => i.month === month)
  for (const inv of invs) {
    if (inv.status !== 'paid') {
      const c = map.get(inv.customer)
      if (c) c.outstanding += inv.total
    }
  }
  return [...map.values()].filter((c) => c.sales > 0).sort((a, b) => b.sales - a.sales)
}

/* ---------- dashboard aggregates (month-aware) ---------- */
export function monthTotals(month: number) {
  const tix = DELIVERY_TICKETS.filter((t) => t.month === month)
  const sales = tix.filter((t) => t.amount > 0)
  const invs = INVOICES.filter((i) => i.month === month)
  return {
    revenue: sales.reduce((s, t) => s + t.amount, 0),
    m3All: tix.reduce((s, t) => s + t.m3, 0),
    m3Sold: sales.reduce((s, t) => s + t.m3, 0),
    tickets: tix.length,
    credit: tix.filter((t) => t.pay === 'เครดิต').reduce((s, t) => s + t.amount, 0),
    cash: tix.filter((t) => t.pay === 'เงินสด' || t.pay === 'โอน').reduce((s, t) => s + t.amount, 0),
    invoices: invs.length,
    overdueCount: invs.filter((i) => i.status === 'overdue').length,
  }
}

export function dailyM3(month: number): { day: number; m3: number; sales: number }[] {
  const byDay = new Map<number, { m3: number; sales: number }>()
  for (const t of DELIVERY_TICKETS.filter((x) => x.month === month)) {
    const d = dd(t.date)
    const e = byDay.get(d) ?? { m3: 0, sales: 0 }
    e.m3 += t.m3; e.sales += t.amount
    byDay.set(d, e)
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, v]) => ({ day, m3: v.m3, sales: v.sales }))
}

export function productMix(month: number): { code: string; label: string; m3: number; pct: number }[] {
  const byProd = new Map<string, number>()
  for (const t of DELIVERY_TICKETS.filter((x) => x.month === month)) byProd.set(t.prod, (byProd.get(t.prod) ?? 0) + t.m3)
  const total = [...byProd.values()].reduce((a, b) => a + b, 0) || 1
  return [...byProd.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, m3]) => ({ code, label: prodShort(code), m3, pct: Math.round((m3 / total) * 100) }))
}

export function invoiceStatusSplit(month: number) {
  const invs = INVOICES.filter((i) => i.month === month)
  const total = invs.length || 1
  const c = (s: InvStatus) => invs.filter((i) => i.status === s).length
  return {
    paid: Math.round((c('paid') / total) * 100),
    pending: Math.round((c('pending') / total) * 100),
    overdue: Math.round((c('overdue') / total) * 100),
    counts: { paid: c('paid'), pending: c('pending'), overdue: c('overdue') },
  }
}

/* all-time monthly trend (for reports) */
export const MONTHLY_TREND = MONTHS.map((m) => {
  const t = monthTotals(m.num)
  return { month: m.num, short: m.short, revenue: t.revenue, m3: t.m3All, tickets: t.tickets }
})
