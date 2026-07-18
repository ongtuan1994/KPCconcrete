import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select, Checkbox, SavedBy, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { NewSupplierForm } from '../components/documents/NewSupplierForm'
import { baht, monthName } from '../data/selectors'
import { downloadCsv } from '../utils/csv'
import { VEHICLES } from '../data/real'
import { FUEL_VEHICLES, fuelVehicleLabel } from '../data/fuelVehicles'
import {
  useCreatedDocs, useSuppliers, useCostCenters, addCostCenter, addExpenseRecord, updateExpenseRecord, removeExpenseRecord, restoreExpenseRecord, recordDieselPrice, dieselPriceOn,
  type ExpenseRecord, type DeletedExpenseRecord, type GoodsPaymentCategory, type GoodsPaymentSite,
} from '../data/createdDocs'
import { useCan } from '../data/auth'
import { fmtThaiDateTime } from '../utils/datetime'
import type { GoodsPaymentInitial } from './GoodsPayments'

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** DD/MM/พ.ศ. from an ISO "YYYY-MM-DD". */
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}
const exYear = (e: { date: string }) => Number(e.date.slice(0, 4)) + 543
const exMonth = (e: { date: string }) => Number(e.date.slice(5, 7))
/** SITE badge colour — แพล้นปูน = น้ำเงิน (info) · โรงหล่อ = เหลือง (warning). */
const SITE_TONE: Record<GoodsPaymentSite, Tone> = { แพล้นปูน: 'info', โรงหล่อ: 'warning' }

const FUEL_CATEGORY: GoodsPaymentCategory = 'ค่าน้ำมัน'
const r2 = (n: number) => Math.round(n * 100) / 100

/** One-line summary of a ค่าน้ำมัน record (รถ · ลิตร · ราคา/ลิตร · เข็มไมล์). */
function fuelSummary(r: ExpenseRecord): string {
  const parts: string[] = []
  if (r.vehicleId) parts.push(fuelVehicleLabel(r.vehicleId))
  if (r.liters) parts.push(`${r.liters} ลิตร`)
  if (r.pricePerLiter) parts.push(`@${r.pricePerLiter} ฿/ล.`)
  if (r.odometer != null) parts.push(`ไมล์ ${r.odometer.toLocaleString()}`)
  return parts.join(' · ')
}
/** Display text for the รายละเอียด column / voucher line — the manual detail, else
    an auto fuel summary for ค่าน้ำมัน records. */
function displayDetail(r: ExpenseRecord): string {
  if (r.detail) return r.detail
  if (r.category === FUEL_CATEGORY) return fuelSummary(r)
  return ''
}

export function ExpenseRecords() {
  const created = useCreatedDocs()
  const all = created.expenseRecords
  const canEdit = useCan('expense-records').edit
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [year, setYear] = useState(2569)
  const [month, setMonth] = useState<number | 'all'>('all')
  const [siteFilter, setSiteFilter] = useState<'all' | GoodsPaymentSite>('all')
  const [showForm, setShowForm] = useState(false)
  const [editRec, setEditRec] = useState<ExpenseRecord | null>(null)
  const [active, setActive] = useState<ExpenseRecord | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /* Year (พ.ศ.) scope — current year always offered. */
  const years = useMemo(() => { const s = new Set(all.map(exYear)); s.add(2569); return [...s].sort((a, b) => b - a) }, [all])
  useEffect(() => { if (!years.includes(year)) setYear(years[0]) }, [years, year])

  const scoped = useMemo(
    () => all.filter((e) => exYear(e) === year && (month === 'all' || exMonth(e) === month) && (siteFilter === 'all' || e.site === siteFilter)),
    [all, year, month, siteFilter],
  )
  const rows = useMemo(
    () => scoped.filter((e) => !query || `${e.category} ${e.site} ${e.supplier ?? ''} ${e.detail ?? ''} ${e.note ?? ''} ${e.voucherNo ?? ''}`.toLowerCase().includes(query.toLowerCase())),
    [scoped, query],
  )

  const totalAmount = scoped.reduce((s, e) => s + e.amount, 0)
  const unbilledCount = scoped.filter((e) => !e.voucherNo).length

  /* Multi-select — only unbilled records can be picked (billed ones already have a
     voucher). Keep the selection pruned to still-selectable ids. */
  const selectedRecs = useMemo(() => all.filter((e) => selected.has(e.id) && !e.voucherNo), [all, selected])
  const selectedTotal = selectedRecs.reduce((s, e) => s + e.amount, 0)
  const pickableRows = rows.filter((e) => !e.voucherNo)
  const allPicked = pickableRows.length > 0 && pickableRows.every((e) => selected.has(e.id))

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev)
    if (allPicked) pickableRows.forEach((e) => n.delete(e.id))
    else pickableRows.forEach((e) => n.add(e.id))
    return n
  })
  const clearSelection = () => setSelected(new Set())

  /** Build a voucher pre-fill from one/many expense records and jump to the
      ใบสำคัญจ่าย form. Uniform supplier/category/site are carried across; each
      record becomes an itemised line so the amount auto-sums. */
  const issueVoucher = (recs: ExpenseRecord[]) => {
    if (recs.length === 0) return
    const suppliers = [...new Set(recs.map((r) => (r.supplier ?? '').trim()).filter(Boolean))]
    const cats = [...new Set(recs.map((r) => r.category))]
    const sites = [...new Set(recs.map((r) => r.site))]
    const initial: GoodsPaymentInitial = {
      supplier: suppliers.length === 1 ? suppliers[0] : '',
      category: cats.length === 1 ? cats[0] : recs[0].category,
      site: sites.length === 1 ? sites[0] : recs[0].site,
      withVat: recs.every((r) => r.withVat !== false),
      items: recs.map((r) => ({ name: displayDetail(r) || r.category, qty: '1', unitPrice: String(r.amount) })),
      note: recs.length === 1 ? (recs[0].note ?? '') : `รวมจากบันทึกรายจ่าย ${recs.length} รายการ`,
      expenseIds: recs.map((r) => r.id),
    }
    navigate('/goods-payments', { state: { payFromPurchaseOrder: initial } })
  }

  /** Export the currently filtered rows to a CSV (opens in Excel). */
  const exportExcel = () => {
    const head = ['วันที่', 'ประเภทค่าใช้จ่าย', 'SITE', 'ผู้รับเงิน', 'รายละเอียด', 'ภาษี', 'จำนวนเงิน', 'สถานะ', 'ผู้บันทึก']
    const body = rows.map((r) => [
      fmtDate(r.date), r.category, r.site, r.supplier ?? '', displayDetail(r),
      r.withVat === false ? 'ไม่ลง VAT' : 'ลง VAT', r2(r.amount),
      r.voucherNo ? `ออกใบสำคัญจ่ายแล้ว · ${r.voucherNo}` : 'ยังไม่ออกใบสำคัญจ่าย',
      r.createdBy ?? '',
    ])
    const total = ['รวม', '', '', '', '', '', r2(rows.reduce((s, e) => s + e.amount, 0)), '', '']
    const scope = `${year}${month === 'all' ? '' : '-' + monthName(month)}`
    downloadCsv(`บันทึกรายจ่าย-${scope}`, [head, ...body, total])
  }

  const columns: Column<ExpenseRecord>[] = [
    ...(canEdit ? [{
      key: 'sel', header: (
        pickableRows.length > 0
          ? <Checkbox checked={allPicked} onChange={toggleAll}>{''}</Checkbox>
          : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
      ), align: 'center' as const,
      cell: (r: ExpenseRecord) => (r.voucherNo
        ? <span style={{ color: 'var(--kpc-text-faint)', fontSize: 11 }}>—</span>
        : <Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)}>{''}</Checkbox>),
    }] : []),
    { key: 'date', header: 'วันที่', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'cat', header: 'ประเภทค่าใช้จ่าย', cell: (r) => <span style={{ fontSize: 13 }}>{r.category}</span> },
    { key: 'site', header: 'SITE', align: 'center', cell: (r) => <Badge tone={SITE_TONE[r.site]} pip={false} square>{r.site}</Badge> },
    { key: 'sup', header: 'ผู้รับเงิน', cell: (r) => (r.supplier ? r.supplier : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'vat', header: 'ภาษี', align: 'center',
      cell: (r) => r.withVat === false
        ? <Badge tone="neutral" pip={false} square>ไม่ลง VAT</Badge>
        : <Badge tone="info" pip={false} square>ลง VAT</Badge>,
    },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.amount)}</span> },
    {
      key: 'status', header: 'ใบสำคัญจ่าย', align: 'center',
      cell: (r) => (r.voucherNo
        ? <Button variant="ghost" size="sm" onClick={() => navigate('/goods-payments', { state: { openVoucher: r.voucherNo } })}>{r.voucherNo}</Button>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'view', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(canEdit ? [{
      key: 'actions', header: '', align: 'center' as const,
      cell: (r: ExpenseRecord) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบบันทึกรายจ่ายนี้ ?\n${r.category} · ${baht(r.amount)}\nระบบจะเก็บไว้ในประวัติการลบด้านล่าง (กู้คืนได้)`)) removeExpenseRecord(r.id) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* Deleted expense-record history for the current period. */
  const deletedRows = useMemo(
    () => created.deletedExpenseRecords.filter((e) =>
      exYear(e) === year && (month === 'all' || exMonth(e) === month) &&
      (!query || `${e.category} ${e.supplier ?? ''} ${e.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()))),
    [created.deletedExpenseRecords, year, month, query],
  )
  const deletedColumns: Column<DeletedExpenseRecord>[] = [
    { key: 'date', header: 'วันที่', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'cat', header: 'ประเภท', cell: (r) => r.category },
    { key: 'site', header: 'SITE', align: 'center', cell: (r) => <Badge tone={SITE_TONE[r.site]} pip={false} square>{r.site}</Badge> },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.amount)}</span> },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canEdit ? [{
      key: 'restore', header: '', align: 'center' as const,
      cell: (r: DeletedExpenseRecord) => <Button variant="ghost" size="sm" onClick={() => { if (confirm('กู้คืนบันทึกรายจ่ายนี้ ?')) restoreExpenseRecord(r.id) }}>กู้คืน</Button>,
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="บันทึกรายจ่าย"
        sub={`Expense Records · ${all.length} รายการ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            {canEdit && <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> เพิ่มรายจ่าย</Button>}
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รายจ่าย · Records" value={scoped.length.toString()} note="ตามช่วงที่เลือก" />
        <KpiCard label="ยอดรวม · Total" value={baht(totalAmount)} note="ตามช่วงที่เลือก" invert />
        <KpiCard label="ยังไม่ออกใบสำคัญจ่าย" value={unbilledCount.toString()} note="รายการ" />
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
          <div className="select-wrap" style={{ width: 150 }}>
            <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value as 'all' | GoodsPaymentSite)}>
              <option value="all">ทุก SITE</option>
              <option value="แพล้นปูน">แพล้นปูน</option>
              <option value="โรงหล่อ">โรงหล่อ</option>
            </Select>
          </div>
        </div>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="ประเภท / ผู้รับเงิน / รายละเอียด" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {/* Selection action bar — issue one voucher for the picked records. */}
      {canEdit && selectedRecs.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: 'var(--kpc-primary-100)', background: 'var(--kpc-primary-50)' }}>
          <div style={{ fontSize: 14 }}>
            เลือก <strong>{selectedRecs.length}</strong> รายการ · รวม <strong className="mono">{baht(selectedTotal)}</strong>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={clearSelection}>ล้างที่เลือก</Button>
            <Button variant="primary" size="sm" onClick={() => issueVoucher(selectedRecs)}>ออกใบสำคัญจ่าย (รวม {selectedRecs.length} รายการ)</Button>
          </div>
        </div>
      )}

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีบันทึกรายจ่าย — กด <strong>“เพิ่มรายจ่าย”</strong> เพื่อเริ่ม
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      )}

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบบันทึกรายจ่าย</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <ExpenseForm
        open={showForm || !!editRec}
        editRec={editRec}
        onClose={() => { setShowForm(false); setEditRec(null) }}
        onSaved={() => { setShowForm(false); setEditRec(null) }}
      />

      <ExpenseDetailModal
        record={active}
        canEdit={canEdit}
        onClose={() => setActive(null)}
        onIssue={(r) => { setActive(null); issueVoucher([r]) }}
        onEdit={(r) => { setActive(null); setEditRec(r) }}
      />
    </>
  )
}

/* ───────── Add / edit expense record ───────── */
function ExpenseForm({ open, editRec, onClose, onSaved }: { open: boolean; editRec: ExpenseRecord | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editRec
  const suppliers = useSuppliers()
  const costCenters = useCostCenters()
  const dieselPrices = useCreatedDocs().dieselPrices
  const [date, setDate] = useState(todayIso())
  const [category, setCategory] = useState<GoodsPaymentCategory>('ค่าซื้อวัตถุดิบ')
  const [site, setSite] = useState<GoodsPaymentSite>('แพล้นปูน')
  const [supplier, setSupplier] = useState('')
  const [detail, setDetail] = useState('')
  const [amount, setAmount] = useState('')
  const [withVat, setWithVat] = useState(true)
  const [note, setNote] = useState('')
  /* Fuel (ค่าน้ำมัน) fields — only used when category is ค่าน้ำมัน. */
  const [vehicleId, setVehicleId] = useState<string>(VEHICLES[0]?.id ?? '')
  const [liters, setLiters] = useState('')
  const [pricePerLiter, setPricePerLiter] = useState('')
  /* Stops the date-based ราคา/ลิตร prefill once the user types their own price. */
  const [priceDirty, setPriceDirty] = useState(false)
  const [odometer, setOdometer] = useState('')
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [err, setErr] = useState('')

  const isFuel = category === FUEL_CATEGORY
  /* ราคารวม = จำนวนลิตร × ราคา/ลิตร (drives the saved amount for fuel records). */
  const fuelTotal = r2((Number(liters) || 0) * (Number(pricePerLiter) || 0))

  useEffect(() => {
    if (!open) return
    setErr('')
    if (editRec) {
      setDate(editRec.date)
      setCategory(editRec.category)
      setSite(editRec.site)
      setSupplier(editRec.supplier ?? '')
      setDetail(editRec.detail ?? '')
      setAmount(String(editRec.amount))
      setWithVat(editRec.withVat !== false)
      setNote(editRec.note ?? '')
      setVehicleId(editRec.vehicleId ?? VEHICLES[0]?.id ?? '')
      setLiters(editRec.liters != null ? String(editRec.liters) : '')
      /* Keep the record's own saved price (mark dirty so the date lookup won't
         overwrite it); fall back to the rate effective on its date. */
      setPricePerLiter(String(editRec.pricePerLiter ?? dieselPriceOn(dieselPrices, editRec.date)))
      setPriceDirty(true)
      setOdometer(editRec.odometer != null ? String(editRec.odometer) : '')
      return
    }
    setDate(todayIso()); setCategory('ค่าซื้อวัตถุดิบ'); setSite('แพล้นปูน')
    setSupplier(''); setDetail(''); setAmount(''); setWithVat(true); setNote('')
    /* Leave ราคา/ลิตร to the date-based effect below (priceDirty=false ⇒ it prefills). */
    setVehicleId(VEHICLES[0]?.id ?? ''); setLiters(''); setPriceDirty(false); setOdometer('')
  }, [open, editRec]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Prefill ราคา/ลิตร from the ไฮดีเซล rate effective on the selected fill date —
     follows the date until the user types their own price. */
  useEffect(() => {
    if (!open || !isFuel || priceDirty) return
    setPricePerLiter(String(dieselPriceOn(dieselPrices, date)))
  }, [open, isFuel, priceDirty, date, dieselPrices])

  /* Add a ประเภทบัญชี cost center on the fly when the needed one isn't listed. */
  const addCostCenterInline = () => {
    const name = window.prompt('ชื่อประเภทบัญชี cost center ใหม่')
    const added = name != null ? addCostCenter(name) : undefined
    if (added) setCategory(added)
  }

  /* Keep the selected vehicle valid for the current SITE — when the site changes to
     one the current vehicle doesn't belong to, fall back to that site's first vehicle. */
  useEffect(() => {
    if (!open || !isFuel) return
    const opts = FUEL_VEHICLES[site]
    if (!opts.some((v) => v.id === vehicleId)) setVehicleId(opts[0]?.id ?? '')
  }, [site, open, isFuel]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    setErr('')
    if (!date) return setErr('กรุณาระบุวันที่')

    /* Fuel records derive the amount from ลิตร × ราคา/ลิตร and carry the
       รถโม่/ลิตร/ราคา/เข็มไมล์ breakdown. Other categories use the plain amount. */
    let amt: number
    let fuelFields: Partial<ExpenseRecord>
    if (isFuel) {
      if (!vehicleId) return setErr('กรุณาเลือกรถ')
      const lit = Number(liters)
      if (!lit || lit <= 0) return setErr('กรุณาระบุจำนวนลิตรที่เติม (มากกว่า 0)')
      const ppl = Number(pricePerLiter)
      if (!ppl || ppl <= 0) return setErr('กรุณาระบุราคาต่อลิตร (มากกว่า 0)')
      amt = fuelTotal
      const odo = odometer.trim() === '' ? undefined : Number(odometer)
      if (odo != null && (!Number.isFinite(odo) || odo < 0)) return setErr('เข็มไมล์ไม่ถูกต้อง')
      fuelFields = { vehicleId, liters: r2(lit), pricePerLiter: r2(ppl), odometer: odo }
    } else {
      amt = Number(amount)
      if (!amt || amt <= 0) return setErr('กรุณาระบุจำนวนเงิน (มากกว่า 0)')
      /* Clear any stale fuel breakdown when the category is not ค่าน้ำมัน. */
      fuelFields = { vehicleId: undefined, liters: undefined, pricePerLiter: undefined, odometer: undefined }
    }

    const fields = {
      date, category, site,
      supplier: supplier.trim() || undefined,
      detail: detail.trim() || undefined,
      amount: r2(amt),
      withVat,
      note: note.trim() || undefined,
      ...fuelFields,
    }
    if (isEdit) {
      updateExpenseRecord(editRec!.id, fields)
    } else {
      addExpenseRecord({ id: `ex_${Date.now()}`, ...fields, createdAt: new Date().toISOString() })
    }
    /* Record the pump price on this fill date so future ค่าน้ำมัน records prefill
       the rate effective on their own date. */
    if (isFuel) recordDieselPrice(date, Number(pricePerLiter))
    onSaved()
  }

  return (
    <Modal open={open} title={isEdit ? 'แก้ไขบันทึกรายจ่าย' : 'เพิ่มบันทึกรายจ่าย'} onClose={onClose} maxWidth={680}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>{isEdit ? 'บันทึกการแก้ไข' : 'บันทึก'}</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="วันที่" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {!isFuel && (
          <Field label="จำนวนเงิน (บาท)" required>
            <Input type="number" step="0.01" min={0} placeholder="เช่น 25000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        <Field label="ประเภทบัญชี cost center" required>
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <div className="select-dark" style={{ flex: 1, minWidth: 0 }}>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {costCenters.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <Button variant="tonal" size="sm" onClick={addCostCenterInline} title="เพิ่มประเภทบัญชี cost center ใหม่">+</Button>
          </div>
        </Field>
        <Field label="SITE" required hint="แพล้นปูน = น้ำเงิน · โรงหล่อ = เหลืองตามธีม">
          <div className={site === 'แพล้นปูน' ? 'month-primary' : 'select-foundry'}>
            <Select value={site} onChange={(e) => setSite(e.target.value as GoodsPaymentSite)}>
              <option value="แพล้นปูน">แพล้นปูน</option>
              <option value="โรงหล่อ">โรงหล่อ</option>
            </Select>
          </div>
        </Field>

        {/* ค่าน้ำมัน — รถโม่ / ลิตร / ราคา/ลิตร / ราคารวม / เข็มไมล์. */}
        {isFuel && (
          <div style={{ gridColumn: '1 / -1', border: '1px dashed var(--kpc-primary-100)', background: 'var(--kpc-primary-50)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--kpc-text-strong)' }}>ข้อมูลการเติมน้ำมัน ({site === 'โรงหล่อ' ? 'รถโรงหล่อ' : 'รถโม่ / รถตัก'})</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 10 }}>
              <Field label="รถ" required>
                <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  {FUEL_VEHICLES[site].map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="จำนวนลิตร" required>
                <Input type="number" step="0.01" min={0} placeholder="เช่น 50" value={liters} onChange={(e) => setLiters(e.target.value)} />
              </Field>
              <Field label="ราคา/ลิตร" required hint="prefill ไฮดีเซลตามวันที่ — แก้ไขได้">
                <Input type="number" step="0.01" min={0} value={pricePerLiter} onChange={(e) => { setPricePerLiter(e.target.value); setPriceDirty(true) }} />
              </Field>
              <Field label="ราคารวม (บาท)" hint="ลิตร × ราคา/ลิตร">
                <div className="input mono" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 700 }}>{baht(fuelTotal)}</div>
              </Field>
            </div>
            <div style={{ marginTop: 10, maxWidth: 240 }}>
              <Field label="เข็มไมล์ (กม.)" hint="เลขไมล์รถ ณ เวลาที่เติม (ไม่บังคับ)">
                <Input type="number" step="1" min={0} placeholder="เช่น 123456" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <Field label="ผู้รับเงิน / ซัพพลายเออร์ (ถ้ามี)">
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <Input list="kpc-supplier-list-ex" placeholder="พิมพ์หรือเลือก" value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <Button variant="tonal" size="sm" onClick={() => setShowAddSupplier(true)} title="เพิ่มซัพพลายเออร์ใหม่">+</Button>
          </div>
          <datalist id="kpc-supplier-list-ex">
            {suppliers.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </Field>
        <Field label="การลงภาษี" required hint="ค่าเริ่มต้น = ลง VAT">
          <Select value={withVat ? 'vat' : 'novat'} onChange={(e) => setWithVat(e.target.value === 'vat')}>
            <option value="vat">ลง VAT</option>
            <option value="novat">ไม่ลง VAT</option>
          </Select>
        </Field>
        <Field label="รายละเอียดค่าใช้จ่าย" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เช่น ค่าน้ำมันรถโม่ / ค่าซ่อมเครื่องผสม" value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
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

/* ───────── View a single expense record ───────── */
function ExpenseDetailModal({ record, canEdit, onClose, onIssue, onEdit }: {
  record: ExpenseRecord | null
  canEdit: boolean
  onClose: () => void
  onIssue: (r: ExpenseRecord) => void
  onEdit: (r: ExpenseRecord) => void
}) {
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, fontSize: 14, padding: '8px 0', borderBottom: '1px solid var(--kpc-border)' }}>
      <span style={{ color: 'var(--kpc-text-muted)' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
  return (
    <Modal
      open={!!record}
      title="รายละเอียดบันทึกรายจ่าย"
      onClose={onClose}
      maxWidth={560}
      footer={record && (
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          {canEdit && <Button variant="tonal" onClick={() => onEdit(record)}>แก้ไข</Button>}
          {canEdit && !record.voucherNo && <Button variant="primary" onClick={() => onIssue(record)}>ออกใบสำคัญจ่าย</Button>}
        </>
      )}
    >
      {record && (
        <div>
          <Row k="วันที่" v={<span className="mono">{fmtDate(record.date)}</span>} />
          <Row k="ประเภทค่าใช้จ่าย" v={record.category} />
          <Row k="SITE" v={<Badge tone={SITE_TONE[record.site]} pip={false} square>{record.site}</Badge>} />
          {record.category === FUEL_CATEGORY && (
            <>
              <Row k="รถ" v={record.vehicleId ? fuelVehicleLabel(record.vehicleId) : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
              <Row k="จำนวนลิตร" v={record.liters != null ? <span className="mono">{record.liters} ลิตร</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
              <Row k="ราคา/ลิตร" v={record.pricePerLiter != null ? <span className="mono">{baht(record.pricePerLiter)}</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
              <Row k="เข็มไมล์" v={record.odometer != null ? <span className="mono">{record.odometer.toLocaleString()} กม.</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
            </>
          )}
          <Row k="ผู้รับเงิน" v={record.supplier || <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
          <Row k="รายละเอียด" v={displayDetail(record) || <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
          <Row k="ภาษี" v={record.withVat === false ? 'ไม่ลง VAT' : 'ลง VAT'} />
          <Row k="จำนวนเงิน" v={<strong className="mono">{baht(record.amount)}</strong>} />
          <Row k="สถานะ" v={record.voucherNo
            ? <Badge tone="success" pip={false} square>ออกใบสำคัญจ่ายแล้ว · {record.voucherNo}</Badge>
            : <Badge tone="warning" pip={false} square>ยังไม่ออกใบสำคัญจ่าย</Badge>} />
          <Row k="หมายเหตุ" v={record.note || <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
        </div>
      )}
    </Modal>
  )
}
