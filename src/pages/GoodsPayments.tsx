import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select, SavedBy, type Tone } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { NewSupplierForm } from '../components/documents/NewSupplierForm'
import { DocModal } from '../components/documents/DocModal'
import { GoodsPaymentVoucherDoc } from '../components/documents/GoodsPaymentVoucherDoc'
import { baht, monthName } from '../data/selectors'
import {
  useCreatedDocs, useSuppliers, useCostCenters, addCostCenter, addGoodsPayment, updateGoodsPayment, addPurchaseOrder, addGeneralReport, removeGoodsPayment, restoreGoodsPayment, markExpenseRecordsBilled, GOODS_PAYMENT_CATEGORIES,
  type GoodsPayment, type GoodsPaymentItem, type PayMethodOut, type PurchaseOrder, type PurchaseOrderItem,
  type GoodsPaymentCategory, type GoodsPaymentSite, type ExpenseReport, type PurchaseAccountReport, type PurchaseSiteAmount,
  type DeletedGoodsPayment,
} from '../data/createdDocs'
import { useCan } from '../data/auth'
import { fmtThaiDateTime } from '../utils/datetime'
import { downloadCsv } from '../utils/csv'

const METHOD_TONE: Record<string, Tone> = { เงินสดย่อย: 'success', เงินสด: 'success', โอน: 'info', เช็ค: 'warning' }
const r2 = (n: number) => Math.round(n * 100) / 100
/** พ.ศ. year / month from a voucher's ISO payDate "YYYY-MM-DD". */
const gpYear = (g: { payDate: string }) => Number(g.payDate.slice(0, 4)) + 543
const gpMonth = (g: { payDate: string }) => Number(g.payDate.slice(5, 7))

/** Optional pre-fill values, e.g. when paying from a purchase order or when
    issuing a voucher from one/many บันทึกรายจ่าย. */
export interface GoodsPaymentInitial {
  supplier?: string
  amount?: string
  ref?: string
  category?: GoodsPaymentCategory
  site?: GoodsPaymentSite
  note?: string
  withVat?: boolean
  /** Itemised lines (e.g. one per expense record) — when set, drives the form's
      product lines and the amount auto-sums from them. */
  items?: { name: string; qty: string; unitPrice: string }[]
  /** บันทึกรายจ่าย ids to stamp as billed once the voucher is saved. */
  expenseIds?: string[]
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}
/** Short Thai label for a "YYYY-MM" month, e.g. "มิถุนายน 2569". */
function fmtYm(ym?: string): string {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  if (!y || !m) return ym
  return `${monthName(Number(m))} ${Number(y) + 543}`
}
/** เดือนยื่น VAT ที่ใช้จริง — the stored value, else the payDate's month. */
const vatMonthOf = (g: GoodsPayment) => g.vatMonth || g.payDate.slice(0, 7)

/** Voucher no. PVYYMMDD-XXXX (YY=Buddhist year, MM=month, DD=day of the pay date,
    XXXX=running sequence within that date). payDate is ISO "YYYY-MM-DD". */
function nextGpNo(existing: GoodsPayment[], payDate: string): string {
  const [y, m, d] = (payDate || todayIso()).split('-')
  const yy = String((Number(y) || new Date().getFullYear()) + 543).slice(-2)
  const prefix = `PV${yy}${m}${d}-`
  let max = 0
  for (const g of existing) {
    if (g.gpNo.startsWith(prefix)) {
      const n = parseInt(g.gpNo.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
function nextPoNo(existing: PurchaseOrder[]): string {
  let max = 0
  for (const p of existing) {
    const n = parseInt(p.poNo.replace(/^PO/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `PO${String(max + 1).padStart(5, '0')}`
}

export function GoodsPayments() {
  const [query, setQuery] = useState('')
  const [year, setYear] = useState(2569)
  const [month, setMonth] = useState<number | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState<GoodsPaymentInitial | null>(null)
  const [editVat, setEditVat] = useState<GoodsPayment | null>(null)
  const [editPayment, setEditPayment] = useState<GoodsPayment | null>(null)
  const [active, setActive] = useState<GoodsPayment | null>(null)
  const created = useCreatedDocs()
  const all = created.goodsPayments
  const canDelete = useCan('goods-payments').edit
  const location = useLocation()
  const navigate = useNavigate()

  /* When navigated here from a purchase order ("ทำจ่ายสินค้า/วัสดุ") open the form
     pre-filled; from a บันทึกรายจ่าย voucher link ("openVoucher") open that voucher.
     Clear router state so a refresh doesn't re-trigger it. */
  useEffect(() => {
    const st = location.state as { payFromPurchaseOrder?: GoodsPaymentInitial; openVoucher?: string } | null
    if (st?.payFromPurchaseOrder) {
      setPrefill(st.payFromPurchaseOrder)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    } else if (st?.openVoucher) {
      const gp = all.find((g) => g.gpNo === st.openVoucher)
      if (gp) setActive(gp)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate, all])

  /* Year (พ.ศ.) + month scope — current year always offered. */
  const years = useMemo(() => { const s = new Set(all.map(gpYear)); s.add(2569); return [...s].sort((a, b) => b - a) }, [all])
  useEffect(() => { if (!years.includes(year)) setYear(years[0]) }, [years, year])
  const scoped = useMemo(() => all.filter((g) => gpYear(g) === year && (month === 'all' || gpMonth(g) === month)), [all, year, month])
  const rows = useMemo(
    () =>
      scoped.filter((g) => {
        if (!query) return true
        return `${g.gpNo} ${g.supplier} ${g.ref ?? ''} ${g.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
      }),
    [scoped, query],
  )

  const totalPaid = scoped.reduce((s, g) => s + g.amount, 0)

  const exportExcel = () => {
    const head = ['เลขที่ใบสำคัญจ่าย', 'วันที่จ่าย', 'ซัพพลายเออร์', 'ประเภทค่าใช้จ่าย', 'SITE', 'อ้างอิง', 'ภาษี', 'เลขที่ใบกำกับ', 'วิธีจ่าย', 'เลขที่เช็ค', 'จำนวนเงิน', 'หมายเหตุ']
    const body = rows.map((g) => [g.gpNo, fmtDate(g.payDate), g.supplier, g.category ?? '', g.site ?? '', g.ref ?? '', g.withVat === false ? 'ไม่ลง VAT' : 'ลง VAT', g.taxInvoiceNo ?? '', g.method, g.chequeNo ?? '', g.amount, g.note ?? ''])
    downloadCsv('goods-payments', [head, ...body])
  }

  /* ── รายงานค่าใช้จ่ายรายเดือน (7 ประเภท, ลง VAT) — เดือน × ประเภท ── */
  const createExpenseReport = () => {
    const CATS: string[] = GOODS_PAYMENT_CATEGORIES.filter((c) => c !== 'ค่าซื้อวัตถุดิบ')
    const byMonth = new Map<string, { y: number; m: number; values: number[] }>()
    for (const g of all) {
      if (g.withVat === false || !g.category) continue
      const ci = CATS.indexOf(g.category)
      if (ci < 0) continue
      const y = Number(g.payDate.slice(0, 4)) + 543, m = Number(g.payDate.slice(5, 7))
      if (!y || !m) continue
      const key = `${y}-${String(m).padStart(2, '0')}`
      const row = byMonth.get(key) ?? { y, m, values: new Array(CATS.length).fill(0) }
      row.values[ci] += g.amount
      byMonth.set(key, row)
    }
    const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    if (sorted.length === 0) return alert('ยังไม่มีใบสำคัญจ่าย (ลง VAT) ใน 7 ประเภทนี้')
    const rows = sorted.map(([, r]) => {
      const values = r.values.map((v) => r2(v))
      return { month: `${monthName(r.m)} ${r.y}`, values, total: r2(values.reduce((s, v) => s + v, 0)) }
    })
    const colTotals = CATS.map((_, i) => r2(rows.reduce((s, row) => s + row.values[i], 0)))
    const grandTotal = r2(colTotals.reduce((s, v) => s + v, 0))
    const fromLabel = rows[0].month, toLabel = rows[rows.length - 1].month
    const report: ExpenseReport = {
      id: `gr_${Date.now()}`, kind: 'expense',
      title: `รายงานค่าใช้จ่าย ${fromLabel} – ${toLabel}`,
      fromLabel, toLabel, scopeLabel: 'ทุกเดือนที่มีข้อมูล',
      categories: CATS, rows, colTotals, grandTotal, createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" แล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) navigate('/general-reports')
  }

  /* ── บัญชีซื้อสินค้า (ค่าซื้อวัตถุดิบ, ลง VAT) — เดือน × SITE (แพล้นปูน/โรงหล่อ) ── */
  const createPurchaseReport = () => {
    const emptyS = (): PurchaseSiteAmount => ({ base: 0, vat: 0, total: 0 })
    const byMonth = new Map<string, { y: number; m: number; plant: PurchaseSiteAmount; foundry: PurchaseSiteAmount }>()
    const addTo = (s: PurchaseSiteAmount, amount: number) => {
      const base = r2(amount / 1.07)
      s.base = r2(s.base + base); s.vat = r2(s.vat + (amount - base)); s.total = r2(s.total + amount)
    }
    for (const g of all) {
      if (g.withVat === false || g.category !== 'ค่าซื้อวัตถุดิบ') continue
      const y = Number(g.payDate.slice(0, 4)) + 543, m = Number(g.payDate.slice(5, 7))
      if (!y || !m) continue
      const key = `${y}-${String(m).padStart(2, '0')}`
      const row = byMonth.get(key) ?? { y, m, plant: emptyS(), foundry: emptyS() }
      addTo(g.site === 'โรงหล่อ' ? row.foundry : row.plant, g.amount)
      byMonth.set(key, row)
    }
    const sorted = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    if (sorted.length === 0) return alert('ยังไม่มีใบสำคัญจ่ายประเภท "ค่าซื้อวัตถุดิบ" ที่ลง VAT')
    const rows = sorted.map(([, r]) => ({ month: `${monthName(r.m)} ${r.y}`, plant: r.plant, foundry: r.foundry }))
    const sum = (pick: (x: typeof rows[number]) => PurchaseSiteAmount): PurchaseSiteAmount =>
      rows.reduce((a, x) => { const s = pick(x); return { base: r2(a.base + s.base), vat: r2(a.vat + s.vat), total: r2(a.total + s.total) } }, emptyS())
    const fromLabel = rows[0].month, toLabel = rows[rows.length - 1].month
    const report: PurchaseAccountReport = {
      id: `gr_${Date.now()}`, kind: 'purchase-account',
      title: `บัญชีซื้อวัตถุดิบ ${fromLabel} – ${toLabel}`,
      fromLabel, toLabel, scopeLabel: 'ทุกเดือนที่มีข้อมูล',
      rows, totals: { plant: sum((x) => x.plant), foundry: sum((x) => x.foundry) },
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" แล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) navigate('/general-reports')
  }

  const columns: Column<GoodsPayment>[] = [
    { key: 'no', header: 'เลขที่ใบสำคัญจ่าย', cell: (r) => <span className="mono">{r.gpNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่จ่าย', cell: (r) => fmtDate(r.payDate), className: 'date' },
    { key: 'sup', header: 'ซัพพลายเออร์', cell: (r) => r.supplier },
    {
      key: 'cat', header: 'ประเภท',
      cell: (r) => (r.category
        ? <span style={{ fontSize: 13 }}>{r.category}{r.site ? <span style={{ color: 'var(--kpc-text-muted)' }}> · {r.site}</span> : ''}</span>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    { key: 'ref', header: 'อ้างอิง', cell: (r) => (r.ref ? <span className="mono" style={{ fontSize: 13 }}>{r.ref}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'vat', header: 'ภาษี', align: 'center',
      cell: (r) => r.withVat === false
        ? <Badge tone="neutral" pip={false} square>ไม่ลง VAT</Badge>
        : (
          <div className="stack" style={{ gap: 3, alignItems: 'center' }}>
            <Badge tone="info" pip={false} square>ลง VAT</Badge>
            <button
              onClick={() => setEditVat(r)}
              title="แก้ไขเดือนยื่น VAT"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--kpc-primary-ink)', textDecoration: 'underline' }}
            >
              ยื่น {fmtYm(vatMonthOf(r))} ✎
            </button>
          </div>
        ),
    },
    {
      key: 'method', header: 'วิธีจ่าย', align: 'center',
      cell: (r) => (
        <div className="stack" style={{ gap: 2, alignItems: 'center' }}>
          <Badge tone={METHOD_TONE[r.method]} pip={false} square>{r.method}</Badge>
          {r.chequeNo && <span className="mono" style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>เช็ค {r.chequeNo}</span>}
        </div>
      ),
    },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.amount)}</span> },
    { key: 'note', header: 'หมายเหตุ', cell: (r) => (r.note ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.note}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'view', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(canDelete ? [{
      key: 'edit', header: '', align: 'center' as const,
      cell: (r: GoodsPayment) => <Button variant="ghost" size="sm" onClick={() => setEditPayment(r)}>แก้ไข</Button>,
    }] : []),
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'purchasing', group: 'ใบสำคัญจ่าย', ref: r.gpNo, label: r.gpNo, sub: `${r.supplier} · ${baht(r.amount)}`, route: '/goods-payments' }} /> },
    ...(canDelete ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: GoodsPayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบสำคัญจ่าย ${r.gpNo} ?\nระบบจะเก็บไว้ในประวัติการลบด้านล่าง (กู้คืนได้)`)) removeGoodsPayment(r.gpNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* Deleted goods-payment history for the current period — appended below the list. */
  const deletedRows = useMemo(
    () => created.deletedGoodsPayments.filter((g) =>
      gpYear(g) === year && (month === 'all' || gpMonth(g) === month) &&
      (!query || `${g.gpNo} ${g.supplier} ${g.ref ?? ''}`.toLowerCase().includes(query.toLowerCase()))),
    [created.deletedGoodsPayments, year, month, query],
  )
  const deletedColumns: Column<DeletedGoodsPayment>[] = [
    { key: 'gp', header: 'เลขที่ใบสำคัญจ่าย', cell: (r) => <span className="mono">{r.gpNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่จ่าย', cell: (r) => fmtDate(r.payDate), className: 'date' },
    { key: 'sup', header: 'ซัพพลายเออร์', cell: (r) => r.supplier },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.amount)}</span> },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canDelete ? [{
      key: 'restore', header: '', align: 'center' as const,
      cell: (r: DeletedGoodsPayment) => <Button variant="ghost" size="sm" onClick={() => { if (confirm(`กู้คืนใบสำคัญจ่าย ${r.gpNo} ?`)) restoreGoodsPayment(r.gpNo) }}>กู้คืน</Button>,
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบสำคัญจ่าย"
        sub={`Goods / Material Payments · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createExpenseReport} disabled={all.length === 0}>รายงานค่าใช้จ่าย</Button>
            <Button variant="secondary" onClick={createPurchaseReport} disabled={all.length === 0}>บัญชีซื้อวัตถุดิบ</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> ออกใบสำคัญจ่าย</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบสำคัญจ่าย · Vouchers" value={scoped.length.toString()} note="ใบ" />
        <KpiCard label="ยอดจ่ายรวม · Paid" value={baht(totalPaid)} note="ตามช่วงที่เลือก" invert />
        <KpiCard label="ซัพพลายเออร์ · Suppliers" value={new Set(scoped.map((g) => g.supplier)).size.toString()} note="รายที่จ่ายแล้ว" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="select-wrap" style={{ width: 130 }}>
            <Select value={String(year)} onChange={(e) => { setYear(Number(e.target.value)); setMonth('all') }}>
              {years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
            </Select>
          </div>
          <div className="select-wrap" style={{ width: 150 }}>
            <Select value={String(month)} onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">ทุกเดือน</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ / ซัพพลายเออร์ / อ้างอิง" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีใบสำคัญจ่าย — กด <strong>“ออกใบสำคัญจ่าย”</strong> เพื่อเริ่ม
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
      )}

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบใบสำคัญจ่าย</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <NewGoodsPaymentForm
        open={showForm || !!editPayment}
        editPayment={editPayment}
        onClose={() => { setShowForm(false); setPrefill(null); setEditPayment(null) }}
        existing={all}
        purchaseOrders={created.purchaseOrders}
        initial={prefill}
        onSaved={(g) => {
          /* When issued from บันทึกรายจ่าย, stamp those records with this voucher no. */
          if (prefill?.expenseIds?.length) markExpenseRecordsBilled(prefill.expenseIds, g.gpNo)
          setShowForm(false); setPrefill(null); setEditPayment(null); setQuery(g.gpNo)
        }}
      />
      <EditVatMonthModal payment={editVat} onClose={() => setEditVat(null)} />
      <DocModal
        open={!!active}
        title={active ? `ใบสำคัญจ่าย ${active.gpNo}` : ''}
        onClose={() => setActive(null)}
        extraActions={active && canDelete
          ? <Button variant="secondary" onClick={() => { setEditPayment(active); setActive(null) }}>แก้ไข</Button>
          : undefined}
      >
        {active && <GoodsPaymentVoucherDoc gp={active} />}
      </DocModal>
    </>
  )
}

/** Edit the เดือนยื่น VAT of an already-issued ใบสำคัญจ่าย (การแก้ไขภายหลัง). */
function EditVatMonthModal({ payment, onClose }: { payment: GoodsPayment | null; onClose: () => void }) {
  const [ym, setYm] = useState('')
  useEffect(() => { if (payment) setYm(vatMonthOf(payment)) }, [payment])
  if (!payment) return null
  const save = () => {
    updateGoodsPayment(payment.gpNo, { vatMonth: ym || payment.payDate.slice(0, 7) })
    onClose()
  }
  return (
    <Modal open={!!payment} title={`เดือนยื่น VAT · ${payment.gpNo}`} onClose={onClose} maxWidth={420}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}>
      <div className="stack" style={{ gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>
          {payment.supplier} · ออกใบเมื่อ {fmtDate(payment.payDate)}
        </div>
        <Field label="ยื่น VAT ในเดือน" hint="ใบสำคัญจ่ายนี้จะถูกนับในรายงานภาษีซื้อของเดือนที่เลือก">
          <Input type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* One editable product line in the form (string-typed while editing). */
type ItemDraft = { name: string; qty: string; unitPrice: string }
const emptyItem = (): ItemDraft => ({ name: '', qty: '', unitPrice: '' })
/** A row counts as "filled" once the user types anything into it. */
const itemFilled = (it: ItemDraft) => !!(it.name.trim() || it.qty.trim() || it.unitPrice.trim())
const lineTotal = (it: ItemDraft) => {
  const q = Number(it.qty), p = Number(it.unitPrice)
  return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0
}

function NewGoodsPaymentForm({ open, onClose, existing, purchaseOrders, initial, editPayment, onSaved }: { open: boolean; onClose: () => void; existing: GoodsPayment[]; purchaseOrders: PurchaseOrder[]; initial?: GoodsPaymentInitial | null; editPayment?: GoodsPayment | null; onSaved: (g: GoodsPayment) => void }) {
  const isEdit = !!editPayment
  const suppliers = useSuppliers()
  const costCenters = useCostCenters()
  const [payDate, setPayDate] = useState(todayIso())
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState<GoodsPaymentCategory>('ค่าซื้อวัตถุดิบ')
  const [site, setSite] = useState<GoodsPaymentSite>('แพล้นปูน')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethodOut>('โอน')
  const [chequeNo, setChequeNo] = useState('')
  const [ref, setRef] = useState('')
  /* ลง VAT by default; the user can switch to ไม่ลง VAT per voucher. */
  const [withVat, setWithVat] = useState(true)
  /* Supplier's tax-invoice no. — feeds the purchase-tax report when ลง VAT. */
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('')
  /* เดือนยื่น VAT ("YYYY-MM") — default = เดือนที่ออกใบ (payDate); user can override. */
  const [vatMonth, setVatMonth] = useState<string>(todayIso().slice(0, 7))
  const [vatMonthDirty, setVatMonthDirty] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [pullInfo, setPullInfo] = useState('')

  /* เลขที่ใบสำคัญจ่าย — prefill อัตโนมัติ (PVYYMMDD-XXXX จากวันที่จ่าย) แต่แก้ไขได้.
     `gpNoDirty` หยุดการเติมอัตโนมัติเมื่อผู้ใช้พิมพ์เลขเอง. */
  const autoGpNo = useMemo(() => nextGpNo(existing, payDate), [existing, payDate])
  const [gpNo, setGpNo] = useState('')
  const [gpNoDirty, setGpNoDirty] = useState(false)
  useEffect(() => {
    if (!gpNoDirty) setGpNo(autoGpNo)
  }, [autoGpNo, gpNoDirty])

  useEffect(() => {
    if (!open) return
    setErr(''); setPullInfo('')
    /* Edit mode — prefill every field from the voucher being edited; keep its own
       เลขที่ (mark dirty so the auto-number effect doesn't overwrite it). */
    if (editPayment) {
      setGpNo(editPayment.gpNo); setGpNoDirty(true)
      setPayDate(editPayment.payDate)
      setSupplier(editPayment.supplier)
      setCategory(editPayment.category ?? 'ค่าซื้อวัตถุดิบ')
      setSite(editPayment.site ?? 'แพล้นปูน')
      setItems(editPayment.items?.length ? editPayment.items.map((it) => ({ name: it.name, qty: String(it.qty), unitPrice: String(it.unitPrice) })) : [emptyItem()])
      setAmount(editPayment.items?.length ? '' : String(editPayment.amount))
      setMethod(editPayment.method)
      setChequeNo(editPayment.chequeNo ?? '')
      setRef(editPayment.ref ?? '')
      setWithVat(editPayment.withVat !== false)
      setTaxInvoiceNo(editPayment.taxInvoiceNo ?? '')
      setVatMonth(editPayment.vatMonth || editPayment.payDate.slice(0, 7)); setVatMonthDirty(true)
      setNote(editPayment.note ?? '')
      return
    }
    setGpNoDirty(false)
    setPayDate(todayIso()); setMethod('โอน'); setChequeNo(''); setTaxInvoiceNo('')
    setVatMonth(todayIso().slice(0, 7)); setVatMonthDirty(false)
    setWithVat(initial?.withVat ?? true)
    setCategory(initial?.category ?? 'ค่าซื้อวัตถุดิบ')
    setSite(initial?.site ?? 'แพล้นปูน')
    setSupplier(initial?.supplier ?? '')
    setNote(initial?.note ?? '')
    /* Itemised prefill (e.g. from บันทึกรายจ่าย) — lines drive the amount; else the
       plain amount field is prefilled. */
    if (initial?.items?.length) {
      setItems(initial.items.map((it) => ({ name: it.name, qty: it.qty, unitPrice: it.unitPrice })))
      setAmount('')
    } else {
      setItems([emptyItem()])
      setAmount(initial?.amount ?? '')
    }
    setRef(initial?.ref ?? '')
  }, [open, initial, editPayment])

  /* เดือนยื่น VAT follows the ออกใบ (payDate) month until the user overrides it. */
  useEffect(() => {
    if (!vatMonthDirty) setVatMonth(payDate ? payDate.slice(0, 7) : todayIso().slice(0, 7))
  }, [payDate, vatMonthDirty])

  /* Purchase orders for the selected supplier — quick reference picker. */
  const supplierPOs = purchaseOrders.filter((p) => !supplier || p.supplier === supplier)

  /** Pull supplier + product lines from an existing purchase order by its no. */
  const pullFromPO = () => {
    setErr(''); setPullInfo('')
    const token = ref.trim().toUpperCase()
    if (!token) return setErr('กรุณากรอกเลขที่ใบสั่งซื้อ (เช่น PO00001) แล้วกดดึงข้อมูล')
    const po = purchaseOrders.find((p) => p.poNo.toUpperCase() === token)
    if (!po) return setErr(`ไม่พบใบสั่งซื้อ “${ref.trim()}” — หรือเว้นว่างไว้แล้วเพิ่มรายการเอง ระบบจะสร้างใบสั่งซื้อให้`)
    setSupplier(po.supplier)
    setItems(po.items.length
      ? po.items.map((it) => ({ name: it.desc, qty: String(it.qty), unitPrice: String(it.price) }))
      : [emptyItem()])
    setPullInfo(`ดึงข้อมูลจากใบสั่งซื้อ ${po.poNo} · ${po.items.length} รายการ`)
  }

  /* When any product line is filled, the จำนวนเงิน auto-sums from the lines and
     becomes read-only; otherwise the user types the amount directly. */
  const filledItems = items.filter(itemFilled)
  const hasItems = filledItems.length > 0
  const itemsTotal = Math.round(filledItems.reduce((s, it) => s + lineTotal(it), 0) * 100) / 100
  const effectiveAmount = hasItems ? itemsTotal : Number(amount)

  const setItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addItem = () => setItems((prev) => [...prev, emptyItem()])
  const removeItem = (i: number) => setItems((prev) => (prev.length <= 1 ? [emptyItem()] : prev.filter((_, idx) => idx !== i)))

  const submit = () => {
    setErr('')
    const finalGpNo = gpNo.trim()
    if (!finalGpNo) return setErr('กรุณาระบุเลขที่ใบสำคัญจ่าย')
    /* Duplicate check ignores the voucher being edited (its own number is fine). */
    if (existing.some((g) => g.gpNo === finalGpNo && g.gpNo !== editPayment?.gpNo)) return setErr(`เลขที่ใบสำคัญจ่าย ${finalGpNo} ถูกใช้แล้ว`)
    if (!supplier.trim()) return setErr('กรุณาเลือกซัพพลายเออร์')
    if (!payDate) return setErr('กรุณาระบุวันที่จ่าย')
    if (hasItems) {
      for (const it of filledItems) {
        if (!it.name.trim()) return setErr('กรุณาระบุชื่อรายการสินค้าทุกบรรทัด')
        const q = Number(it.qty), p = Number(it.unitPrice)
        if (!Number.isFinite(q) || q <= 0) return setErr(`รายการ “${it.name.trim()}” — จำนวนต้องมากกว่า 0`)
        if (!Number.isFinite(p) || p < 0) return setErr(`รายการ “${it.name.trim()}” — ราคา/หน่วยไม่ถูกต้อง`)
      }
    }
    const amt = effectiveAmount
    if (!amt || amt <= 0) return setErr('กรุณาระบุจำนวนเงินที่จ่าย (มากกว่า 0)')
    if (method === 'เช็ค' && !chequeNo.trim()) return setErr('จ่ายแบบเช็ค — กรุณาระบุเลขที่เช็ค')

    const savedItems: GoodsPaymentItem[] | undefined = hasItems
      ? filledItems.map((it) => ({ name: it.name.trim(), qty: Number(it.qty), unitPrice: Number(it.unitPrice) }))
      : undefined

    /* No PO referenced but the lines were keyed in by hand → auto-generate a
       purchase order so the payment still traces back to a PO record. Only on
       new vouchers — editing an existing one must not spawn a duplicate PO. */
    let finalRef = ref.trim()
    if (!isEdit && !finalRef && savedItems && savedItems.length > 0) {
      const poItems: PurchaseOrderItem[] = savedItems.map((it) => ({ desc: it.name, qty: it.qty, unit: 'หน่วย', price: it.unitPrice }))
      const poNo = nextPoNo(purchaseOrders)
      addPurchaseOrder({
        id: poNo, poNo, orderDate: payDate, dueDate: payDate, supplier: supplier.trim(),
        items: poItems, status: 'รับของแล้ว', note: `สร้างอัตโนมัติจากใบสำคัญจ่าย ${finalGpNo}`,
        createdAt: new Date().toISOString(),
      })
      finalRef = poNo
    }

    /* Fields the form owns — shared by add and edit. createdAt/createdBy are set by
       the store on add and preserved on edit (kept out of the patch). */
    const fields = {
      gpNo: finalGpNo, payDate, supplier: supplier.trim(),
      category, site,
      items: savedItems, amount: amt, method,
      chequeNo: method === 'เช็ค' ? chequeNo.trim() : undefined,
      ref: finalRef || undefined, withVat,
      vatMonth: withVat ? (vatMonth || payDate.slice(0, 7)) : undefined,
      taxInvoiceNo: taxInvoiceNo.trim() || undefined,
      note: note.trim() || undefined,
    }
    if (isEdit) {
      updateGoodsPayment(editPayment!.gpNo, { ...fields, id: finalGpNo })
      onSaved({ ...editPayment!, ...fields, id: finalGpNo })
    } else {
      const gp: GoodsPayment = { id: finalGpNo, ...fields, createdAt: new Date().toISOString() }
      addGoodsPayment(gp)
      onSaved(gp)
    }
  }

  return (
    <Modal open={open} title={isEdit ? `แก้ไขใบสำคัญจ่าย ${editPayment!.gpNo}` : 'ออกใบสำคัญจ่าย'} onClose={onClose} maxWidth={780}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>{isEdit ? 'บันทึกการแก้ไข' : 'ออกใบสำคัญจ่าย'}</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่ใบสำคัญจ่าย" hint="ระบบเติมเลขให้อัตโนมัติจากวันที่จ่าย — แก้ไขเป็นเลขอื่นได้">
          <Input
            className="input mono"
            value={gpNo}
            onChange={(e) => { setGpNo(e.target.value); setGpNoDirty(true) }}
            placeholder="เช่น PV690718-0001"
            style={{ fontWeight: 600 }}
          />
        </Field>
        <Field label="วันที่จ่าย" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        {/* เลขที่ใบสั่งซื้อ · ซัพพลายเออร์ · เลขที่ใบกำกับ — same row (document refs). */}
        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
          <Field label="เลขที่ใบสั่งซื้อ (ถ้ามี)" hint="กรอกแล้วกดดึงข้อมูล — หรือเว้นว่าง ระบบสร้างให้อัตโนมัติ">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
              <Input list="kpc-po-list" placeholder="เช่น PO00001" value={ref} onChange={(e) => { setRef(e.target.value); setPullInfo('') }} />
              <Button variant="tonal" size="sm" onClick={pullFromPO}>ดึง</Button>
            </div>
            <datalist id="kpc-po-list">
              {supplierPOs.map((p) => <option key={p.poNo} value={p.poNo} />)}
            </datalist>
            {pullInfo && <div style={{ fontSize: 12, color: 'var(--kpc-primary-ink)', marginTop: 6 }}>✓ {pullInfo}</div>}
          </Field>
          <Field label="ซัพพลายเออร์" required>
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <Input list="kpc-supplier-list-gp" placeholder="พิมพ์หรือเลือก" value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <Button variant="tonal" size="sm" onClick={() => setShowAddSupplier(true)} title="เพิ่มซัพพลายเออร์ใหม่">+</Button>
            </div>
            <datalist id="kpc-supplier-list-gp">
              {suppliers.map((s) => <option key={s.id} value={s.name} />)}
            </datalist>
          </Field>
          <Field label="เลขที่ใบกำกับ" hint="ใบกำกับภาษีของผู้ขาย (ลง VAT)">
            <Input placeholder="เช่น INV256906/0123" value={taxInvoiceNo} onChange={(e) => setTaxInvoiceNo(e.target.value)} />
          </Field>
        </div>

        <Field label="ประเภทบัญชี cost center" required>
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <div className="select-dark" style={{ flex: 1, minWidth: 0 }}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {costCenters.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <Button variant="tonal" size="sm" onClick={() => {
              const name = window.prompt('ชื่อประเภทบัญชี cost center ใหม่')
              const added = name != null ? addCostCenter(name) : undefined
              if (added) setCategory(added)
            }} title="เพิ่มประเภทบัญชี cost center ใหม่">+</Button>
          </div>
        </Field>
        <Field label="SITE" required hint="ทุกประเภทค่าใช้จ่ายต้องระบุ · แพล้นปูน = น้ำเงิน · โรงหล่อ = เหลืองตามธีม">
          {/* SITE cell coloured by theme: แพล้นปูน น้ำเงิน · โรงหล่อ เหลืองอำพัน. */}
          <div className={site === 'แพล้นปูน' ? 'month-primary' : 'select-foundry'}>
            <Select value={site} onChange={(e) => setSite(e.target.value as GoodsPaymentSite)}>
              <option value="แพล้นปูน">แพล้นปูน</option>
              <option value="โรงหล่อ">โรงหล่อ</option>
            </Select>
          </div>
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>รายการสินค้า</label>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ระบบรวมยอดให้อัตโนมัติ</span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
              <span style={{ flex: 1 }}>ชื่อรายการ</span>
              <span style={{ width: 80, textAlign: 'right' }}>จำนวน</span>
              <span style={{ width: 110, textAlign: 'right' }}>ราคา/หน่วย</span>
              <span style={{ width: 110, textAlign: 'right' }}>รวม</span>
              <span style={{ width: 28 }} />
            </div>
            {items.map((it, i) => (
              <div className="row" key={i} style={{ gap: 8, alignItems: 'center' }}>
                <Input style={{ flex: 1 }} placeholder="เช่น ปูนผง / หิน / ทราย" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                <Input style={{ width: 80, textAlign: 'right' }} type="number" step="any" min={0} placeholder="0" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                <Input style={{ width: 110, textAlign: 'right' }} type="number" step="0.01" min={0} placeholder="0.00" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} />
                <span className="mono" style={{ width: 110, textAlign: 'right', fontSize: 13, color: itemFilled(it) ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>
                  {itemFilled(it) ? baht(Math.round(lineTotal(it) * 100) / 100) : '—'}
                </span>
                <Button variant="ghost" size="sm" onClick={() => removeItem(i)} style={{ width: 28, color: 'var(--kpc-danger)' }} aria-label="ลบรายการ">✕</Button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" size="sm" onClick={addItem}><IconPlus /> เพิ่มรายการ</Button>
          </div>
        </div>

        <Field label="จำนวนเงิน (บาท)" required hint={hasItems ? 'รวมจากรายการสินค้าอัตโนมัติ' : undefined}>
          {hasItems ? (
            <div className="input mono" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 700 }}>{baht(itemsTotal)}</div>
          ) : (
            <Input type="number" step="0.01" min={0} placeholder="เช่น 25000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          )}
        </Field>
        <Field label="วิธีจ่าย" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethodOut)}>
            <option value="โอน">โอน</option>
            <option value="เงินสดย่อย">เงินสดย่อย</option>
            <option value="เช็ค">เช็ค</option>
          </Select>
        </Field>
        {method === 'เช็ค' && (
          <Field label="เลขที่เช็ค" required style={{ gridColumn: '1 / -1' }} hint="บันทึกเลขที่เช็คที่จ่าย">
            <Input placeholder="เช่น 0012345" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
          </Field>
        )}
        <Field label="การลงภาษี" required hint="ค่าเริ่มต้น = ลง VAT">
          <Select value={withVat ? 'vat' : 'novat'} onChange={(e) => setWithVat(e.target.value === 'vat')}>
            <option value="vat">ลง VAT</option>
            <option value="novat">ไม่ลง VAT</option>
          </Select>
        </Field>
        {withVat && (
          <Field label="เดือนยื่น VAT" hint="ค่าเริ่มต้น = เดือนที่ออกใบ · แก้ไขได้ภายหลัง">
            <Input type="month" value={vatMonth} onChange={(e) => { setVatMonth(e.target.value); setVatMonthDirty(true) }} />
          </Field>
        )}
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <NewSupplierForm
        open={showAddSupplier}
        onClose={() => setShowAddSupplier(false)}
        initialName={supplier}
        onCreated={(c) => { setSupplier(c.name); setShowAddSupplier(false) }}
      />
    </Modal>
  )
}
