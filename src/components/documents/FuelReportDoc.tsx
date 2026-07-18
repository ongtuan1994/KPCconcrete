import { COMPANY } from '../../data/real'
import type { FuelUsageReport } from '../../data/createdDocs'

const money = (n: number) => (n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const num2 = (n: number | null | undefined) => (n != null ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const lit = (n: number | undefined) => (n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
/** DD/MM/YY (2-digit พ.ศ.), e.g. 01/06/69. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${String((Number(y) + 543) % 100).padStart(2, '0')}`
}

/** Printable ค่าน้ำมันรถ report — 'all' lists every fill across both SITEs with the
    ลิตร(รถปูน)/ลิตร(อื่นๆ) split; 'mixer' adds เข็มไมล์ + an อัตราสิ้นเปลือง summary. */
export function FuelReportDoc({ report }: { report: FuelUsageReport }) {
  const isMixer = report.mode === 'mixer'
  return (
    <div className="trip-report-sheet">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">{isMixer ? 'ค่าน้ำมันรถโม่' : 'ค่าน้ำมันรถ (ทุกคัน)'}</div>
          <div className="trr-range">{report.fromLabel} – {report.toLabel}</div>
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      {isMixer ? (
        <table className="trr-table trr-detail">
          <thead>
            <tr>
              <th>ทะเบียนรถ</th>
              <th>วันที่</th>
              <th className="n">จำนวนลิตรที่เติม</th>
              <th className="n">ราคาต่อลิตร</th>
              <th className="n">ราคารวม</th>
              <th className="n">เข็มไมล์</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i} style={r.baseline ? { background: '#fff9c4' } : undefined}>
                <td>{r.reg}</td>
                <td>{shortDate(r.date)}{r.baseline ? ' (ยกมา)' : ''}</td>
                <td className="n mono">{lit(r.liters)}</td>
                <td className="n mono">{r.pricePerLiter != null ? num2(r.pricePerLiter) : ''}</td>
                <td className="n mono">{money(r.amount)}</td>
                <td className="n mono">{r.odometer != null ? r.odometer.toLocaleString('en-US') : ''}</td>
              </tr>
            ))}
            <tr className="trr-total">
              <td colSpan={2}>รวมทั้งหมด</td>
              <td className="n mono">{lit(report.totals.liters)}</td>
              <td className="n"></td>
              <td className="n mono">{money(report.totals.amount)}</td>
              <td className="n"></td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="trr-table trr-detail">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ทะเบียนรถ</th>
              <th>พนง.ขับรถ</th>
              <th>SITE</th>
              <th className="n">ลิตร(รถปูน)</th>
              <th className="n">ลิตร(อื่นๆ)</th>
              <th className="n">ราคา/ลิตร</th>
              <th className="n">บาท</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i}>
                <td>{shortDate(r.date)}</td>
                <td>{r.reg}</td>
                <td>{r.driver || ''}</td>
                <td>{r.site || ''}</td>
                <td className="n mono">{r.mixer ? lit(r.liters) : ''}</td>
                <td className="n mono">{r.mixer ? '' : lit(r.liters)}</td>
                <td className="n mono">{r.pricePerLiter != null ? num2(r.pricePerLiter) : ''}</td>
                <td className="n mono">{money(r.amount)}</td>
              </tr>
            ))}
            <tr className="trr-total">
              <td colSpan={4}>รวมทั้งหมด</td>
              <td className="n mono">{lit(report.totals.mixerLiters)}</td>
              <td className="n mono">{lit(report.totals.otherLiters)}</td>
              <td className="n"></td>
              <td className="n mono">{money(report.totals.amount)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {report.summary.length > 0 && (
        <>
          <div className="trr-title" style={{ fontSize: 14, margin: '18px 0 6px' }}>{isMixer ? 'สรุปอัตราสิ้นเปลือง' : 'สรุปตามคัน'}</div>
          <table className="trr-table trr-detail">
            {isMixer ? (
              <>
                <thead>
                  <tr>
                    <th>ทะเบียนรถ</th>
                    <th className="n">จำนวนน้ำมันที่เติม<br />(ยกเว้นครั้งสุดท้าย)</th>
                    <th className="n">ราคารวมที่เติมน้ำมัน<br />(ยกเว้นครั้งสุดท้าย)</th>
                    <th className="n">จำนวนกิโลเมตร<br />ที่วิ่งได้</th>
                    <th className="n">อัตราสิ้นเปลือง<br />กิโลเมตร/ลิตร</th>
                    <th className="n">บาท/กิโลเมตร</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summary.map((s, i) => (
                    <tr key={i}>
                      <td>{s.reg}</td>
                      <td className="n mono">{lit(s.liters)}</td>
                      <td className="n mono">{money(s.amount)}</td>
                      <td className="n mono">{s.km ? s.km.toLocaleString('en-US') : '—'}</td>
                      <td className="n mono">{num2(s.kmPerL)}</td>
                      <td className="n mono">{num2(s.bahtPerKm)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>ทะเบียน</th>
                    <th className="n">จำนวนลิตร</th>
                    <th className="n">จำนวนเงิน</th>
                    <th className="n">จำนวนครั้ง</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summary.map((s, i) => (
                    <tr key={i}>
                      <td>{s.reg}</td>
                      <td className="n mono">{lit(s.liters)}</td>
                      <td className="n mono">{money(s.amount)}</td>
                      <td className="n mono">{s.count ?? ''}</td>
                    </tr>
                  ))}
                  <tr className="trr-total">
                    <td>รวม</td>
                    <td className="n mono">{lit(report.totals.liters)}</td>
                    <td className="n mono">{money(report.totals.amount)}</td>
                    <td className="n mono">{report.totals.count}</td>
                  </tr>
                </tbody>
              </>
            )}
          </table>
        </>
      )}

      {isMixer && (
        <p style={{ fontSize: 10, color: '#6b7280', marginTop: 8 }}>
          * กิโลเมตรที่วิ่งได้ = เข็มไมล์ครั้งสุดท้าย − เข็มไมล์ยอดยกมา · น้ำมัน/ราคาที่ใช้คำนวณไม่รวมการเติมครั้งสุดท้าย
        </p>
      )}
    </div>
  )
}
