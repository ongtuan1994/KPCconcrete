import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Field, Input, Select, SavedBy, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { STOCK_MATERIALS, type StockMaterial, type DeliveryTicket } from '../data/real'
import { CREDITOR_MASTER } from '../data/creditors'
import { MIX_BY_CODE } from '../data/mixDesign'
import { baht, qm, prodShort } from '../data/selectors'
import { useCreatedDocs, addStockReceipt, removeStockReceipt, addStockReconcile, CAN_DELETE, type StockReconcileLine } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | 'low' | 'out'

/* Estimated raw-material consumption per 1 m³ of concrete (ตัน). Used to auto-
   issue stock when a ใบจ่ายคอนกรีต is created. Admixtures vary by mix and are
   not auto-deducted. Cement is charged to SCG or ดอกบัว by the product code. */
const MIX_PER_M3 = { cement: 0.32, SAN: 0.80, AGG: 1.05 } as const
const MAT_BY_CODE = Object.fromEntries(STOCK_MATERIALS.map((m) => [m.code, m]))
/** R2/P2 = ปูนดอกบัว (CEM-2) ; RO/PO = ปูน SCG (CEM-1). */
const cementCodeOf = (prod: string): 'CEM-1' | 'CEM-2' => (/^KPC[RP]2/.test(prod) ? 'CEM-2' : 'CEM-1')

const r2 = (n: number) => Math.round(n * 100) / 100
/** Raw-material lines consumed by one delivery ticket — uses the real mix design
    for the product when available (kg → ตัน), else the per-m³ estimate. */
function ticketConsumption(t: DeliveryTicket): { code: string; qty: number }[] {
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

/** One stock movement row (รับเข้า / จ่ายออก) for the combined history table. */
interface Movement {
  key: string
  date: string
  sortAt: string
  kind: 'in' | 'out'
  material: string
  unit: string
  qty: number
  ref: string
  detail?: string
  by?: string
  at?: string
  receiptId?: string
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

function status(m: StockMaterial): { th: string; en: string; tone: Tone } {
  if (m.balance <= 0) return { th: 'ติดลบ / หมด', en: 'Out', tone: 'danger' }
  if (m.balance < m.reorder) return { th: 'ใกล้หมด', en: 'Low', tone: 'warning' }
  return { th: 'พอเพียง', en: 'In stock', tone: 'success' }
}

export function Stock() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [showReceive, setShowReceive] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* Sum received quantity per material code, then add it onto the seed balance. */
  const receivedByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of created.stockReceipts) m[r.code] = (m[r.code] ?? 0) + r.qty
    return m
  }, [created.stockReceipts])

  /* Approved reconciliations adjust the balance by their per-line diff. */
  const adjustByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const rc of created.stockReconciles) {
      if (rc.status !== 'approved') continue
      for (const l of rc.lines) if (l.diff) m[l.code] = (m[l.code] ?? 0) + l.diff
    }
    return m
  }, [created.stockReconciles])

  /* Auto-issue: user-created delivery tickets consume raw materials (seed
     tickets are excluded — the seed balance already reflects past use). */
  const issuedByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of created.tickets) {
      for (const c of ticketConsumption(t)) m[c.code] = (m[c.code] ?? 0) + c.qty
    }
    return m
  }, [created.tickets])

  const materials = useMemo(
    () => STOCK_MATERIALS.map((m) => ({
      ...m,
      balance: Math.round((m.balance + (receivedByCode[m.code] ?? 0) + (adjustByCode[m.code] ?? 0) - (issuedByCode[m.code] ?? 0)) * 100) / 100,
    })),
    [receivedByCode, adjustByCode, issuedByCode],
  )

  const rows = useMemo(
    () =>
      materials.filter((m) => {
        const t = status(m).tone
        if (filter === 'low' && t !== 'warning') return false
        if (filter === 'out' && t !== 'danger') return false
        if (query && !`${m.code} ${m.name} ${m.en}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [materials, filter, query],
  )
  const low = materials.filter((m) => status(m).tone === 'warning').length
  const out = materials.filter((m) => status(m).tone === 'danger').length

  /* Combined movement history — รับเข้า (receipts) + จ่ายออก (auto from tickets). */
  const movements: Movement[] = useMemo(() => {
    const out: Movement[] = []
    for (const r of created.stockReceipts) {
      out.push({ key: `in_${r.id}`, date: fmtDate(r.date), sortAt: r.createdAt ?? r.date, kind: 'in', material: r.material, unit: r.unit, qty: r.qty, ref: r.voucherNo ?? '', detail: r.note, by: r.createdBy, at: r.createdAt, receiptId: r.id })
    }
    for (const t of created.tickets) {
      for (const c of ticketConsumption(t)) {
        const mat = MAT_BY_CODE[c.code]
        out.push({ key: `out_${t.dtNo}_${c.code}`, date: t.date, sortAt: t.createdAt ?? t.date, kind: 'out', material: mat?.name ?? c.code, unit: mat?.unit ?? 'ตัน', qty: c.qty, ref: t.dtNo, detail: `${t.customer} · ${prodShort(t.prod)}`, by: t.createdBy, at: t.createdAt })
      }
    }
    out.sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    return out
  }, [created.stockReceipts, created.tickets])

  const moveColumns: Column<Movement>[] = [
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'kind', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={r.kind === 'in' ? 'success' : 'danger'} pip={false} square>{r.kind === 'in' ? 'รับเข้า' : 'จ่ายออก'}</Badge> },
    { key: 'mat', header: 'วัตถุดิบ', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.material}</span> },
    { key: 'qty', header: 'จำนวน', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 600, color: r.kind === 'in' ? '#15803d' : '#b91c1c' }}>{r.kind === 'in' ? '+' : '−'}{qm(r.qty)} {r.unit}</span> },
    { key: 'ref', header: 'เอกสารอ้างอิง', cell: (r) => (r.ref ? <span className="mono" style={{ fontSize: 13 }}>{r.ref}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'detail', header: 'รายละเอียด', cell: (r) => (r.detail ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.detail}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.by} at={r.at} /> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: Movement) => (r.receiptId
        ? <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบประวัติรับเข้า ${r.material} +${qm(r.qty)} ${r.unit} ?\n(ยอดคงเหลือจะถูกปรับกลับ)`)) removeStockReceipt(r.receiptId!) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
        : <span style={{ color: 'var(--kpc-text-faint)', fontSize: 11 }}>อัตโนมัติ</span>),
    }] : []),
  ]

  const columns: Column<StockMaterial>[] = [
    { key: 'code', header: 'รหัส', cell: (r) => r.code, className: 'docno' },
    {
      key: 'name',
      header: 'วัตถุดิบ',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{r.en}</span>
        </div>
      ),
    },
    {
      key: 'bal',
      header: 'คงเหลือ',
      align: 'right',
      cell: (r) => (
        <span className="mono" style={{ fontWeight: 600, color: r.balance <= 0 ? 'var(--kpc-danger-ink)' : 'var(--kpc-text-strong)' }}>
          {qm(r.balance)}
        </span>
      ),
    },
    { key: 'unit', header: 'หน่วย', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
    { key: 'reorder', header: 'จุดสั่งซื้อ', align: 'right', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{r.reorder.toLocaleString()}</span> },
    {
      key: 'status',
      header: 'สถานะ',
      align: 'center',
      cell: (r) => {
        const s = status(r)
        return <Badge tone={s.tone} pip={false}>{s.th}</Badge>
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="คลังวัตถุดิบ"
        sub="Raw Material Stock · คงเหลือ ณ มิถุนายน 2569"
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['รหัส', 'วัตถุดิบ', 'Material (EN)', 'คงเหลือ', 'หน่วย', 'จุดสั่งซื้อ', 'สถานะ']
              const body = rows.map((r) => [r.code, r.name, r.en, Math.round(r.balance * 100) / 100, r.unit, r.reorder, status(r).th])
              downloadCsv('stock', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={() => navigate('/stock-reconcile')}>ประวัติการกระทบยอด</Button>
            <Button variant="tonal" onClick={() => setShowReconcile(true)}>กระทบยอดคงคลัง</Button>
            <Button variant="primary" onClick={() => setShowReceive(true)}>
              <IconPlus /> รับเข้าวัตถุดิบ
            </Button>
          </>
        }
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รายการวัตถุดิบ · Materials" value={materials.length.toString()} note="รายการ" />
        <KpiCard label="ใกล้หมด · Low stock" value={low.toString()} delta="ต้องสั่งซื้อ" deltaDir="down" note="" />
        <KpiCard label="ติดลบ / หมด · Out" value={out.toString()} note="เร่งจัดหา" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {materials.length}</Pill>
          <Pill active={filter === 'low'} onClick={() => setFilter('low')}>ใกล้หมด {low}</Pill>
          <Pill active={filter === 'out'} onClick={() => setFilter('out')}>หมด {out}</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="รหัส / ชื่อวัตถุดิบ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />

      <div style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ประวัติการเคลื่อนไหวสต๊อก (รับเข้า / จ่ายออก)</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{movements.length} รายการ</span>
        </div>
        {movements.length === 0 ? (
          <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--kpc-text-faint)', fontSize: 13 }}>
            ยังไม่มีการเคลื่อนไหว — รับเข้าวัตถุดิบ หรือออกใบจ่ายคอนกรีตเพื่อบันทึก
          </div>
        ) : (
          <DataTable columns={moveColumns} rows={movements} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
        )}
      </div>
      <p className="page-sub" style={{ marginTop: 10, fontSize: 12 }}>
        * จ่ายออกอัตโนมัติเมื่อออกใบจ่ายคอนกรีต ตาม<strong>สูตร Mix Design</strong>ของสินค้านั้น (ปูน/ทราย/หิน + น้ำยา) — สินค้าที่ยังไม่มีสูตรจะใช้ค่าประมาณการ (ปูน {MIX_PER_M3.cement} · ทราย {MIX_PER_M3.SAN} · หิน {MIX_PER_M3.AGG} ตัน/คิว)
      </p>

      <ReceiveStockModal open={showReceive} onClose={() => setShowReceive(false)} receivedByCode={receivedByCode} />
      <ReconcileModal open={showReconcile} onClose={() => setShowReconcile(false)} materials={materials} />
    </>
  )
}

type RcvLine = { code: string; qty: string }
const emptyLine = (): RcvLine => ({ code: STOCK_MATERIALS[0]?.code ?? '', qty: '' })

function ReceiveStockModal({ open, onClose, receivedByCode }: { open: boolean; onClose: () => void; receivedByCode: Record<string, number> }) {
  const created = useCreatedDocs()
  const [lines, setLines] = useState<RcvLine[]>([emptyLine()])
  const [date, setDate] = useState(todayIso())
  const [supplier, setSupplier] = useState('')
  const [voucherNo, setVoucherNo] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setLines([emptyLine()]); setDate(todayIso()); setSupplier(''); setVoucherNo(''); setNote(''); setErr('')
  }, [open])

  const setLine = (i: number, patch: Partial<RcvLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, idx) => idx !== i)))

  const matOf = (code: string) => STOCK_MATERIALS.find((m) => m.code === code)
  const currentOf = (code: string) => {
    const m = matOf(code)
    return m ? Math.round((m.balance + (receivedByCode[code] ?? 0)) * 100) / 100 : 0
  }

  const submit = () => {
    setErr('')
    if (!date) return setErr('กรุณาระบุวันที่')
    const filled = lines.filter((l) => l.code && Number(l.qty) > 0)
    if (filled.length === 0) return setErr('กรุณาเพิ่มวัตถุดิบอย่างน้อย 1 รายการ (พร้อมจำนวน > 0)')
    for (const l of filled) {
      const n = Number(l.qty)
      if (!Number.isFinite(n) || n <= 0) return setErr('จำนวนที่รับเข้าต้องมากกว่า 0')
    }
    const ts = Date.now()
    filled.forEach((l, i) => {
      const m = matOf(l.code)!
      addStockReceipt({
        id: `sr_${ts}_${i}`,
        code: m.code, material: m.name, unit: m.unit, qty: Math.round(Number(l.qty) * 100) / 100, date,
        supplier: supplier.trim() || undefined, voucherNo: voucherNo.trim() || undefined, note: note.trim() || undefined,
      })
    })
    onClose()
  }

  return (
    <Modal open={open} title="รับเข้าวัตถุดิบ" onClose={onClose} maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึกรับเข้า</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12, marginBottom: 4 }}>
        <Field label="วันที่รับเข้า" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ผู้ขาย / ซัพพลายเออร์">
          <Input list="kpc-supplier-list-stock" placeholder="พิมพ์หรือเลือกซัพพลายเออร์" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <datalist id="kpc-supplier-list-stock">
            {CREDITOR_MASTER.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
        </Field>
        <Field label="เลขใบสำคัญจ่าย (ถ้ามี)" style={{ gridColumn: '1 / -1' }} hint="อ้างอิงใบสำคัญจ่ายที่เกี่ยวข้อง">
          <Input list="kpc-gp-list-stock" placeholder="เช่น GP00001" value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
          <datalist id="kpc-gp-list-stock">
            {created.goodsPayments.map((g) => <option key={g.gpNo} value={g.gpNo}>{g.supplier}</option>)}
          </datalist>
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เลขที่ใบส่งของ / รายละเอียด" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>รายการวัตถุดิบที่รับเข้า</label>
          <Button variant="ghost" size="sm" onClick={addLine}>+ เพิ่มรายการ</Button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
            <span style={{ flex: 1 }}>วัตถุดิบ</span>
            <span style={{ width: 96, textAlign: 'right' }}>จำนวน</span>
            <span style={{ width: 120, textAlign: 'right' }}>คงเหลือ → ใหม่</span>
            <span style={{ width: 28 }} />
          </div>
          {lines.map((l, i) => {
            const cur = currentOf(l.code)
            const n = Number(l.qty)
            const after = Math.round((cur + (Number.isFinite(n) ? n : 0)) * 100) / 100
            return (
              <div className="row" key={i} style={{ gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Select value={l.code} onChange={(e) => setLine(i, { code: e.target.value })}>
                    {STOCK_MATERIALS.map((mm) => <option key={mm.code} value={mm.code}>{mm.name} ({mm.unit})</option>)}
                  </Select>
                </div>
                <Input style={{ width: 96, textAlign: 'right' }} type="number" step="0.01" min={0} placeholder="0" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                <span className="mono" style={{ width: 120, textAlign: 'right', fontSize: 12, color: n > 0 ? 'var(--kpc-primary-ink)' : 'var(--kpc-text-faint)' }}>
                  {qm(cur)}{n > 0 ? ` → ${qm(after)}` : ''}
                </span>
                <Button variant="ghost" size="sm" onClick={() => removeLine(i)} style={{ width: 28, color: 'var(--kpc-danger)' }} aria-label="ลบรายการ">✕</Button>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

const tdSt: CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }
const thSt: CSSProperties = { padding: '8px', borderBottom: '1px solid var(--kpc-border)', color: 'var(--kpc-text-muted)', fontSize: 11.5, fontWeight: 600 }

function ReconcileModal({ open, onClose, materials }: { open: boolean; onClose: () => void; materials: StockMaterial[] }) {
  const [date, setDate] = useState(todayIso())
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [costs, setCosts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [overall, setOverall] = useState('')

  useEffect(() => {
    if (!open) return
    setDate(todayIso()); setCounted({}); setNotes({}); setOverall('')
    const c: Record<string, string> = {}
    for (const m of materials) c[m.code] = m.cost != null ? String(m.cost) : ''
    setCosts(c)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const calc = (m: StockMaterial) => {
    const sys = m.balance
    const cStr = counted[m.code]
    const cnt = cStr === undefined || cStr === '' ? sys : Number(cStr)
    const cntSafe = Number.isFinite(cnt) ? cnt : sys
    const diff = Math.round((cntSafe - sys) * 100) / 100
    const pct = sys !== 0 ? Math.round((diff / sys) * 1000) / 10 : 0
    const unitCost = Number(costs[m.code]) || 0
    const value = Math.round(diff * unitCost * 100) / 100
    const entered = cStr !== undefined && cStr !== ''
    return { cnt: cntSafe, diff, pct, unitCost, value, entered }
  }

  const totals = materials.reduce(
    (a, m) => { const { diff, value } = calc(m); return { net: a.net + value, loss: a.loss + (diff < 0 ? -value : 0) } },
    { net: 0, loss: 0 },
  )

  const submit = () => {
    const lines: StockReconcileLine[] = materials.map((m) => {
      const { cnt, diff, pct, unitCost, value } = calc(m)
      return {
        code: m.code, material: m.name, unit: m.unit, systemQty: m.balance, countedQty: cnt,
        diff, diffPct: pct, unitCost, diffValue: value, note: (notes[m.code] ?? '').trim() || undefined,
      }
    })
    addStockReconcile({
      id: `rc_${Date.now()}`, date, lines,
      totalDiffValue: Math.round(totals.net * 100) / 100,
      lossValue: Math.round(totals.loss * 100) / 100,
      note: overall.trim() || undefined,
      status: 'draft',
    })
    onClose()
  }

  return (
    <Modal open={open} title="กระทบยอดคงคลัง (Stock Reconcile)" onClose={onClose} maxWidth={940}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึกผลกระทบยอด</Button></>}>
      <div className="row wrap" style={{ gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
        <Field label="วันที่กระทบยอด" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Field label="หมายเหตุรวม">
            <Input placeholder="เช่น ตรวจนับสิ้นเดือน" value={overall} onChange={(e) => setOverall(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid var(--kpc-border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--kpc-bg-soft, #f8fafc)', zIndex: 1 }}>
            <tr>
              <th style={{ ...thSt, textAlign: 'left' }}>วัตถุดิบ</th>
              <th style={{ ...thSt, textAlign: 'right' }}>คงคลัง (ระบบ)</th>
              <th style={{ ...thSt, textAlign: 'right' }}>นับจริง</th>
              <th style={{ ...thSt, textAlign: 'right' }}>ผลต่าง</th>
              <th style={{ ...thSt, textAlign: 'right' }}>%</th>
              <th style={{ ...thSt, textAlign: 'right' }}>ต้นทุน/หน่วย</th>
              <th style={{ ...thSt, textAlign: 'right' }}>มูลค่า</th>
              <th style={{ ...thSt, textAlign: 'left' }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const { diff, pct, value, entered } = calc(m)
              const short = diff < 0
              const diffColor = diff === 0 ? 'var(--kpc-text-faint)' : short ? '#b91c1c' : '#15803d'
              return (
                <tr key={m.code}>
                  <td style={tdSt}>
                    <div style={{ fontSize: 13, color: 'var(--kpc-text-strong)' }}>{m.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>{m.code} · {m.unit}</div>
                  </td>
                  <td className="mono" style={{ ...tdSt, textAlign: 'right' }}>{qm(m.balance)}</td>
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    <input type="number" step="0.01" className="input mono" placeholder={qm(m.balance)} value={counted[m.code] ?? ''} onChange={(e) => setCounted({ ...counted, [m.code]: e.target.value })} style={{ width: 90, textAlign: 'right', padding: '4px 6px', fontSize: 13 }} />
                  </td>
                  <td className="mono" style={{ ...tdSt, textAlign: 'right', color: diffColor, fontWeight: entered && diff ? 700 : 400 }}>{entered ? `${diff > 0 ? '+' : ''}${qm(diff)}` : '—'}</td>
                  <td className="mono" style={{ ...tdSt, textAlign: 'right', color: diffColor }}>{entered && m.balance !== 0 ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}</td>
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    <input type="number" step="0.01" className="input mono" value={costs[m.code] ?? ''} onChange={(e) => setCosts({ ...costs, [m.code]: e.target.value })} style={{ width: 78, textAlign: 'right', padding: '4px 6px', fontSize: 13 }} />
                  </td>
                  <td className="mono" style={{ ...tdSt, textAlign: 'right', color: value < 0 ? '#b91c1c' : value > 0 ? '#15803d' : 'var(--kpc-text-faint)' }}>{entered ? `${value > 0 ? '+' : ''}${baht(value)}` : '—'}</td>
                  <td style={tdSt}>
                    <input className="input" placeholder="เหตุผลถ้าไม่ตรง" value={notes[m.code] ?? ''} onChange={(e) => setNotes({ ...notes, [m.code]: e.target.value })} style={{ width: '100%', minWidth: 120, padding: '4px 6px', fontSize: 13 }} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 14 }}>
        <div>มูลค่าส่วนต่างสุทธิ: <strong className="mono">{totals.net > 0 ? '+' : ''}{baht(Math.round(totals.net * 100) / 100)}</strong></div>
        <div>ต้นทุนเสียหายรวม: <strong className="mono" style={{ color: '#b91c1c' }}>{baht(Math.round(totals.loss * 100) / 100)}</strong></div>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--kpc-text-muted)' }}>* บันทึกเพื่อตรวจสอบเท่านั้น — ระบบจะไม่ปรับยอดคงคลังตามจำนวนที่นับจริง</div>
    </Modal>
  )
}
