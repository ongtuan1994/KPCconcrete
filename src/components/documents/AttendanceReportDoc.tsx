import { COMPANY } from '../../data/real'
import type { AttendanceReport } from '../../data/createdDocs'

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Printable time-attendance summary: per-employee จำนวนวันมา / สายรวม / OT.
    OT shows "-" for employees configured ไม่ร่วม OT. Reuses the general-report
    sheet styling. */
export function AttendanceReportDoc({ report }: { report: AttendanceReport }) {
  return (
    <div className="trip-report-sheet">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">สรุปการลงเวลาทำงาน</div>
          <div className="trr-range">ช่วงวันที่ {report.fromLabel} ถึง {report.toLabel}</div>
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="c" style={{ width: 40 }}>ที่</th>
            <th style={{ width: 70 }}>รหัส</th>
            <th>ชื่อ-สกุล</th>
            <th className="n" style={{ width: 90 }}>มา (วัน)</th>
            <th className="n" style={{ width: 110 }}>สายรวม (นาที)</th>
            <th className="n" style={{ width: 110 }}>OT (นาที)</th>
          </tr>
        </thead>
        <tbody>
          {report.employees.map((e, i) => (
            <tr key={e.empId}>
              <td className="c">{i + 1}</td>
              <td className="mono">{e.empId}</td>
              <td>{e.empName}</td>
              <td className="n mono">{e.days}</td>
              <td className="n mono">{e.lateMin}</td>
              <td className="n mono">{e.otEligible ? e.otMin : '-'}</td>
            </tr>
          ))}
          <tr className="trr-total">
            <td colSpan={3} className="c">รวมทั้งหมด ({report.totals.employees} คน)</td>
            <td className="n mono">{report.totals.days}</td>
            <td className="n mono">{report.totals.lateMin}</td>
            <td className="n mono">{report.totals.otMin}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>
        * OT แสดงเป็น "-" สำหรับพนักงานที่ตั้งค่าไม่ร่วม OT · OT คิดสุทธิหลังหักสาย
      </div>
    </div>
  )
}
