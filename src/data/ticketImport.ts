/* Parse ใบจ่ายคอนกรีต (delivery tickets) from an uploaded spreadsheet grid into
   DeliveryTicket rows. Import format (per sheet), columns matched by header:
   วันที่ · เลขที่ใบจ่าย · ประเภท · ลูกค้า · คอนกรีต · จำนวนคิว · ราคา · จำนวนเงิน ·
   ใบกำกับ · ใบวางบิล · ชำระโดย · หมายเหตุ  (extra/re-ordered columns tolerated). */

import { PRODUCTS, PRODUCT_MAP, type DeliveryTicket, type PayMethod } from './real'

const pad2 = (n: number) => String(n).padStart(2, '0')
const r2 = (n: number) => Math.round(n * 100) / 100
const cleanName = (n: string) => n.replace(/\s*\(ปูน[^)]*\)/g, '').trim()

/** Strip ฿ / thousands separators from a cell into a number (NaN when blank). */
function num(s: string | undefined): number {
  if (s == null) return NaN
  const c = String(s).replace(/[฿,\s]/g, '').replace(/[^\d.\-]/g, '')
  return c === '' || c === '-' ? NaN : Number(c)
}

/** Parse a dd/mm/yy(yy) cell into month + a normalised dd/mm/yy date; null if none. */
function parseDate(s: string): { month: number; date: string } | null {
  const m = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/)
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2])
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
  const yy = m[3].length >= 2 ? m[3].slice(-2) : m[3]
  return { month: mo, date: `${pad2(d)}/${pad2(mo)}/${yy}` }
}

/** Normalise a ticket number: DT + digits when numeric; ref = trailing 5 digits.
    Preserves a non-numeric value as-is. null when empty. */
function normDtNo(s: string): { dtNo: string; ref: string } | null {
  const up = (s ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!up) return null
  const digits = up.replace(/\D/g, '')
  const dtNo = up.startsWith('DT') ? `DT${digits}` : (/^\d+$/.test(up) ? `DT${up}` : up)
  return { dtNo, ref: digits.slice(-5) }
}

function normType(s: string): string {
  const t = (s ?? '').trim()
  if (/โรงหล่อ/.test(t)) return 'โรงหล่อ'
  if (/ใช้เอง/.test(t)) return 'ใช้เอง'
  if (/ขาย|ลูกค้า/.test(t)) return 'ขายลูกค้า'
  return t || 'ขายลูกค้า'
}

function normPay(s: string): PayMethod {
  const t = (s ?? '').trim()
  if (/เครดิต/.test(t)) return 'เครดิต'
  if (/โอน/.test(t)) return 'โอน'
  if (/เช็ค|เชค/.test(t)) return 'เช็ค'
  if (/เงินสด|สด/.test(t)) return 'เงินสด'
  return '' as PayMethod
}

/** Best-effort map the "คอนกรีต" cell to a product code: exact code, exact name,
    then strength(+brand) heuristic; otherwise keep the raw label. */
function resolveProd(label: string): string {
  const s = (label ?? '').trim()
  if (!s) return ''
  if (PRODUCT_MAP[s]) return s
  const byName = PRODUCTS.find((p) => p.name === s || cleanName(p.name) === s)
  if (byName) return byName.code
  const strength = s.match(/(\d{3})/)?.[1]
  if (strength) {
    const cand = PRODUCTS.filter((p) => p.strengthKsc === Number(strength) && p.category === 'concrete')
    const isR2 = /ดอกบัว/.test(s), isSCG = /scg/i.test(s)
    const pick = cand.find((p) => (isR2 ? /^KPC[RP]2/.test(p.code) : isSCG ? !/^KPC[RP]2/.test(p.code) : true)) ?? cand[0]
    if (pick) return pick.code
  }
  return s
}

interface ColMap {
  date: number; dtNo: number; type: number; customer: number; prod: number
  m3: number; price: number; amount: number; invoice: number; billing: number; pay: number; note: number
}
/* Image column order — used when no header row is detected. */
const FIXED_COLS: ColMap = { date: 0, dtNo: 1, type: 2, customer: 3, prod: 4, m3: 5, price: 6, amount: 7, invoice: 8, billing: 9, pay: 10, note: 11 }

/** Map columns from the header row (วันที่ + เลขที่ใบจ่าย present). */
function detectCols(grid: string[][]): ColMap {
  for (const row of grid) {
    const has = (re: RegExp) => row.some((c) => re.test(c ?? ''))
    if (!(has(/วันที่/) && has(/ใบจ่าย|เลขที่/))) continue
    const find = (re: RegExp, fallback: number) => { const i = row.findIndex((c) => re.test(c ?? '')); return i >= 0 ? i : fallback }
    return {
      date: find(/วันที่/, 0),
      dtNo: find(/เลขที่ใบจ่าย|ใบจ่าย|เลขที่/, 1),
      type: find(/ประเภท/, 2),
      customer: find(/ลูกค้า/, 3),
      prod: find(/คอนกรีต|สินค้า/, 4),
      m3: find(/จำนวนคิว|ปริมาณ|คิว/, 5),
      price: find(/ราคา/, 6),
      amount: find(/จำนวนเงิน|ยอดเงิน/, 7),
      invoice: find(/ใบกำกับ/, 8),
      billing: find(/ใบวางบิล|วางบิล/, 9),
      pay: find(/ชำระ/, 10),
      note: find(/หมายเหตุ/, 11),
    }
  }
  return FIXED_COLS
}

/** Turn one sheet's grid into importable delivery tickets. A row counts when it
    has a parseable date and a ticket number; header/blank/total rows are skipped.
    price/amount fall back to each other (amount = คิว × ราคา when blank). */
export function parseTicketGrid(grid: string[][]): DeliveryTicket[] {
  const cols = detectCols(grid)
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')
  const out: DeliveryTicket[] = []
  for (const row of grid) {
    if (!row || row.length === 0) continue
    const parsed = parseDate(cell(row, cols.date))
    if (!parsed) continue
    const dt = normDtNo(cell(row, cols.dtNo))
    if (!dt) continue
    const m3 = num(row[cols.m3]); const price = num(row[cols.price]); let amount = num(row[cols.amount])
    if (!Number.isFinite(amount)) amount = Number.isFinite(m3) && Number.isFinite(price) ? r2(m3 * price) : 0
    out.push({
      month: parsed.month, date: parsed.date, dtNo: dt.dtNo, ref: dt.ref,
      type: normType(cell(row, cols.type)),
      customer: cell(row, cols.customer),
      prod: resolveProd(cell(row, cols.prod)),
      m3: Number.isFinite(m3) ? m3 : 0,
      price: Number.isFinite(price) ? price : 0,
      amount: Number.isFinite(amount) ? amount : 0,
      invoice: cell(row, cols.invoice),
      billing: cell(row, cols.billing),
      pay: normPay(cell(row, cols.pay)),
      note: cell(row, cols.note),
    })
  }
  return out
}
