import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { CREDITOR_MASTER } from '../data/creditors'
import {
  useCreatedDocs, addPurchaseOrder, removePurchaseOrder, markPurchaseOrderReceived, CAN_DELETE,
  type PurchaseOrder, type PurchaseOrderItem, type PurchaseStatus,
} from '../data/createdDocs'
import { type GoodsPaymentInitial } from './GoodsPayments'
import { downloadCsv } from '../utils/csv'

const STATUS_TONE: Record<PurchaseStatus, Tone> = { รอรับของ: 'warning', รับของแล้ว: 'success' }

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
function nextPoNo(existing: PurchaseOrder[]): string {
  let max = 0
  for (const p of existing) {
    const n = parseInt(p.poNo.replace(/^PO/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `PO${String(max + 1).padStart(5, '0')}`
}
const poTotal = (po: PurchaseOrder) => po.items.reduce((s, it) => s + it.qty * it.price, 0)

export function PurchaseOrders() {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [active, setActive] = useState<PurchaseOrder | null>(null)
  const created = useCreatedDocs()
  const all = created.purchaseOrders
  const navigate = useNavigate()

  /* Record a goods/material payment from a PO: jump to the payments page with
     the form pre-filled (supplier, total, PO ref); user reviews and confirms. */
  const payForOrder = (po: PurchaseOrder) => {
    const initial: GoodsPaymentInitial = { supplier: po.supplier, amount: String(poTotal(po)), ref: po.poNo }
    navigate('/goods-payments', { state: { payFromPurchaseOrder: initial } })
  }

  const rows = useMemo(
    () =>
      all.filter((po) => {
        if (!query) return true
        const hay = `${po.poNo} ${po.supplier} ${po.items.map((i) => i.desc).join(' ')} ${po.note ?? ''}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      }),
    [all, query],
  )

  const waiting = all.filter((p) => p.status === 'รอรับของ').length
  const totalValue = all.reduce((s, p) => s + poTotal(p), 0)

  const exportExcel = () => {
    const head = ['เลขที่ใบสั่งซื้อ', 'วันที่สั่ง', 'กำหนดรับของ', 'ซัพพลายเออร์', 'จำนวนรายการ', 'มูลค่ารวม', 'สถานะ', 'หมายเหตุ']
    const body = rows.map((p) => [
      p.poNo, fmtDate(p.orderDate), fmtDate(p.dueDate), p.supplier, p.items.length, poTotal(p), p.status, p.note ?? '',
    ])
    downloadCsv('purchase-orders', [head, ...body])
  }

  const columns: Column<PurchaseOrder>[] = [
    { key: 'po', header: 'เลขที่ใบสั่งซื้อ', cell: (r) => <span className="mono">{r.poNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่สั่ง', cell: (r) => fmtDate(r.orderDate), className: 'date' },
    { key: 'sup', header: 'ซัพพลายเออร์', cell: (r) => r.supplier },
    { key: 'items', header: 'รายการ', cell: (r) => <Badge tone="info" pip={false} square>{r.items.length} รายการ</Badge> },
    { key: 'total', header: 'มูลค่ารวม', align: 'right', cell: (r) => <span className="amt mono">{baht(poTotal(r))}</span> },
    { key: 'due', header: 'กำหนดรับของ', cell: (r) => (r.dueDate ? fmtDate(r.dueDate) : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>), className: 'date' },
    { key: 'status', header: 'สถานะ', align: 'center', cell: (r) => <Badge tone={STATUS_TONE[r.status]} pip={false} square>{r.status}</Badge> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: PurchaseOrder) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบสั่งซื้อ ${r.poNo} ?`)) removePurchaseOrder(r.poNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบสั่งซื้อ"
        sub={`Purchase Orders · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> สร้างใบสั่งซื้อ</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบสั่งซื้อ · Orders" value={all.length.toString()} note="ใบ" />
        <KpiCard label="รอรับของ · Pending" value={waiting.toString()} note="ใบ" invert />
        <KpiCard label="มูลค่ารวม · Value" value={baht(totalValue)} note="ทุกใบสั่งซื้อ" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ / ซัพพลายเออร์ / รายการ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีใบสั่งซื้อ — กด <strong>“สร้างใบสั่งซื้อ”</strong> เพื่อเริ่ม
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
      )}

      <NewPurchaseOrderForm open={showForm} onClose={() => setShowForm(false)} existing={all} onSaved={(po) => { setShowForm(false); setQuery(po.poNo) }} />
      <PurchaseOrderDetail
        order={active}
        onClose={() => setActive(null)}
        onPay={(po) => { setActive(null); payForOrder(po) }}
      />
    </>
  )
}

interface DraftItem { desc: string; qty: string; unit: string; price: string }

function NewPurchaseOrderForm({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing: PurchaseOrder[]; onSaved: (po: PurchaseOrder) => void }) {
  const [orderDate, setOrderDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState('')
  const [supplier, setSupplier] = useState('')
  const [items, setItems] = useState<DraftItem[]>([{ desc: '', qty: '', unit: 'หน่วย', price: '' }])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const poNo = useMemo(() => nextPoNo(existing), [existing, open])

  useEffect(() => {
    if (!open) return
    setOrderDate(todayIso()); setDueDate(''); setSupplier('')
    setItems([{ desc: '', qty: '', unit: 'หน่วย', price: '' }]); setNote(''); setErr('')
  }, [open])

  const setRow = (i: number, patch: Partial<DraftItem>) => setItems((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setItems((rs) => [...rs, { desc: '', qty: '', unit: 'หน่วย', price: '' }])
  const removeRow = (i: number) => setItems((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)))

  const draftTotal = items.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.price) || 0), 0)

  const submit = () => {
    setErr('')
    if (!supplier.trim()) return setErr('กรุณาเลือกซัพพลายเออร์')
    if (!orderDate) return setErr('กรุณาระบุวันที่สั่งซื้อ')
    const cleaned: PurchaseOrderItem[] = []
    for (const r of items) {
      if (!r.desc.trim()) continue
      const qty = Number(r.qty); const price = Number(r.price)
      if (!qty || qty <= 0) return setErr('กรุณาระบุจำนวนของทุกรายการ (มากกว่า 0)')
      if (price < 0 || Number.isNaN(price)) return setErr('กรุณาระบุราคาต่อหน่วยที่ถูกต้อง')
      cleaned.push({ desc: r.desc.trim(), qty, unit: r.unit.trim() || 'หน่วย', price })
    }
    if (cleaned.length === 0) return setErr('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ')

    const po: PurchaseOrder = {
      id: poNo, poNo, orderDate, dueDate, supplier: supplier.trim(),
      items: cleaned, status: 'รอรับของ', note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addPurchaseOrder(po)
    onSaved(po)
  }

  return (
    <Modal open={open} title="สร้างใบสั่งซื้อใหม่" onClose={onClose} maxWidth={780}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field label="เลขที่ใบสั่งซื้อ" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{poNo}</div>
        </Field>
        <Field label="วันที่สั่งซื้อ" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field label="กำหนดรับของ" hint="วันที่คาดว่าจะได้รับ (ถ้ามี)">
          <Input type="date" value={dueDate} min={orderDate || undefined} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="ซัพพลายเออร์" required style={{ gridColumn: '1 / -1' }}>
          <Input list="kpc-supplier-list" placeholder="พิมพ์หรือเลือกซัพพลายเออร์" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <datalist id="kpc-supplier-list">
            {CREDITOR_MASTER.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </Field>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>รายการสินค้า/วัสดุ <span className="req">*</span></label>
          <Button variant="tonal" size="sm" onClick={addRow}>+ เพิ่มรายการ</Button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {items.map((row, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: 'stretch' }}>
              <Input placeholder="รายละเอียดสินค้า/วัสดุ" value={row.desc} onChange={(e) => setRow(i, { desc: e.target.value })} style={{ flex: 1 }} />
              <Input type="number" step="0.01" min={0} placeholder="จำนวน" value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} style={{ width: 90 }} />
              <Input placeholder="หน่วย" value={row.unit} onChange={(e) => setRow(i, { unit: e.target.value })} style={{ width: 80 }} />
              <Input type="number" step="0.01" min={0} placeholder="ราคา/หน่วย" value={row.price} onChange={(e) => setRow(i, { price: e.target.value })} style={{ width: 110 }} />
              <Button variant="ghost" size="sm" onClick={() => removeRow(i)} disabled={items.length === 1} title="ลบรายการ" style={{ color: items.length === 1 ? 'var(--kpc-text-faint)' : 'var(--kpc-danger)' }}>✕</Button>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10, fontSize: 14 }}>
          <span style={{ color: 'var(--kpc-text-muted)' }}>มูลค่ารวม:&nbsp;</span>
          <strong className="mono" style={{ color: 'var(--kpc-text-strong)' }}>{baht(draftTotal)}</strong>
        </div>
      </div>

      <Field label="หมายเหตุ">
        <Input placeholder="เงื่อนไข / รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  )
}

function PurchaseOrderDetail({ order, onClose, onPay }: { order: PurchaseOrder | null; onClose: () => void; onPay: (po: PurchaseOrder) => void }) {
  if (!order) return null
  return (
    <Modal open={!!order} title={`ใบสั่งซื้อ ${order.poNo}`} onClose={onClose} maxWidth={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          {order.status === 'รอรับของ' && (
            <Button variant="tonal" onClick={() => { markPurchaseOrderReceived(order.poNo); onClose() }}>ทำเครื่องหมายรับของแล้ว</Button>
          )}
          <Button variant="primary" onClick={() => onPay(order)}>ทำจ่ายสินค้า/วัสดุ</Button>
        </>
      }>
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone={STATUS_TONE[order.status]} pip={false} square>{order.status}</Badge>
      </div>
      <div className="grid g-2" style={{ gap: 12, marginBottom: 16 }}>
        <ReadField label="ซัพพลายเออร์" value={order.supplier} full />
        <ReadField label="วันที่สั่งซื้อ" value={fmtDate(order.orderDate)} />
        <ReadField label="กำหนดรับของ" value={order.dueDate ? fmtDate(order.dueDate) : '—'} />
      </div>
      <table className="table" style={{ width: '100%', fontSize: 13, marginBottom: 12 }}>
        <thead><tr><th style={{ textAlign: 'left' }}>รายการ</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'left' }}>หน่วย</th><th style={{ textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ textAlign: 'right' }}>รวม</th></tr></thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i}>
              <td>{it.desc}</td>
              <td style={{ textAlign: 'right' }} className="mono">{it.qty.toLocaleString()}</td>
              <td>{it.unit}</td>
              <td style={{ textAlign: 'right' }} className="mono">{baht(it.price)}</td>
              <td style={{ textAlign: 'right' }} className="mono">{baht(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>มูลค่ารวม</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{baht(poTotal(order))}</td></tr></tfoot>
      </table>
      {order.note && <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}><strong style={{ color: 'var(--kpc-text-strong)' }}>หมายเหตุ:</strong> {order.note}</div>}
    </Modal>
  )
}

function ReadField({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className="field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center' }}>{value}</div>
    </div>
  )
}
