import { PageHeader } from '../components/Layout'
import { Button, Badge } from '../components/ui'
import { KpiCard, Gauge, BarChart, PlantStatusCard, ChartCard, type Bar } from '../components/charts'
import { monthTotals, dailyM3, LATEST_MONTH, monthLabel, qm } from '../data/selectors'
import { downloadCsv } from '../utils/csv'

interface Mixer { id: string; grade: string; status: 'running' | 'idle' | 'paused' | 'fault'; load: number }
const MIXERS: Mixer[] = [
  { id: 'MX-01', grade: '240 ksc', status: 'running', load: 92 },
  { id: 'MX-02', grade: '280 ksc', status: 'running', load: 78 },
  { id: 'MX-03', grade: 'พรีคาสท์', status: 'running', load: 64 },
  { id: 'MX-04', grade: '240 ksc R2', status: 'idle', load: 0 },
]
const MIX_STATUS: Record<Mixer['status'], { th: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  running: { th: 'กำลังผลิต', tone: 'success' },
  idle: { th: 'ว่าง', tone: 'neutral' },
  paused: { th: 'หยุดชั่วคราว', tone: 'warning' },
  fault: { th: 'ขัดข้อง', tone: 'danger' },
}

export function PlantMonitoring() {
  const month = LATEST_MONTH
  const totals = monthTotals(month)
  const daily = dailyM3(month)
  const peak = Math.max(1, ...daily.map((d) => d.m3))
  const lastDays = daily.slice(-10)
  const bars: Bar[] = lastDays.map((d) => ({ label: String(d.day), cap: qm(Math.round(d.m3)), value: d.m3, highlight: d.m3 === peak }))
  const avgDay = daily.length ? Math.round(totals.m3All / daily.length) : 0
  const todayM3 = daily[daily.length - 1]?.m3 ?? 0
  const util = Math.min(100, Math.round((todayM3 / peak) * 100))

  return (
    <>
      <PageHeader
        title="ติดตามโรงงาน"
        sub="Plant Monitoring · โรงงานบางนอน ระนอง"
        actions={
          <>
            <Badge tone="success">ออนไลน์</Badge>
            <Button variant="secondary" onClick={() => {
              const rows: (string | number)[][] = []
              rows.push(['ติดตามโรงงาน', monthLabel(month)])
              rows.push([])
              rows.push(['สถานะโม่ผสม'])
              rows.push(['รหัสโม่', 'เกรด', 'สถานะ', 'โหลด (%)'])
              for (const m of MIXERS) rows.push([m.id, m.grade, MIX_STATUS[m.status].th, m.load])
              rows.push([])
              rows.push(['ปริมาณรายวัน (10 วันล่าสุด)'])
              rows.push(['วันที่', 'ปริมาณ (m³)'])
              for (const d of lastDays) rows.push([d.day, Math.round(d.m3 * 100) / 100])
              downloadCsv(`plant-monitoring-${monthLabel(month).replace(/\s+/g, '-')}`, rows)
            }}>ส่งออก Excel</Button>
            <Button variant="secondary">ประวัติการผลิต</Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ผลิตวันล่าสุด · Latest day" value={qm(Math.round(todayM3))} unit="m³" delta={`${util}%`} note="ของวันสูงสุด" />
        <KpiCard label="เฉลี่ย/วัน · Avg / day" value={qm(avgDay)} unit="m³" note={monthLabel(month)} />
        <KpiCard label="โม่ทำงาน · Active mixers" value="3 / 4" delta="▲" note="กำลังเดินเครื่อง" />
        <KpiCard label="ใบจ่ายเดือนนี้ · Tickets" value={totals.tickets.toString()} delta="ใบ" note={monthLabel(month)} invert />
      </div>

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <PlantStatusCard pct={util} ring="#1E9E5A" name="โรงงานคอนกรีต" en="Ready-mix plant" tone="success" statusText="กำลังผลิต" />
        <PlantStatusCard pct={64} ring="var(--kpc-primary, #0E0EE6)" name="โรงหล่อพรีคาสท์" en="Precast yard" tone="success" statusText="กำลังผลิต" />
        <PlantStatusCard name="สำนักงาน" en="Office · บางนอน" ring="#969CA6" tone="neutral" statusText="เปิดทำการ" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', marginBottom: 24 }}>
        <div className="card stack" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)', alignSelf: 'flex-start' }}>อัตราการใช้กำลังผลิต · Utilization</span>
          <Gauge pct={util} size={170} label={`${util}%`} sublabel="เทียบวันสูงสุด" />
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{qm(Math.round(todayM3))} / {qm(Math.round(peak))} m³</span>
        </div>
        <ChartCard title="ปริมาณการผลิต 10 วันล่าสุด · m³" right={<span className="card-meta">{monthLabel(month)}</span>}>
          <BarChart data={bars} max={peak * 1.1} />
        </ChartCard>
      </div>

      <div className="card flush">
        <div className="card-head" style={{ margin: 0, padding: '18px 20px', borderBottom: '1px solid var(--kpc-border)' }}>
          <h3 className="card-title">สถานะเครื่องโม่ · Mixers</h3>
          <span className="card-meta">4 เครื่อง</span>
        </div>
        <div className="grid g-4" style={{ padding: 20, gap: 16 }}>
          {MIXERS.map((m) => {
            const s = MIX_STATUS[m.status]
            return (
              <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{m.id}</span>
                  <Badge tone={s.tone} square>{s.th}</Badge>
                </div>
                <span className="th" style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{m.grade}</span>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--kpc-neutral-100)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${m.load}%`, background: m.status === 'fault' ? 'var(--kpc-danger)' : 'var(--kpc-primary)', borderRadius: 999, transition: 'width .3s' }} />
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>โหลด {m.load}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
