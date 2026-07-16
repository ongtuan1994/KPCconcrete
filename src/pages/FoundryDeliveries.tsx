import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select, SavedBy, SortDateToggle } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { FoundryDeliveryDoc } from '../components/documents/FoundryDeliveryDoc'
import { TaxInvoiceDoc } from '../components/documents/TaxInvoiceDoc'
import { NewCustomerForm } from '../components/documents/NewCustomerForm'
import { IconPlus } from '../components/icons'
import { CUSTOMER_MASTER, type Product } from '../data/real'
import { cleanProductName as cleanName, monthName, type Invoice } from '../data/selectors'
import { currentBuddhistYear, currentMonth, fmtThaiDateTime } from '../utils/datetime'
import { useCan } from '../data/auth'
import {
  useCreatedDocs, useProducts, addFoundryDelivery, removeFoundryDelivery, restoreFoundryDelivery, addProduct, removeInvoice,
  type FoundryDelivery, type FoundryDeliveryItem, type DeletedFoundryDelivery,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/* Line-item picker label for a foundry product. */
const optionLabel = (p: Product) => `${cleanName(p.name)} (${p.unit})`

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
/** พ.ศ. year / month from a foundry-delivery ISO date "YYYY-MM-DD". */
const feYear = (f: { date: string }) => Number(f.date.slice(0, 4)) + 543
const feMonth = (f: { date: string }) => Number(f.date.slice(5, 7))

/** Pre-fill values when issuing a foundry delivery from a sales order. */
interface FoundryDeliveryInitial { customer: string; items: { code: string; qty: number }[]; note?: string }

export function FoundryDeliveries() {
  const [query, setQuery] = useState('')
  const [year, setYear] = useState(currentBuddhistYear())
  const [month, setMonth] = useState<number | 'all'>(currentMonth())
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState<FoundryDeliveryInitial | null>(null)
  const [active, setActive] = useState<FoundryDelivery | null>(null)
  /* An issued invoice being viewed from a delivery note (with a cancel action). */
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const created = useCreatedDocs()
  const canDelete = useCan('foundry-deliveries').edit
  const location = useLocation()
  const navigate = useNavigate()
  const all = created.foundryDeliveries

  /* Opened from a สินค้าโรงหล่อ sales order ("ออกใบส่งสินค้าโรงหล่อ") → open the
     create form pre-filled with the customer + ordered items. */
  useEffect(() => {
    const st = location.state as { issueFromSalesOrder?: FoundryDeliveryInitial } | null
    if (st?.issueFromSalesOrder) {
      setPrefill(st.issueFromSalesOrder)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  /* Years present (พ.ศ.), newest first — current year always offered. */
  const years = useMemo(() => {
    const s = new Set(all.map(feYear))
    s.add(currentBuddhistYear())
    return [...s].sort((a, b) => b - a)
  }, [all])
  useEffect(() => { if (!years.includes(year)) setYear(years[0]) }, [years, year])
  /* Year + month scope (before the text search) — drives the KPIs too. */
  const scoped = useMemo(
    () => all.filter((f) => feYear(f) === year && (month === 'all' || feMonth(f) === month)),
    [all, year, month],
  )
  const rows = useMemo(
    () => {
      const filtered = scoped.filter((f) => {
        if (!query) return true
        const hay = `${f.fdNo} ${f.customer} ${f.vehicle} ${f.items.map((i) => i.name).join(' ')}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      })
      /* Dates are ISO yyyy-mm-dd → lexical compare sorts chronologically. */
      return [...filtered].sort((a, b) => (sortDir === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
    },
    [scoped, query, sortDir],
  )

  const totalItems = scoped.reduce((s, f) => s + f.items.reduce((a, it) => a + it.qty, 0), 0)

  /* fdNo → เลขใบกำกับภาษี. An invoice raised from a foundry delivery stores that
     delivery's fdNo in its refs (NewInvoiceForm), so map ref→invoice no. */
  const invoiceNoByFd = useMemo(() => {
    const m = new Map<string, string>()
    for (const inv of created.invoices) for (const ref of inv.refs) if (!m.has(ref)) m.set(ref, inv.no)
    return m
  }, [created.invoices])
  /* An invoice raised from a foundry delivery is always user-created, so look it
     up in created.invoices to view/cancel it. */
  const invoiceByNo = (no: string): Invoice | undefined => created.invoices.find((i) => i.no === no)
  /* Cancel an issued invoice (e.g. one raised by mistake) — removeInvoice drops
     the user-created invoice so its fdNo becomes re-issuable, and keeps the
     deletion in the ใบกำกับภาษี audit history. */
  const cancelInvoice = (no: string) => {
    if (!no) return
    const inv = invoiceByNo(no)
    if (!inv) return
    if (confirm(`ยกเลิกใบกำกับภาษี ${no} ?\nใบส่งสินค้าที่เกี่ยวข้องจะกลับมาออกใบกำกับใหม่ได้`)) {
      removeInvoice(inv)
      setViewInvoice(null)
      setActive(null)
    }
  }

  const exportExcel = () => {
    const head = ['เลขที่ส่งสินค้า', 'วันที่', 'ลูกค้า', 'ทะเบียนรถ', 'เลขใบกำกับภาษี', 'รายการสินค้า', 'รวมจำนวน', 'หมายเหตุ']
    const body = rows.map((f) => [
      f.fdNo, fmtDate(f.date), f.customer, f.vehicle, invoiceNoByFd.get(f.fdNo) ?? '',
      f.items.map((i) => `${i.name} x${i.qty} ${i.unit}`).join(' / '),
      f.items.reduce((a, it) => a + it.qty, 0), f.note ?? '',
    ])
    downloadCsv('foundry-deliveries', [head, ...body])
  }

  const columns: Column<FoundryDelivery>[] = [
    { key: 'no', header: 'เลขที่ส่งสินค้า', cell: (r) => <span className="mono">{r.fdNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.customer}</span> },
    { key: 'veh', header: 'ทะเบียนรถ', align: 'center', cell: (r) => (r.vehicle ? <span className="mono">{r.vehicle}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'items', header: 'รายการ', align: 'right', cell: (r) => <span className="mono">{r.items.length} รายการ</span> },
    { key: 'inv', header: 'เลขใบกำกับภาษี', cell: (r) => {
      const no = invoiceNoByFd.get(r.fdNo)
      return no
        ? <a className="mono" role="button" tabIndex={0} style={{ color: 'var(--kpc-primary)', textDecoration: 'underline', cursor: 'pointer' }}
             onClick={() => navigate('/invoices', { state: { openInvoiceNo: no } })}
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/invoices', { state: { openInvoiceNo: no } }) }}>{no}</a>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
    }, className: 'docno' },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'sales', group: 'ใบส่งสินค้าโรงหล่อ', ref: r.fdNo, label: r.fdNo, sub: `${r.customer} · ${r.items.length} รายการ`, route: '/foundry-deliveries' }} /> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(canDelete ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: FoundryDelivery) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบส่งสินค้า ${r.fdNo} ?\nระบบจะเก็บประวัติการลบไว้ตรวจสอบย้อนหลัง`)) removeFoundryDelivery(r) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* Deleted foundry-delivery history for the current period — appended below the list. */
  const deletedRows = useMemo(
    () => created.deletedFoundryDeliveries.filter((d) => feYear(d) === year && (month === 'all' || feMonth(d) === month)),
    [created.deletedFoundryDeliveries, year, month],
  )
  const deletedColumns: Column<DeletedFoundryDelivery>[] = [
    { key: 'no', header: 'เลขที่ส่งสินค้า', cell: (r) => <span className="mono">{r.fdNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'items', header: 'รายการ', align: 'right', cell: (r) => <span className="mono">{r.items.length} รายการ</span> },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canDelete ? [{
      key: 'restore', header: '', align: 'center' as const,
      cell: (r: DeletedFoundryDelivery) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`กู้คืนใบส่งสินค้า ${r.fdNo} ?`)) restoreFoundryDelivery(r.fdNo) }}>กู้คืน</Button>
      ),
    }] : []),
  ]

  return (
    <div className="foundry-theme">
      <PageHeader
        title="ใบส่งสินค้าโรงหล่อ"
        sub={`Foundry Delivery Notes · ${month === 'all' ? 'ทุกเดือน' : monthName(month)} ${year}`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> ออกใบส่งสินค้า</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบส่งสินค้า · Notes" value={scoped.length.toString()} note="ใบ" />
        <KpiCard label="รวมจำนวนสินค้า · Items" value={totalItems.toLocaleString()} note="ชิ้น/แผ่น/ต้น" invert />
        <KpiCard label="ลูกค้า · Customers" value={new Set(scoped.map((f) => f.customer)).size.toString()} note="รายที่ส่งแล้ว" />
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
          <SortDateToggle dir={sortDir} onToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
        </div>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ส่งสินค้า / ลูกค้า / ทะเบียนรถ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีใบส่งสินค้าโรงหล่อ — กด <strong>“ออกใบส่งสินค้า”</strong> เพื่อเริ่ม
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
      )}

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบใบส่งสินค้าโรงหล่อ</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <NewFoundryDeliveryForm
        open={showForm}
        onClose={() => { setShowForm(false); setPrefill(null) }}
        existing={all}
        initial={prefill}
        onSaved={(f) => { setShowForm(false); setPrefill(null); setQuery(f.fdNo); setActive(f) }}
      />

      <DocModal
        open={!!active}
        title={active ? `ใบส่งสินค้าชั่วคราว ${active.fdNo}` : ''}
        onClose={() => setActive(null)}
        extraActions={active ? (() => {
          const no = invoiceNoByFd.get(active.fdNo)
          return no ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--kpc-text-muted)', flexWrap: 'wrap' }}>
              ออกใบกำกับภาษี <span className="mono" style={{ color: 'var(--kpc-primary-ink, #1d4ed8)', fontWeight: 600 }}>{no}</span> แล้ว
              <Button variant="secondary" size="sm" onClick={() => { const inv = invoiceByNo(no); if (inv) { setActive(null); setViewInvoice(inv) } }}>เปิดดูใบกำกับ</Button>
              <Button variant="secondary" size="sm" onClick={() => cancelInvoice(no)} style={{ color: 'var(--kpc-danger)' }}>ยกเลิกใบกำกับ</Button>
            </span>
          ) : (
            <Button variant="tonal" onClick={() => navigate('/invoices', { state: { invoiceFromFoundry: active.fdNo } })}>ออกใบกำกับภาษี</Button>
          )
        })() : undefined}
      >
        {active && <FoundryDeliveryDoc fd={active} />}
      </DocModal>

      {/* View an issued invoice (from a delivery note) with a cancel action. */}
      <DocModal
        open={!!viewInvoice}
        title={viewInvoice ? `ใบกำกับภาษี ${viewInvoice.no}` : ''}
        onClose={() => setViewInvoice(null)}
        extraActions={viewInvoice ? (
          <Button variant="secondary" onClick={() => cancelInvoice(viewInvoice.no)} style={{ color: 'var(--kpc-danger)' }}>ยกเลิกใบกำกับ</Button>
        ) : undefined}
      >
        {viewInvoice && <TaxInvoiceDoc inv={viewInvoice} />}
      </DocModal>
    </div>
  )
}

type ItemDraft = { code: string; qty: string; pickup: 'รับเอง' | 'จัดส่ง' }
const emptyItem = (code = ''): ItemDraft => ({ code, qty: '', pickup: 'รับเอง' })

function NewFoundryDeliveryForm({ open, onClose, existing, initial, onSaved }: { open: boolean; onClose: () => void; existing: FoundryDelivery[]; initial?: FoundryDeliveryInitial | null; onSaved: (f: FoundryDelivery) => void }) {
  /* Merged product list (seed + user-added), so foundry products added on the
     ราคาสินค้าโรงหล่อ page show up in the picker here too. */
  const created = useCreatedDocs()
  const allProducts = useProducts()
  const foundryProducts = useMemo(() => allProducts.filter((p) => p.site === 'foundry'), [allProducts])
  const prodByCode = useMemo(() => Object.fromEntries(foundryProducts.map((p) => [p.code, p])) as Record<string, Product>, [foundryProducts])
  const allCodes = useMemo(() => new Set(allProducts.map((p) => p.code)), [allProducts])
  const firstCode = foundryProducts[0]?.code ?? ''
  const [fdNo, setFdNo] = useState('')
  const [date, setDate] = useState(todayIso())
  const [customer, setCustomer] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [items, setItems] = useState<ItemDraft[]>(() => [emptyItem(firstCode)])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)

  useEffect(() => {
    if (!open) return
    setFdNo(''); setDate(todayIso()); setVehicle(''); setErr('')
    if (initial) {
      setCustomer(initial.customer)
      const known = initial.items.filter((it) => prodByCode[it.code])
      setItems(known.length ? known.map((it) => ({ code: it.code, qty: String(it.qty), pickup: 'รับเอง' as const })) : [emptyItem(firstCode)])
      setNote(initial.note ?? '')
    } else {
      setCustomer(''); setItems([emptyItem(firstCode)]); setNote('')
    }
  }, [open, initial]) // eslint-disable-line react-hooks/exhaustive-deps

  const setItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addItem = () => setItems((prev) => [...prev, emptyItem(firstCode)])
  const removeItem = (i: number) => setItems((prev) => (prev.length <= 1 ? [emptyItem(firstCode)] : prev.filter((_, idx) => idx !== i)))
  /* A just-created product drops into the first empty row (else a new row). */
  const selectNewProduct = (code: string) =>
    setItems((prev) => {
      const idx = prev.findIndex((it) => !it.qty)
      return idx >= 0 ? prev.map((it, i) => (i === idx ? { ...it, code } : it)) : [...prev, emptyItem(code)]
    })

  const submit = () => {
    setErr('')
    if (!fdNo.trim()) return setErr('กรุณาระบุเลขที่ส่งสินค้า')
    if (existing.some((f) => f.fdNo.toLowerCase() === fdNo.trim().toLowerCase())) return setErr(`เลขที่ส่งสินค้า "${fdNo.trim()}" มีอยู่แล้ว`)
    if (!date) return setErr('กรุณาระบุวันที่')
    if (!customer.trim()) return setErr('กรุณาระบุชื่อลูกค้า')
    const filled = items.filter((it) => it.code && Number(it.qty) > 0)
    if (filled.length === 0) return setErr('กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการ (พร้อมจำนวน)')

    const savedItems: FoundryDeliveryItem[] = filled.map((it) => {
      const p = prodByCode[it.code]
      return { code: p.code, name: cleanName(p.name), unit: p.unit, qty: Number(it.qty), pickup: p.pickupPrices ? it.pickup : undefined }
    })
    const fd: FoundryDelivery = {
      id: fdNo.trim(), fdNo: fdNo.trim(), date, customer: customer.trim(), vehicle: vehicle.trim(),
      items: savedItems, note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addFoundryDelivery(fd)
    onSaved(fd)
  }

  return (
    <Modal open={open} title="ออกใบส่งสินค้าโรงหล่อ" onClose={onClose} maxWidth={720}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>ออกใบส่งสินค้า</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่ส่งสินค้า" required hint="กรอกเลขที่ตามเล่มใบส่งสินค้า">
          <Input placeholder="เช่น 0001 / FD-690628-01" value={fdNo} onChange={(e) => setFdNo(e.target.value)} />
        </Field>
        <Field label="วันที่" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ทะเบียนรถ" hint="เลขทะเบียนรถที่นำส่ง">
          <Input placeholder="เช่น 70-1234 ระนอง" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </Field>
        <Field label="ชื่อลูกค้า" required>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <Input list="kpc-customer-list-fd" placeholder="พิมพ์หรือเลือกลูกค้า" value={customer} onChange={(e) => setCustomer(e.target.value)} style={{ flex: 1 }} />
            <Button variant="tonal" size="sm" onClick={() => setShowAddCustomer(true)} title="เพิ่มลูกค้า/หน่วยงานใหม่">+ เพิ่มลูกค้าใหม่</Button>
          </div>
          <datalist id="kpc-customer-list-fd">
            {created.customersAdded.map((c) => <option key={c.id} value={c.name} />)}
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>รายการสินค้า (เฉพาะโรงหล่อ)</label>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="tonal" size="sm" onClick={() => setShowAddProduct(true)} title="เพิ่มประเภทสินค้าโรงหล่อใหม่">+ เพิ่มประเภทใหม่</Button>
            <Button variant="ghost" size="sm" onClick={addItem}>+ เพิ่มรายการ</Button>
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
            <span style={{ flex: 1 }}>สินค้า</span>
            <span style={{ width: 130 }}>การรับของ</span>
            <span style={{ width: 90, textAlign: 'right' }}>จำนวน</span>
            <span style={{ width: 28 }} />
          </div>
          {items.map((it, i) => {
            const byPickup = !!prodByCode[it.code]?.pickupPrices
            return (
              <div className="row" key={i} style={{ gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Select value={it.code} onChange={(e) => setItem(i, { code: e.target.value })}>
                    {foundryProducts.map((p) => <option key={p.code} value={p.code}>{optionLabel(p)}</option>)}
                  </Select>
                </div>
                <div style={{ width: 130 }}>
                  {byPickup
                    ? <Select value={it.pickup} onChange={(e) => setItem(i, { pickup: e.target.value as 'รับเอง' | 'จัดส่ง' })}>
                        <option value="รับเอง">รับเอง</option>
                        <option value="จัดส่ง">จัดส่ง</option>
                      </Select>
                    : <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>—</span>}
                </div>
                <Input style={{ width: 90, textAlign: 'right' }} type="number" min={0} step="any" placeholder="0" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                <Button variant="ghost" size="sm" onClick={() => removeItem(i)} style={{ width: 28, color: 'var(--kpc-danger)' }} aria-label="ลบรายการ">✕</Button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid g-2" style={{ gap: 12, marginTop: 12 }}>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <NewCustomerForm
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        initialName={customer}
        onCreated={(c) => { setCustomer(c.name); setShowAddCustomer(false) }}
      />
      <NewFoundryProductForm
        open={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        existingCodes={allCodes}
        onCreated={selectNewProduct}
      />
    </Modal>
  )
}

/** Auto-generate a unique foundry product code (KPCF0001, …). Mirrors the
    generator on the ราคาสินค้าโรงหล่อ page so hand-added codes never collide. */
function genFoundryCode(existing: Set<string>): string {
  let n = 1
  let code = `KPCF${String(n).padStart(4, '0')}`
  while (existing.has(code)) { n++; code = `KPCF${String(n).padStart(4, '0')}` }
  return code
}

/** Quick-add modal for a brand-new foundry product type (ประเภทสินค้าโรงหล่อใหม่) —
    the user supplies a type label, product name, unit and an optional price. The
    product is saved with site 'foundry' so it flows into the delivery picker,
    ราคาสินค้าโรงหล่อ and สต๊อกสินค้าโรงหล่อ. `onCreated` returns the new code so the
    caller can select it straight away. */
function NewFoundryProductForm({ open, onClose, existingCodes, onCreated }: { open: boolean; onClose: () => void; existingCodes: Set<string>; onCreated: (code: string) => void }) {
  const [typeLabel, setTypeLabel] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [price, setPrice] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setTypeLabel(''); setName(''); setUnit(''); setPrice(''); setErr('')
  }, [open])

  const submit = () => {
    setErr('')
    const t = typeLabel.trim(), nm = name.trim(), u = unit.trim()
    if (!t) return setErr('กรุณากรอกชื่อประเภทสินค้าใหม่')
    if (!nm) return setErr('กรุณากรอกชื่อสินค้า')
    if (!u) return setErr('กรุณากรอกหน่วยของสินค้า')
    const pt = price.trim()
    const pr = pt === '' ? 0 : Number(pt)
    if (!Number.isFinite(pr) || pr < 0) return setErr('กรุณากรอกราคา/หน่วยให้ถูกต้อง (เว้นว่าง = 0)')
    const code = genFoundryCode(existingCodes)
    addProduct({ code, name: nm, strengthKsc: 0, unit: u, category: 'precast', site: 'foundry', typeLabel: t, price: Math.round(pr * 100) / 100 })
    onCreated(code)
    onClose()
  }

  return (
    <Modal open={open} title="เพิ่มประเภทสินค้าโรงหล่อใหม่" onClose={onClose} maxWidth={520}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึกสินค้า</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="ชื่อประเภท" required hint="เช่น ท่อระบายน้ำ / บ่อพัก" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="ชื่อประเภทสินค้าใหม่" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} />
        </Field>
        <Field label="ชื่อสินค้า" required style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เช่น ท่อ คสล. Ø0.30 ม." value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="หน่วย" required hint="เช่น ท่อน / ต้น / แผ่น / อัน">
          <Input placeholder="หน่วย" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="ราคา/หน่วย (บาท)" hint="ไม่บังคับ — เว้นว่าง = 0">
          <Input type="number" min={0} step="any" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
