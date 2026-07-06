import { Fragment } from 'react'
import { COMPANY } from '../../data/real'
import type { AttendanceReport, AttendanceReportDay } from '../../data/createdDocs'

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const leaveLabel = (l: AttendanceReportDay['leave']) => (l === 'morning' ? 'ลาเช้า' : l === 'afternoon' ? 'ลาบ่าย' : '')
const forgotLabel = (f: AttendanceReportDay['forgot']) => (f === 'in' ? 'ลืมขาเข้า' : f === 'out' ? 'ลืมขาออก' : '')

/** Group the flat daily list into consecutive per-employee blocks (it arrives
    already sorted by empId then date). */
function groupByEmployee(days: AttendanceReportDay[]): { empId: string; empName: string; rows: AttendanceReportDay[] }[] {
  const out: { empId: string; empName: string; rows: AttendanceReportDay[] }[] = []
  for (const d of days) {
    const g = out[out.length - 1]
    if (g && g.empId === d.empId) g.rows.push(d)
    else out.push({ empId: d.empId, empName: d.empName, rows: [d] })
  }
  return out
}

/** Printable time-attendance summary: per-employee จำนวนวันมา / สายรวม / OT.
    OT shows "-" for employees configured ไม่ร่วม OT. Reuses the general-report
    sheet styling. */
export function AttendanceReportDoc({ report }: { report: AttendanceReport }) {
  return (
    <div className="trip-report-sheet att-report">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">สรุปการลงเวลาทำงาน</div>
          <div className="trr-range">ช่วงที่เลือก {report.fromLabel} ถึง {report.toLabel}</div>
          {(report.dataFromLabel || report.dataToLabel) && (
            <div className="trr-range" style={{ fontSize: 11 }}>
              ดึงข้อมูลตั้งแต่ {report.dataFromLabel ?? '—'} ถึงข้อมูลล่าสุด {report.dataToLabel ?? '—'}
            </div>
          )}
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="c" style={{ width: 40 }}>ที่</th>
            <th style={{ width: 70 }}>รหัส</th>
            <th>ชื่อ-สกุล</th>
            <th className="n" style={{ width: 75 }}>มา (วัน)</th>
            <th className="n" style={{ width: 65 }}>ลา (วัน)</th>
            <th className="n" style={{ width: 90 }}>สายรวม (นาที)</th>
            <th className="n" style={{ width: 85 }}>ลืมลงเวลา (ครั้ง)</th>
            <th className="n" style={{ width: 95 }}>ล่วงเวลา (นาที)</th>
            <th className="n" style={{ width: 90 }}>OT สุทธิ (นาที)</th>
          </tr>
        </thead>
        <tbody>
          {report.employees.map((e, i) => (
            <tr key={e.empId}>
              <td className="c">{i + 1}</td>
              <td className="mono">{e.empId}</td>
              <td>{e.empName}</td>
              <td className="n mono">{e.days}</td>
              <td className="n mono">{(e.leaveDays ?? 0) > 0 ? e.leaveDays : '-'}</td>
              <td className="n mono">{e.lateMin}</td>
              <td className="n mono" style={(e.forgotCount ?? 0) > 0 ? { color: '#b45309', fontWeight: 600 } : undefined}>{e.forgotCount ?? 0}</td>
              <td className="n mono">{e.otRawMin ?? 0}</td>
              <td className="n mono">{e.otEligible ? e.otMin : '-'}</td>
            </tr>
          ))}
          <tr className="trr-total">
            <td colSpan={3} className="c">รวมทั้งหมด ({report.totals.employees} คน)</td>
            <td className="n mono">{report.totals.days}</td>
            <td className="n mono">{report.totals.leaveDays ?? 0}</td>
            <td className="n mono">{report.totals.lateMin}</td>
            <td className="n mono">{report.totals.forgotCount ?? 0}</td>
            <td className="n mono">{report.totals.otRawMin ?? 0}</td>
            <td className="n mono">{report.totals.otMin}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>
        * ล่วงเวลาบันทึกให้ทุกคน · OT สุทธิ แสดง "-" สำหรับพนักงานที่ตั้งค่าไม่ร่วม OT · OT สุทธิ = ล่วงเวลา − สาย (คิดต่อวัน ไม่ติดลบ)<br />
        * "ลืมลงเวลา" = จำนวนวันที่ลืมขาเข้า/ขาออก (ระบบเติมเวลามาตรฐานให้) · วันที่ลืมลงเวลาจะไม่คิด OT ยกเว้นผู้จัดการ
      </div>

      {report.days && report.days.length > 0 && (
        <div className="att-daily">
          <div className="trr-section">รายละเอียดการเข้า–ออกรายวัน (เรียงตามพนักงาน)</div>
          <table className="trr-table">
            <thead>
              <tr>
                <th className="c" style={{ width: 32 }}>ที่</th>
                <th style={{ width: 95 }}>วันที่</th>
                <th className="c" style={{ width: 55 }}>ลา</th>
                <th className="c" style={{ width: 60 }}>เข้า</th>
                <th className="c" style={{ width: 60 }}>ออก</th>
                <th className="c" style={{ width: 75 }}>ลืมลงเวลา</th>
                <th className="n" style={{ width: 80 }}>ล่วงเวลา (นาที)</th>
                <th className="n" style={{ width: 80 }}>สาย (นาที)</th>
                <th className="n" style={{ width: 80 }}>OT (นาที)</th>
                <th className="c" style={{ width: 70 }}>แหล่ง</th>
              </tr>
            </thead>
            <tbody>
              {groupByEmployee(report.days).map((g) => {
                const sumOtRaw = g.rows.reduce((s, d) => s + d.otRawMin, 0)
                const sumLate = g.rows.reduce((s, d) => s + d.lateMin, 0)
                const sumOt = g.rows.reduce((s, d) => s + d.otMin, 0)
                return (
                  <Fragment key={g.empId}>
                    <tr className="trr-total">
                      <td colSpan={10}>{g.empId} · {g.empName}</td>
                    </tr>
                    {g.rows.map((d, i) => (
                      <tr key={`${g.empId}-${d.date}-${i}`}>
                        <td className="c">{i + 1}</td>
                        <td className="mono">{d.date}</td>
                        <td className="c">{leaveLabel(d.leave) || '—'}</td>
                        <td className="c mono">{d.clockIn || '—'}</td>
                        <td className="c mono">{d.clockOut || '—'}</td>
                        <td className="c" style={d.forgot ? { color: '#b45309', fontWeight: 600 } : undefined}>{forgotLabel(d.forgot) || '—'}</td>
                        <td className="n mono">{d.otRawMin || '—'}</td>
                        <td className="n mono">{d.lateMin || '—'}</td>
                        <td className="n mono">{d.otMin || '—'}</td>
                        <td className="c">{d.source === 'scan' ? 'สแกน' : 'บันทึกเอง'}</td>
                      </tr>
                    ))}
                    <tr className="trr-total">
                      <td colSpan={6} className="c">รวม {g.empName} · {g.rows.length} วัน</td>
                      <td className="n mono">{sumOtRaw}</td>
                      <td className="n mono">{sumLate}</td>
                      <td className="n mono">{sumOt}</td>
                      <td />
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
            * วันที่มีเครื่องหมายในช่อง "ลืมลงเวลา" ระบบเติมเวลามาตรฐานให้ · OT (นาที) คิดสุทธิต่อวัน หลังหักสาย
          </div>
        </div>
      )}
    </div>
  )
}
