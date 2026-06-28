import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Field, Input, Badge } from '../components/ui'
import { Modal } from '../components/Modal'
import { DataTable, type Column } from '../components/DataTable'
import { KpiCard } from '../components/charts'
import { TRANSPORT_FEES, TRANSPORT_FULL_M3 } from '../data/real'
import { addTransportRateAdjustment, addGeneralReport, useCreatedDocs, type TransportRateAdjustment, type TransportPriceReport } from '../data/createdDocs'
import { baht, qm } from '../data/selectors'
import { downloadCsv } from '../utils/csv'

/** Today as DD/MM/พ.ศ. for report labels. */
function todayThai(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543}`
}

/* Bangchak retail Hi-Diesel S price snapshot (manual refresh — no CORS-friendly
   public API). Update from https://www.bangchak.co.th/th/oilprice/historical
   when fuel prices change. `price` and `prevPrice` are baht/litre. */
const HI_DIESEL = {
  price: 37.50,
  prevPrice: 38.80,
  asOf: '22 มิ.ย. 2569',
  source: 'บางจาก',
  url: 'https://www.bangchak.co.th/th/oilprice/historical',
} as const

/* The default fee table is treated as having been "set" on 16 เม.ย. 2569.
   Hi-Diesel S on 16/04/2569 wasn't explicitly listed on Bangchak's history page,
   so we use the closest known data point (17/04/2569 = ฿35.90/ลิตร) as the
   contemporaneous fuel snapshot. */
const SEED_ADJUSTMENT: TransportRateAdjustment = {
  at: '2026-04-16T09:00:00+07:00',
  fees: TRANSPORT_FEES,
  changes: [],
  fuelPrice: 35.90,
  fuelPriceAsOf: '16 เม.ย. 2569',
}

interface FeeRow { m3: number; totalWithVat: number }

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function TransportPricing() {
  const created = useCreatedDocs()
  const navigate = useNavigate()
  /* Full history = user adjustments (newest first) + the seed baseline at the tail. */
  const allAdjustments = useMemo<TransportRateAdjustment[]>(
    () => [...created.transportAdjustments, SEED_ADJUSTMENT],
    [created.transportAdjustments]
  )
  /* Current fee schedule = head of the merged history. */
  const currentFees: FeeRow[] = allAdjustments[0].fees
  /* The 0.25-คิว short row gives the printed-sheet headline. */
  const stepRow = currentFees.find((r) => Math.abs(TRANSPORT_FULL_M3 - r.m3 - 0.25) < 0.01)
  const stepWithVat = stepRow?.totalWithVat ?? 0

  const [open, setOpen] = useState(false)

  /** Snapshot the current fee schedule into รายงานทั่วไป. */
  const createReport = () => {
    if (currentFees.length === 0) { alert('ไม่มีตารางค่าขนส่งให้สร้างรายงาน'); return }
    const today = todayThai()
    const report: TransportPriceReport = {
      id: `gr_${Date.now()}`,
      kind: 'transport-pricing',
      title: `ราคาค่าขนส่ง (ไม่เต็มเที่ยว) ณ ${today}`,
      fromLabel: today,
      toLabel: today,
      fees: currentFees.map((r) => ({ m3: r.m3, totalWithVat: r.totalWithVat })),
      fullM3: TRANSPORT_FULL_M3,
      fuelPrice: HI_DIESEL.price,
      fuelAsOf: HI_DIESEL.asOf,
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  const columns: Column<FeeRow>[] = [
    { key: 'm3', header: 'จำนวนคิว', align: 'center', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'short', header: 'ขาดจาก 3 คิว', align: 'center', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{qm(TRANSPORT_FULL_M3 - r.m3)}</span> },
    {
      key: 'preVat',
      header: 'ราคาก่อน VAT',
      align: 'right',
      cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{baht(Math.round((r.totalWithVat / 1.07) * 100) / 100)}</span>,
      className: 'amt',
    },
    { key: 'fee', header: 'จำนวนราคารวม VAT', align: 'right', cell: (r) => <span className="mono"><strong>{baht(r.totalWithVat)}</strong></span>, className: 'amt' },
  ]

  return (
    <>
      <PageHeader
        title="ราคาค่าขนส่ง"
        sub={`Transport Surcharge · ค่าขนส่งไม่เต็มเที่ยว — เก็บเพิ่มเมื่อปริมาณส่งน้อยกว่า ${qm(TRANSPORT_FULL_M3)} คิว`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const rows: (string | number)[][] = []
              rows.push(['ตารางค่าขนส่งไม่เต็มเที่ยว (ราคารวม VAT)'])
              rows.push(['จำนวนคิว', 'ขาดจาก 3 คิว', 'ราคาก่อน VAT', 'ราคารวม VAT'])
              for (const r of currentFees) {
                rows.push([r.m3, TRANSPORT_FULL_M3 - r.m3, Math.round((r.totalWithVat / 1.07) * 100) / 100, r.totalWithVat])
              }
              rows.push([])
              rows.push(['ประวัติการปรับราคา'])
              rows.push(['เวลาที่ปรับ', 'ผู้ปรับ', 'หมายเหตุ', 'จำนวนรายการที่เปลี่ยน', 'ราคาน้ำมัน (บาท/ลิตร)', 'วันที่อ้างอิงน้ำมัน'])
              for (const a of allAdjustments) {
                rows.push([
                  formatTimestamp(a.at), a.by ?? '', a.note ?? '',
                  a.changes.length, a.fuelPrice ?? '', a.fuelPriceAsOf ?? '',
                ])
              }
              downloadCsv('transport-pricing', rows)
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport}>สร้างรายงาน</Button>
            <Button variant="primary" onClick={() => setOpen(true)}>ปรับราคาค่าขนส่ง</Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <KpiCard
          label="ราคาน้ำมันไฮดีเซล"
          value={<span className="mono">฿{HI_DIESEL.price.toFixed(2)}</span>}
          unit="/ลิตร"
          note={
            <span>
              {(() => {
                const dropped = HI_DIESEL.price < HI_DIESEL.prevPrice
                const same = (HI_DIESEL.price as number) === (HI_DIESEL.prevPrice as number)
                if (same) return null
                const color = dropped ? '#15803d' : '#b91c1c'
                const arrow = dropped ? '▼' : '▲'
                const delta = Math.abs(HI_DIESEL.price - HI_DIESEL.prevPrice).toFixed(2)
                return (
                  <>
                    <span style={{ color, fontWeight: 700, marginRight: 6 }}>{arrow} ฿{delta}</span>
                    ·{' '}
                  </>
                )
              })()}
              ณ {HI_DIESEL.asOf} ·{' '}
              <a href={HI_DIESEL.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                {HI_DIESEL.source}
              </a>
            </span>
          }
        />
      </div>

      <div style={{
        marginBottom: 20,
        padding: '14px 16px',
        background: 'var(--kpc-primary-50)',
        border: '1px solid var(--kpc-primary-100)',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div><strong>หลักการคิด:</strong> หากส่งคอนกรีตได้น้อยกว่า {qm(TRANSPORT_FULL_M3)} คิว/เที่ยว จะคิดค่าขนส่งเพิ่มตามคิวที่ขาด — ขั้นต่ำสุด (ขาด 0.25 คิว) = {baht(stepWithVat)} รวม VAT</div>
          <Badge tone="info" pip={false} square>ปรับล่าสุด {formatTimestamp(allAdjustments[0].at)}</Badge>
        </div>
        <div style={{ marginTop: 4, color: 'var(--kpc-text-muted)' }}>* ใช้ตอนออกใบกำกับภาษี — เมื่อระบบรู้ปริมาณส่งจริงจากใบจ่ายคอนกรีต</div>
      </div>

      <DataTable
        columns={columns}
        rows={currentFees}
        pageSize={currentFees.length}
        totalLabel={(_f, _t, total) => `รวม ${total} ระดับการขนส่งไม่เต็มเที่ยว`}
      />

      <div style={{ marginTop: 24 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ประวัติการปรับราคา</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>
            {allAdjustments.length} ครั้ง
          </span>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {allAdjustments.map((a, i) => (
            <AdjustmentCard key={a.at + i} adj={a} isBaseline={i === allAdjustments.length - 1} />
          ))}
        </div>
      </div>

      <AdjustRateModal
        open={open}
        currentFees={currentFees}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function AdjustmentCard({ adj, isBaseline }: { adj: TransportRateAdjustment; isBaseline?: boolean }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{formatTimestamp(adj.at)}</span>
          {adj.by && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--kpc-text-muted)' }}>โดย {adj.by}</span>}
        </div>
        {isBaseline
          ? <Badge tone="neutral" pip={false} square>ตั้งราคาเริ่มต้น</Badge>
          : <Badge tone="warning" pip={false} square>เปลี่ยน {adj.changes.length} รายการ</Badge>}
      </div>
      {adj.note && (
        <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 10, fontStyle: 'italic' }}>
          “{adj.note}”
        </div>
      )}
      {adj.fuelPrice !== undefined && (
        <div className="row" style={{
          gap: 8, alignItems: 'center', marginBottom: 10, padding: '6px 10px',
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, fontSize: 12,
        }}>
          <span style={{ color: '#9a3412' }}>⛽ ราคาน้ำมันไฮดีเซลตอนนั้น</span>
          <span className="mono" style={{ fontWeight: 600, color: '#9a3412' }}>฿{adj.fuelPrice.toFixed(2)} /ลิตร</span>
          {adj.fuelPriceAsOf && <span style={{ color: 'var(--kpc-text-muted)' }}>({adj.fuelPriceAsOf})</span>}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        {isBaseline || adj.changes.length === 0 ? (
          <table className="mini-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>คิว</th>
                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>ขาดจาก 3 คิว</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>ราคาที่ตั้ง (รวม VAT)</th>
              </tr>
            </thead>
            <tbody>
              {adj.fees.map((r) => (
                <tr key={r.m3}>
                  <td className="mono" style={{ textAlign: 'center', padding: '4px 8px' }}>{qm(r.m3)}</td>
                  <td className="mono" style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--kpc-text-muted)' }}>{qm(TRANSPORT_FULL_M3 - r.m3)}</td>
                  <td className="mono" style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>{baht(r.totalWithVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="mini-table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>คิว</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>จากเดิม</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>ปรับเป็น</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>ส่วนต่าง</th>
              </tr>
            </thead>
            <tbody>
              {adj.changes.map((c) => {
                const d = c.to - c.from
                const tone = d > 0 ? 'var(--kpc-danger-ink, #b91c1c)' : d < 0 ? '#15803d' : 'var(--kpc-text-muted)'
                return (
                  <tr key={c.m3}>
                    <td className="mono" style={{ textAlign: 'center', padding: '4px 8px' }}>{qm(c.m3)}</td>
                    <td className="mono" style={{ textAlign: 'right', padding: '4px 8px' }}>{baht(c.from)}</td>
                    <td className="mono" style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>{baht(c.to)}</td>
                    <td className="mono" style={{ textAlign: 'right', padding: '4px 8px', color: tone }}>{d > 0 ? '+' : ''}{baht(d)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AdjustRateModal({
  open,
  currentFees,
  onClose,
}: {
  open: boolean
  currentFees: FeeRow[]
  onClose: () => void
}) {
  /* Edit state: per-row string input keyed by m3. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  /* Custom percent for the quick-scale field. */
  const [customPct, setCustomPct] = useState('')

  useEffect(() => {
    if (!open) return
    const init: Record<string, string> = {}
    for (const r of currentFees) init[r.m3.toFixed(2)] = String(r.totalWithVat)
    setDrafts(init)
    setBy('')
    setNote('')
    setErr('')
    setCustomPct('')
  }, [open, currentFees])

  /* Live computation of changed rows so the footer can preview the count. */
  const diff = useMemo(() => {
    const changes: { m3: number; from: number; to: number }[] = []
    let invalid = false
    for (const r of currentFees) {
      const v = drafts[r.m3.toFixed(2)]
      const n = Number(v)
      if (v === undefined || v === '' || !Number.isFinite(n) || n < 0) {
        invalid = true
        continue
      }
      const rounded = Math.round(n * 100) / 100
      if (rounded !== r.totalWithVat) {
        changes.push({ m3: r.m3, from: r.totalWithVat, to: rounded })
      }
    }
    return { changes, invalid }
  }, [drafts, currentFees])

  const submit = () => {
    setErr('')
    if (diff.invalid) return setErr('กรุณาตรวจสอบราคาทุกช่อง — ต้องเป็นจำนวนไม่ติดลบ')
    if (diff.changes.length === 0) return setErr('ยังไม่มีรายการที่เปลี่ยนแปลง')
    const newFees: FeeRow[] = currentFees.map((r) => {
      const n = Number(drafts[r.m3.toFixed(2)])
      return { m3: r.m3, totalWithVat: Math.round(n * 100) / 100 }
    })
    addTransportRateAdjustment({
      at: new Date().toISOString(),
      by: by.trim() || undefined,
      note: note.trim() || undefined,
      fees: newFees,
      changes: diff.changes,
      fuelPrice: HI_DIESEL.price,
      fuelPriceAsOf: HI_DIESEL.asOf,
    })
    onClose()
  }

  /* Quick-action: scale every input by a percentage. Useful for blanket
     increases like "+5% across the board". */
  const applyScale = (pct: number) => {
    const next: Record<string, string> = {}
    for (const r of currentFees) {
      const scaled = Math.round(r.totalWithVat * (1 + pct / 100))
      next[r.m3.toFixed(2)] = String(scaled)
    }
    setDrafts(next)
  }
  const resetDrafts = () => {
    const init: Record<string, string> = {}
    for (const r of currentFees) init[r.m3.toFixed(2)] = String(r.totalWithVat)
    setDrafts(init)
  }

  return (
    <Modal
      open={open}
      title="ปรับราคาค่าขนส่ง (ราคารวม VAT)"
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>
            บันทึก {diff.changes.length > 0 && `(${diff.changes.length} รายการ)`}
          </Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ปรับแบบเร็ว:</span>
        <Button size="sm" variant="secondary" onClick={() => applyScale(5)}>+5%</Button>
        <Button size="sm" variant="secondary" onClick={() => applyScale(10)}>+10%</Button>
        <Button size="sm" variant="secondary" onClick={() => applyScale(-5)}>−5%</Button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <input
            type="number"
            step={0.5}
            value={customPct}
            onChange={(e) => setCustomPct(e.target.value)}
            placeholder="เช่น 7.5 หรือ -3"
            className="input mono"
            style={{ width: 110, padding: '4px 8px', fontSize: 13 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = Number(customPct)
                if (Number.isFinite(n) && n !== 0) applyScale(n)
              }
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>%</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const n = Number(customPct)
              if (Number.isFinite(n) && n !== 0) applyScale(n)
            }}
            disabled={!Number.isFinite(Number(customPct)) || Number(customPct) === 0 || customPct === ''}
          >
            ปรับ
          </Button>
        </span>
        <Button size="sm" variant="secondary" onClick={resetDrafts}>คืนค่าเดิม</Button>
      </div>

      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--kpc-border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--kpc-bg-soft, #f8fafc)', zIndex: 1 }}>
            <tr style={{ color: 'var(--kpc-text-muted)', fontWeight: 600, fontSize: 12 }}>
              <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>คิว</th>
              <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ขาดจาก 3 คิว</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ราคาปัจจุบัน</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ราคาใหม่ (รวม VAT)</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ส่วนต่าง</th>
            </tr>
          </thead>
          <tbody>
            {currentFees.map((r) => {
              const key = r.m3.toFixed(2)
              const draft = drafts[key] ?? ''
              const n = Number(draft)
              const valid = draft !== '' && Number.isFinite(n) && n >= 0
              const rounded = valid ? Math.round(n * 100) / 100 : r.totalWithVat
              const delta = valid ? rounded - r.totalWithVat : 0
              const tone = delta > 0 ? 'var(--kpc-danger-ink, #b91c1c)' : delta < 0 ? '#15803d' : 'var(--kpc-text-muted)'
              return (
                <tr key={key}>
                  <td className="mono" style={{ textAlign: 'center', padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }}>{qm(r.m3)}</td>
                  <td className="mono" style={{ textAlign: 'center', padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)', color: 'var(--kpc-text-muted)' }}>{qm(TRANSPORT_FULL_M3 - r.m3)}</td>
                  <td className="mono" style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }}>{baht(r.totalWithVat)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft}
                      onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })}
                      className="input mono"
                      style={{ width: 110, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                    />
                  </td>
                  <td className="mono" style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)', color: tone, fontWeight: delta !== 0 ? 600 : 400 }}>
                    {valid ? `${delta > 0 ? '+' : ''}${baht(delta)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid g-2" style={{ gap: 12, marginTop: 12 }}>
        <Field label="ผู้ปรับ">
          <Input value={by} onChange={(e) => setBy(e.target.value)} placeholder="ชื่อผู้บันทึก" />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ค่าน้ำมันขึ้น Q3" />
        </Field>
      </div>

      <div style={{
        marginTop: 12, padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa',
        borderRadius: 6, fontSize: 12, color: '#9a3412',
      }}>
        ⛽ ราคาน้ำมันไฮดีเซลที่จะบันทึกพร้อมการปรับครั้งนี้: <strong>฿{HI_DIESEL.price.toFixed(2)}/ลิตร</strong> (ณ {HI_DIESEL.asOf})
      </div>
    </Modal>
  )
}
