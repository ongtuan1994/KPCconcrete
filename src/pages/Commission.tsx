import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Input } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DELIVERY_TICKETS } from '../data/real'
import { qm, prodShort } from '../data/selectors'
import { useCreatedDocs, addGeneralReport, type CommissionReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/* Commission qualifies at ≥ 500 คิว; 490–500 is allowed (อนุโลม); below 490 pays nothing. */
const TARGET_M3 = 500
const ALLOW_M3 = 490
const num2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round2 = (n: number) => Math.round(n * 100) / 100

/** "DD/MM/YY" (พ.ศ.) → ISO "YYYY-MM-DD" (ค.ศ.). 69 → 2026. */
function ticketISO(date: string): string {
  const [dd, mm, yy] = date.split('/')
  if (!dd || !mm || !yy) return ''
  return `${1957 + Number(yy)}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}
/** ISO → Thai "DD/MM/พ.ศ." for report labels. */
function isoToThai(iso: string): string {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

export function Commission() {
  const created = useCreatedDocs()
  const navigate = useNavigate()
  const rates = created.commissionRates

  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])
  const allTickets = useMemo(
    () => [...created.tickets, ...DELIVERY_TICKETS].filter((t) => !hiddenSet.has(t.dtNo)),
    [created.tickets, hiddenSet],
  )

  const span = useMemo(() => {
    let min = '', max = ''
    for (const t of allTickets) {
      const iso = ticketISO(t.date)
      if (!iso) continue
      if (!min || iso < min) min = iso
      if (!max || iso > max) max = iso
    }
    return { min, max }
  }, [allTickets])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  useEffect(() => {
    setFrom((f) => f || span.min)
    setTo((t) => t || span.max)
  }, [span.min, span.max])

  /* ยอดขายปูนให้ลูกค้า (เฉพาะ type ขายลูกค้า) ในช่วงวันที่เลือก. The ticket list is
     shown for verification only — it is NOT stored in the saved report. */
  const { volume, custRows } = useMemo(() => {
    const rows = allTickets.filter((t) => {
      if (t.type !== 'ขายลูกค้า') return false
      const iso = ticketISO(t.date)
      return iso && (!from || iso >= from) && (!to || iso <= to)
    })
    rows.sort((a, b) => ticketISO(a.date).localeCompare(ticketISO(b.date)) || a.dtNo.localeCompare(b.dtNo))
    return { volume: round2(rows.reduce((s, t) => s + t.m3, 0)), custRows: rows }
  }, [allTickets, from, to])
  const custTickets = custRows.length

  const qualifies = volume >= ALLOW_M3
  const status = volume >= TARGET_M3
    ? `ผ่านเป้าหมาย (≥ ${TARGET_M3} คิว)`
    : volume >= ALLOW_M3
      ? `อนุโลม (${ALLOW_M3}–${TARGET_M3} คิว)`
      : `ไม่ถึงเป้า (< ${ALLOW_M3} คิว) — ไม่จ่ายค่าคอมมิชชั่น`

  const lines = rates.map((r) => ({ name: r.name, rate: r.rate, amount: qualifies ? round2(r.rate * volume) : 0 }))
  const total = lines.reduce((s, l) => s + l.amount, 0)

  const exportCsv = () => {
    const head = ['ที่', 'ฝ่าย/แผนก', 'บาท/คิว', 'รวม บาท']
    const body = lines.map((l, i) => [i + 1, l.name, l.rate, l.amount])
    downloadCsv('commission', [head, ...body, ['', '', 'รวมทั้งหมด', total]])
  }

  const createReport = () => {
    if (custTickets === 0) { alert('ไม่มียอดขายให้ลูกค้าในช่วงที่เลือก'); return }
    const fromLabel = isoToThai(from)
    const toLabel = isoToThai(to)
    const report: CommissionReport = {
      id: `gr_${Date.now()}`,
      kind: 'commission',
      title: `ค่าคอมมิชชั่น ${fromLabel} ถึง ${toLabel}`,
      fromLabel,
      toLabel,
      volumeM3: volume,
      qualifies,
      status,
      lines,
      total,
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  return (
    <>
      <PageHeader
        title="บันทึกค่าคอมมิชชั่น"
        sub="Sales Commission · ค่าคอมตามยอดขายปูนให้ลูกค้า (บาท/คิว)"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={createReport}>สร้างรายงาน</Button>
          </>
        }
      />

      {/* Date range */}
      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ตั้งแต่</span>
            <Input type="date" value={from} min={span.min} max={span.max} onChange={(e) => setFrom(e.target.value)} style={{ width: 170 }} />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>จนถึง</span>
            <Input type="date" value={to} min={span.min} max={span.max} onChange={(e) => setTo(e.target.value)} style={{ width: 170 }} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>
            คิดเฉพาะปูนที่ขายให้ลูกค้า · ต้องได้ยอดรวม ≥ {ALLOW_M3} คิว ถึงจะได้ค่าคอม
          </span>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <KpiCard label="ยอดขายให้ลูกค้า · Volume" value={qm(volume)} note={`คิว · ${custTickets} ใบจ่าย`} />
        <KpiCard label="เป้าหมาย · Target" value={`${TARGET_M3}`} note={`คิว (อนุโลม ${ALLOW_M3})`} />
        <KpiCard label="สถานะ · Status" value={qualifies ? 'ได้ค่าคอม' : 'ไม่ได้'} note={status} invert={qualifies} />
        <KpiCard label="ค่าคอมรวม · Total" value={num2(total)} note="บาท" />
      </div>

      {!qualifies && (
        <div className="card" style={{ padding: 12, marginBottom: 16, background: 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)', fontSize: 13, color: '#b91c1c' }}>
          ⚠️ ยอดขายให้ลูกค้า {qm(volume)} คิว ยังไม่ถึง {ALLOW_M3} คิว — ค่าคอมมิชชั่นทุกคนเป็น 0 ตามเงื่อนไข
        </div>
      )}

      {/* Read-only commission rate table */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 10 }}>ตารางค่าคอมมิชชั่น (บาท/คิว × ยอดขาย)</div>
      <div className="card flush" style={{ overflowX: 'auto' }}>
        <table className="data" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>ที่</th>
              <th>ฝ่าย / แผนก</th>
              <th className="num" style={{ width: 130 }}>บาท/คิว</th>
              <th className="num" style={{ width: 150 }}>รวม บาท</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--kpc-text-faint)' }}>{i + 1}</td>
                <td className="th">{l.name}</td>
                <td className="num mono">{num2(l.rate)}</td>
                <td className="num mono" style={{ fontWeight: 600, color: l.amount ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>{num2(l.amount)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--kpc-neutral-300)', fontWeight: 700 }}>
              <td colSpan={3} className="num">รวมทั้งหมด</td>
              <td className="num mono">{num2(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="page-sub" style={{ marginTop: 12, marginBottom: 26 }}>
        * ค่าคอมต่อคน = (บาท/คิว) × ยอดขายให้ลูกค้า {qm(volume)} คิว · จ่ายเมื่อยอดรวม ≥ {ALLOW_M3} คิวเท่านั้น · รายชื่อและอัตราเป็นค่าคงที่ (อ่านอย่างเดียว)
      </p>

      {/* Verification list — for checking only; NOT stored in the report */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>รายการที่นำมาคิดยอด (สำหรับตรวจสอบ)</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{custTickets} ใบจ่าย · รวม {qm(volume)} คิว · ไม่ถูกบันทึกในรายงาน</span>
      </div>
      <div className="card flush" style={{ overflowX: 'auto' }}>
        <table className="data" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>วันที่</th>
              <th>เลขที่ DP</th>
              <th>ลูกค้า</th>
              <th>สินค้า</th>
              <th className="num">คิว</th>
            </tr>
          </thead>
          <tbody>
            {custRows.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state"><span className="et">ไม่มียอดขายให้ลูกค้าในช่วงที่เลือก</span></div></td></tr>
            ) : custRows.map((t, i) => (
              <tr key={t.dtNo}>
                <td style={{ color: 'var(--kpc-text-faint)' }}>{i + 1}</td>
                <td className="mono">{t.date}</td>
                <td className="mono">{t.ref || t.dtNo}</td>
                <td className="th">{t.customer}</td>
                <td className="th">{prodShort(t.prod)}</td>
                <td className="num mono">{qm(t.m3)}</td>
              </tr>
            ))}
            {custRows.length > 0 && (
              <tr style={{ borderTop: '2px solid var(--kpc-neutral-300)', fontWeight: 700 }}>
                <td colSpan={5} className="num">รวม</td>
                <td className="num mono">{qm(volume)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
