import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Badge, Button, MonthSelect } from '../components/ui'
import { downloadCsv } from '../utils/csv'
import { DELIVERY_TICKETS, VEHICLES, FUEL_KM_PER_LITER, DIESEL_PRICE_PER_LITER, type Vehicle, type DeliveryTicket } from '../data/real'
import { useCreatedDocs } from '../data/createdDocs'
import { baht, qm, ticketDistanceKm, vehicleForTicket, LATEST_MONTH, monthLabel } from '../data/selectors'

interface FleetStats {
  trips: number
  m3: number
  km: number
  liters: number
  fuelCost: number
  zones: { OS: number; OV21: number; OV31: number; OV41: number }
}

function zoneKey(t: DeliveryTicket): keyof FleetStats['zones'] | null {
  const c = t.prod
  if (c.includes('OV41')) return 'OV41'
  if (c.includes('OV31')) return 'OV31'
  if (c.includes('OV21')) return 'OV21'
  if (c.includes('OS00')) return 'OS'
  return null
}

function buildStats(tickets: DeliveryTicket[]): FleetStats {
  const s: FleetStats = { trips: 0, m3: 0, km: 0, liters: 0, fuelCost: 0, zones: { OS: 0, OV21: 0, OV31: 0, OV41: 0 } }
  for (const t of tickets) {
    s.trips += 1
    s.m3 += t.m3
    s.km += ticketDistanceKm(t)
    const z = zoneKey(t); if (z) s.zones[z] += 1
  }
  s.liters = Math.round((s.km / FUEL_KM_PER_LITER) * 100) / 100
  s.fuelCost = Math.round(s.liters * DIESEL_PRICE_PER_LITER * 100) / 100
  return s
}

/** Real photo of the truck. Files live in /public/trucks/00X.jpg. */
function TruckArt({ id }: { id: string }) {
  return (
    <img
      src={`/trucks/${id}.jpg`}
      alt={`รถขนส่งหมายเลข ${id}`}
      style={{ width: '100%', height: 160, objectFit: 'contain', display: 'block', background: '#f3f4f6' }}
      loading="lazy"
    />
  )
}

function StatRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--kpc-border)', fontSize: 13 }}>
      <span style={{ color: 'var(--kpc-text-muted)' }}>{label}</span>
      <span>
        <strong className="mono">{value}</strong>
        {sub && <span style={{ color: 'var(--kpc-text-muted)', marginLeft: 6, fontSize: 12 }}>{sub}</span>}
      </span>
    </div>
  )
}

function TruckCard({ v, stats }: { v: Vehicle; stats: FleetStats }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#f3f4f6', borderRadius: '8px 8px 0 0', overflow: 'hidden' }}>
        <TruckArt id={v.id} />
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>หมายเลขรถ {v.id}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-primary-ink, #1d4ed8)', marginTop: 2 }}>
              ทะเบียน {v.plate}
            </div>
            <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 2 }}>ขนได้สูงสุด {v.maxM3} คิว</div>
          </div>
          <Badge tone={v.maxM3 >= 6 ? 'info' : 'neutral'} pip={false} square>{v.maxM3} คิว</Badge>
        </div>

        <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 2 }}>พนักงานจัดส่ง</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {v.driver || <span style={{ color: 'var(--kpc-text-faint)', fontWeight: 400 }}>ยังไม่ได้ระบุ</span>}
          </div>
        </div>

        <div>
          <StatRow label="จำนวนเที่ยว"   value={`${stats.trips}`} sub="เที่ยว" />
          <StatRow label="ปริมาณรวม"     value={qm(stats.m3)} sub="คิว" />
          <StatRow label="ระยะทางรวม"   value={qm(Math.round(stats.km))} sub="กม. (ไป-กลับ)" />
          <StatRow label="น้ำมัน (โดยประมาณ)" value={qm(Math.round(stats.liters))} sub="ลิตร" />
          <StatRow label="ค่าน้ำมัน"     value={baht(stats.fuelCost)} />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
          {stats.zones.OS   > 0 && <Badge tone="success" pip={false} square>OS {stats.zones.OS}</Badge>}
          {stats.zones.OV21 > 0 && <Badge tone="info"    pip={false} square>OV21 {stats.zones.OV21}</Badge>}
          {stats.zones.OV31 > 0 && <Badge tone="warning" pip={false} square>OV31 {stats.zones.OV31}</Badge>}
          {stats.zones.OV41 > 0 && <Badge tone="danger"  pip={false} square>OV41 {stats.zones.OV41}</Badge>}
          {stats.trips === 0 && <span style={{ color: 'var(--kpc-text-faint)' }}>ไม่มีงานในเดือนนี้</span>}
        </div>
      </div>
    </div>
  )
}

export function TruckFleet() {
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const created = useCreatedDocs()

  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])
  const allTickets = useMemo(
    () => [...created.tickets, ...DELIVERY_TICKETS].filter((t) => !hiddenSet.has(t.dtNo)),
    [created.tickets, hiddenSet],
  )
  const monthTickets = useMemo(
    () => (month === 'all' ? allTickets : allTickets.filter((t) => t.month === month)),
    [month, allTickets],
  )

  const perVehicle = useMemo(() => {
    const buckets: Record<string, DeliveryTicket[]> = Object.fromEntries(VEHICLES.map((v) => [v.id, []]))
    for (const t of monthTickets) {
      const id = vehicleForTicket(t)
      if (buckets[id]) buckets[id].push(t)
    }
    return buckets
  }, [monthTickets])

  const totals = useMemo(() => {
    const merged: FleetStats = { trips: 0, m3: 0, km: 0, liters: 0, fuelCost: 0, zones: { OS: 0, OV21: 0, OV31: 0, OV41: 0 } }
    for (const v of VEHICLES) {
      const s = buildStats(perVehicle[v.id] ?? [])
      merged.trips += s.trips; merged.m3 += s.m3; merged.km += s.km
      merged.liters += s.liters; merged.fuelCost += s.fuelCost
      for (const k of Object.keys(merged.zones) as (keyof FleetStats['zones'])[]) merged.zones[k] += s.zones[k]
    }
    return merged
  }, [perVehicle])

  return (
    <>
      <PageHeader
        title="รถขนส่งปูน"
        sub={`Truck Fleet · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — สรุประยะทาง · น้ำมัน · ค่าน้ำมันรายคัน`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['หมายเลขรถ', 'ทะเบียน', 'พนักงานจัดส่ง', 'ขนได้สูงสุด (คิว)', 'จำนวนเที่ยว', 'ปริมาณรวม (m³)', 'ระยะทาง (km)', 'น้ำมัน (ลิตร)', 'ค่าน้ำมัน (บาท)', 'โซน OS', 'โซน OV21', 'โซน OV31', 'โซน OV41']
              const body = VEHICLES.map((v) => {
                const s = buildStats(perVehicle[v.id] ?? [])
                return [v.id, v.plate, v.driver, v.maxM3, s.trips, Math.round(s.m3 * 100) / 100, Math.round(s.km), s.liters, s.fuelCost, s.zones.OS, s.zones.OV21, s.zones.OV31, s.zones.OV41]
              })
              const slug = `truck-fleet-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
              downloadCsv(slug, [head, ...body])
            }}>ส่งออก Excel</Button>
            <MonthSelect value={month} onChange={setMonth} />
          </>
        }
      />

      <div style={{
        marginBottom: 20,
        padding: '14px 16px',
        background: 'var(--kpc-primary-50)',
        border: '1px solid var(--kpc-primary-100)',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        <div>
          <strong>สรุปรวมเดือนนี้:</strong>{' '}
          {totals.trips} เที่ยว · {qm(totals.m3)} คิว ·
          ระยะทางรวม <strong>{qm(Math.round(totals.km))} กม.</strong> ·
          น้ำมันประมาณ <strong>{qm(Math.round(totals.liters))} ลิตร</strong> ·
          ค่าน้ำมัน <strong>{baht(totals.fuelCost)}</strong>
        </div>
        <div style={{ marginTop: 4, color: 'var(--kpc-text-muted)', fontSize: 12 }}>
          * ระยะทางคำนวณจากช่วงระยะส่งในรหัสสินค้า (OS00=20 / OV21=50 / OV31=70 / OV41=90 กม. ต่อเที่ยว ไป-กลับ) ·
          อัตราน้ำมัน {FUEL_KM_PER_LITER} กม./ลิตร · ราคาดีเซล {DIESEL_PRICE_PER_LITER} ฿/ลิตร
        </div>
      </div>

      <div className="grid g-4" style={{ alignItems: 'stretch' }}>
        {VEHICLES.map((v) => (
          <TruckCard key={v.id} v={v} stats={buildStats(perVehicle[v.id] ?? [])} />
        ))}
      </div>
    </>
  )
}
