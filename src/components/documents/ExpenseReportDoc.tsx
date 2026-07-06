import { COMPANY } from '../../data/real'
import type { ExpenseReport } from '../../data/createdDocs'

const money = (n: number) => (n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Printable monthly expense report — months down the rows, the 7 expense
    categories across the columns (ลง VAT vouchers only). */
export function ExpenseReportDoc({ report }: { report: ExpenseReport }) {
  return (
    <div className="trip-report-sheet">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">รายงานค่าใช้จ่ายรายเดือน (ลง VAT)</div>
          <div className="trr-range">{report.fromLabel} – {report.toLabel}</div>
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table trr-detail">
        <thead>
          <tr>
            <th>เดือน</th>
            {report.categories.map((c) => <th key={c} className="n">{c}</th>)}
            <th className="n">รวม</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              {r.values.map((v, i) => <td key={i} className="n mono">{money(v)}</td>)}
              <td className="n mono" style={{ fontWeight: 700 }}>{money(r.total)}</td>
            </tr>
          ))}
          <tr className="trr-total">
            <td>รวมทั้งสิ้น</td>
            {report.colTotals.map((v, i) => <td key={i} className="n mono">{money(v)}</td>)}
            <td className="n mono">{money(report.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 10, color: '#6b7280', marginTop: 8 }}>* ยอดเงินเป็นจำนวนที่จ่ายจริง (รวม VAT) จากใบสำคัญจ่ายที่ลง VAT · ไม่รวมประเภท "ค่าซื้อวัตถุดิบ"</p>
    </div>
  )
}
