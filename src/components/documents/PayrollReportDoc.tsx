import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { PayrollReport } from '../../data/createdDocs'

const n = (v: number) => (v ? v.toLocaleString('en-US') : '-')

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* Company theme colour used only for the header band; the table itself uses a
   neutral light-grey header with clear black text for readability. */
const PRIMARY = 'var(--kpc-primary)'
const PRIMARY_INK = 'var(--kpc-primary-ink)'
const GREY_HEAD = '#e9e9e9'   /* sub-column header */
const GREY_GROUP = '#d6d6d6'   /* รายการรับ / รายการหัก group header */
const GREY_TOTAL = '#f1f1f1'   /* totals row / grand-total box */
const th: CSSProperties = { background: GREY_HEAD, color: '#111', borderColor: '#b8b8b8' }
const grp: CSSProperties = { background: GREY_GROUP, color: '#111', borderColor: '#b8b8b8' }

/** Printable payroll payout report (รายงานการจ่ายเงินเดือน) — themed in the KPC
    brand colour, grouped into รายการรับ / รายการหัก with a totals row and the
    grand "รวมรายการเบิกจ่ายเงินทั้งสิ้น". Daily-wage columns appear only when the
    group contains day-rate workers (e.g. แรงงานพม่า โรงหล่อ). */
export function PayrollReportDoc({ report }: { report: PayrollReport }) {
  const showDaily = report.rows.some((r) => r.daysWorked != null || r.dailyWage != null)
  /* Leading columns: # + name + dept (+ days + dailyWage). */
  const leadCols = 3 + (showDaily ? 2 : 0)
  const t = report.totals

  return (
    <div className="trip-report-sheet">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
        borderBottom: `2.5px solid ${PRIMARY}`, paddingBottom: 10, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img src="/logo.jpg" alt="KPC กิจไพศาลคอนกรีต" style={{ width: 72, height: 'auto', objectFit: 'contain', flex: 'none' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: PRIMARY_INK }}>{COMPANY.name}</div>
            <div style={{ fontSize: 11, color: '#444' }}>({COMPANY.branch}) {COMPANY.address}</div>
            <div style={{ fontSize: 11, color: '#444' }}>เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.tel}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>รายงานการจ่ายเงินเดือน</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>({report.scopeLabel})</div>
          <div style={{ fontSize: 11.5 }}>ประจำเดือน {report.payMonthLabel} · {report.rows.length} คน</div>
          <div style={{ fontSize: 10.5, color: '#9aa0a6' }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th rowSpan={2} className="n" style={{ ...th, width: '4%' }}>ลำดับ</th>
            <th rowSpan={2} style={th}>ชื่อ-สกุล</th>
            <th rowSpan={2} className="c" style={th}>ฝ่าย</th>
            {showDaily && <th rowSpan={2} className="n" style={th}>วันทำงาน</th>}
            {showDaily && <th rowSpan={2} className="n" style={th}>ค่าแรง/วัน</th>}
            <th colSpan={6} className="c" style={grp}>รายการรับ</th>
            <th colSpan={4} className="c" style={grp}>รายการหัก</th>
            <th rowSpan={2} className="n" style={th}>เงินได้สุทธิ</th>
          </tr>
          <tr>
            <th className="n" style={th}>เงินเดือน</th>
            <th className="n" style={th}>ประสบการณ์</th>
            <th className="n" style={th}>เงินพิเศษ</th>
            <th className="n" style={th}>OT / ค่าเที่ยว</th>
            <th className="n" style={th}>อื่นๆ</th>
            <th className="n" style={th}>รวมรับ</th>
            <th className="n" style={th}>ปกส.</th>
            <th className="n" style={th}>เบิกล่วงหน้า</th>
            <th className="n" style={th}>อื่นๆ</th>
            <th className="n" style={th}>รวมหัก</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={r.ppNo}>
              <td className="n mono">{i + 1}</td>
              <td>{r.employeeName}</td>
              <td className="c">{r.department || '-'}</td>
              {showDaily && <td className="n mono">{r.daysWorked ?? '-'}</td>}
              {showDaily && <td className="n mono">{n(r.dailyWage ?? 0)}</td>}
              <td className="n mono">{n(r.baseSalary)}</td>
              <td className="n mono">{n(r.experiencePay)}</td>
              <td className="n mono">{n(r.specialPay)}</td>
              <td className="n mono">{n(r.vehiclePay)}</td>
              <td className="n mono">{n(r.otherIncome)}</td>
              <td className="n mono"><strong>{n(r.totalIncome)}</strong></td>
              <td className="n mono">{n(r.socialSecurity)}</td>
              <td className="n mono">{n(r.advance)}</td>
              <td className="n mono">{n(r.otherDeduction)}</td>
              <td className="n mono">{n(r.totalDeduction)}</td>
              <td className="n mono"><strong>{n(r.netAmount)}</strong></td>
            </tr>
          ))}
          <tr style={{ background: GREY_TOTAL, fontWeight: 700, color: '#111' }}>
            <td className="c" colSpan={leadCols}>รวม</td>
            <td className="n mono" colSpan={5} />
            <td className="n mono">{n(t.income)}</td>
            <td className="n mono" colSpan={3} />
            <td className="n mono">{n(t.deduction)}</td>
            <td className="n mono">{n(t.net)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{
        marginTop: 14, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16,
        fontSize: 14, fontWeight: 700, color: '#111',
      }}>
        <span>รวมรายการเบิกจ่ายเงินทั้งสิ้น</span>
        <span style={{
          minWidth: 140, textAlign: 'right', padding: '6px 14px',
          background: GREY_TOTAL, border: '1px solid #b8b8b8', borderRadius: 4,
        }} className="mono">{n(t.net)} บาท</span>
      </div>
    </div>
  )
}
