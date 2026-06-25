import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { CREDITOR_MASTER } from '../data/creditors'
import {
  useCreatedDocs, addGoodsPayment, removeGoodsPayment, CAN_DELETE,
  type GoodsPayment, type PayMethodOut, type PurchaseOrder,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const METHOD_TONE: Record<PayMethodOut, Tone> = { เงินสด: 'success', โอน: 'info', เช็ค: 'warning' }

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
    const head = ['เลขที่ใบทำจ่าย', 'วันที่จ่าย', 'ซัพพลายเออร์', 'อ้างอิง', 'วิธีจ่าย', 'เลขที่เช็ค', 'จำนวนเงิน', 'หมายเหตุ']
    const body = rows.map((g) => [g.gpNo, fmtDate(g.payDate), g.supplier, g.ref ?? '', g.method, g.chequeNo ?? '', g.amount, g.note ?? ''])
    downloadCsv('goods-payments', [head, ...body])
  }

  const columns: Column<GoodsPayment>[] = [
    { key: 'no', header: 'เลขที่ใบทำจ่าย', cell: (r) => <span className="mono">{r.gpNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่จ่าย', cell: (r) => fmtDate(r.payDate), className: 'date' },
    { key: 'sup', header: 'ซัพพลายเออร์', cell: (r) => r.supplier },
    { key: 'ref', header: 'อ้างอิง', cell: (r) => (r.ref ? <span className="mono" style={{ fontSize: 13 }}>{r.ref}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
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
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: GoodsPayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบทำจ่าย ${r.gpNo} ?`)) removeGoodsPayment(r.gpNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบทำจ่ายสินค้า/วัสดุ"
        sub={`Goods / Material Payments · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> บันทึกใบทำจ่าย</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบทำจ่าย · Vouchers" value={all.length.toString()} note="ใบ" />
        <KpiCard label="ยอดจ่ายรวม · Paid" value={baht(totalPaid)} note="ทุกใบทำจ่าย" invert />
        <KpiCard label="ซัพพลายเออร์ · Suppliers" value={new Set(all.map((g) => g.supplier)).size.toString()} note="รายที่จ่ายแล้ว" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ / ซัพพลายเออร์ / อ้างอิง" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีใบทำจ่าย — กด <strong>“บันทึกใบทำจ่าย”</strong> เพื่อเริ่ม
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

function NewGoodsPaymentForm({ open, onClose, existing, purchaseOrders, initial, onSaved }: { open: boolean; onClose: () => void; existing: GoodsPayment[]; purchaseOrders: PurchaseOrder[]; initial?: GoodsPaymentInitial | null; onSaved: (g: GoodsPayment) => void }) {
  const [payDate, setPayDate] = useState(todayIso())
  const [supplier, setSupplier] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethodOut>('โอน')
  const [chequeNo, setChequeNo] = useState('')
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const gpNo = useMemo(() => nextGpNo(existing), [existing, open])

  useEffect(() => {
    if (!open) return
    setPayDate(todayIso()); setMethod('โอน'); setChequeNo(''); setNote(''); setErr('')
    setSupplier(initial?.supplier ?? '')
    setAmount(initial?.amount ?? '')
    setRef(initial?.ref ?? '')
  }, [open, initial])

  /* Purchase orders for the selected supplier — quick reference picker. */
  const supplierPOs = purchaseOrders.filter((p) => !supplier || p.supplier === supplier)

  const submit = () => {
    setErr('')
    if (!supplier.trim()) return setErr('กรุณาเลือกซัพพลายเออร์')
    if (!payDate) return setErr('กรุณาระบุวันที่จ่าย')
    const amt = Number(amount)
    if (!amt || amt <= 0) return setErr('กรุณาระบุจำนวนเงินที่จ่าย (มากกว่า 0)')
    if (method === 'เช็ค' && !chequeNo.trim()) return setErr('จ่ายแบบเช็ค — กรุณาระบุเลขที่เช็ค')

    const gp: GoodsPayment = {
      id: gpNo, gpNo, payDate, supplier: supplier.trim(), amount: amt, method,
      chequeNo: method === 'เช็ค' ? chequeNo.trim() : undefined,
      ref: ref.trim() || undefined, note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addGoodsPayment(gp)
    onSaved(gp)
  }

  return (
    <Modal open={open} title="บันทึกใบทำจ่ายสินค้า/วัสดุ" onClose={onClose} maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่ใบทำจ่าย" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{gpNo}</div>
        </Field>
        <Field label="วันที่จ่าย" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        <Field label="ซัพพลายเออร์" required style={{ gridColumn: '1 / -1' }}>
          <Input list="kpc-supplier-list-gp" placeholder="พิมพ์หรือเลือกซัพพลายเออร์" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <datalist id="kpc-supplier-list-gp">
            {CREDITOR_MASTER.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </Field>
        <Field label="อ้างอิงใบสั่งซื้อ (ถ้ามี)" style={{ gridColumn: '1 / -1' }} hint="เลือกจากใบสั่งซื้อของซัพพลายเออร์ หรือพิมพ์เลขอ้างอิงเอง">
          <Input list="kpc-po-list" placeholder="เช่น PO00001 / เลขที่ใบส่งของ" value={ref} onChange={(e) => setRef(e.target.value)} />
          <datalist id="kpc-po-list">
            {supplierPOs.map((p) => <option key={p.poNo} value={p.poNo} />)}
          </datalist>
        </Field>
        <Field label="จำนวนเงิน (บาท)" required>
          <Input type="number" step="0.01" min={0} placeholder="เช่น 25000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="วิธีจ่าย" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethodOut)}>
            <option value="โอน">โอน</option>
            <option value="เงินสด">เงินสด</option>
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
    </Modal>
  )
}
