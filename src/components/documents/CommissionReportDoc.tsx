import { COMPANY } from '../../data/real'
import { qm } from '../../data/selectors'
import type { CommissionReport } from '../../data/createdDocs'

const num2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Printable sales-commission report, mirroring the company's paper form.
    Commission per employee = rate (บาท/คิว) × ยอดขายให้ลูกค้า (คิว), paid only
    when the volume qualifies. Reuses the general-report sheet styling. */
export function CommissionReportDoc({ report }: { report: CommissionReport }) {
  return (
    <div className="trip-report-sheet">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">ค่าคอมมิชชั่นยอดขายตามเป้าหมาย</div>
          <div className="trr-range">ช่วงวันที่ {report.fromLabel} ถึง {report.toLabel}</div>
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 10px' }}>
        <div style={{ fontSize: 13 }}>
          ยอดขายปูนให้ลูกค้า (ตามเป้าหมาย) : <strong style={{ fontSize: 15 }}>{qm(report.volumeM3)}</strong> คิว
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: report.qualifies ? '#15803d' : '#b91c1c' }}>{report.status}</div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="c" style={{ width: 40 }}>ที่</th>
            <th>ฝ่าย / แผนก</th>
            <th className="n" style={{ width: 110 }}>บาท/คิว</th>
            <th className="n" style={{ width: 140 }}>รวม บาท</th>
            <th style={{ width: 120 }}>Remark</th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((l, i) => (
            <tr key={i}>
              <td className="c">{i + 1}</td>
              <td>{l.name}</td>
              <td className="n mono">{num2(l.rate)}</td>
              <td className="n mono">{num2(l.amount)}</td>
              <td></td>
            </tr>
          ))}
          <tr className="trr-total">
            <td colSpan={3} className="c">รวมทั้งหมด</td>
            <td className="n mono">{num2(report.total)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div className="trr-section">สรุปยอดค่าคอมมิชชั่น</div>
      <table className="trr-table" style={{ maxWidth: 460 }}>
        <tbody>
          <tr><td>ค่ารักษามาตรฐานก้อนปูน</td><td className="n mono" style={{ width: 140 }}>—</td><td style={{ width: 50 }}>บาท</td></tr>
          <tr><td>ค่ายอดขายตามเป้าหมายที่ตั้งไว้</td><td className="n mono">{num2(report.total)}</td><td>บาท</td></tr>
          <tr className="trr-total"><td>รวม</td><td className="n mono">{num2(report.total)}</td><td>บาท</td></tr>
        </tbody>
      </table>
    </div>
  )
}
