import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Field, Input, Select, SavedBy, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { type FoundryKind, type Product } from '../data/real'
import { cleanProductName as cleanName, baht, qm } from '../data/selectors'
import {
  useCreatedDocs, useProducts, addFoundryReceipt, removeFoundryReceipt, addStockReconcile, addGeneralReport,
  CAN_DELETE, type StockReconcileLine, type StockReport,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const KIND_LABEL: Record<FoundryKind, { th: string; tone: Tone }> = {
  plank: { th: 'แผ่นพื้น', tone: 'info' },
  ipole: { th: 'เสาไอ', tone: 'warning' },
  wallpanel: { th: 'แผ่นผนัง', tone: 'success' },
}

type Filter = 'all' | FoundryKind

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function firstOfMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

interface FoundryStockRow {
  code: string; name: string; unit: string; kind?: FoundryKind
  received: number; delivered: number; balance: number
}
interface Movement {
  key: string; date: string; iso: string; sortAt: string; kind: 'in' | 'out'
  material: string; unit: string; qty: number; ref: string; detail?: string
  by?: string; at?: string; receiptId?: string
}

export function FoundryStock() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState(firstOfMonthIso())
  const [to, setTo] = useState(todayIso())
  const [showReceive, setShowReceive] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* Reactive foundry product list (seed + user-added, with edits) — so products
     added on the ราคาสินค้าโรงหล่อ page show up in the stock table + รับเข้า picker. */
  const allProducts = useProducts()
  const foundryProducts = useMemo(() => allProducts.filter((p) => p.site === 'foundry'), [allProducts])
  const prodByCode = useMemo(() => Object.fromEntries(foundryProducts.map((p) => [p.code, p])) as Record<string, Product>, [foundryProducts])

  const upTo = (iso: string) => !to || iso <= to

  const receivedByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of created.foundryReceipts) if (upTo(r.date)) m[r.code] = (m[r.code] ?? 0) + r.qty
    return m
  }, [created.foundryReceipts, to])

  const deliveredByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const fd of created.foundryDeliveries) {
      if (!upTo(fd.date)) continue
      for (const it of fd.items) m[it.code] = (m[it.code] ?? 0) + it.qty
    }
    return m
  }, [created.foundryDeliveries, to])

  /* Approved foundry reconciliations adjust the balance by their per-line diff. */
  const adjustByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const rc of created.stockReconciles) {
      if (rc.status !== 'approved' || rc.scope !== 'foundry' || !upTo(rc.date)) continue
      for (const l of rc.lines) if (l.diff) m[l.code] = (m[l.code] ?? 0) + l.diff
    }
    return m
  }, [created.stockReconciles, to])

  const items: FoundryStockRow[] = useMemo(
    () => foundryProducts.map((p) => {
      const received = receivedByCode[p.code] ?? 0
      const delivered = deliveredByCode[p.code] ?? 0
      return {
        code: p.code, name: cleanName(p.name), unit: p.unit, kind: p.kind,
        received, delivered, balance: Math.round((received - delivered + (adjustByCode[p.code] ?? 0)) * 100) / 100,
      }
    }),
    [foundryProducts, receivedByCode, deliveredByCode, adjustByCode],
  )

  const rows = useMemo(
    () => items.filter((r) => {
      if (filter !== 'all' && r.kind !== filter) return false
      if (query && !`${r.code} ${r.name}`.toLowerCase().includes(query.toLowerCase())) return false
      return true
    }),
    [items, filter, query],
  )

  const kindCount = (k: FoundryKind) => items.filter((r) => r.kind === k).length
  const totalBalance = items.reduce((s, r) => s + r.balance, 0)
  const outOfStock = items.filter((r) => r.balance <= 0).length

  /* Combined movement history (รับเข้า / จ่ายออก), filtered by date range. */
  const movements: Movement[] = useMemo(() => {
    const out: Movement[] = []
    for (const r of created.foundryReceipts) {
      const ref = (r.reportBook || r.reportNo) ? `เล่ม ${r.reportBook ?? '-'} เลขที่ ${r.reportNo ?? '-'}` : ''
      const parts = [r.bench ? `แท่น ${r.bench}` : '', r.note ?? ''].filter(Boolean)
      out.push({ key: `in_${r.id}`, date: fmtDate(r.date), iso: r.date, sortAt: r.createdAt ?? r.date, kind: 'in', material: r.material, unit: r.unit, qty: r.qty, ref, detail: parts.join(' · ') || undefined, by: r.createdBy, at: r.createdAt, receiptId: r.id })
    }
    for (const fd of created.foundryDeliveries) {
      for (const it of fd.items) {
        out.push({ key: `out_${fd.fdNo}_${it.code}`, date: fmtDate(fd.date), iso: fd.date, sortAt: fd.createdAt ?? fd.date, kind: 'out', material: it.name, unit: it.unit, qty: it.qty, ref: fd.fdNo, detail: `${fd.customer}${it.pickup ? ` · ${it.pickup}` : ''}`, by: fd.createdBy, at: fd.createdAt })
      }
    }
    return out
      .filter((mv) => (!from || mv.iso >= from) && (!to || mv.iso <= to))
      .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
  }, [created.foundryReceipts, created.foundryDeliveries, from, to])

  const moveColumns: Column<Movement>[] = [
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'kind', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={r.kind === 'in' ? 'success' : 'danger'} pip={false} square>{r.kind === 'in' ? 'รับเข้า' : 'จ่ายออก'}</Badge> },
    { key: 'mat', header: 'สินค้า', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.material}</span> },
    { key: 'qty', header: 'จำนวน', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 600, color: r.kind === 'in' ? '#15803d' : '#b91c1c' }}>{r.kind === 'in' ? '+' : '−'}{qm(r.qty)} {r.unit}</span> },
    { key: 'ref', header: 'เอกสารอ้างอิง', cell: (r) => (r.ref ? <span className="mono" style={{ fontSize: 13 }}>{r.ref}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'detail', header: 'รายละเอียด', cell: (r) => (r.detail ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.detail}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.by} at={r.at} /> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: Movement) => (r.receiptId
        ? <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบประวัติรับเข้า ${r.material} +${qm(r.qty)} ${r.unit} ?`)) removeFoundryReceipt(r.receiptId!) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
        : <span style={{ color: 'var(--kpc-text-faint)', fontSize: 11 }}>อัตโนมัติ</span>),
    }] : []),
  ]

  const columns: Column<FoundryStockRow>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'สินค้า', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span> },
    { key: 'kind', header: 'ประเภท', align: 'center', cell: (r) => (r.kind ? <Badge tone={KIND_LABEL[r.kind].tone} pip={false} square>{KIND_LABEL[r.kind].th}</Badge> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'recv', header: 'รับเข้ารวม', align: 'right', cell: (r) => <span className="mono" style={{ color: '#15803d' }}>{qm(r.received)}</span> },
    { key: 'deliv', header: 'ส่งออกรวม', align: 'right', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{qm(r.delivered)}</span> },
    { key: 'bal', header: 'คงเหลือ', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 700, color: r.balance <= 0 ? 'var(--kpc-danger-ink)' : 'var(--kpc-text-strong)' }}>{qm(r.balance)}</span> },
    { key: 'unit', header: 'หน่วย', align: 'center', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
  ]

  const periodLabel = from || to
    ? `${from ? `ตั้งแต่ ${fmtDate(from)}` : ''}${from && to ? ' ' : ''}${to ? `ถึง ${fmtDate(to)}` : ''}`.trim()
    : 'ยอดปัจจุบัน (ทั้งหมด)'
  const createReport = () => {
    const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to)
    const recv: Record<string, number> = {}, iss: Record<string, number> = {}
    for (const r of created.foundryReceipts) if (inRange(r.date)) recv[r.code] = (recv[r.code] ?? 0) + r.qty
    for (const fd of created.foundryDeliveries) if (inRange(fd.date)) for (const it of fd.items) iss[it.code] = (iss[it.code] ?? 0) + it.qty
    const report: StockReport = {
      id: `gr_${Date.now()}`,
      kind: 'stock',
      heading: 'รายงานสต๊อกสินค้าโรงหล่อ',
      title: `สต๊อกสินค้าโรงหล่อ · ${periodLabel}`,
      fromLabel: from ? fmtDate(from) : '—',
      toLabel: to ? fmtDate(to) : 'ปัจจุบัน',
      scopeLabel: periodLabel,
      rows: items.map((m) => ({
        code: m.code, material: m.name, unit: m.unit,
        received: Math.round((recv[m.code] ?? 0) * 100) / 100,
        issued: Math.round((iss[m.code] ?? 0) * 100) / 100,
        balance: m.balance, reorder: 0, status: m.balance <= 0 ? 'หมด' : 'พอเพียง',
      })),
      movements: movements.map((mv) => ({ date: mv.date, kind: mv.kind, material: mv.material, unit: mv.unit, qty: mv.qty, ref: mv.ref, detail: mv.detail })),
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  return (
    <div className="foundry-theme">
      <PageHeader
        title="สต๊อกสินค้าโรงหล่อ"
        sub={`Foundry Product Stock · ${items.length} รายการ`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['รหัสสินค้า', 'สินค้า', 'ประเภท', 'รับเข้ารวม', 'ส่งออกรวม', 'คงเหลือ', 'หน่วย']
              const body = rows.map((r) => [r.code, r.name, r.kind ? KIND_LABEL[r.kind].th : '', r.received, r.delivered, r.balance, r.unit])
              downloadCsv('foundry-stock', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport}>สร้างรายงาน</Button>
            <Button variant="secondary" onClick={() => navigate('/foundry-stock-reconcile')}>ประวัติการกระทบยอด</Button>
            <Button variant="tonal" onClick={() => setShowReconcile(true)}>กระทบยอดคงคลัง</Button>
            <Button variant="primary" onClick={() => setShowReceive(true)}>
              <IconPlus /> รับเข้าสต๊อก
            </Button>
          </>
        }
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รายการสินค้า · Items" value={items.length.toString()} note="โรงหล่อ" />
        <KpiCard label="คงเหลือรวม · Balance" value={qm(Math.round(totalBalance))} note="ทุกสินค้า" invert />
        <KpiCard label="หมดสต๊อก · Out" value={outOfStock.toString()} note="คงเหลือ ≤ 0" />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {items.length}</Pill>
          {(Object.keys(KIND_LABEL) as FoundryKind[]).map((k) => (
            <Pill key={k} active={filter === k} onClick={() => setFilter(k)}>{KIND_LABEL[k].th} {kindCount(k)}</Pill>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>ตั้งแต่</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>จนถึง</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }}>ล้างช่วง</Button>}
          <div style={{ width: 220 }}>
            <SearchInput placeholder="รหัส / ชื่อสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
      </div>
      {to && <p className="page-sub" style={{ marginTop: -6, marginBottom: 12, fontSize: 12 }}>* คอลัมน์ "คงเหลือ" แสดงยอด ณ วันที่ {fmtDate(to)} (รวมการเคลื่อนไหวถึงวันนั้น)</p>}
      <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />

      <div style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ประวัติการเคลื่อนไหวสต๊อก (รับเข้า / จ่ายออก)</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{movements.length} รายการ</span>
        </div>
        {movements.length === 0 ? (
          <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--kpc-text-faint)', fontSize: 13 }}>
            ยังไม่มีการเคลื่อนไหว — รับเข้าสต๊อก หรือออกใบส่งสินค้าโรงหล่อเพื่อบันทึก
          </div>
        ) : (
          <DataTable columns={moveColumns} rows={movements} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
        )}
      </div>

      <ReceiveFoundryModal open={showReceive} onClose={() => setShowReceive(false)} balanceByCode={Object.fromEntries(items.map((r) => [r.code, r.balance]))} products={foundryProducts} prodByCode={prodByCode} />
      <FoundryReconcileModal open={showReconcile} onClose={() => setShowReconcile(false)} items={items} prodByCode={prodByCode} />
    </div>
  )
}

/* ───────── รับเข้าสต๊อก ───────── */
type RcvLine = { code: string; qty: string }

function ReceiveFoundryModal({ open, onClose, balanceByCode, products, prodByCode }: { open: boolean; onClose: () => void; balanceByCode: Record<string, number>; products: Product[]; prodByCode: Record<string, Product> }) {
  const firstCode = products[0]?.code ?? ''
  const emptyLine = (): RcvLine => ({ code: firstCode, qty: '' })
  const optionLabel = (code: string) => {
    const p = prodByCode[code]
    return p ? `${cleanName(p.name)} (${p.unit})` : code
  }
  const [lines, setLines] = useState<RcvLine[]>([emptyLine()])
  const [date, setDate] = useState(todayIso())
  const [reportBook, setReportBook] = useState('')
  const [reportNo, setReportNo] = useState('')
  const [bench, setBench] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setLines([emptyLine()]); setDate(todayIso()); setReportBook(''); setReportNo(''); setBench(''); setNote(''); setErr('')
  }, [open])

  const setLine = (i: number, patch: Partial<RcvLine>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, idx) => idx !== i)))

  const submit = () => {
    setErr('')
    if (!date) return setErr('กรุณาระบุวันที่')
    const filled = lines.filter((l) => l.code && Number(l.qty) > 0)
    if (filled.length === 0) return setErr('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ (พร้อมจำนวน > 0)')
    const ts = Date.now()
    filled.forEach((l, i) => {
      const p = prodByCode[l.code]
      addFoundryReceipt({
        id: `fr_${ts}_${i}`,
        code: p.code, material: cleanName(p.name), unit: p.unit, qty: Math.round(Number(l.qty) * 100) / 100, date,
        reportBook: reportBook.trim() || undefined, reportNo: reportNo.trim() || undefined, bench: bench.trim() || undefined,
        note: note.trim() || undefined,
      })
    })
    onClose()
  }

  return (
    <Modal open={open} title="รับเข้าสต๊อกสินค้าโรงหล่อ" onClose={onClose} maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึกรับเข้า</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12, marginBottom: 4 }}>
        <Field label="วันที่รับเข้า" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="แท่นผลิต">
          <Input placeholder="เช่น แท่น 1" value={bench} onChange={(e) => setBench(e.target.value)} />
        </Field>
        <Field label="เล่มใบรายงาน">
          <Input placeholder="เช่น 5" value={reportBook} onChange={(e) => setReportBook(e.target.value)} />
        </Field>
        <Field label="เลขที่ใบรายงาน">
          <Input placeholder="เช่น 0123" value={reportNo} onChange={(e) => setReportNo(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เช่น ผลิตเข้าสต๊อก / รายละเอียด" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>รายการสินค้าที่รับเข้า</label>
          <Button variant="ghost" size="sm" onClick={addLine}>+ เพิ่มรายการ</Button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
            <span style={{ flex: 1 }}>สินค้า</span>
            <span style={{ width: 96, textAlign: 'right' }}>จำนวน</span>
            <span style={{ width: 120, textAlign: 'right' }}>คงเหลือ → ใหม่</span>
            <span style={{ width: 28 }} />
          </div>
          {lines.map((l, i) => {
            const cur = balanceByCode[l.code] ?? 0
            const n = Number(l.qty)
            const after = Math.round((cur + (Number.isFinite(n) ? n : 0)) * 100) / 100
            return (
              <div className="row" key={i} style={{ gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Select value={l.code} onChange={(e) => setLine(i, { code: e.target.value })}>
                    {products.map((p) => <option key={p.code} value={p.code}>{optionLabel(p.code)}</option>)}
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

/* ───────── กระทบยอดคงคลัง (สต๊อกโรงหล่อ) ───────── */
const tdSt: CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }
const thSt: CSSProperties = { padding: '8px', borderBottom: '1px solid var(--kpc-border)', color: 'var(--kpc-text-muted)', fontSize: 11.5, fontWeight: 600 }

function FoundryReconcileModal({ open, onClose, items, prodByCode }: { open: boolean; onClose: () => void; items: FoundryStockRow[]; prodByCode: Record<string, Product> }) {
  const [date, setDate] = useState(todayIso())
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [costs, setCosts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [overall, setOverall] = useState('')

  useEffect(() => {
    if (!open) return
    setDate(todayIso()); setCounted({}); setNotes({}); setOverall('')
    const c: Record<string, string> = {}
    for (const m of items) c[m.code] = String(prodByCode[m.code]?.price ?? '')
    setCosts(c)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const calc = (m: FoundryStockRow) => {
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

  const totals = items.reduce(
    (a, m) => { const { diff, value } = calc(m); return { net: a.net + value, loss: a.loss + (diff < 0 ? -value : 0) } },
    { net: 0, loss: 0 },
  )

  const submit = () => {
    const lines: StockReconcileLine[] = items.map((m) => {
      const { cnt, diff, pct, unitCost, value } = calc(m)
      return { code: m.code, material: m.name, unit: m.unit, systemQty: m.balance, countedQty: cnt, diff, diffPct: pct, unitCost, diffValue: value, note: (notes[m.code] ?? '').trim() || undefined }
    })
    addStockReconcile({
      id: `rc_${Date.now()}`, scope: 'foundry', date, lines,
      totalDiffValue: Math.round(totals.net * 100) / 100,
      lossValue: Math.round(totals.loss * 100) / 100,
      note: overall.trim() || undefined,
      status: 'draft',
    })
    onClose()
  }

  return (
    <Modal open={open} title="กระทบยอดสต๊อกสินค้าโรงหล่อ" onClose={onClose} maxWidth={940}
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
              <th style={{ ...thSt, textAlign: 'left' }}>สินค้า</th>
              <th style={{ ...thSt, textAlign: 'right' }}>คงเหลือ (ระบบ)</th>
              <th style={{ ...thSt, textAlign: 'right' }}>นับจริง</th>
              <th style={{ ...thSt, textAlign: 'right' }}>ผลต่าง</th>
              <th style={{ ...thSt, textAlign: 'right' }}>%</th>
              <th style={{ ...thSt, textAlign: 'right' }}>ต้นทุน/หน่วย</th>
              <th style={{ ...thSt, textAlign: 'right' }}>มูลค่า</th>
              <th style={{ ...thSt, textAlign: 'left' }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
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
                    <input type="number" step="0.01" className="input mono" value={costs[m.code] ?? ''} onChange={(e) => setCosts({ ...costs, [m.code]: e.target.value })} style={{ width: 84, textAlign: 'right', padding: '4px 6px', fontSize: 13 }} />
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
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--kpc-text-muted)' }}>* บันทึกเพื่อขออนุมัติ — ระบบจะปรับยอดสต๊อกจริงเมื่อผู้บริหาร (Board) อนุมัติ</div>
    </Modal>
  )
}
