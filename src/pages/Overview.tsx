import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, MonthSelect } from '../components/ui'
import { KpiCard, Gauge, BarChart, Donut, Legend, AreaLine, PlantStatusCard, ChartCard, type Seg, type Bar } from '../components/charts'
import { IconPlus } from '../components/icons'
import { monthTotals, dailyM3, productMix, invoiceStatusSplit, LATEST_MONTH, monthLabel, bahtShort, qm } from '../data/selectors'

const MIX_COLORS = ['var(--kpc-primary, #0E0EE6)', '#8585F8', '#B4B4FB', '#D8D8FD', '#969CA6', '#C2C8D0']

export function Overview() {
  const [month, setMonth] = useState<number>(LATEST_MONTH)
  const totals = monthTotals(month)
  const daily = dailyM3(month)
  const mixRaw = productMix(month)
  const split = invoiceStatusSplit(month)

  const mix: Seg[] = mixRaw.slice(0, 5).map((p, i) => ({ label: p.label, pct: p.pct, color: MIX_COLORS[i] }))
  const restPct = mixRaw.slice(5).reduce((s, p) => s + p.pct, 0)
  if (restPct > 0) mix.push({ label: 'อื่นๆ', pct: restPct, color: MIX_COLORS[5] })

  const peak = Math.max(1, ...daily.map((d) => d.m3))
  const bars: Bar[] = daily.map((d) => ({ label: String(d.day), cap: qm(Math.round(d.m3)), value: d.m3, highlight: d.m3 === peak }))
  const salesPeak = Math.max(1, ...daily.map((d) => d.sales))
  const trend = daily.map((d) => Math.round((d.sales / salesPeak) * 100))
  const soldPct = totals.m3All ? Math.round((totals.m3Sold / totals.m3All) * 100) : 0

  const statusSegs: Seg[] = [
    { label: 'ชำระแล้ว (เงินสด)', pct: split.paid, color: '#1E9E5A' },
    { label: 'รอชำระ (เครดิต)', pct: split.pending, color: '#C77700' },
    { label: 'เกินกำหนด', pct: split.overdue, color: '#D23B3B' },
  ].filter((s) => s.pct > 0)

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        sub={`Dashboard · ${monthLabel(month)} — บริษัท กิจไพศาล คอนกรีต จำกัด`}
        actions={
          <>
            <MonthSelect value={month} onChange={(v) => setMonth(v as number)} allowAll={false} />
            <Button variant="primary">
              <IconPlus /> บันทึกใบจ่าย
            </Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="รายได้เดือนนี้ · Revenue" value={bahtShort(totals.revenue)} delta="▲" note="เฉพาะขายลูกค้า" />
        <KpiCard label="ปริมาณคอนกรีต · Produced" value={qm(Math.round(totals.m3All))} unit="m³" delta={`${totals.tickets} ใบจ่าย`} note="ทั้งเดือน" />
        <KpiCard label="ใบกำกับ · Invoices" value={totals.invoices.toString()} delta="ใบ" note="รวมจากใบจ่าย" />
        <KpiCard label="ค้างชำระ · Credit A/R" value={bahtShort(totals.credit)} delta="เครดิต" note="รอเก็บเงิน" invert />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', marginBottom: 16 }}>
        <div className="card stack" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)', alignSelf: 'flex-start' }}>สัดส่วนผลิตเพื่อขาย · Billable</span>
          <Gauge pct={soldPct} size={170} label={`${soldPct}%`} sublabel="ของปริมาณผลิต" />
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{qm(Math.round(totals.m3Sold))} / {qm(Math.round(totals.m3All))} m³ เป็นการขาย</span>
        </div>
        <ChartCard title="ปริมาณการผลิตรายวัน · m³ / วัน" right={<span className="card-meta">{monthLabel(month)}</span>}>
          <BarChart data={bars} max={peak * 1.1} />
        </ChartCard>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', marginBottom: 16 }}>
        <div className="card row" style={{ gap: 20 }}>
          <Donut segments={mix} />
          <div className="stack" style={{ gap: 11 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)' }}>สัดส่วนสินค้า (m³)</span>
            <Legend segments={mix} />
          </div>
        </div>
        <ChartCard title="แนวโน้มยอดขายรายวัน · Sales trend" right={<span className="mono" style={{ fontSize: 11, color: 'var(--kpc-success-ink)' }}>{monthLabel(month)}</span>}>
          <AreaLine points={trend} />
          <div className="row" style={{ justifyContent: 'space-between', fontFamily: 'var(--kpc-font-mono)', fontSize: 11, color: 'var(--kpc-text-faint)' }}>
            <span>ต้นเดือน</span>
            <span>กลางเดือน</span>
            <span>สิ้นเดือน</span>
          </div>
        </ChartCard>
      </div>

      <div className="card row" style={{ gap: 20, marginBottom: 24 }}>
        <Donut segments={statusSegs} />
        <div className="stack" style={{ gap: 11 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)' }}>สถานะใบกำกับ</span>
            <Badge tone="warning" square pip={false}>{split.counts.pending} ใบรอชำระ</Badge>
          </div>
          <Legend segments={statusSegs} />
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', margin: '8px 2px 12px' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ติดตามโรงงาน · Plant monitoring</span>
        <Badge tone="success">2 จุดผลิต</Badge>
      </div>
      <div className="grid g-3">
        <PlantStatusCard pct={soldPct} ring="#1E9E5A" name="โรงงานคอนกรีต" en="Ready-mix plant" tone="success" statusText="กำลังผลิต" />
        <PlantStatusCard pct={64} ring="var(--kpc-primary, #0E0EE6)" name="โรงหล่อพรีคาสท์" en="Precast yard" tone="success" statusText="กำลังผลิต" />
        <PlantStatusCard name="สำนักงาน" en="Office · บางนอน" ring="#969CA6" tone="neutral" statusText="เปิดทำการ" />
      </div>
    </>
  )
}
