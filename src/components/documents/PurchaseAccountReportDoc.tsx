import { COMPANY } from '../../data/real'
import type { PurchaseAccountReport, PurchaseSiteAmount } from '../../data/createdDocs'

const money = (n: number) => (n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* A left divider that visually splits แพล้นปูน (left) from โรงหล่อ (right). */
const divider = { borderLeft: '2px solid #9ca3af' }

function siteCells(s: PurchaseSiteAmount, first = false) {
  return (
    <>
      <td className="n mono" style={first ? divider : undefined}>{money(s.base)}</td>
      <td className="n mono">{money(s.vat)}</td>
      <td className="n mono" style={{ fontWeight: 600 }}>{money(s.total)}</td>
    </>
  )
}

/** Printable purchase account (บัญชีซื้อสินค้า · ค่าซื้อวัตถุดิบ ลง VAT) — one row
    per month, split left = แพล้นปูน, right = โรงหล่อ, each broken into
    มูลค่า (ก่อน VAT) / ภาษี / รวม. */
export function PurchaseAccountReportDoc({ report }: { report: PurchaseAccountReport }) {
  return (
    <div className="trip-report-sheet">
      <div className="trr-head">
        <div>
          <div className="trr-co">{COMPANY.name}</div>
          <div className="trr-sub">{COMPANY.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="trr-title">บัญชีซื้อสินค้า (ค่าซื้อวัตถุดิบ · ลง VAT)</div>
          <div className="trr-range">{report.fromLabel} – {report.toLabel}</div>
          <div className="trr-meta">สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table trr-detail">
        <thead>
          <tr>
            <th rowSpan={2}>เดือน</th>
            <th colSpan={3} className="c" style={divider}>แพล้นปูน</th>
            <th colSpan={3} className="c" style={divider}>โรงหล่อ</th>
          </tr>
          <tr>
            <th className="n" style={divider}>มูลค่า</th><th className="n">ภาษี 7%</th><th className="n">รวม</th>
            <th className="n" style={divider}>มูลค่า</th><th className="n">ภาษี 7%</th><th className="n">รวม</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              {siteCells(r.plant, true)}
              {siteCells(r.foundry, true)}
            </tr>
          ))}
          <tr className="trr-total">
            <td>รวมทั้งสิ้น</td>
            {siteCells(report.totals.plant, true)}
            {siteCells(report.totals.foundry, true)}
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 10, color: '#6b7280', marginTop: 8 }}>* เฉพาะใบสำคัญจ่ายประเภท "ค่าซื้อวัตถุดิบ" ที่ลง VAT · มูลค่า = ยอดก่อน VAT (จ่ายจริง ÷ 1.07) · แบ่งตาม SITE ที่รับวัตถุดิบ</p>
    </div>
  )
}
