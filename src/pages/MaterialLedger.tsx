import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Pill, Field, Input } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { IconPlus } from '../components/icons'
import { STOCK_MATERIALS, type StockMaterial } from '../data/real'
import { useCan } from '../data/auth'
import {
  useCreatedDocs, useSuppliers, addStockMovement, updateStockMovement, removeStockMovement, setStockOpening,
  addGeneralReport, type StockMovement, type StockMovementKind, type StockReport,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/* Plant raw materials only (foundry stays on its own page). These are the tabs. */
const PLANT_MATERIALS = STOCK_MATERIALS.filter((m) => (m.site ?? 'plant') === 'plant')
const PLANT_CODES = new Set(PLANT_MATERIALS.map((m) => m.code))
/** Short tab labels mirroring the company's stock-card sheet tabs. */
const SHORT_LABEL: Record<string, string> = {
  SAN: 'ทราย', AGG: 'หิน 3/4"', 'CEM-1': 'ปูน SCG', 'CEM-2': 'ปูน ดอกบัว',
  'ADM-D': 'น้ำยา D', 'ADM-F': 'น้ำยา F', 'ADM-W': 'น้ำยากันซึม',
}
const shortOf = (m: StockMaterial) => SHORT_LABEL[m.code] ?? m.name

const r2 = (n: number) => Math.round(n * 100) / 100
const pad = (n: number) => String(n).padStart(2, '0')
function todayIso(): string { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
/** ISO yyyy-mm-dd → dd/mm/YY (2-digit พ.ศ.), matching the paper stock card. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${String(Number(y) + 543).slice(-2)}`
}
const fmt2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const byDateAsc = (a: StockMovement, b: StockMovement) =>
  (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

export function MaterialLedger() {
  const created = useCreatedDocs()
  const canEdit = useCan('material-ledger').edit
  const navigate = useNavigate()
  const [code, setCode] = useState(PLANT_MATERIALS[0]?.code ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [form, setForm] = useState<{ kind: StockMovementKind; edit: StockMovement | null } | null>(null)
  const [openingOpen, setOpeningOpen] = useState(false)

  const mat = PLANT_MATERIALS.find((m) => m.code === code) ?? PLANT_MATERIALS[0]

  const allMoves = useMemo(() => created.stockMovements.filter((m) => m.code === code).sort(byDateAsc), [created.stockMovements, code])
  const baseOpening = created.stockOpenings[code] ?? 0
  /* ยอดยกมา for the period = base opening + every movement before `from`. */
  const openingForPeriod = useMemo(() => {
    if (!from) return baseOpening
    let b = baseOpening
    for (const m of allMoves) if (m.date < from) b += m.kind === 'in' ? m.qty : -m.qty
    return r2(b)
  }, [allMoves, from, baseOpening])
  const periodMoves = useMemo(
    () => allMoves.filter((m) => (!from || m.date >= from) && (!to || m.date <= to)),
    [allMoves, from, to],
  )
  const cardRows = useMemo(() => {
    let bal = openingForPeriod
    return periodMoves.map((m) => { bal = r2(bal + (m.kind === 'in' ? m.qty : -m.qty)); return { m, balance: bal } })
  }, [periodMoves, openingForPeriod])

  const closing = cardRows.length ? cardRows[cardRows.length - 1].balance : openingForPeriod
  const totalIn = r2(periodMoves.filter((m) => m.kind === 'in').reduce((s, m) => s + m.qty, 0))
  const totalOut = r2(periodMoves.filter((m) => m.kind === 'out').reduce((s, m) => s + m.qty, 0))
  const totalAmount = r2(periodMoves.filter((m) => m.kind === 'in').reduce((s, m) => s + (m.amount ?? 0), 0))

  const periodLabel = from || to ? `${from ? fmtDate(from) : 'ต้น'} – ${to ? fmtDate(to) : 'ปัจจุบัน'}` : 'ทั้งหมด'

  const remove = (m: StockMovement) => {
    if (confirm(`ลบรายการ${m.kind === 'in' ? 'รับเข้า' : 'จ่ายออก'} ${fmt2(m.qty)} ${mat.unit} วันที่ ${fmtDate(m.date)} ?`)) removeStockMovement(m.id)
  }

  const exportExcel = () => {
    const head = ['เลขที่ใบสำคัญ', 'ผู้จำหน่าย', 'วันที่', 'รับ', 'หน่วยละ', 'จำนวนเงิน', 'จ่าย', 'คงเหลือ', 'หมายเหตุ']
    const body: (string | number)[][] = []
    body.push(['', '', 'ยกมา', '', '', '', '', openingForPeriod, ''])
    for (const { m, balance } of cardRows) body.push([
      m.voucherNo ?? '', m.supplier ?? '', fmtDate(m.date),
      m.kind === 'in' ? m.qty : '', m.kind === 'in' ? (m.unitPrice ?? '') : '', m.kind === 'in' ? (m.amount ?? '') : '',
      m.kind === 'out' ? m.qty : '', balance, m.note ?? '',
    ])
    body.push(['', '', 'รวม', totalIn, '', totalAmount, totalOut, closing, ''])
    downloadCsv(`material-ledger-${mat.code}`, [[`บันทึกวัตถุดิบ: ${mat.name} (${mat.unit}) · ${periodLabel}`], head, ...body])
  }

  const createReport = () => {
    const inRange = (iso: string) => (!from || iso >= from) && (!to || iso <= to)
    const rows = PLANT_MATERIALS.map((mm) => {
      const moves = created.stockMovements.filter((x) => x.code === mm.code).sort(byDateAsc)
      const opening = created.stockOpenings[mm.code] ?? 0
      let received = 0, issued = 0, bal = opening
      for (const x of moves) {
        if (inRange(x.date)) { if (x.kind === 'in') received += x.qty; else issued += x.qty }
        if (!to || x.date <= to) bal += x.kind === 'in' ? x.qty : -x.qty
      }
      return {
        code: mm.code, material: mm.name, unit: mm.unit,
        received: r2(received), issued: r2(issued), balance: r2(bal), reorder: mm.reorder,
        status: bal <= mm.reorder ? 'ต่ำกว่าจุดสั่งซื้อ' : 'พอเพียง',
      }
    })
    const movements = created.stockMovements
      .filter((x) => PLANT_CODES.has(x.code) && inRange(x.date))
      .sort(byDateAsc)
      .map((x) => {
        const mm = PLANT_MATERIALS.find((p) => p.code === x.code)
        const detail = [x.supplier, x.note].filter(Boolean).join(' · ') || undefined
        return { date: fmtDate(x.date), kind: x.kind, material: mm?.name ?? x.code, unit: mm?.unit ?? '', qty: x.qty, ref: x.voucherNo ?? '', detail }
      })
    const report: StockReport = {
      id: `gr_${Date.now()}`, kind: 'stock', heading: 'รายงานบันทึกวัตถุดิบแยกประเภท',
      title: `บันทึกวัตถุดิบแยกประเภท · ${periodLabel}`,
      fromLabel: from ? fmtDate(from) : '—', toLabel: to ? fmtDate(to) : 'ปัจจุบัน',
      scopeLabel: periodLabel, rows, movements, createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) navigate('/general-reports')
  }

  return (
    <>
      <PageHeader
        title="บันทึกวัตถุดิบแยกประเภท"
        sub={`Raw Material Ledger · ${mat.name} (${mat.unit})`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={cardRows.length === 0}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport}>สร้างรายงาน</Button>
            {canEdit && (
              <>
                <Button variant="secondary" onClick={() => setForm({ kind: 'out', edit: null })}>− จ่ายออก</Button>
                <Button variant="primary" onClick={() => setForm({ kind: 'in', edit: null })}><IconPlus /> รับเข้า</Button>
              </>
            )}
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {PLANT_MATERIALS.map((m) => (
          <Pill key={m.code} active={m.code === code} onClick={() => setCode(m.code)}>{shortOf(m)}</Pill>
        ))}
      </div>

      <div className="grid g-4" style={{ marginBottom: 20 }}>
        <KpiCard label="คงเหลือ · Balance" value={fmt2(closing)} note={`${mat.unit} · ${mat.name}`} invert />
        <KpiCard label="รับเข้ารวม · Received" value={fmt2(totalIn)} note={mat.unit} />
        <KpiCard label="จ่ายออกรวม · Issued" value={fmt2(totalOut)} note={mat.unit} />
        <KpiCard label="มูลค่ารับเข้า · Value" value={fmt2(totalAmount)} note="บาท" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12, alignItems: 'flex-end' }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <Field label="ตั้งแต่วันที่" style={{ width: 160 }}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="ถึงวันที่" style={{ width: 160 }}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }}>ล้างช่วง</Button>}
        </div>
        {canEdit && <Button variant="ghost" size="sm" onClick={() => setOpeningOpen(true)}>ตั้งยอดยกมา ({fmt2(baseOpening)})</Button>}
      </div>

      <div className="card flush" style={{ overflowX: 'auto' }}>
        <table className="data" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ width: 130 }}>เลขที่ใบสำคัญ</th>
              <th style={{ width: 150 }}>ผู้จำหน่าย</th>
              <th style={{ width: 110 }}>วัน เดือน ปี</th>
              <th className="num" style={{ width: 90 }}>รับ</th>
              <th className="num" style={{ width: 100 }}>หน่วยละ</th>
              <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
              <th className="num" style={{ width: 90 }}>จ่าย</th>
              <th className="num" style={{ width: 100 }}>คงเหลือ</th>
              <th>หมายเหตุ</th>
              {canEdit && <th style={{ width: 90 }} />}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'var(--kpc-bg-soft, #f8fafc)' }}>
              <td /><td />
              <td className="th" style={{ fontWeight: 600 }}>ยกมา</td>
              <td /><td /><td /><td />
              <td className="num mono" style={{ fontWeight: 700 }}>{fmt2(openingForPeriod)}</td>
              <td />{canEdit && <td />}
            </tr>
            {cardRows.map(({ m, balance }) => (
              <tr key={m.id}>
                <td className="mono">{m.voucherNo || <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}</td>
                <td style={{ fontSize: 12 }}>{m.supplier || <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}</td>
                <td className="mono">{fmtDate(m.date)}</td>
                <td className="num mono" style={{ color: '#15803d' }}>{m.kind === 'in' ? fmt2(m.qty) : ''}</td>
                <td className="num mono">{m.kind === 'in' && m.unitPrice != null ? fmt2(m.unitPrice) : ''}</td>
                <td className="num mono">{m.kind === 'in' && m.amount != null ? fmt2(m.amount) : ''}</td>
                <td className="num mono" style={{ color: '#b91c1c' }}>{m.kind === 'out' ? fmt2(m.qty) : ''}</td>
                <td className="num mono" style={{ fontWeight: 600, color: balance < 0 ? 'var(--kpc-danger-ink)' : 'var(--kpc-text-strong)' }}>{fmt2(balance)}</td>
                <td style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{m.note}</td>
                {canEdit && (
                  <td className="ctr">
                    <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
                      <Button variant="ghost" size="sm" onClick={() => setForm({ kind: m.kind, edit: m })}>แก้ไข</Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(m)} style={{ color: 'var(--kpc-danger)' }}>✕</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {cardRows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 10 : 9} style={{ textAlign: 'center', color: 'var(--kpc-text-faint)', padding: 24 }}>
                  ยังไม่มีรายการในช่วงที่เลือก — กด “รับเข้า” หรือ “จ่ายออก” เพื่อบันทึก
                </td>
              </tr>
            )}
            <tr style={{ borderTop: '2px solid var(--kpc-neutral-300)', fontWeight: 700 }}>
              <td /><td />
              <td>รวม</td>
              <td className="num mono" style={{ color: '#15803d' }}>{fmt2(totalIn)}</td>
              <td />
              <td className="num mono">{fmt2(totalAmount)}</td>
              <td className="num mono" style={{ color: '#b91c1c' }}>{fmt2(totalOut)}</td>
              <td className="num mono">{fmt2(closing)}</td>
              <td />{canEdit && <td />}
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 12 }}>
        * คงเหลือ = ยอดยกมา + รับเข้า − จ่ายออก (คำนวณต่อเนื่องตามวันที่) · แก้ไข “เลขที่ใบสำคัญ” ของรายการรับเข้าได้ภายหลังโดยกด “แก้ไข”
      </p>

      {form && <MovementForm mat={mat} kind={form.kind} edit={form.edit} onClose={() => setForm(null)} />}
      {openingOpen && <OpeningForm mat={mat} value={baseOpening} onClose={() => setOpeningOpen(false)} />}
    </>
  )
}

/* ───────── รับเข้า / จ่ายออก form ───────── */
function MovementForm({ mat, kind, edit, onClose }: { mat: StockMaterial; kind: StockMovementKind; edit: StockMovement | null; onClose: () => void }) {
  const isIn = kind === 'in'
  const suppliers = useSuppliers()
  const [date, setDate] = useState(edit?.date ?? todayIso())
  const [qty, setQty] = useState(edit ? String(edit.qty) : '')
  const [unitPrice, setUnitPrice] = useState(edit?.unitPrice != null ? String(edit.unitPrice) : (isIn ? String(mat.cost ?? '') : ''))
  const [supplier, setSupplier] = useState(edit?.supplier ?? '')
  const [voucherNo, setVoucherNo] = useState(edit?.voucherNo ?? '')
  const [note, setNote] = useState(edit?.note ?? '')
  const [err, setErr] = useState('')

  const qtyN = Number(qty), upN = Number(unitPrice)
  const amount = isIn && qtyN > 0 && Number.isFinite(upN) && upN > 0 ? r2(qtyN * upN) : undefined

  const save = () => {
    setErr('')
    if (!date) return setErr('กรุณาระบุวันที่')
    if (!(qtyN > 0)) return setErr('กรุณาระบุจำนวนให้มากกว่า 0')
    const patch = {
      date, qty: r2(qtyN),
      unitPrice: isIn && upN > 0 ? r2(upN) : undefined,
      amount,
      supplier: isIn ? (supplier.trim() || undefined) : undefined,
      voucherNo: voucherNo.trim() || undefined,
      note: note.trim() || undefined,
    }
    if (edit) updateStockMovement(edit.id, patch)
    else addStockMovement({ id: `sm_${Date.now()}`, code: mat.code, kind, ...patch })
    onClose()
  }

  return (
    <Modal
      open
      title={`${edit ? 'แก้ไข' : 'บันทึก'}${isIn ? 'รับเข้า' : 'จ่ายออก'}วัตถุดิบ · ${mat.name}`}
      onClose={onClose}
      maxWidth={480}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="วันที่" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={`จำนวน (${mat.unit})`} required><Input type="number" min={0} step="any" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {isIn && (
          <>
            <Field label="หน่วยละ (บาท)"><Input type="number" min={0} step="any" placeholder="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></Field>
            <Field label="จำนวนเงิน (บาท)"><Input value={amount != null ? fmt2(amount) : ''} readOnly placeholder="คำนวณอัตโนมัติ" /></Field>
            <Field label="ผู้จำหน่าย / Supplier" style={{ gridColumn: '1 / -1' }} hint="ไม่บังคับ · พิมพ์หรือเลือก · แก้ไขภายหลังได้">
              <Input list="ml-supplier-list" placeholder="พิมพ์หรือเลือกซัพพลายเออร์" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              <datalist id="ml-supplier-list">
                {suppliers.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </Field>
          </>
        )}
        <Field label="เลขที่ใบสำคัญ" style={{ gridColumn: '1 / -1' }} hint="แก้ไขภายหลังได้">
          <Input placeholder="เช่น 4020269870" value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ───────── ยอดยกมา (opening balance) ───────── */
function OpeningForm({ mat, value, onClose }: { mat: StockMaterial; value: number; onClose: () => void }) {
  const [v, setV] = useState(value ? String(value) : '')
  const save = () => {
    const n = Number(v)
    setStockOpening(mat.code, v.trim() === '' ? undefined : (Number.isFinite(n) ? n : undefined))
    onClose()
  }
  return (
    <Modal
      open
      title={`ตั้งยอดยกมา · ${mat.name}`}
      onClose={onClose}
      maxWidth={380}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      <Field label={`ยอดยกมา (${mat.unit})`}><Input type="number" step="any" placeholder="0" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <p style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 10 }}>ยอดคงเหลือเริ่มต้นก่อนรายการแรกของบัตรคุมนี้</p>
    </Modal>
  )
}
