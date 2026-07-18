import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Field, Input, Badge, SearchInput, Pill, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { baht } from '../data/selectors'
import { downloadCsv, type Cell } from '../utils/csv'
import {
  useCreatedDocs, addGeneralReport,
  type ExpenseRecord, type GoodsPaymentSite, type FuelReportRow, type FuelReportSummaryRow, type FuelUsageReport,
} from '../data/createdDocs'
import { ALL_FUEL_VEHICLES, FUEL_VEHICLE_BY_ID, fuelVehicleReg, isMixerVehicle } from '../data/fuelVehicles'

const FUEL_CATEGORY = 'ค่าน้ำมัน'
/** SITE badge colour — แพล้นปูน = น้ำเงิน (info) · โรงหล่อ = เหลือง (warning). */
const SITE_TONE: Record<GoodsPaymentSite, Tone> = { แพล้นปูน: 'info', โรงหล่อ: 'warning' }
/** The four mixer trucks (รถโม่), in canonical order. */
const MIXER_VEHICLES = ALL_FUEL_VEHICLES.filter((v) => v.kind === 'mixer')
const r2 = (n: number) => Math.round(n * 100) / 100

/** n with 2 decimals. */
const num2 = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** ลิตร with 2 decimals, or blank for empty. */
const nf2 = (n: number | undefined) => (n ? num2(n) : '')

/** DD/MM/YY (2-digit พ.ศ.) — matches the paper report, e.g. 01/06/69. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${String((Number(y) + 543) % 100).padStart(2, '0')}`
}
/** DD/MM/พ.ศ. (full year) for report range labels. */
function isoToThai(iso: string): string {
  if (!iso) return '-'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

/* Report table cell styles — bordered like the paper report, theme-aware. */
const cellBase: React.CSSProperties = { border: '1px solid var(--kpc-border)', padding: '6px 10px', fontSize: 13 }
const th: React.CSSProperties = { ...cellBase, fontWeight: 600, background: 'var(--kpc-surface-alt)', textAlign: 'center', whiteSpace: 'nowrap' }
const num: React.CSSProperties = { ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/** Chronological order (date, then save time). */
function byDate(a: ExpenseRecord, b: ExpenseRecord): number {
  return a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}
/** Indices kept by the longest non-decreasing subsequence of `a` (patience sorting). */
function lisKeep(a: number[]): Set<number> {
  const keep = new Set<number>()
  if (a.length === 0) return keep
  const tails: number[] = []
  const prev = new Array<number>(a.length).fill(-1)
  for (let i = 0; i < a.length; i++) {
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (a[tails[mid]] <= a[i]) lo = mid + 1; else hi = mid }
    if (lo > 0) prev[i] = tails[lo - 1]
    if (lo === tails.length) tails.push(i); else tails[lo] = i
  }
  for (let k = tails[tails.length - 1]; k !== -1; k = prev[k]) keep.add(k)
  return keep
}
/** Ids of fills whose เข็มไมล์ breaks the monotonic-increasing trend for a truck
    (a mis-typed odometer). `series` must already be in chronological order. */
function odometerAnomalies(series: ExpenseRecord[]): Set<string> {
  const withOdo = series.filter((r) => r.odometer != null)
  const keep = lisKeep(withOdo.map((r) => r.odometer as number))
  const bad = new Set<string>()
  withOdo.forEach((r, i) => { if (!keep.has(i)) bad.add(r.id) })
  return bad
}

/* ───────── Pure computations (shared by the screen + Excel/report builders) ───────── */
type AllData = ReturnType<typeof computeAll>
function computeAll(records: ExpenseRecord[], from: string, to: string, query: string) {
  const q = query.trim().toLowerCase()
  const rows = records
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .filter((e) => !q || `${fuelVehicleReg(e.vehicleId ?? '')} ${FUEL_VEHICLE_BY_ID[e.vehicleId ?? '']?.driver ?? ''} ${e.site} ${e.supplier ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

  const totals = rows.reduce(
    (t, e) => {
      const l = e.liters ?? 0
      if (isMixerVehicle(e.vehicleId ?? '')) t.mixer += l; else t.other += l
      t.baht += e.amount
      return t
    },
    { mixer: 0, other: 0, baht: 0 },
  )

  const map = new Map<string, { liters: number; baht: number; count: number }>()
  for (const e of rows) {
    const id = e.vehicleId ?? '—'
    const cur = map.get(id) ?? { liters: 0, baht: 0, count: 0 }
    cur.liters += e.liters ?? 0; cur.baht += e.amount; cur.count += 1
    map.set(id, cur)
  }
  const perVehicle = [...map.entries()]
    .map(([id, v]) => ({ id, reg: fuelVehicleReg(id), ...v }))
    .sort((a, b) => ALL_FUEL_VEHICLES.findIndex((x) => x.id === a.id) - ALL_FUEL_VEHICLES.findIndex((x) => x.id === b.id))

  return { rows, totals, perVehicle, totalLiters: totals.mixer + totals.other }
}

/** Per-truck fills within the period, plus its carry-over baseline (the last fill
    before `from`, which sets the starting odometer). */
function seriesFor(records: ExpenseRecord[], id: string, from: string, to: string): { series: ExpenseRecord[]; baselineId?: string } {
  const truck = records.filter((e) => e.vehicleId === id)
  const inRange = truck
    .filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
    .sort(byDate)
  if (inRange.length === 0) return { series: [] }
  const before = from ? truck.filter((e) => e.date < from && e.odometer != null).sort(byDate) : []
  const baseline = before.length ? before[before.length - 1] : undefined
  return { series: baseline ? [baseline, ...inRange] : inRange, baselineId: baseline?.id }
}

/** อัตราสิ้นเปลือง from a truck's series — distance = last odo − first odo; the
    fuel/price that drove it = every fill EXCEPT the last. */
function truckStats(series: ExpenseRecord[]) {
  const n = series.length
  const exceptLast = series.slice(0, Math.max(0, n - 1))
  const liters = exceptLast.reduce((s, r) => s + (r.liters ?? 0), 0)
  const amount = exceptLast.reduce((s, r) => s + r.amount, 0)
  const withOdo = series.filter((r) => r.odometer != null)
  const km = withOdo.length >= 2 ? (withOdo[withOdo.length - 1].odometer! - withOdo[0].odometer!) : 0
  const kmPerL = km > 0 && liters > 0 ? km / liters : null
  const bahtPerKm = km > 0 ? amount / km : null
  return { liters, amount, km, kmPerL, bahtPerKm }
}

type MixerData = ReturnType<typeof computeMixer>
function computeMixer(records: ExpenseRecord[], from: string, to: string) {
  const mixer = records.filter((e) => isMixerVehicle(e.vehicleId ?? ''))
  const perTruck = MIXER_VEHICLES
    .map((v) => ({ v, ...seriesFor(mixer, v.id, from, to) }))
    .filter((t) => t.series.length > 0)

  /* Grouped by ทะเบียนรถ (MIXER_VEHICLES order), and date-sorted within each truck —
     t.series is already chronological, so the flatMap preserves that layout. */
  const detailRows = perTruck.flatMap((t) => {
    const bad = odometerAnomalies(t.series)
    return t.series.map((rec) => ({ rec, isBaseline: rec.id === t.baselineId, odoAnomaly: bad.has(rec.id) }))
  })

  const summary = perTruck.map((t) => ({ v: t.v, ...truckStats(t.series) }))
  const inRangeRows = detailRows.filter((r) => !r.isBaseline)
  const kpi = inRangeRows.reduce((t, { rec }) => { t.liters += rec.liters ?? 0; t.baht += rec.amount; return t }, { liters: 0, baht: 0 })
  return { detailRows, summary, inRangeRows, kpi }
}

/* ───────── Page shell ───────── */
export function FuelReport() {
  const created = useCreatedDocs()
  const navigate = useNavigate()
  const fuelAll = useMemo(
    () => created.expenseRecords.filter((e) => e.category === FUEL_CATEGORY),
    [created.expenseRecords],
  )

  const [tab, setTab] = useState<'all' | 'mixer'>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [query, setQuery] = useState('')

  /* Default the range to the span of existing fuel records on first load. */
  useEffect(() => {
    if (from || to || fuelAll.length === 0) return
    const dates = fuelAll.map((e) => e.date).sort()
    setFrom(dates[0]); setTo(dates[dates.length - 1])
  }, [fuelAll, from, to])

  const allData = useMemo(() => computeAll(fuelAll, from, to, query), [fuelAll, from, to, query])
  const mixerData = useMemo(() => computeMixer(fuelAll, from, to), [fuelAll, from, to])
  const activeCount = tab === 'all' ? allData.rows.length : mixerData.inRangeRows.length

  const exportExcel = () => {
    if (tab === 'all') downloadCsv(`ค่าน้ำมันรถ-ทุกคัน-${from}-${to}`, buildAllCsv(allData))
    else downloadCsv(`ค่าน้ำมันรถโม่-${from}-${to}`, buildMixerCsv(mixerData))
  }

  const createReport = () => {
    if (activeCount === 0) { alert('ไม่มีรายการค่าน้ำมันในช่วงที่เลือก'); return }
    const fromLabel = isoToThai(from), toLabel = isoToThai(to)
    const report: FuelUsageReport = tab === 'all'
      ? buildAllReport(allData, fromLabel, toLabel)
      : buildMixerReport(mixerData, fromLabel, toLabel)
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  return (
    <>
      <PageHeader
        title="ค่าน้ำมันรถ"
        sub="Vehicle Fuel · ค่าน้ำมันทั้ง 2 SITE"
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={activeCount === 0}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport} disabled={activeCount === 0}>สร้างรายงาน</Button>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={tab === 'all'} onClick={() => setTab('all')}>รวมทุกคัน</Pill>
        <Pill active={tab === 'mixer'} onClick={() => setTab('mixer')}>ค่าน้ำมันรถโม่</Pill>
      </div>

      <div className="row wrap" style={{ gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <Field label="ตั้งแต่วันที่" style={{ width: 180 }}>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="จนถึงวันที่" style={{ width: 180 }}>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      {tab === 'all'
        ? <FuelAllView data={allData} query={query} setQuery={setQuery} />
        : <FuelMixerView data={mixerData} />}
    </>
  )
}

/* ───────── CSV / report builders ───────── */
function buildAllCsv(d: AllData): Cell[][] {
  const head: Cell[] = ['วันที่', 'ทะเบียนรถ', 'พนง.ขับรถ', 'SITE', 'ลิตร(รถปูน)', 'ลิตร(อื่นๆ)', 'ราคา/ลิตร', 'บาท']
  const body: Cell[][] = d.rows.map((e) => {
    const mixer = isMixerVehicle(e.vehicleId ?? '')
    return [
      fmtDate(e.date), fuelVehicleReg(e.vehicleId ?? ''), FUEL_VEHICLE_BY_ID[e.vehicleId ?? '']?.driver ?? '', e.site,
      mixer ? (e.liters ?? '') : '', mixer ? '' : (e.liters ?? ''), e.pricePerLiter ?? '', r2(e.amount),
    ]
  })
  const total: Cell[] = ['รวมทั้งหมด', '', '', '', r2(d.totals.mixer), r2(d.totals.other), '', r2(d.totals.baht)]
  const sumHead: Cell[] = ['ทะเบียน', 'จำนวนลิตร', 'จำนวนเงิน', 'จำนวนครั้ง']
  const sumBody: Cell[][] = d.perVehicle.map((v) => [v.reg, r2(v.liters), r2(v.baht), v.count])
  return [head, ...body, total, [], ['สรุปตามคัน'], sumHead, ...sumBody]
}

function buildMixerCsv(d: MixerData): Cell[][] {
  const head: Cell[] = ['ทะเบียนรถ', 'วันที่', 'จำนวนลิตรที่เติม', 'ราคาต่อลิตร', 'ราคารวม', 'เข็มไมล์']
  const body: Cell[][] = d.detailRows.map(({ rec, isBaseline }) => [
    fuelVehicleReg(rec.vehicleId ?? ''), fmtDate(rec.date) + (isBaseline ? ' (ยกมา)' : ''),
    rec.liters ?? '', rec.pricePerLiter ?? '', r2(rec.amount), rec.odometer ?? '',
  ])
  const sumHead: Cell[] = ['ทะเบียนรถ', 'จำนวนน้ำมัน (ยกเว้นครั้งสุดท้าย)', 'ราคารวม (ยกเว้นครั้งสุดท้าย)', 'กม.ที่วิ่งได้', 'กม./ลิตร', 'บาท/กม.']
  const sumBody: Cell[][] = d.summary.map((s) => [
    s.v.reg, r2(s.liters), r2(s.amount), s.km || '', s.kmPerL != null ? r2(s.kmPerL) : '', s.bahtPerKm != null ? r2(s.bahtPerKm) : '',
  ])
  return [head, ...body, [], ['สรุปอัตราสิ้นเปลือง'], sumHead, ...sumBody]
}

function buildAllReport(d: AllData, fromLabel: string, toLabel: string): FuelUsageReport {
  const rows: FuelReportRow[] = d.rows.map((e) => ({
    date: e.date, reg: fuelVehicleReg(e.vehicleId ?? ''), driver: FUEL_VEHICLE_BY_ID[e.vehicleId ?? '']?.driver,
    site: e.site, mixer: isMixerVehicle(e.vehicleId ?? ''), liters: e.liters, pricePerLiter: e.pricePerLiter, amount: r2(e.amount),
  }))
  const summary: FuelReportSummaryRow[] = d.perVehicle.map((v) => ({ reg: v.reg, liters: r2(v.liters), amount: r2(v.baht), count: v.count }))
  return {
    id: `gr_${Date.now()}`, kind: 'fuel', mode: 'all',
    title: `ค่าน้ำมันรถ (ทุกคัน) ${fromLabel} ถึง ${toLabel}`, fromLabel, toLabel,
    rows, summary,
    totals: { liters: r2(d.totalLiters), mixerLiters: r2(d.totals.mixer), otherLiters: r2(d.totals.other), amount: r2(d.totals.baht), count: rows.length },
    createdAt: new Date().toISOString(),
  }
}

function buildMixerReport(d: MixerData, fromLabel: string, toLabel: string): FuelUsageReport {
  const rows: FuelReportRow[] = d.detailRows.map(({ rec, isBaseline }) => ({
    date: rec.date, reg: fuelVehicleReg(rec.vehicleId ?? ''), mixer: true,
    liters: rec.liters, pricePerLiter: rec.pricePerLiter, amount: r2(rec.amount), odometer: rec.odometer, baseline: isBaseline,
  }))
  const summary: FuelReportSummaryRow[] = d.summary.map((s) => ({
    reg: s.v.reg, liters: r2(s.liters), amount: r2(s.amount), km: s.km,
    kmPerL: s.kmPerL != null ? r2(s.kmPerL) : null, bahtPerKm: s.bahtPerKm != null ? r2(s.bahtPerKm) : null,
  }))
  return {
    id: `gr_${Date.now()}`, kind: 'fuel', mode: 'mixer',
    title: `ค่าน้ำมันรถโม่ ${fromLabel} ถึง ${toLabel}`, fromLabel, toLabel,
    rows, summary,
    totals: { liters: r2(d.kpi.liters), mixerLiters: r2(d.kpi.liters), otherLiters: 0, amount: r2(d.kpi.baht), count: d.inRangeRows.length },
    createdAt: new Date().toISOString(),
  }
}

/* ───────── Tab 1: all vehicles, both SITEs ───────── */
function FuelAllView({ data, query, setQuery }: { data: AllData; query: string; setQuery: (v: string) => void }) {
  const { rows, totals, perVehicle, totalLiters } = data
  return (
    <>
      <div className="grid g-3" style={{ marginBottom: 20 }}>
        <KpiCard label="รายการเติมน้ำมัน" value={rows.length.toString()} note="ตามช่วงที่เลือก" />
        <KpiCard label="รวมลิตร" value={`${nf2(totalLiters) || '0.00'} ล.`} note={`รถปูน ${nf2(totals.mixer) || '0.00'} · อื่นๆ ${nf2(totals.other) || '0.00'}`} />
        <KpiCard label="ยอดรวม · Total" value={baht(totals.baht)} note="ตามช่วงที่เลือก" invert />
      </div>

      <div className="row" style={{ marginBottom: 16, justifyContent: 'flex-end' }}>
        <div style={{ width: 320, maxWidth: '100%' }}>
          <SearchInput placeholder="ทะเบียนรถ / คนขับ / SITE" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ไม่มีรายการค่าน้ำมันในช่วงที่เลือก
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th} rowSpan={2}>วันที่</th>
                <th style={th} rowSpan={2}>ทะเบียนรถ</th>
                <th style={th} rowSpan={2}>พนง.ขับรถ</th>
                <th style={th} rowSpan={2}>SITE</th>
                <th style={th} colSpan={4}>จำนวน</th>
              </tr>
              <tr>
                <th style={th}>ลิตร(รถปูน)</th>
                <th style={th}>ลิตร(อื่นๆ)</th>
                <th style={th}>ราคา/ลิตร</th>
                <th style={th}>บาท</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const mixer = isMixerVehicle(e.vehicleId ?? '')
                const driver = FUEL_VEHICLE_BY_ID[e.vehicleId ?? '']?.driver ?? ''
                return (
                  <tr key={e.id}>
                    <td style={{ ...cellBase, textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                    <td style={{ ...cellBase, whiteSpace: 'nowrap' }}>{fuelVehicleReg(e.vehicleId ?? '')}</td>
                    <td style={cellBase}>{driver || <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}</td>
                    <td style={{ ...cellBase, textAlign: 'center' }}><Badge tone={SITE_TONE[e.site]} pip={false} square>{e.site}</Badge></td>
                    <td style={num}>{mixer ? nf2(e.liters) : ''}</td>
                    <td style={num}>{mixer ? '' : nf2(e.liters)}</td>
                    <td style={num}>{e.pricePerLiter != null ? num2(e.pricePerLiter) : ''}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{baht(e.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...th, textAlign: 'right' }} colSpan={4}>รวมทั้งหมด</td>
                <td style={{ ...num, fontWeight: 700 }}>{nf2(totals.mixer) || '0.00'}</td>
                <td style={{ ...num, fontWeight: 700 }}>{nf2(totals.other) || '0.00'}</td>
                <td style={th}></td>
                <td style={{ ...num, fontWeight: 700 }}>{baht(totals.baht)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {perVehicle.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>สรุปตามคัน</h3>
          <div className="card" style={{ padding: 0, overflowX: 'auto', maxWidth: 560 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>ทะเบียน</th>
                  <th style={th}>จำนวนลิตร</th>
                  <th style={th}>จำนวนเงิน</th>
                  <th style={th}>จำนวนครั้ง</th>
                </tr>
              </thead>
              <tbody>
                {perVehicle.map((v) => (
                  <tr key={v.id}>
                    <td style={{ ...cellBase, whiteSpace: 'nowrap' }}>{v.reg}</td>
                    <td style={num}>{nf2(v.liters) || '0.00'}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{baht(v.baht)}</td>
                    <td style={{ ...cellBase, textAlign: 'center' }}>{v.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...th, textAlign: 'right' }}>รวม</td>
                  <td style={{ ...num, fontWeight: 700 }}>{nf2(totalLiters) || '0.00'}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{baht(totals.baht)}</td>
                  <td style={{ ...th }}>{rows.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

/* ───────── Tab 2: mixer trucks only — detail + fuel-efficiency ───────── */
function FuelMixerView({ data }: { data: MixerData }) {
  const { detailRows, summary, inRangeRows, kpi } = data

  if (detailRows.length === 0) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
        ไม่มีรายการค่าน้ำมันรถโม่ในช่วงที่เลือก
      </div>
    )
  }

  return (
    <>
      <div className="grid g-3" style={{ marginBottom: 20 }}>
        <KpiCard label="รายการเติมน้ำมัน (รถโม่)" value={inRangeRows.length.toString()} note="ตามช่วงที่เลือก" />
        <KpiCard label="รวมลิตร" value={`${nf2(kpi.liters) || '0.00'} ล.`} note="ไม่รวมยอดยกมา" />
        <KpiCard label="ยอดรวม · Total" value={baht(kpi.baht)} note="ตามช่วงที่เลือก" invert />
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={th}>ทะเบียนรถ</th>
              <th style={th}>วันที่</th>
              <th style={th}>จำนวนลิตรที่เติม</th>
              <th style={th}>ราคาต่อลิตร</th>
              <th style={th}>ราคารวม</th>
              <th style={th}>เข็มไมล์</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map(({ rec, isBaseline, odoAnomaly }) => (
              <tr key={rec.id} style={isBaseline ? { background: 'var(--kpc-warning-bg)', color: 'var(--kpc-warning-ink)' } : undefined}>
                <td style={{ ...cellBase, whiteSpace: 'nowrap' }}>{fuelVehicleReg(rec.vehicleId ?? '')}</td>
                <td style={{ ...cellBase, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  {fmtDate(rec.date)}
                  {isBaseline && <span style={{ color: 'var(--kpc-text-muted)', fontSize: 11, marginLeft: 6 }}>(ยกมา)</span>}
                </td>
                <td style={num}>{nf2(rec.liters)}</td>
                <td style={num}>{rec.pricePerLiter != null ? num2(rec.pricePerLiter) : ''}</td>
                <td style={{ ...num, fontWeight: 600 }}>{baht(rec.amount)}</td>
                <td style={odoAnomaly ? { ...num, color: 'var(--kpc-danger)', fontWeight: 700 } : num} title={odoAnomaly ? 'เลขไมล์ผิดปกติ (ไม่เรียงตามเวลา) — โปรดตรวจสอบ/แก้ไข' : undefined}>
                  {rec.odometer != null ? rec.odometer.toLocaleString('th-TH') : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--kpc-text-muted)' }}>
        แถวไฮไลต์ = ยอดยกมา (ครั้งเติมล่าสุดก่อนช่วงที่เลือก) ใช้เป็นเข็มไมล์ตั้งต้น ·{' '}
        <span style={{ color: 'var(--kpc-danger)', fontWeight: 600 }}>เลขไมล์สีแดง</span> = ผิดปกติ (ไม่เรียงตามเวลา) โปรดตรวจสอบและแก้ไขที่บันทึกรายจ่าย
      </div>

      <div style={{ marginTop: 28 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>สรุปอัตราสิ้นเปลือง</h3>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>ทะเบียนรถ</th>
                <th style={th}>จำนวนน้ำมันที่เติม<br />(ยกเว้นครั้งสุดท้าย)</th>
                <th style={th}>ราคารวมที่เติมน้ำมัน<br />(ยกเว้นครั้งสุดท้าย)</th>
                <th style={th}>จำนวนกิโลเมตร<br />ที่วิ่งได้</th>
                <th style={th}>อัตราสิ้นเปลือง<br />กิโลเมตร/ลิตร</th>
                <th style={th}>บาท/กิโลเมตร</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.v.id}>
                  <td style={{ ...cellBase, whiteSpace: 'nowrap' }}>{s.v.reg}</td>
                  <td style={num}>{nf2(s.liters) || '0.00'}</td>
                  <td style={{ ...num, fontWeight: 600 }}>{baht(s.amount)}</td>
                  <td style={num}>{s.km ? s.km.toLocaleString('th-TH') : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{s.kmPerL != null ? num2(s.kmPerL) : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{s.bahtPerKm != null ? num2(s.bahtPerKm) : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--kpc-text-muted)' }}>
          กิโลเมตรที่วิ่งได้ = เข็มไมล์ครั้งสุดท้าย − เข็มไมล์ยอดยกมา · น้ำมัน/ราคาที่ใช้คำนวณไม่รวมการเติมครั้งสุดท้าย (ยังวิ่งไม่ครบระยะ)
        </div>
      </div>
    </>
  )
}
