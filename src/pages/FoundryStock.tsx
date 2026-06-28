import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Field, Input, Select, SavedBy, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { PRODUCTS, type FoundryKind } from '../data/real'
import { cleanProductName as cleanName, qm } from '../data/selectors'
import { useCreatedDocs, addFoundryReceipt, removeFoundryReceipt, CAN_DELETE, type StockReceipt } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/* All foundry (โรงหล่อ) products feed this stock page. */
const FOUNDRY_PRODUCTS = PRODUCTS.filter((p) => p.site === 'foundry')

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
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

interface FoundryStockRow {
  code: string
  name: string
  unit: string
  kind?: FoundryKind
  pickup?: string
  received: number
  delivered: number
  balance: number
}

export function FoundryStock() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [showReceive, setShowReceive] = useState(false)
  const created = useCreatedDocs()

  /* รับเข้า (production into stock) per product code. */
  const receivedByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of created.foundryReceipts) m[r.code] = (m[r.code] ?? 0) + r.qty
    return m
  }, [created.foundryReceipts])

  /* ส่งออก via ใบส่งสินค้าโรงหล่อ per product code. */
  const deliveredByCode = useMemo(() => {
    const m: Record<string, number> = {}
    for (const fd of created.foundryDeliveries) {
      for (const it of fd.items) m[it.code] = (m[it.code] ?? 0) + it.qty
    }
    return m
  }, [created.foundryDeliveries])

  const items: FoundryStockRow[] = useMemo(
    () => FOUNDRY_PRODUCTS.map((p) => {
      const received = receivedByCode[p.code] ?? 0
      const delivered = deliveredByCode[p.code] ?? 0
      return {
        code: p.code, name: cleanName(p.name), unit: p.unit, kind: p.kind, pickup: p.pickup,
        received, delivered, balance: Math.round((received - delivered) * 100) / 100,
      }
    }),
    [receivedByCode, deliveredByCode],
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

  const columns: Column<FoundryStockRow>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'สินค้า', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span> },
    { key: 'kind', header: 'ประเภท', align: 'center', cell: (r) => (r.kind ? <Badge tone={KIND_LABEL[r.kind].tone} pip={false} square>{KIND_LABEL[r.kind].th}</Badge> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'pickup', header: 'การรับของ', align: 'center', cell: (r) => (r.pickup ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.pickup}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'recv', header: 'รับเข้ารวม', align: 'right', cell: (r) => <span className="mono" style={{ color: '#15803d' }}>{qm(r.received)}</span> },
    { key: 'deliv', header: 'ส่งออกรวม', align: 'right', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{qm(r.delivered)}</span> },
    { key: 'bal', header: 'คงเหลือ', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 700, color: r.balance <= 0 ? 'var(--kpc-danger-ink)' : 'var(--kpc-text-strong)' }}>{qm(r.balance)}</span> },
    { key: 'unit', header: 'หน่วย', align: 'center', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
  ]

  /* รับเข้า history (newest first). */
  const receipts = created.foundryReceipts
  const receiptColumns: Column<StockReceipt>[] = [
    { key: 'date', header: 'วันที่', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'mat', header: 'สินค้า', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.material}</span> },
    { key: 'qty', header: 'รับเข้า', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 600, color: '#15803d' }}>+{qm(r.qty)} {r.unit}</span> },
    { key: 'note', header: 'หมายเหตุ', cell: (r) => (r.note ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.note}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: StockReceipt) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบประวัติรับเข้า ${r.material} +${qm(r.qty)} ${r.unit} ?\n(ยอดคงเหลือจะถูกปรับกลับ)`)) removeFoundryReceipt(r.id) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="สต๊อกสินค้าโรงหล่อ"
        sub={`Foundry Product Stock · ${items.length} รายการ`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['รหัสสินค้า', 'สินค้า', 'ประเภท', 'การรับของ', 'รับเข้ารวม', 'ส่งออกรวม', 'คงเหลือ', 'หน่วย']
              const body = rows.map((r) => [r.code, r.name, r.kind ? KIND_LABEL[r.kind].th : '', r.pickup ?? '', r.received, r.delivered, r.balance, r.unit])
              downloadCsv('foundry-stock', [head, ...body])
            }}>ส่งออก Excel</Button>
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
        <div style={{ width: 280 }}>
          <SearchInput placeholder="รหัส / ชื่อสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />

      <div style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ประวัติการรับเข้าสต๊อก</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{receipts.length} ครั้ง</span>
        </div>
        {receipts.length === 0 ? (
          <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--kpc-text-faint)', fontSize: 13 }}>
            ยังไม่มีประวัติการรับเข้า — กด <strong>“รับเข้าสต๊อก”</strong> เพื่อบันทึก
          </div>
        ) : (
          <DataTable columns={receiptColumns} rows={receipts} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ครั้ง`} />
        )}
      </div>

      <ReceiveFoundryModal open={showReceive} onClose={() => setShowReceive(false)} balanceByCode={Object.fromEntries(items.map((r) => [r.code, r.balance]))} />
    </>
  )
}

type RcvLine = { code: string; qty: string }
const emptyLine = (): RcvLine => ({ code: FOUNDRY_PRODUCTS[0]?.code ?? '', qty: '' })
const optionLabel = (code: string) => {
  const p = FOUNDRY_PRODUCTS.find((x) => x.code === code)
  if (!p) return code
  return `${cleanName(p.name)}${p.pickup ? ` · ${p.pickup}` : ''} (${p.unit})`
}

function ReceiveFoundryModal({ open, onClose, balanceByCode }: { open: boolean; onClose: () => void; balanceByCode: Record<string, number> }) {
  const [lines, setLines] = useState<RcvLine[]>([emptyLine()])
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setLines([emptyLine()]); setDate(todayIso()); setNote(''); setErr('')
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
      const p = FOUNDRY_PRODUCTS.find((x) => x.code === l.code)!
      addFoundryReceipt({
        id: `fr_${ts}_${i}`,
        code: p.code, material: cleanName(p.name), unit: p.unit, qty: Math.round(Number(l.qty) * 100) / 100, date,
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
        <Field label="หมายเหตุ">
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
                    {FOUNDRY_PRODUCTS.map((p) => <option key={p.code} value={p.code}>{optionLabel(p.code)}</option>)}
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
