import { bahtText } from '../../data/bahtText'
import { COMPANY } from '../../data/real'
import type { MidMonthAdvanceReport, MidMonthAdvanceSection } from '../../data/createdDocs'

/** Amount formatter — 6000 → "6,000.00", 0 → "-" (matches the printed sheet). */
const n = (v: number) => (v ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-')

/** One A4 page of the mid-month advance report (one เดือน, one work group).
    Mirrors the company's Excel sheet: centered heading, ประจำเดือน line, a
    full-grid table, a รวมเงินที่เบิก row with the amount spelled out in Thai,
    and a ผู้จ่าย signature line. */
function AdvancePage({ section, monthLabel }: { section: MidMonthAdvanceSection; monthLabel: string }) {
  return (
    <>
      <div className="adv-head">
        <img src="/logo.jpg" alt="KPC กิจไพศาลคอนกรีต" className="adv-logo" />
        <div className="adv-co">
          <div className="adv-co-name">{COMPANY.name}</div>
          <div className="adv-co-line">({COMPANY.branch}) {COMPANY.address}</div>
          <div className="adv-co-line">เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.tel}</div>
        </div>
      </div>

      <div className="adv-title">{section.heading}</div>
      <div className="adv-month">ประจำเดือน {monthLabel}</div>

      <table className="adv-table">
        <thead>
          <tr>
            <th className="c" style={{ width: '7%' }}>ลำดับที่</th>
            <th className="c" style={{ width: '12%' }}>วันที่</th>
            <th style={{ width: '30%' }}>ชื่อ-สกุล</th>
            <th className="c" style={{ width: '10%' }}>ชื่อเล่น</th>
            <th className="c" style={{ width: '14%' }}>พนักงาน</th>
            <th className="r" style={{ width: '15%' }}>จำนวนเงิน</th>
            <th className="c" style={{ width: '12%' }}>ผู้รับเงิน</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((r, i) => (
            <tr key={r.employeeId}>
              <td className="c">{i + 1}</td>
              <td className="c mono">{r.date}</td>
              <td>{r.name}</td>
              <td className="c">{r.nickname || ''}</td>
              <td className="c">{r.role}</td>
              <td className="r mono">{n(r.amount)}</td>
              <td className="c">{r.receiver || ''}</td>
            </tr>
          ))}
          <tr className="adv-total">
            <td className="c" colSpan={2}>รวมเงินที่เบิก</td>
            <td className="c" colSpan={3}>{bahtText(section.total)}</td>
            <td className="r mono">{n(section.total)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <div className="adv-sign">ผู้จ่าย.................................................................</div>
    </>
  )
}

/** Printable mid-month salary-advance report — one page per work group
    (แพล้นปูน คนไทย + โรงหล่อ คนงานพม่า), each on its own sheet of paper. */
export function MidMonthAdvanceReportDoc({ report }: { report: MidMonthAdvanceReport }) {
  return (
    <div className="trip-report-sheet advance-report">
      {report.sections.map((sec, i) => (
        <div key={sec.key} className={i > 0 ? 'advance-page-sheet advance-break' : 'advance-page-sheet'}>
          <AdvancePage section={sec} monthLabel={report.monthLabel} />
        </div>
      ))}
    </div>
  )
}
