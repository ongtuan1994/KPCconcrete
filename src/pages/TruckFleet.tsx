import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Badge, Button, MonthSelect } from '../components/ui'
import { downloadCsv } from '../utils/csv'
import { DELIVERY_TICKETS, VEHICLES, type Vehicle, type DeliveryTicket } from '../data/real'
import { useCreatedDocs } from '../data/createdDocs'
import { baht, qm, ticketDistanceKm, vehicleForTicket, LATEST_MONTH, monthLabel } from '../data/selectors'

interface FleetStats {
  trips: number
  m3: number
  km: number
}

/** Actual fuel filled for one truck over the selected period — summed from the
    ค่าน้ำมัน expense records (บันทึกรายจ่าย), not estimated from distance. */
interface FuelUse { liters: number; amount: number; fills: number }
const EMPTY_FUEL: FuelUse = { liters: 0, amount: 0, fills: 0 }

function buildStats(tickets: DeliveryTicket[]): FleetStats {
  const s: FleetStats = { trips: 0, m3: 0, km: 0 }
  for (const t of tickets) {
    s.trips += 1
    s.m3 += t.m3
    s.km += ticketDistanceKm(t)
  }
  return s
}

const r2 = (n: number) => Math.round(n * 100) / 100
/** อัตราสิ้นเปลือง กม./ลิตร — null when no fuel was filled in the period. */
const kmPerLitre = (km: number, liters: number): number | null => (liters > 0 ? r2(km / liters) : null)
/** ต้นทุนน้ำมัน บาท/กม. — null when the truck did not run in the period. */
const bahtPerKm = (amount: number, km: number): number | null => (km > 0 ? r2(amount / km) : null)

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

function TruckCard({ v, stats, fuel }: { v: Vehicle; stats: FleetStats; fuel: FuelUse }) {
  const kmL = kmPerLitre(stats.km, fuel.liters)
  const bkm = bahtPerKm(fuel.amount, stats.km)
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
          <StatRow label="น้ำมันที่เติม"  value={qm(fuel.liters)} sub={`ลิตร · ${fuel.fills} ครั้ง`} />
          <StatRow label="ค่าน้ำมัน"     value={baht(fuel.amount)} />
          <StatRow label="อัตราสิ้นเปลือง" value={kmL == null ? '—' : qm(kmL)} sub="กม./ลิตร" />
          <StatRow label="ต้นทุนน้ำมัน"   value={bkm == null ? '—' : baht(bkm)} sub="ต่อ กม." />
        </div>

        {stats.trips === 0 && (
          <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>ไม่มีงานในเดือนนี้</div>
        )}
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

  /* Actual fuel per mixer truck for the selected period, from the ค่าน้ำมัน expense
     records. Ticket months are Thai (พ.ศ. 2569) while expense dates are ISO
     Gregorian, so month N maps to "2026-NN"; 'all' covers the whole of 2569/2026.
     Non-mixer vehicles (รถกระบะ / รถตัก) are skipped — they have no truck card. */
  const fuelByVehicle = useMemo(() => {
    const prefix = month === 'all' ? '2026' : `2026-${String(month).padStart(2, '0')}`
    const m: Record<string, FuelUse> = Object.fromEntries(VEHICLES.map((v) => [v.id, { liters: 0, amount: 0, fills: 0 }]))
    for (const e of created.expenseRecords) {
      if (e.category !== 'ค่าน้ำมัน' || !e.vehicleId || !e.date.startsWith(prefix)) continue
      const b = m[e.vehicleId]
      if (!b) continue
      b.liters += e.liters ?? 0
      b.amount += e.amount ?? 0
      b.fills += 1
    }
    for (const v of VEHICLES) m[v.id].liters = Math.round(m[v.id].liters * 100) / 100
    return m
  }, [created.expenseRecords, month])

  const totals = useMemo(() => {
    const merged: FleetStats = { trips: 0, m3: 0, km: 0 }
    for (const v of VEHICLES) {
      const s = buildStats(perVehicle[v.id] ?? [])
      merged.trips += s.trips; merged.m3 += s.m3; merged.km += s.km
    }
    return merged
  }, [perVehicle])

  const fuelTotals = useMemo(() => {
    const t: FuelUse = { liters: 0, amount: 0, fills: 0 }
    for (const v of VEHICLES) {
      const f = fuelByVehicle[v.id] ?? EMPTY_FUEL
      t.liters += f.liters; t.amount += f.amount; t.fills += f.fills
    }
    t.liters = Math.round(t.liters * 100) / 100
    return t
  }, [fuelByVehicle])

  return (
    <>
      <PageHeader
        title="รถขนส่งปูน"
        sub={`Truck Fleet · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — สรุประยะทาง · น้ำมัน · ค่าน้ำมันรายคัน`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['หมายเลขรถ', 'ทะเบียน', 'พนักงานจัดส่ง', 'ขนได้สูงสุด (คิว)', 'จำนวนเที่ยว', 'ปริมาณรวม (m³)', 'ระยะทาง (km)', 'น้ำมันที่เติม (ลิตร)', 'จำนวนครั้งที่เติม', 'ค่าน้ำมัน (บาท)', 'อัตราสิ้นเปลือง (กม./ลิตร)', 'ต้นทุนน้ำมัน (บาท/กม.)']
              const body = VEHICLES.map((v) => {
                const s = buildStats(perVehicle[v.id] ?? [])
                const f = fuelByVehicle[v.id] ?? EMPTY_FUEL
                return [v.id, v.plate, v.driver, v.maxM3, s.trips, Math.round(s.m3 * 100) / 100, Math.round(s.km), f.liters, f.fills, Math.round(f.amount * 100) / 100, kmPerLitre(s.km, f.liters) ?? '', bahtPerKm(f.amount, s.km) ?? '']
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
          น้ำมันที่เติม <strong>{qm(fuelTotals.liters)} ลิตร</strong> ({fuelTotals.fills} ครั้ง) ·
          ค่าน้ำมัน <strong>{baht(fuelTotals.amount)}</strong>
          {(() => {
            const kmL = kmPerLitre(totals.km, fuelTotals.liters)
            const bkm = bahtPerKm(fuelTotals.amount, totals.km)
            return (kmL != null || bkm != null) ? (
              <> · เฉลี่ย <strong>{kmL == null ? '—' : `${qm(kmL)} กม./ลิตร`}</strong> · <strong>{bkm == null ? '—' : `${baht(bkm)}/กม.`}</strong></>
            ) : null
          })()}
        </div>
        <div style={{ marginTop: 4, color: 'var(--kpc-text-muted)', fontSize: 12 }}>
          * จำนวนเที่ยว/ปริมาณ มาจากใบส่งของในงวดที่เลือก · น้ำมันที่เติมและค่าน้ำมันดึงจากบันทึกรายจ่ายหมวด “ค่าน้ำมัน” ตามหมายเลขรถ (ยอดจริง ไม่ใช่ค่าประมาณ) ·
          ระยะทางคำนวณจากช่วงระยะส่งในรหัสสินค้า (OS00=20 / OV21=50 / OV31=70 / OV41=90 กม. ต่อเที่ยว ไป-กลับ)
        </div>
      </div>

      <div className="grid g-4" style={{ alignItems: 'stretch' }}>
        {VEHICLES.map((v) => (
          <TruckCard key={v.id} v={v} stats={buildStats(perVehicle[v.id] ?? [])} fuel={fuelByVehicle[v.id] ?? EMPTY_FUEL} />
        ))}
      </div>
    </>
  )
}
