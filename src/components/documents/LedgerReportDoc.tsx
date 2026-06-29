import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import { baht, qm } from '../../data/selectors'
import type { LedgerReport } from '../../data/createdDocs'

function fmtCreated(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const PRIMARY = 'var(--kpc-primary)'
const PRIMARY_INK = 'var(--kpc-primary-ink)'
const th: CSSProperties = { background: '#e9e9e9', color: '#111', borderColor: '#b8b8b8' }
const faint = '#9aa0a6'

/** Printable ลูกหนี้ / เจ้าหนี้ snapshot. Columns differ per side: debtors carry
    ใบจ่าย / ปริมาณ / ยอดซื้อ, creditors carry เงื่อนไขชำระ. */
export function LedgerReportDoc({ report }: { report: LedgerReport }) {
  const isDebtors = report.side === 'debtors'
  const heading = isDebtors ? 'รายงานลูกหนี้' : 'รายงานเจ้าหนี้'
  const nameHeader = isDebtors ? 'ลูกค้า / หน่วยงาน' : 'ชื่อเจ้าหนี้'
  return (
    <div className="trip-report-sheet">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
        borderBottom: `2.5px solid ${PRIMARY}`, paddingBottom: 10, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img src="/logo.jpg" alt="KPC" style={{ width: 72, height: 'auto', objectFit: 'contain', flex: 'none' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: PRIMARY_INK }}>{COMPANY.name}</div>
            <div style={{ fontSize: 11, color: '#444' }}>({COMPANY.branch}) {COMPANY.address}</div>
            <div style={{ fontSize: 11, color: '#444' }}>เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.tel}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>{heading}</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{isDebtors ? 'Debtors / Accounts Receivable' : 'Creditors / Accounts Payable'}</div>
          <div style={{ fontSize: 11.5 }}>{report.scopeLabel} · {report.rows.length} ราย</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="n" style={{ ...th, width: '5%' }}>ลำดับ</th>
            <th style={th}>{nameHeader}</th>
            {!isDebtors && <th className="c" style={{ ...th, width: '14%' }}>เงื่อนไขชำระ</th>}
            {isDebtors && <th className="n" style={{ ...th, width: '8%' }}>ใบจ่าย</th>}
            {isDebtors && <th className="n" style={{ ...th, width: '11%' }}>ปริมาณ (m³)</th>}
            {isDebtors && <th className="n" style={{ ...th, width: '13%' }}>ยอดซื้อ</th>}
            <th className="n" style={{ ...th, width: '13%' }}>ค้างชำระ</th>
            <th className="c" style={{ ...th, width: '13%' }}>วันครบกำหนด</th>
            <th className="c" style={{ ...th, width: '14%' }}>สถานะการชำระ</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={`${r.name}-${i}`}>
              <td className="n mono">{i + 1}</td>
              <td>{r.name}{r.detail ? <span style={{ color: faint, fontSize: 10.5 }}> · {r.detail}</span> : ''}</td>
              {!isDebtors && <td className="c">{r.terms || '—'}</td>}
              {isDebtors && <td className="n mono">{r.tickets ?? 0}</td>}
              {isDebtors && <td className="n mono">{qm(r.m3 ?? 0)}</td>}
              {isDebtors && <td className="n mono">{baht(r.sales ?? 0)}</td>}
              <td className="n mono" style={{ fontWeight: r.outstanding > 0 ? 700 : 400, color: r.outstanding > 0 ? '#b91c1c' : faint }}>
                {r.outstanding > 0 ? baht(r.outstanding) : '—'}
              </td>
              <td className="c mono" style={{ fontSize: 11 }}>{r.dueLabel || '—'}</td>
              <td className="c" style={{ color: r.overdue ? '#b91c1c' : '#111', fontWeight: r.overdue ? 600 : 400 }}>{r.status}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="c" style={{ ...th, fontWeight: 700 }} colSpan={isDebtors ? 4 : 2}>รวม {report.totals.count} ราย · เลยกำหนด {report.totals.overdue} ราย</td>
            {isDebtors && <td className="n mono" style={{ ...th, fontWeight: 700 }}>{baht(report.totals.sales ?? 0)}</td>}
            <td className="n mono" style={{ ...th, fontWeight: 700, color: '#b91c1c' }}>{baht(report.totals.outstanding)}</td>
            <td style={th} colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
