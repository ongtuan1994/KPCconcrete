import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Pill } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { Modal } from '../components/Modal'
import { baht } from '../data/selectors'
import { COMPANY } from '../data/real'
import { TAX_SALE, TAX_PURCHASE, type TaxMonthData, type TaxRow, type ImportedTaxRow } from '../data/taxReports'
import { SEED_TAX_IMPORTS } from '../data/taxSeed'
import { useCreatedDocs, addTaxImports, clearTaxImports, taxImportKey, type GoodsPayment } from '../data/createdDocs'
import { useCurrentUser } from '../data/auth'
import { parseSpreadsheet } from '../utils/spreadsheet'
import { downloadCsv } from '../utils/csv'

type Kind = 'sale' | 'purchase'

const r2 = (n: number) => Math.round(n * 100) / 100

/** พ.ศ. year of the built-in seed data (and ใบสำคัญจ่าย dated in the current year). */
const SEED_YEAR = 2569

/** Buddhist year (พ.ศ.) of an ISO yyyy-mm-dd date (Gregorian + 543). */
function buddhistYearOfIso(iso: string): number {
  const m = iso.match(/^(\d{4})/)
  return m ? Number(m[1]) + 543 : SEED_YEAR
}
/** Buddhist year (พ.ศ.) from a dd/mm/yy(yy) date's year part. 2-digit → 25xx;
    4-digit Gregorian (< 2200) → +543; otherwise taken as-is. null if no date. */
function buddhistYearOf(dateStr: string): number | null {
  const m = dateStr.match(/\d{1,2}[/.\-]\d{1,2}[/.\-](\d{2,4})/)
  if (!m) return null
  let y = Number(m[1])
  if (m[1].length <= 2) y += 2500
  else if (y < 2200) y += 543
  return y
}

const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** Parse a "ประจำเดือน &lt;ชื่อเดือน&gt; &lt;ปี พ.ศ.&gt;" filing-period header (e.g.
    "ประจำเดือน พฤศจิกายน 2564") into its month + Buddhist year. This is the period
    the invoices are FILED in, which can differ from each invoice's own date (input
    VAT may be claimed in a later period). null when the row isn't such a header. */
function parsePeriodHeader(row: string[]): { month: number; year: number } | null {
  for (const c of row) {
    const s = c ?? ''
    if (!/ประจำเดือน/.test(s)) continue
    const mi = THAI_MONTHS_FULL.findIndex((m) => s.includes(m))
    const ym = s.match(/(\d{4})|\b(\d{2})\b/)
    if (mi < 0 || !ym) continue
    const raw = ym[1] ?? ym[2]
    let y = Number(raw)
    if (raw.length <= 2) y += 2500
    return { month: mi + 1, year: y }
  }
  return null
}

/** Split a VAT-inclusive gross amount into base value + 7% VAT (2-dp rounded,
    value + vat === gross). */
function splitVat(gross: number): { value: number; vat: number } {
  const value = r2(gross / 1.07)
  return { value, vat: r2(gross - value) }
}

/** Merge VAT-bearing ใบสำคัญจ่าย (goods payments marked "ลง VAT") for one พ.ศ.
    year into the seed purchase-tax report, grouped by the payment month and
    following the same row format. The paid amount is treated as VAT-inclusive. */
function mergePurchaseTax(seed: TaxMonthData[], payments: GoodsPayment[], year: number): TaxMonthData[] {
  const vatPays = payments.filter((p) => p.withVat !== false && buddhistYearOfIso(p.payDate) === year)
  if (vatPays.length === 0) return seed

  const byMonth = new Map<number, TaxMonthData>()
  for (const md of seed) byMonth.set(md.month, { ...md, rows: [...md.rows] })

  /* Oldest first so the running sequence numbers stay stable. */
  const sorted = [...vatPays].sort((a, b) => a.payDate.localeCompare(b.payDate))
  for (const p of sorted) {
    const m = p.payDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) continue
    const [, y, mm, dd] = m
    const month = Number(mm)
    let md = byMonth.get(month)
    if (!md) { md = { month, rows: [], totalValue: 0, totalVat: 0 }; byMonth.set(month, md) }
    const { value, vat } = splitVat(p.amount)
    md.rows.push({
      seq: `${month}/${md.rows.length + 1}`,
      date: `${Number(dd)}/${month}/${y}`,
      docNo: p.taxInvoiceNo || p.ref || p.gpNo,
      name: p.supplier,
      taxId: '',
      branch: '',
      value,
      vat,
    })
    md.totalValue = r2(md.totalValue + value)
    md.totalVat = r2(md.totalVat + vat)
  }
  return [...byMonth.values()].sort((a, b) => a.month - b.month)
}

/** Merge imported historical rows into a report by month, re-sequencing and
    accumulating month totals. Imported rows land after any seed / voucher rows. */
function appendImportedTax(base: TaxMonthData[], rows: ImportedTaxRow[]): TaxMonthData[] {
  if (rows.length === 0) return base
  const byMonth = new Map<number, TaxMonthData>()
  for (const md of base) byMonth.set(md.month, { ...md, rows: [...md.rows] })
  for (const r of rows) {
    let md = byMonth.get(r.month)
    if (!md) { md = { month: r.month, rows: [], totalValue: 0, totalVat: 0 }; byMonth.set(r.month, md) }
    md.rows.push({ seq: `${r.month}/${md.rows.length + 1}`, date: r.date, docNo: r.docNo, name: r.name, taxId: r.taxId, branch: r.branch, value: r.value, vat: r.vat })
    md.totalValue = r2(md.totalValue + r.value)
    md.totalVat = r2(md.totalVat + r.vat)
  }
  return [...byMonth.values()].sort((a, b) => a.month - b.month)
}

/** Strip ฿ / thousands separators from a spreadsheet cell into a number. */
function parseNum(s: string | undefined): number {
  if (s == null) return NaN
  const cleaned = String(s).replace(/[฿,\s]/g, '').replace(/[^\d.\-]/g, '')
  return cleaned === '' || cleaned === '-' ? NaN : Number(cleaned)
}
/** Pull a 1–12 month out of a dd/mm/yy(yy) date cell; null if unparseable. */
function parseTaxMonth(s: string): number | null {
  const m = s.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/)
  if (!m) return null
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? month : null
}

/** Does a cell contain a dd/mm/yy(yy) date? */
const hasDate = (s: string) => /\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(s)

/** Locate the (มูลค่าสินค้า, ภาษีมูลค่าเพิ่ม) pair on a row. Scans the numeric
    cells from `start` and returns the first adjacent pair where the second is
    ≈7% of the first — the VAT relationship. This ignores สาขาที่ branch numbers,
    the total (value+vat) column, and refund columns, and works whether the
    money columns sit at 6/7 (app export) or 7/8 (RD report with a สนง./สาขา split). */
function findValueVat(row: string[], start: number): { value: number; vat: number; valueIdx: number } | null {
  const nums: { i: number; n: number }[] = []
  for (let i = start; i < row.length; i++) {
    const n = parseNum(row[i])
    if (Number.isFinite(n) && n > 0) nums.push({ i, n })
  }
  for (let k = 0; k < nums.length - 1; k++) {
    const a = nums[k].n, b = nums[k + 1].n
    if (Math.abs(b - a * 0.07) <= a * 0.01 + 1) return { value: a, vat: b, valueIdx: nums[k].i }
  }
  return null
}

/** Derive สถานประกอบการ from the cells between the tax-id and the value column
    (สนง. "/" marker + optional สาขาที่ number). */
function deriveBranch(row: string[], start: number, valueIdx: number): string {
  let head = false, branchNo = ''
  for (let i = start; i < valueIdx; i++) {
    const c = (row[i] ?? '').replace(/\s/g, '')
    if (!c) continue
    if (/^\d+$/.test(c)) branchNo = c
    else if (c.includes('/') || c.includes('ใหญ่')) head = true
    else if (c.includes('สาขา')) branchNo = branchNo || c
  }
  if (branchNo) return /^\d+$/.test(branchNo) ? `สาขา ${branchNo}` : branchNo
  return head ? 'สำนักงานใหญ่' : ''
}

/** Locate the มูลค่าสินค้า and ภาษีมูลค่าเพิ่ม column indices from the (possibly
    multi-row, merged) header. Scanning every cell lets it find the columns even
    when the header labels are split across two rows. null when no header found. */
function detectTaxCols(grid: string[][]): { valueCol: number; vatCol: number } | null {
  let valueCol = -1, vatCol = -1
  for (const row of grid) {
    for (let i = 0; i < row.length; i++) {
      const c = row[i] ?? ''
      if (valueCol < 0 && i >= 5 && /มูลค่า/.test(c) && !/ภาษี/.test(c)) valueCol = i
      if (vatCol < 0 && /ภาษีมูลค่าเพิ่ม/.test(c)) vatCol = i
    }
    if (valueCol >= 0 && vatCol >= 0) break
  }
  return valueCol >= 0 ? { valueCol, vatCol: vatCol >= 0 ? vatCol : valueCol + 1 } : null
}

/** Turn a raw spreadsheet grid into importable tax rows for one report side.
    Handles the Revenue-Department report layout: the tax month comes from the
    seq column's "M/N" prefix (falling back to the document date); subtotal /
    carry-forward / page-header / blank filler rows have no seq and are skipped;
    ditto (") dates inherit the previous row's date. VAT-exempt lines (e.g.
    ค่าขนส่ง) with a blank ภาษีมูลค่าเพิ่ม cell are kept with vat = 0.

    The tax period (เดือน/ปีภาษี) is the FILING period from the "ประจำเดือน …"
    header, not each invoice's own date — input VAT can be filed in a later
    period than the invoice date (e.g. an invoice dated พ.ย. 2564 filed in 2565).

    `kind` is the starting side; a section title mid-grid (รายงานภาษีขาย/ซื้อ)
    switches it, so one file/sheet holding both reports splits correctly. */
function parseTaxGrid(grid: string[][], kind: Kind): ImportedTaxRow[] {
  const cols = detectTaxCols(grid)
  const out: ImportedTaxRow[] = []
  let curKind = kind
  let lastDate = ''
  let lastYear = SEED_YEAR
  let periodMonth: number | null = null
  let periodYear: number | null = null
  for (const row of grid) {
    if (!row || row.length === 0) continue
    const seqCell = (row[0] ?? '').trim()
    const dateCell = (row[1] ?? '').trim()
    const seqM = seqCell.match(/^(\d+)\s*\/\s*\d+$/)
    const month = seqM ? Number(seqM[1]) : (hasDate(dateCell) ? parseTaxMonth(dateCell) : null)
    if (month == null || month < 1 || month > 12) {
      /* Non-data row: capture the filing period ("ประจำเดือน …"), and let a
         section title switch the report side. Both only here (never on a real
         data line) so a supplier name / date can't flip period or side. */
      const period = parsePeriodHeader(row)
      if (period) { periodMonth = period.month; periodYear = period.year }
      const hint = rowKindHint(row)
      if (hint && hint !== curKind) { curKind = hint; lastDate = ''; lastYear = SEED_YEAR; periodMonth = null; periodYear = null }
      continue
    }
    /* Read มูลค่า + VAT. With a detected header, from fixed columns so a
       VAT-exempt line (blank VAT cell → 0) is still captured; otherwise fall
       back to the 7%-VAT relationship. A row needs a positive มูลค่า to count —
       this (with the seq/date requirement above) filters subtotal/junk rows. */
    let value: number, vat: number, valueIdx: number
    if (cols) {
      value = parseNum(row[cols.valueCol])
      if (!Number.isFinite(value) || value <= 0) continue
      const v = parseNum(row[cols.vatCol])
      vat = Number.isFinite(v) ? v : 0
      valueIdx = cols.valueCol
    } else {
      const pair = findValueVat(row, 5)
      if (!pair) continue
      value = pair.value; vat = pair.vat; valueIdx = pair.valueIdx
    }
    const date = hasDate(dateCell) ? dateCell : lastDate
    if (hasDate(dateCell)) lastDate = dateCell
    /* Tax period = the filing period from the "ประจำเดือน" header when present;
       else fall back to the seq month + the invoice-date year (with a Dec↔Jan
       guard for an invoice dated across the new-year boundary from its month). */
    const groupMonth = periodMonth ?? month
    let groupYear: number
    if (periodYear != null) {
      groupYear = periodYear
    } else {
      groupYear = buddhistYearOf(date) ?? lastYear
      const dm = parseTaxMonth(date)
      if (dm != null) {
        if (month === 1 && dm === 12) groupYear += 1
        else if (month === 12 && dm === 1) groupYear -= 1
      }
    }
    lastYear = groupYear
    out.push({
      kind: curKind, year: groupYear, month: groupMonth, seq: '', date,
      docNo: (row[2] ?? '').trim(),
      name: (row[3] ?? '').trim(),
      taxId: (row[4] ?? '').trim(),
      branch: deriveBranch(row, 5, valueIdx),
      value: r2(value), vat: r2(vat),
    })
  }
  return out
}

/** Which report side, if any, a title/header row announces — รายงานภาษีขาย vs
    รายงานภาษีซื้อ, or the ผู้ซื้อ/ผู้ขาย header wording. null for ordinary rows. */
function rowKindHint(row: string[]): Kind | null {
  for (const c of row) {
    const s = c ?? ''
    if (/รายงานภาษีขาย/.test(s) || /ผู้ซื้อสินค้า|ผู้รับบริการ/.test(s)) return 'sale'
    if (/รายงานภาษีซื้อ/.test(s) || /ผู้ขายสินค้า|ผู้ให้บริการ/.test(s)) return 'purchase'
  }
  return null
}

/** Detect which report side a sheet starts as — from the first title/header row,
    falling back to the sheet name. null when it can't be told apart (caller then
    falls back to the currently-selected tab). Lets a multi-sheet workbook
    (ภาษีขาย + ภาษีซื้อ) route each sheet to the correct report automatically. */
function detectKind(grid: string[][], sheetName: string): Kind | null {
  for (const row of grid) { const k = rowKindHint(row); if (k) return k }
  if (/ขาย/.test(sheetName)) return 'sale'
  if (/ซื้อ/.test(sheetName)) return 'purchase'
  return null
}

const money2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Normalise the messy source date to dd/mm/yy, keeping the source's own year
    (seed dates are 19xx → shown as the 2-digit พ.ศ.; imported rows keep theirs). */
function fmtTaxDate(s: string): string {
  const m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/)
  if (!m) return s
  const pad = (x: string) => x.padStart(2, '0')
  const yy = m[3].length >= 2 ? m[3].slice(-2) : m[3]
  return `${pad(m[1])}/${pad(m[2])}/${yy}`
}

export function TaxReports() {
  const [kind, setKind] = useState<Kind>('sale')
  const [year, setYear] = useState<number>(SEED_YEAR)
  const [month, setMonth] = useState<number>(1)
  const [showPrint, setShowPrint] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const created = useCreatedDocs()
  const isAdmin = useCurrentUser()?.role === 'Admin'

  /* Baked-in seed (2565–2569 company data) + runtime imports, deduped — seed
     shows on every machine; a user's own uploads add/refresh on top. */
  const allImports = useMemo(() => {
    const seen = new Set<string>()
    const out: ImportedTaxRow[] = []
    for (const r of [...SEED_TAX_IMPORTS, ...created.taxImports]) {
      const k = taxImportKey(r)
      if (seen.has(k)) continue
      seen.add(k); out.push(r)
    }
    return out
  }, [created.taxImports])
  const saleImports = useMemo(() => allImports.filter((r) => r.kind === 'sale'), [allImports])
  const purchaseImports = useMemo(() => allImports.filter((r) => r.kind === 'purchase'), [allImports])

  /* Tax years (พ.ศ.) available for the current report side: the seed year plus
     any imported years (and, for ภาษีซื้อ, the years of ใบสำคัญจ่าย ที่ลง VAT). */
  const years = useMemo(() => {
    const s = new Set<number>([SEED_YEAR])
    for (const r of kind === 'sale' ? saleImports : purchaseImports) s.add(r.year)
    if (kind === 'purchase') for (const g of created.goodsPayments) if (g.withVat !== false) s.add(buddhistYearOfIso(g.payDate))
    return [...s].sort((a, b) => a - b)
  }, [kind, saleImports, purchaseImports, created.goodsPayments])

  /* Report data for the selected side + year: seed applies only to SEED_YEAR;
     ใบสำคัญจ่าย + imported rows are filtered to the selected year. */
  const data = useMemo(() => {
    if (kind === 'sale') {
      const seed = year === SEED_YEAR ? TAX_SALE : []
      return appendImportedTax(seed, saleImports.filter((r) => r.year === year))
    }
    const seed = year === SEED_YEAR ? TAX_PURCHASE : []
    const merged = mergePurchaseTax(seed, created.goodsPayments, year)
    return appendImportedTax(merged, purchaseImports.filter((r) => r.year === year))
  }, [kind, year, saleImports, purchaseImports, created.goodsPayments])

  const available = useMemo(() => data.map((d) => d.month), [data])
  /* Banner counts only the user's runtime uploads (seed is the baseline, not
     shown as "imported"), so the clear-imports action stays meaningful. */
  const importedCount = useMemo(
    () => created.taxImports.filter((r) => r.kind === kind && r.year === year).length,
    [created.taxImports, kind, year],
  )

  /* ภาษีซื้อ filed late: imported rows in the selected filing period whose invoice
     date falls in a different year than the year they're filed under (input VAT
     can be claimed in a later period). Based on imported rows only. */
  const crossYear = useMemo(() => {
    if (kind !== 'purchase') return { count: 0, detail: '' }
    const byYr = new Map<number, number>()
    for (const r of purchaseImports) {
      if (r.year !== year || r.month !== month) continue
      const iy = buddhistYearOf(r.date)
      if (iy != null && iy !== year) byYr.set(iy, (byYr.get(iy) ?? 0) + 1)
    }
    const count = [...byYr.values()].reduce((s, n) => s + n, 0)
    const detail = [...byYr.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y} (${n})`).join(' · ')
    return { count, detail }
  }, [kind, purchaseImports, year, month])

  /* ภาษีซื้อ whose invoice-date month differs from the month it's filed under. */
  const crossMonth = useMemo(() => {
    if (kind !== 'purchase') return { count: 0, detail: '' }
    const byM = new Map<number, number>()
    for (const r of purchaseImports) {
      if (r.year !== year || r.month !== month) continue
      const im = parseTaxMonth(r.date)
      if (im != null && im !== month) byM.set(im, (byM.get(im) ?? 0) + 1)
    }
    const count = [...byM.values()].reduce((s, n) => s + n, 0)
    const detail = [...byM.entries()].sort((a, b) => a[0] - b[0]).map(([m, n]) => `${THAI_MONTHS_SHORT[m - 1]} (${n})`).join(' · ')
    return { count, detail }
  }, [kind, purchaseImports, year, month])

  /* Keep the selected year / month valid as the side or data changes. */
  useEffect(() => { if (!years.includes(year)) setYear(years[years.length - 1] ?? SEED_YEAR) }, [years, year])
  useEffect(() => { if (available.length > 0 && !available.includes(month)) setMonth(available[0]) }, [available, month])

  const current: TaxMonthData | undefined = useMemo(() => data.find((d) => d.month === month), [data, month])
  const rows = current?.rows ?? []

  const title = kind === 'sale' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ'
  const nameHeader = kind === 'sale' ? 'ชื่อผู้ซื้อสินค้า / ผู้รับบริการ' : 'ชื่อผู้ขายสินค้า / ผู้ให้บริการ'

  const exportExcel = () => {
    const head = ['ลำดับ', 'วันที่', 'เลขที่', nameHeader, 'เลขประจำตัวผู้เสียภาษี', 'สถานประกอบการ', 'มูลค่าสินค้า', 'ภาษีมูลค่าเพิ่ม']
    const body = rows.map((r) => [r.seq, fmtTaxDate(r.date), r.docNo, r.name, r.taxId, r.branch, r.value, r.vat])
    body.push(['', '', '', 'รวม', '', '', current?.totalValue ?? 0, current?.totalVat ?? 0])
    downloadCsv(`tax-${kind}-${year}-${THAI_MONTHS_SHORT[month - 1]}`, [head, ...body])
  }

  /* Dev-only: dump the runtime imports so they can be baked into taxSeed.json. */
  const exportSeed = () => {
    const blob = new Blob([JSON.stringify(created.taxImports)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'tax-imports-seed.json'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const columns: Column<TaxRow>[] = [
    { key: 'seq', header: 'ลำดับ', align: 'center', cell: (r) => <span className="mono" style={{ fontSize: 12 }}>{r.seq}</span> },
    { key: 'date', header: 'วันที่', cell: (r) => fmtTaxDate(r.date), className: 'date' },
    { key: 'doc', header: 'เลขที่ใบกำกับ', cell: (r) => <span className="mono" style={{ fontSize: 12 }}>{r.docNo}</span>, className: 'docno' },
    { key: 'name', header: nameHeader, cell: (r) => r.name },
    { key: 'tax', header: 'เลขผู้เสียภาษี', cell: (r) => (r.taxId ? <span className="mono" style={{ fontSize: 12 }}>{r.taxId}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'branch', header: 'สถานประกอบการ', align: 'center', cell: (r) => (r.branch || <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'value', header: 'มูลค่าสินค้า', align: 'right', cell: (r) => <span className="amt mono">{money2(r.value)}</span> },
    { key: 'vat', header: 'ภาษีมูลค่าเพิ่ม', align: 'right', cell: (r) => <span className="mono">{r.vat ? money2(r.vat) : '—'}</span> },
    {
      key: 'audit',
      header: '',
      align: 'center',
      cell: (r) => (
        <AuditButton
          item={{
            category: kind === 'sale' ? 'sales' : 'purchasing',
            group: kind === 'sale' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ',
            ref: r.docNo,
            label: r.docNo,
            sub: `${r.name} · ${money2(r.value)}`,
            route: '/tax-reports',
          }}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="รายงานภาษีซื้อ / ขาย"
        sub={`Tax Reports · ${title} · ${THAI_MONTHS_FULL[month - 1]} ${year}`}
        actions={
          <>
            {import.meta.env.DEV && (
              <Button variant="secondary" onClick={exportSeed} disabled={created.taxImports.length === 0}>ส่งออก seed (dev)</Button>
            )}
            {isAdmin && <Button variant="secondary" onClick={() => setShowImport(true)}>นำเข้า Excel</Button>}
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowPrint(true)} disabled={rows.length === 0}>พิมพ์รายงาน</Button>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 16 }}>
        <Pill active={kind === 'sale'} onClick={() => setKind('sale')}>รายงานภาษีขาย</Pill>
        <Pill active={kind === 'purchase'} onClick={() => setKind('purchase')}>รายงานภาษีซื้อ</Pill>
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>ปีภาษี (พ.ศ.):</span>
        {years.map((y) => (
          <Pill key={y} active={year === y} onClick={() => setYear(y)}>{y}</Pill>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>เดือนภาษี:</span>
        {available.length === 0
          ? <span style={{ fontSize: 13, color: 'var(--kpc-text-faint)' }}>— ไม่มีข้อมูลในปีนี้ —</span>
          : available.map((mn) => (
            <Pill key={mn} active={month === mn} onClick={() => setMonth(mn)}>{THAI_MONTHS_FULL[mn - 1]} {year}</Pill>
          ))}
      </div>

      {importedCount > 0 && (
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 14px', background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--kpc-text-strong)' }}>รวมข้อมูลที่นำเข้าจาก Excel <strong>{importedCount}</strong> รายการ ใน{title} ปี {year}</span>
          <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ล้างข้อมูล${title} ปี ${year} ที่นำเข้า (${importedCount} รายการ) ?`)) clearTaxImports(kind, year) }} style={{ color: 'var(--kpc-danger)' }}>ล้างข้อมูลที่นำเข้า (ปี {year})</Button>
        </div>
      )}

      <div className={`grid ${kind === 'purchase' ? 'g-5' : 'g-3'}`} style={{ marginBottom: 24 }}>
        <KpiCard label="จำนวนรายการ · Items" value={rows.length.toString()} note="ใบกำกับ" />
        <KpiCard label="มูลค่าสินค้ารวม · Value" value={baht(current?.totalValue ?? 0)} note="ก่อน VAT" invert />
        <KpiCard label="ภาษีมูลค่าเพิ่มรวม · VAT" value={baht(current?.totalVat ?? 0)} note={kind === 'sale' ? 'ภาษีขาย' : 'ภาษีซื้อ'} />
        {kind === 'purchase' && (
          <KpiCard
            label="ยื่นข้ามปี · Cross-year"
            value={crossYear.count.toString()}
            note={crossYear.count > 0 ? `ใบกำกับปี ${crossYear.detail} (ยื่นในปี ${year})` : `ใบกำกับตรงปีที่ยื่นทั้งหมด`}
          />
        )}
        {kind === 'purchase' && (
          <KpiCard
            label="ยื่นข้ามเดือน · Cross-month"
            value={crossMonth.count.toString()}
            note={crossMonth.count > 0 ? `ใบกำกับเดือน ${crossMonth.detail} (ยื่น ${THAI_MONTHS_SHORT[month - 1]})` : `ใบกำกับตรงเดือนที่ยื่นทั้งหมด`}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ไม่มีข้อมูลสำหรับเดือนนี้
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      )}

      <DocModal open={showPrint} title={`${title} · ${THAI_MONTHS_FULL[month - 1]} ${year}`} onClose={() => setShowPrint(false)}>
        {current && <TaxReportSheet kind={kind} month={month} year={year} data={current} />}
      </DocModal>

      <ImportTaxModal open={showImport} kind={kind} nameHeader={nameHeader} onClose={() => setShowImport(false)} />
    </>
  )
}

/** Import historical tax rows from an uploaded Excel/CSV file into the current
    report side. Parses on file pick, previews a per-month summary, then commits. */
function ImportTaxModal({ open, kind, nameHeader, onClose }: { open: boolean; kind: Kind; nameHeader: string; onClose: () => void }) {
  const created = useCreatedDocs()
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ImportedTaxRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  /* Keys already in the system → used to flag rows that were imported before. */
  const existingKeys = useMemo(() => new Set(created.taxImports.map(taxImportKey)), [created.taxImports])
  /* Split the parsed rows into genuinely new vs already-imported (skipping
     both existing records and duplicates within the uploaded batch itself). */
  const split = useMemo(() => {
    if (!parsed) return null
    const seen = new Set(existingKeys)
    const fresh: ImportedTaxRow[] = []
    for (const r of parsed) { const k = taxImportKey(r); if (!seen.has(k)) { seen.add(k); fresh.push(r) } }
    return { fresh, dupCount: parsed.length - fresh.length }
  }, [parsed, existingKeys])

  useEffect(() => {
    if (open) return
    setFileName(''); setParsed(null); setBusy(false); setErr(''); setDone('')
  }, [open])

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setErr(''); setDone(''); setParsed(null)
    setFileName(list.length === 1 ? list[0].name : `${list.length} ไฟล์: ${list.map((f) => f.name).join(', ')}`)
    setBusy(true)
    try {
      /* Read every file × every worksheet; route each sheet to its own report
         side (ขาย/ซื้อ) from its title/header, falling back to the current tab.
         A file that fails to read is skipped, not aborting the whole batch. */
      const rows: ImportedTaxRow[] = []
      const failed: string[] = []
      for (const file of list) {
        try {
          const sheets = await parseSpreadsheet(file)
          for (const sh of sheets) rows.push(...parseTaxGrid(sh.grid, detectKind(sh.grid, sh.name) ?? kind))
        } catch (e) {
          failed.push(`${file.name} (${e instanceof Error ? e.message : 'อ่านไม่สำเร็จ'})`)
        }
      }
      if (rows.length === 0) {
        setErr(failed.length ? `อ่านไฟล์ไม่สำเร็จ: ${failed.join(' · ')}` : 'ไม่พบรายการภาษีในไฟล์ — ตรวจสอบว่ามีคอลัมน์ วันที่ / มูลค่าสินค้า / ภาษีมูลค่าเพิ่ม และวันที่อยู่ในรูปแบบ วว/ดด/ปป')
      } else {
        setParsed(rows)
        if (failed.length) setErr(`ข้ามไฟล์ที่อ่านไม่สำเร็จ: ${failed.join(' · ')}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    if (!split || split.fresh.length === 0) return
    /* Import only the new rows (duplicates already excluded), each side
       separately so we can report per-side counts. */
    const addedS = addTaxImports(split.fresh.filter((r) => r.kind === 'sale'))
    const addedP = addTaxImports(split.fresh.filter((r) => r.kind === 'purchase'))
    const added = addedS + addedP
    if (added === 0) { setErr('ทุกรายการในไฟล์มีอยู่ในระบบแล้ว ไม่มีข้อมูลใหม่'); return }
    const parts = [addedS ? `ภาษีขาย ${addedS}` : '', addedP ? `ภาษีซื้อ ${addedP}` : ''].filter(Boolean)
    setDone(`นำเข้าข้อมูลใหม่ ${added} รายการเรียบร้อยแล้ว (${parts.join(' · ')})${split.dupCount > 0 ? ` — ข้ามรายการที่มีอยู่แล้ว ${split.dupCount} รายการ` : ''}`)
    setParsed(null); setFileName('')
  }

  const downloadTemplate = () => {
    const head = ['ลำดับ', 'วันที่', 'เลขที่ใบกำกับ', nameHeader, 'เลขประจำตัวผู้เสียภาษี', 'สถานประกอบการ', 'มูลค่าสินค้า', 'ภาษีมูลค่าเพิ่ม']
    const example = ['1', '15/1/69', '690115-0001', 'ตัวอย่าง บจก.ผู้ประกอบการ', '0 8555 59000 12 7', 'สำนักงานใหญ่', '1000.00', '70.00']
    downloadCsv(`tax-${kind}-import-template`, [head, example])
  }

  /* Preview: only the NEW rows, grouped by side + tax period (year + month). */
  const summary = useMemo(() => {
    if (!split) return null
    const rows = split.fresh
    const byKey = new Map<string, { kind: Kind; year: number; month: number; count: number; value: number; vat: number }>()
    for (const r of rows) {
      const k = `${r.kind}-${r.year}-${r.month}`
      const g = byKey.get(k) ?? { kind: r.kind, year: r.year, month: r.month, count: 0, value: 0, vat: 0 }
      g.count++; g.value = r2(g.value + r.value); g.vat = r2(g.vat + r.vat)
      byKey.set(k, g)
    }
    const groups = [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.year - b.year || a.month - b.month)
    const totalValue = r2(rows.reduce((s, r) => s + r.value, 0))
    const totalVat = r2(rows.reduce((s, r) => s + r.vat, 0))
    return { groups, totalValue, totalVat }
  }, [split])

  return (
    <Modal
      open={open}
      title="นำเข้ารายงานภาษีซื้อ / ขาย จาก Excel"
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="primary" onClick={confirm} disabled={!split || split.fresh.length === 0 || busy}>{split && split.fresh.length > 0 ? `นำเข้าข้อมูลใหม่ ${split.fresh.length} รายการ` : 'นำเข้า'}</Button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        เลือกไฟล์ <strong>.xlsx</strong> หรือ <strong>.csv</strong> (<strong>เลือกได้หลายไฟล์พร้อมกัน</strong>) ที่มีคอลัมน์: วันที่ · เลขที่ใบกำกับ · ชื่อผู้ประกอบการ · เลขประจำตัวผู้เสียภาษี · สถานประกอบการ · มูลค่าสินค้า · ภาษีมูลค่าเพิ่ม
        <br />ระบบจะแยกเดือน/ปีภาษีจากคอลัมน์วันที่ (วว/ดด/ปป — ปีเป็น พ.ศ.) ให้อัตโนมัติ · รายการที่ยกเว้น VAT (ช่องภาษีว่าง เช่น ค่าขนส่ง) จะนำเข้าด้วย (ภาษี = 0)
        <br />ไฟล์ Excel ที่มีหลายชีท (ภาษีขาย + ภาษีซื้อ) ระบบจะอ่านทุกชีทและแยกเข้าฝั่งซื้อ/ขายให้อัตโนมัติจากหัวรายงานในแต่ละชีท
        <button type="button" onClick={downloadTemplate} style={{ marginLeft: 6, color: 'var(--kpc-primary-ink)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 }}>ดาวน์โหลดเทมเพลต</button>
      </div>

      <input className="input" type="file" accept=".xlsx,.csv,text/csv" multiple onChange={(e) => onPick(e.target.files)} disabled={busy} />
      {fileName && <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 6 }}>ไฟล์: <strong>{fileName}</strong>{busy && ' · กำลังอ่าน…'}</div>}

      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginTop: 12 }}>{err}</div>}
      {done && <div style={{ color: 'var(--kpc-primary-ink)', fontSize: 13, marginTop: 12 }}>✓ {done}</div>}

      {split && (
        <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--kpc-surface-alt)', borderRadius: 8 }}>
          {split.dupCount > 0 && (
            <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginBottom: 8 }}>
              ตรวจพบข้อมูลที่นำเข้าแล้ว <strong>{split.dupCount}</strong> รายการ — ระบบจะข้ามไม่นำเข้าซ้ำ
            </div>
          )}
          {split.fresh.length === 0 ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ทุกรายการในไฟล์มีอยู่ในระบบแล้ว — ไม่มีข้อมูลใหม่ให้นำเข้า</div>
          ) : summary && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--kpc-text-strong)' }}>ข้อมูลใหม่ที่จะนำเข้า {split.fresh.length} รายการ</div>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead><tr><th style={{ textAlign: 'left' }}>ประเภท</th><th style={{ textAlign: 'left' }}>เดือน/ปีภาษี</th><th style={{ textAlign: 'right' }}>รายการ</th><th style={{ textAlign: 'right' }}>มูลค่าสินค้า</th><th style={{ textAlign: 'right' }}>ภาษี</th></tr></thead>
                <tbody>
                  {summary.groups.map((g) => (
                    <tr key={`${g.kind}-${g.year}-${g.month}`}>
                      <td>{g.kind === 'sale' ? 'ภาษีขาย' : 'ภาษีซื้อ'}</td>
                      <td>{THAI_MONTHS_FULL[g.month - 1]} {g.year}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{g.count}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{money2(g.value)}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{money2(g.vat)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td style={{ fontWeight: 600 }} colSpan={2}>รวม</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{split.fresh.length}</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{money2(summary.totalValue)}</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{money2(summary.totalVat)}</td></tr></tfoot>
              </table>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

/* Rows per printed page. Conservative so a page never overflows onto a second
   physical page (which would drop the header / carry rows). */
const ROWS_PER_PAGE = 25

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function TaxReportSheet({ kind, month, year, data }: { kind: Kind; month: number; year: number; data: TaxMonthData }) {
  const title = kind === 'sale' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ'
  const nameHeader = kind === 'sale' ? 'ชื่อผู้ซื้อสินค้า / ผู้รับบริการ' : 'ชื่อผู้ขายสินค้า / ผู้ให้บริการ'
  const taxHeader = kind === 'sale' ? 'เลขประจำตัวผู้เสียภาษีของผู้ซื้อ' : 'เลขประจำตัวผู้เสียภาษีของผู้ขาย'
  const digits = COMPANY.taxId.replace(/\D/g, '').padEnd(13, ' ').slice(0, 13).split('')

  /* Paginate and accumulate running totals for ยอดยกมา / ยอดยกไป per page. */
  const pages = chunk(data.rows, ROWS_PER_PAGE)
  let runValue = 0, runVat = 0
  const pageData = pages.map((pr, idx) => {
    const broughtValue = runValue, broughtVat = runVat
    for (const r of pr) { runValue += r.value; runVat += r.vat }
    return { rows: pr, idx, broughtValue, broughtVat, carriedValue: runValue, carriedVat: runVat }
  })
  const totalPages = pageData.length

  return (
    <div className="tax-report-sheet">
      {pageData.map((pg) => {
        const isLast = pg.idx === totalPages - 1
        return (
          <div className="tax-page" key={pg.idx}>
            <div className="tr-pageno">หน้า {pg.idx + 1}/{totalPages}</div>
            <div className="tr-title">{title}</div>
            <div className="tr-sub">เดือนภาษี {THAI_MONTHS_FULL[month - 1]} {year}</div>

            <div className="tr-head">
              <div className="tr-co">
                <div>ชื่อผู้ประกอบการ : <strong>{COMPANY.name}</strong></div>
                <div>ชื่อสถานประกอบการ : <strong>{COMPANY.name}</strong> ({COMPANY.branch})</div>
                <div>{COMPANY.address}</div>
              </div>
              <div className="tr-taxid">
                <div>เลขประจำตัวผู้เสียภาษีอากร</div>
                <div className="tr-boxes">{digits.map((d, i) => <span key={i}>{d.trim()}</span>)}</div>
                <div style={{ marginTop: 4 }}>☑ สำนักงานใหญ่&nbsp;&nbsp;☐ สาขา</div>
              </div>
            </div>

            <table className="tr-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>ลำดับ</th>
                  <th style={{ width: '9%' }}>วันเดือนปี</th>
                  <th style={{ width: '12%' }}>เล่มที่/เลขที่</th>
                  <th>{nameHeader}</th>
                  <th style={{ width: '15%' }}>{taxHeader}</th>
                  <th style={{ width: '10%' }}>สถานประกอบการ</th>
                  <th style={{ width: '11%' }}>มูลค่าสินค้า<br />หรือบริการ</th>
                  <th style={{ width: '11%' }}>จำนวนเงินภาษี<br />มูลค่าเพิ่ม</th>
                </tr>
              </thead>
              <tbody>
                {pg.idx > 0 && (
                  <tr>
                    <td colSpan={6} className="carry">ยอดยกมา</td>
                    <td className="num carry">{money2(pg.broughtValue)}</td>
                    <td className="num carry">{money2(pg.broughtVat)}</td>
                  </tr>
                )}
                {pg.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="ctr">{r.seq}</td>
                    <td className="ctr">{fmtTaxDate(r.date)}</td>
                    <td>{r.docNo}</td>
                    <td>{r.name}</td>
                    <td className="ctr">{r.taxId || '-'}</td>
                    <td className="ctr">{r.branch || '-'}</td>
                    <td className="num">{money2(r.value)}</td>
                    <td className="num">{r.vat ? money2(r.vat) : '-'}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} className="carry">{isLast ? 'รวมทั้งสิ้น' : 'ยอดยกไป'}</td>
                  <td className="num carry">{money2(isLast ? data.totalValue : pg.carriedValue)}</td>
                  <td className="num carry">{money2(isLast ? data.totalVat : pg.carriedVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
