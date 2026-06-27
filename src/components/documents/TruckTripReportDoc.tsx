import { COMPANY } from '../../data/real'
import { qm } from '../../data/selectors'
import type { TruckTripReport } from '../../data/createdDocs'

const money = (n: number) => '฿' + n.toLocaleString('en-US')

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Printable mixer-truck-trip report. Rendered both in the on-screen preview
    modal and (via window.print) as the saved PDF. Compact so the wide table
    fits an A4 page; long ranges flow across pages with a repeating header. */
export function TruckTripReportDoc({ report }: { report: TruckTripReport }) {
  const t = report.totals
  return (
    <div className="trip-report-sheet">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">รายงานบันทึกเที่ยวรถโม่ตามใบจ่าย</div>
          <div className="trr-range">ช่วงวันที่ {report.fromLabel} ถึง {report.toLabel}</div>
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      {/* Per-truck summary */}
      <div className="trr-section">สรุปแยกรถ</div>
      <table className="trr-table">
        <thead>
          <tr>
            <th>รถทะเบียนที่ส่ง</th><th>ประเภท</th><th>คนขับประจำรถ</th>
            <th className="n">เที่ยวรวม</th><th className="n">ระยะปกติ</th><th className="n">เกิน 20 กม.</th>
            <th className="n">หลัง 18:00</th><th className="n">หลัง 22:00</th><th className="n">คิวรวม</th><th className="n">ค่าเที่ยวรวม</th>
          </tr>
        </thead>
        <tbody>
          {report.trucks.map((r) => (
            <tr key={r.vehicle}>
              <td className="mono">{r.vehicle} · {r.plate}</td>
              <td>{r.wheel}</td>
              <td>{r.driver}</td>
              <td className="n mono">{r.trips}</td>
              <td className="n mono">{r.normal}</td>
              <td className="n mono">{r.over}</td>
              <td className="n mono">{r.ot18}</td>
              <td className="n mono">{r.ot22}</td>
              <td className="n mono">{qm(r.m3)}</td>
              <td className="n mono">{money(r.fee)}</td>
            </tr>
          ))}
          <tr className="trr-total">
            <td colSpan={3}>รวมทั้งสิ้น</td>
            <td className="n mono">{t.tripTotal}</td>
            <td className="n mono">{report.trucks.reduce((a, r) => a + r.normal, 0)}</td>
            <td className="n mono">{report.trucks.reduce((a, r) => a + r.over, 0)}</td>
            <td className="n mono">{report.trucks.reduce((a, r) => a + r.ot18, 0)}</td>
            <td className="n mono">{report.trucks.reduce((a, r) => a + r.ot22, 0)}</td>
            <td className="n mono">{qm(report.trucks.reduce((a, r) => a + r.m3, 0))}</td>
            <td className="n mono">{money(t.feeTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Per-driver rollup */}
      <div className="trr-section">เที่ยวรถต่อคนขับ</div>
      <table className="trr-table" style={{ maxWidth: 460 }}>
        <thead>
          <tr><th>คนขับ</th><th className="n">เที่ยว</th><th className="n">ค่าเที่ยวรวม</th></tr>
        </thead>
        <tbody>
          {report.drivers.map((d) => (
            <tr key={d.driver}><td>{d.driver}</td><td className="n mono">{d.trips}</td><td className="n mono">{money(d.fee)}</td></tr>
          ))}
        </tbody>
      </table>

      {/* Detail */}
      <div className="trr-section">รายละเอียดเที่ยววิ่ง ({report.rows.length} รายการ)</div>
      <table className="trr-table trr-detail">
        <thead>
          <tr>
            <th className="n">#</th><th className="n">เที่ยว</th><th>สำหรับ</th><th>เดือน</th><th>วันที่</th>
            <th>เลขที่ DP</th><th>รถทะเบียนที่ส่ง</th><th>คนขับ</th><th className="n">คิว</th>
            <th className="c">เกิน 20</th><th className="c">18:00</th><th className="c">22:00</th><th className="n">ค่าเที่ยว</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => {
            const dim = r.forLabel !== 'ลูกค้า'
            return (
              <tr key={r.dp + i} className={dim ? 'dim' : undefined}>
                <td className="n">{i + 1}</td>
                <td className="n mono">{r.trip || ''}</td>
                <td>{r.forLabel}</td>
                <td>{r.monthLabel}</td>
                <td className="mono">{r.date}</td>
                <td className="mono">{r.dp}</td>
                <td className="mono">{r.vehicle ? `${r.vehicle} · ${r.plate}` : '—'}</td>
                <td>{r.driver || '—'}</td>
                <td className="n mono">{qm(r.m3)}</td>
                <td className="c">{r.over20 ? '✓' : ''}</td>
                <td className="c">{r.ot18 ? '✓' : ''}</td>
                <td className="c">{r.ot22 ? '✓' : ''}</td>
                <td className="n mono">{r.fee ? money(r.fee) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
