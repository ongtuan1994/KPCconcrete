import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, MonthSelect } from '../components/ui'
import { KpiCard, BarChart, Donut, Legend, ChartCard, type Seg, type Bar } from '../components/charts'
import { monthTotals, productMix, dailyM3, MONTHLY_TREND, LATEST_MONTH, monthLabel, baht, qm } from '../data/selectors'

const MIX_COLORS = ['var(--kpc-primary, #0E0EE6)', '#8585F8', '#B4B4FB', '#D8D8FD', '#969CA6', '#C2C8D0']

export function MonthlyReport() {
  const [month, setMonth] = useState<number>(LATEST_MONTH)
  const t = monthTotals(month)
  const net = t.revenue
  const vat = Math.round(net * 0.07 * 100) / 100
  const estCost = Math.round(net * 0.62)
  const grossProfit = net - estCost

  const summary = [
    { label: 'ยอดขายรวม (ก่อน VAT)', value: baht(net) },
    { label: 'ภาษีมูลค่าเพิ่ม 7%', value: baht(vat) },
    { label: 'รวมเรียกเก็บ', value: baht(net + vat) },
    { label: 'กำไรขั้นต้น (ประมาณ)', value: baht(grossProfit), invert: true },
  ]

  const mixRaw = productMix(month)
  const mix: Seg[] = mixRaw.slice(0, 5).map((p, i) => ({ label: p.label, pct: p.pct, color: MIX_COLORS[i] }))
  const restPct = mixRaw.slice(5).reduce((s, p) => s + p.pct, 0)
  if (restPct > 0) mix.push({ label: 'อื่นๆ', pct: restPct, color: MIX_COLORS[5] })

  // cross-month revenue trend (all 6 months)
  const revPeak = Math.max(1, ...MONTHLY_TREND.map((m) => m.revenue))
  const trendBars: Bar[] = MONTHLY_TREND.map((m) => ({
    label: m.short,
    cap: '฿' + (m.revenue / 1_000_000).toFixed(1) + 'M',
    value: m.revenue,
    highlight: m.month === month,
  }))

  const daily = dailyM3(month)
  const dPeak = Math.max(1, ...daily.map((d) => d.m3))
  const dailyBars: Bar[] = daily.map((d) => ({ label: String(d.day), cap: qm(Math.round(d.m3)), value: d.m3, highlight: d.m3 === dPeak }))

  return (
    <>
      <PageHeader
        title="รายงานประจำเดือน"
        sub={`Monthly Report · ${monthLabel(month)}`}
        actions={
          <>
            <MonthSelect value={month} onChange={(v) => setMonth(v as number)} allowAll={false} />
            <Button variant="secondary">พิมพ์ PDF</Button>
            <Button variant="primary">ส่งออก Excel</Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        {summary.map((s) => (
          <KpiCard key={s.label} label={s.label} value={s.value} invert={s.invert} />
        ))}
      </div>

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ปริมาณผลิต · Volume" value={qm(Math.round(t.m3All))} unit="m³" note="ทั้งเดือน" />
        <KpiCard label="ใบจ่ายคอนกรีต · Tickets" value={t.tickets.toString()} note="ใบ" />
        <KpiCard label="ใบกำกับ · Invoices" value={t.invoices.toString()} note="ใบ" />
        <KpiCard label="เฉลี่ยต่อคิว · Avg / m³" value={baht(t.m3Sold ? Math.round(net / t.m3Sold) : 0)} note="ราคาขายเฉลี่ย" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 16 }}>
        <ChartCard title="รายได้รายเดือน · Revenue / month" right={<span className="card-meta">ม.ค.–มิ.ย. 2569</span>}>
          <BarChart data={trendBars} max={revPeak * 1.1} />
        </ChartCard>
        <div className="card row" style={{ gap: 20 }}>
          <Donut segments={mix} />
          <div className="stack" style={{ gap: 11 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)' }}>สัดส่วนสินค้า</span>
            <Legend segments={mix} />
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <ChartCard title="ปริมาณการผลิตรายวัน · m³ / วัน" right={<span className="card-meta">{monthLabel(month)}</span>}>
          <BarChart data={dailyBars} max={dPeak * 1.1} />
        </ChartCard>
        <div className="card stack" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)' }}>สรุปการเงิน</span>
            <Badge tone="warning" square pip={false}>เครดิต {net ? Math.round((t.credit / net) * 100) : 0}%</Badge>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <Row k="ยอดขายสุทธิ" v={baht(net)} />
            <Row k="ขายเงินสด/โอน" v={baht(t.cash)} />
            <Row k="ขายเครดิต (ค้าง)" v={baht(t.credit)} danger />
            <div className="divider" />
            <Row k="ต้นทุนประมาณ (62%)" v={baht(estCost)} />
            <Row k="กำไรขั้นต้น" v={baht(grossProfit)} strong />
          </div>
        </div>
      </div>
    </>
  )
}

function Row({ k, v, danger, strong }: { k: string; v: string; danger?: boolean; strong?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{k}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: strong ? 700 : 500, color: danger ? 'var(--kpc-danger-ink)' : strong ? 'var(--kpc-primary-ink)' : 'var(--kpc-text-strong)' }}>{v}</span>
    </div>
  )
}
