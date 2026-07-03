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
import { baht } from '../data/selectors'
import { CREDITOR_MASTER } from '../data/creditors'
import {
  useCreatedDocs, addGoodsPayment, addPurchaseOrder, removeGoodsPayment, CAN_DELETE,
  type GoodsPayment, type GoodsPaymentItem, type PayMethodOut, type PurchaseOrder, type PurchaseOrderItem,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const METHOD_TONE: Record<string, Tone> = { เงินสดย่อย: 'success', เงินสด: 'success', โอน: 'info', เช็ค: 'warning' }

/** Optional pre-fill values, e.g. when paying from a purchase order. */
export interface GoodsPaymentInitial {
  supplier?: string
  amount?: string
  ref?: string
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
function nextGpNo(existing: GoodsPayment[]): string {
  let max = 0
  for (const g of existing) {
    const n = parseInt(g.gpNo.replace(/^GP/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `GP${String(max + 1).padStart(5, '0')}`
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
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState<GoodsPaymentInitial | null>(null)
  const created = useCreatedDocs()
  const all = created.goodsPayments
  const location = useLocation()
  const navigate = useNavigate()

  /* When navigated here from a purchase order ("ทำจ่ายสินค้า/วัสดุ"), open the
     form pre-filled. Clear router state so a refresh doesn't re-trigger it. */
  useEffect(() => {
    const st = location.state as { payFromPurchaseOrder?: GoodsPaymentInitial } | null
    if (st?.payFromPurchaseOrder) {
      setPrefill(st.payFromPurchaseOrder)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  const rows = useMemo(
    () =>
      all.filter((g) => {
        if (!query) return true
        return `${g.gpNo} ${g.supplier} ${g.ref ?? ''} ${g.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
      }),
    [all, query],
  )

  const totalPaid = all.reduce((s, g) => s + g.amount, 0)

  const exportExcel = () => {
    const head = ['เลขที่ใบสำคัญจ่าย', 'วันที่จ่าย', 'ซัพพลายเออร์', 'อ้างอิง', 'ภาษี', 'เลขที่ใบกำกับ', 'วิธีจ่าย', 'เลขที่เช็ค', 'จำนวนเงิน', 'หมายเหตุ']
    const body = rows.map((g) => [g.gpNo, fmtDate(g.payDate), g.supplier, g.ref ?? '', g.withVat === false ? 'ไม่ลง VAT' : 'ลง VAT', g.taxInvoiceNo ?? '', g.method, g.chequeNo ?? '', g.amount, g.note ?? ''])
    downloadCsv('goods-payments', [head, ...body])
  }

  const columns: Column<GoodsPayment>[] = [
    { key: 'no', header: 'เลขที่ใบสำคัญจ่าย', cell: (r) => <span className="mono">{r.gpNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่จ่าย', cell: (r) => fmtDate(r.payDate), className: 'date' },
    { key: 'sup', header: 'ซัพพลายเออร์', cell: (r) => r.supplier },
    { key: 'ref', header: 'อ้างอิง', cell: (r) => (r.ref ? <span className="mono" style={{ fontSize: 13 }}>{r.ref}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'vat', header: 'ภาษี', align: 'center',
      cell: (r) => r.withVat === false
        ? <Badge tone="neutral" pip={false} square>ไม่ลง VAT</Badge>
        : <Badge tone="info" pip={false} square>ลง VAT</Badge>,
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
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'purchasing', group: 'ใบสำคัญจ่าย', ref: r.gpNo, label: r.gpNo, sub: `${r.supplier} · ${baht(r.amount)}`, route: '/goods-payments' }} /> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: GoodsPayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบสำคัญจ่าย ${r.gpNo} ?`)) removeGoodsPayment(r.gpNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
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
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> ออกใบสำคัญจ่าย</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบสำคัญจ่าย · Vouchers" value={all.length.toString()} note="ใบ" />
        <KpiCard label="ยอดจ่ายรวม · Paid" value={baht(totalPaid)} note="ทุกใบสำคัญจ่าย" invert />
        <KpiCard label="ซัพพลายเออร์ · Suppliers" value={new Set(all.map((g) => g.supplier)).size.toString()} note="รายที่จ่ายแล้ว" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
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

      <NewGoodsPaymentForm
        open={showForm}
        onClose={() => { setShowForm(false); setPrefill(null) }}
        existing={all}
        purchaseOrders={created.purchaseOrders}
        initial={prefill}
        onSaved={(g) => { setShowForm(false); setPrefill(null); setQuery(g.gpNo) }}
      />
    </>
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

function NewGoodsPaymentForm({ open, onClose, existing, purchaseOrders, initial, onSaved }: { open: boolean; onClose: () => void; existing: GoodsPayment[]; purchaseOrders: PurchaseOrder[]; initial?: GoodsPaymentInitial | null; onSaved: (g: GoodsPayment) => void }) {
  const created = useCreatedDocs()
  const [payDate, setPayDate] = useState(todayIso())
  const [supplier, setSupplier] = useState('')
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
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [pullInfo, setPullInfo] = useState('')

  const gpNo = useMemo(() => nextGpNo(existing), [existing, open])

  useEffect(() => {
    if (!open) return
    setPayDate(todayIso()); setMethod('โอน'); setChequeNo(''); setWithVat(true); setTaxInvoiceNo(''); setNote(''); setErr(''); setPullInfo('')
    setSupplier(initial?.supplier ?? '')
    setItems([emptyItem()])
    setAmount(initial?.amount ?? '')
    setRef(initial?.ref ?? '')
  }, [open, initial])

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
       purchase order so the payment still traces back to a PO record. */
    let finalRef = ref.trim()
    if (!finalRef && savedItems && savedItems.length > 0) {
      const poItems: PurchaseOrderItem[] = savedItems.map((it) => ({ desc: it.name, qty: it.qty, unit: 'หน่วย', price: it.unitPrice }))
      const poNo = nextPoNo(purchaseOrders)
      addPurchaseOrder({
        id: poNo, poNo, orderDate: payDate, dueDate: payDate, supplier: supplier.trim(),
        items: poItems, status: 'รับของแล้ว', note: `สร้างอัตโนมัติจากใบสำคัญจ่าย ${gpNo}`,
        createdAt: new Date().toISOString(),
      })
      finalRef = poNo
    }

    const gp: GoodsPayment = {
      id: gpNo, gpNo, payDate, supplier: supplier.trim(), items: savedItems, amount: amt, method,
      chequeNo: method === 'เช็ค' ? chequeNo.trim() : undefined,
      ref: finalRef || undefined, withVat, taxInvoiceNo: taxInvoiceNo.trim() || undefined,
      note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addGoodsPayment(gp)
    onSaved(gp)
  }

  return (
    <Modal open={open} title="ออกใบสำคัญจ่าย" onClose={onClose} maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>ออกใบสำคัญจ่าย</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่ใบสำคัญจ่าย" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{gpNo}</div>
        </Field>
        <Field label="วันที่จ่าย" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        <Field label="เลขที่ใบสั่งซื้อ (ถ้ามี)" style={{ gridColumn: '1 / -1' }} hint="กรอกเลขใบสั่งซื้อแล้วกดดึงข้อมูล เพื่อเติมซัพพลายเออร์ + รายการสินค้า — หรือเว้นว่างไว้แล้วเพิ่มรายการเอง ระบบจะสร้างใบสั่งซื้อให้อัตโนมัติ">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <Input list="kpc-po-list" placeholder="เช่น PO00001 / เลขที่ใบส่งของ" value={ref} onChange={(e) => { setRef(e.target.value); setPullInfo('') }} />
            <Button variant="tonal" onClick={pullFromPO}>ดึงข้อมูล</Button>
          </div>
          <datalist id="kpc-po-list">
            {supplierPOs.map((p) => <option key={p.poNo} value={p.poNo} />)}
          </datalist>
          {pullInfo && <div style={{ fontSize: 12, color: 'var(--kpc-primary-ink)', marginTop: 6 }}>✓ {pullInfo}</div>}
        </Field>
        <Field label="ซัพพลายเออร์" required style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <Input list="kpc-supplier-list-gp" placeholder="พิมพ์หรือเลือกซัพพลายเออร์" value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ flex: 1 }} />
            <Button variant="tonal" size="sm" onClick={() => setShowAddSupplier(true)} title="เพิ่มซัพพลายเออร์ใหม่">+ เพิ่มซัพพลายเออร์</Button>
          </div>
          <datalist id="kpc-supplier-list-gp">
            {created.suppliersAdded.map((s) => <option key={s.id} value={s.name} />)}
            {CREDITOR_MASTER.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
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
        <Field label="การลงภาษี" required hint="ค่าเริ่มต้น = ลง VAT">
          <Select value={withVat ? 'vat' : 'novat'} onChange={(e) => setWithVat(e.target.value === 'vat')}>
            <option value="vat">ลง VAT</option>
            <option value="novat">ไม่ลง VAT</option>
          </Select>
        </Field>
        {withVat && (
          <Field label="เลขที่ใบกำกับ" style={{ gridColumn: '1 / -1' }} hint="เลขที่ใบกำกับภาษีของซัพพลายเออร์ — ใช้แสดงในรายงานภาษีซื้อ">
            <Input placeholder="เช่น INV256906/0123" value={taxInvoiceNo} onChange={(e) => setTaxInvoiceNo(e.target.value)} />
          </Field>
        )}
        <Field label="วิธีจ่าย" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethodOut)}>
            <option value="โอน">โอน</option>
            <option value="เงินสดย่อย">เงินสดย่อย</option>
            <option value="เช็ค">เช็ค</option>
          </Select>
        </Field>
        {method === 'เช็ค' && (
          <Field label="เลขที่เช็ค" required hint="บันทึกเลขที่เช็คที่จ่าย">
            <Input placeholder="เช่น 0012345" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
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
