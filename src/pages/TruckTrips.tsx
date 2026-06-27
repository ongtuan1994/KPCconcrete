import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Input, Select } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DELIVERY_TICKETS, VEHICLES, VEHICLE_MAP } from '../data/real'
import { qm, monthShort } from '../data/selectors'
import { useCreatedDocs, setTruckTrip, addGeneralReport, type TruckTripEntry, type GeneralReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/* The four mixer trucks. 001/002 are 10-wheel (bigger), 003/004 are 6-wheel. */
const TRUCKS = ['001', '002', '003', '004'] as const
const TEN_WHEEL = new Set(['001', '002'])
const wheelLabel = (v: string) => (TEN_WHEEL.has(v) ? '10 ล้อ' : '6 ล้อ')

/* Distinct driver names across the fleet — options for the per-row driver picker. */
const DRIVERS = Array.from(new Set(VEHICLES.map((v) => v.driver)))

/** Per-trip running fee:
 *  10-wheel (001/002): 35 บาท · 40 if เกิน 20 กม.
 *  6-wheel  (003/004): 25 บาท · 30 if เกิน 20 กม.
 *  +10 if วิ่งหลัง 18:00 · +10 more if วิ่งหลัง 22:00. */
function tripBase(vehicle: string, over20: boolean): number {
  if (TEN_WHEEL.has(vehicle)) return over20 ? 40 : 35
  return over20 ? 30 : 25
}
const OT_BONUS = 10
function rowFee(vehicle: string | undefined, e: TruckTripEntry): number {
  if (!vehicle) return 0
  return tripBase(vehicle, !!e.over20) + (e.ot18 ? OT_BONUS : 0) + (e.ot22 ? OT_BONUS : 0)
}

const money = (n: number) => '฿' + n.toLocaleString('en-US')

/** Parse a Thai delivery-ticket date "DD/MM/YY" (พ.ศ.) into an ISO "YYYY-MM-DD"
    (ค.ศ.) string so a native date-range picker can compare it. 69 → 2026. */
function ticketISO(date: string): string {
  const [dd, mm, yy] = date.split('/')
  if (!dd || !mm || !yy) return ''
  const ce = 1957 + Number(yy) /* 2500+yy (พ.ศ.) − 543 = 1957+yy */
  return `${ce}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}
/** ISO "YYYY-MM-DD" → Thai "DD/MM/พ.ศ." for report titles/labels. */
function isoToThai(iso: string): string {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

export function TruckTrips() {
  const created = useCreatedDocs()
  const navigate = useNavigate()

  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])
  const allTickets = useMemo(
    () => [...created.tickets, ...DELIVERY_TICKETS].filter((t) => !hiddenSet.has(t.dtNo)),
    [created.tickets, hiddenSet],
  )

  /* Data's own date span — used to seed the from/to inputs. */
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
  /* Default the range to the full data span on first load (keeps user edits). */
  useEffect(() => {
    setFrom((f) => f || span.min)
    setTo((t) => t || span.max)
  }, [span.min, span.max])

  /* Tickets within the selected range, oldest first. */
  const inRange = useMemo(() => {
    return allTickets
      .filter((t) => {
        const iso = ticketISO(t.date)
        return iso && (!from || iso >= from) && (!to || iso <= to)
      })
      .sort((a, b) => ticketISO(a.date).localeCompare(ticketISO(b.date)) || a.dtNo.localeCompare(b.dtNo))
  }, [allTickets, from, to])

  /* Build display rows + per-truck + per-driver rollups in one pass. The truck is
     read straight from each ticket (ticket.vehicle); the driver defaults to that
     truck's driver but can be overridden per row. */
  const { rowData, perTruck, perDriver, totals } = useMemo(() => {
    const m: Record<string, { trips: number; m3: number; normal: number; over: number; ot18: number; ot22: number; fee: number }> = {}
    for (const v of TRUCKS) m[v] = { trips: 0, m3: 0, normal: 0, over: 0, ot18: 0, ot22: 0, fee: 0 }
    const driverMap: Record<string, { trips: number; fee: number }> = {}
    let tripSeq = 0
    let totalM3 = 0
    const rows = inRange.map((t) => {
      const isCust = t.type === 'ขายลูกค้า'
      const e: TruckTripEntry = created.truckTrips[t.dtNo] ?? {}
      const vehicle = t.vehicle /* read-only, straight from the delivery ticket */
      const defDriver = vehicle ? VEHICLE_MAP[vehicle]?.driver ?? '' : ''
      const driver = e.driver ?? defDriver
      const fee = isCust ? rowFee(vehicle, e) : 0
      totalM3 += t.m3
      let trip = 0
      if (isCust) trip = ++tripSeq
      if (isCust && vehicle && m[vehicle]) {
        const s = m[vehicle]
        s.trips++; s.m3 += t.m3; s.fee += fee
        if (e.over20) s.over++; else s.normal++
        if (e.ot18) s.ot18++
        if (e.ot22) s.ot22++
        const d = driver || '—'
        if (!driverMap[d]) driverMap[d] = { trips: 0, fee: 0 }
        driverMap[d].trips++; driverMap[d].fee += fee
      }
      return { t, isCust, e, vehicle, defDriver, driver, fee, trip }
    })
    const tripTotal = TRUCKS.reduce((s, v) => s + m[v].trips, 0)
    const feeTotal = TRUCKS.reduce((s, v) => s + m[v].fee, 0)
    return { rowData: rows, perTruck: m, perDriver: driverMap, totals: { totalM3, tripTotal, feeTotal } }
  }, [inRange, created.truckTrips])

  const exportCsv = () => {
    const head = ['ลำดับ', 'เที่ยว', 'สำหรับ', 'เดือน', 'วันที่', 'เลขที่ DP', 'รถทะเบียนที่ส่ง', 'คนขับ', 'คิว', 'เกิน20กม.', 'หลัง18:00', 'หลัง22:00', 'ค่าเที่ยว']
    const body = rowData.map((r, i) => [
      i + 1,
      r.trip || '',
      r.isCust ? 'ลูกค้า' : r.t.type,
      monthShort(r.t.month),
      r.t.date,
      r.t.ref || r.t.dtNo,
      r.vehicle ? `${r.vehicle} ${VEHICLE_MAP[r.vehicle]?.plate ?? ''}` : '',
      r.driver,
      r.t.m3,
      r.e.over20 ? '✓' : '',
      r.e.ot18 ? '✓' : '',
      r.e.ot22 ? '✓' : '',
      r.fee || '',
    ])
    downloadCsv('truck-trips', [head, ...body])
  }

  /* Snapshot the current range into a saved report (รายงานทั่วไป) and open it. */
  const createReport = () => {
    if (inRange.length === 0) { alert('ไม่มีใบจ่ายในช่วงที่เลือก — กรุณาเลือกช่วงวันอื่น'); return }
    const fromLabel = isoToThai(from)
    const toLabel = isoToThai(to)
    const report: GeneralReport = {
      id: `gr_${Date.now()}`,
      kind: 'truck-trips',
      title: `บันทึกเที่ยวรถโม่ ${fromLabel} ถึง ${toLabel}`,
      fromLabel,
      toLabel,
      rows: rowData.map((r) => ({
        trip: r.trip,
        forLabel: r.isCust ? 'ลูกค้า' : r.t.type,
        monthLabel: monthShort(r.t.month),
        date: r.t.date,
        dp: r.t.ref || r.t.dtNo,
        vehicle: r.vehicle ?? '',
        plate: r.vehicle ? (VEHICLE_MAP[r.vehicle]?.plate ?? '') : '',
        driver: r.driver,
        m3: r.t.m3,
        over20: !!r.e.over20,
        ot18: !!r.e.ot18,
        ot22: !!r.e.ot22,
        fee: r.fee,
      })),
      trucks: TRUCKS.map((v) => ({
        vehicle: v,
        plate: VEHICLE_MAP[v]?.plate ?? '',
        wheel: wheelLabel(v),
        driver: VEHICLE_MAP[v]?.driver ?? '',
        ...perTruck[v],
      })),
      drivers: Object.entries(perDriver).map(([driver, s]) => ({ driver, trips: s.trips, fee: s.fee })),
      totals: { ...totals },
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
        title="บันทึกเที่ยวรถโม่ตามใบจ่าย"
        sub="Mixer Truck Trips · นับเที่ยว/ค่าเที่ยววิ่งรถจากใบจ่ายคอนกรีต (เฉพาะงานลูกค้า)"
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
            ดึงใบจ่าย {inRange.length} รายการ · งานลูกค้านับเที่ยว, โรงหล่อ/ใช้เองไม่คิดค่าเที่ยว
          </span>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 16 }}>
        <KpiCard label="เที่ยวลูกค้ารวม · Trips" value={totals.tripTotal.toString()} note="เที่ยว (เฉพาะใบจ่ายที่ระบุรถ)" />
        <KpiCard label="ปริมาณรวม · Volume" value={qm(totals.totalM3)} note="คิว (ทุกใบจ่ายในช่วง)" />
        <KpiCard label="ค่าเที่ยวรวมสุทธิ · Net" value={money(totals.feeTotal)} note="บาท" invert />
        <KpiCard label="ใบจ่ายในช่วง · Tickets" value={inRange.length.toString()} note="รายการ" />
      </div>

      {/* Main entry table */}
      <div className="card flush" style={{ overflowX: 'auto', marginBottom: 22 }}>
        <table className="data" style={{ minWidth: 980, whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>เที่ยว</th>
              <th>สำหรับ</th>
              <th>เดือน</th>
              <th>วันที่</th>
              <th>เลขที่ DP</th>
              <th>รถทะเบียนที่ส่ง</th>
              <th>คนขับรถ</th>
              <th className="num">คิว</th>
              <th className="ctr">เกิน 20<br />กม.</th>
              <th className="ctr">หลัง<br />18:00</th>
              <th className="ctr">หลัง<br />22:00</th>
              <th className="num">ค่าเที่ยว</th>
            </tr>
          </thead>
          <tbody>
            {rowData.length === 0 ? (
              <tr><td colSpan={13}><div className="empty-state"><span className="et">ไม่พบใบจ่ายในช่วงวันที่เลือก</span></div></td></tr>
            ) : rowData.map((r, i) => {
              const dim = !r.isCust /* โรงหล่อ / ใช้เอง — no trip fee */
              return (
                <tr key={r.t.dtNo} style={dim ? { background: '#fdf2f8' } : undefined}>
                  <td style={{ color: 'var(--kpc-text-faint)' }}>{i + 1}</td>
                  <td className="mono">{r.trip || ''}</td>
                  <td>{r.isCust ? 'ลูกค้า' : <span style={{ color: '#be185d' }}>{r.t.type}</span>}</td>
                  <td>{monthShort(r.t.month)}</td>
                  <td className="mono">{r.t.date}</td>
                  <td className="mono">{r.t.ref || r.t.dtNo}</td>
                  <td>
                    {r.vehicle ? (
                      <span>
                        <span className="mono" style={{ fontWeight: 600 }}>{r.vehicle}</span>
                        <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}> · {VEHICLE_MAP[r.vehicle]?.plate}</span>
                        <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}> ({wheelLabel(r.vehicle)})</span>
                      </span>
                    ) : <span style={{ color: 'var(--kpc-text-faint)' }}>— ไม่ระบุรถ</span>}
                  </td>
                  <td>
                    {r.vehicle ? (
                      <Select
                        value={r.driver}
                        onChange={(e) => setTruckTrip(r.t.dtNo, { driver: e.target.value === r.defDriver ? undefined : e.target.value })}
                        style={{ padding: '4px 8px', fontSize: 13, minWidth: 150 }}
                      >
                        {/* Keep any custom saved driver selectable even if not in the fleet list. */}
                        {!DRIVERS.includes(r.driver) && r.driver && <option value={r.driver}>{r.driver}</option>}
                        {DRIVERS.map((d) => <option key={d} value={d}>{d}{d === r.defDriver ? ' (ประจำรถ)' : ''}</option>)}
                      </Select>
                    ) : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}
                  </td>
                  <td className="num mono">{qm(r.t.m3)}</td>
                  <td className="ctr">
                    {r.isCust && r.vehicle && <input type="checkbox" checked={!!r.e.over20} onChange={(e) => setTruckTrip(r.t.dtNo, { over20: e.target.checked })} />}
                  </td>
                  <td className="ctr">
                    {r.isCust && r.vehicle && <input type="checkbox" checked={!!r.e.ot18} onChange={(e) => setTruckTrip(r.t.dtNo, { ot18: e.target.checked })} />}
                  </td>
                  <td className="ctr">
                    {r.isCust && r.vehicle && <input type="checkbox" checked={!!r.e.ot22} onChange={(e) => setTruckTrip(r.t.dtNo, { ot22: e.target.checked })} />}
                  </td>
                  <td className="num mono" style={{ fontWeight: r.fee ? 600 : 400, color: r.fee ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>
                    {r.isCust ? (r.vehicle ? money(r.fee) : '—') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Per-truck summary */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สรุปแยกรถ</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>10 ล้อ 35/40 · 6 ล้อ 25/30 · OT +10/+10</span>
      </div>
      <div className="card flush" style={{ overflowX: 'auto', marginBottom: 22 }}>
        <table className="data" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>รถทะเบียนที่ส่ง</th>
              <th>ประเภท</th>
              <th>คนขับประจำรถ</th>
              <th className="num">เที่ยวรวม</th>
              <th className="num">ระยะปกติ</th>
              <th className="num">เกิน 20 กม.</th>
              <th className="num">หลัง 18:00</th>
              <th className="num">หลัง 22:00</th>
              <th className="num">คิวรวม</th>
              <th className="num">ค่าเที่ยวรวม</th>
            </tr>
          </thead>
          <tbody>
            {TRUCKS.map((v) => {
              const s = perTruck[v]
              return (
                <tr key={v}>
                  <td className="mono" style={{ fontWeight: 600 }}>{v}<span style={{ color: 'var(--kpc-text-faint)', fontWeight: 400 }}> · {VEHICLE_MAP[v]?.plate}</span></td>
                  <td>{wheelLabel(v)}</td>
                  <td>{VEHICLE_MAP[v]?.driver}</td>
                  <td className="num mono" style={{ fontWeight: 600 }}>{s.trips}</td>
                  <td className="num mono">{s.normal}</td>
                  <td className="num mono">{s.over}</td>
                  <td className="num mono">{s.ot18}</td>
                  <td className="num mono">{s.ot22}</td>
                  <td className="num mono">{qm(s.m3)}</td>
                  <td className="num mono" style={{ fontWeight: 600 }}>{money(s.fee)}</td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '2px solid var(--kpc-neutral-300)', fontWeight: 700 }}>
              <td colSpan={3}>รวมทั้งสิ้น</td>
              <td className="num mono">{totals.tripTotal}</td>
              <td className="num mono">{TRUCKS.reduce((a, v) => a + perTruck[v].normal, 0)}</td>
              <td className="num mono">{TRUCKS.reduce((a, v) => a + perTruck[v].over, 0)}</td>
              <td className="num mono">{TRUCKS.reduce((a, v) => a + perTruck[v].ot18, 0)}</td>
              <td className="num mono">{TRUCKS.reduce((a, v) => a + perTruck[v].ot22, 0)}</td>
              <td className="num mono">{qm(TRUCKS.reduce((a, v) => a + perTruck[v].m3, 0))}</td>
              <td className="num mono">{money(totals.feeTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Per-driver rollup (reflects the chosen driver per row) */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 10 }}>เที่ยวรถต่อคนขับ (ในช่วงที่เลือก)</div>
      <div className="grid g-4">
        {Object.entries(perDriver).map(([driver, s]) => (
          <div key={driver} className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)', marginBottom: 8 }}>{driver}</div>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>{s.trips}</span>
              <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>เที่ยว · {money(s.fee)}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
