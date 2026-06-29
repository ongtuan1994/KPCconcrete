import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { EmployeeReport } from '../../data/createdDocs'

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

/** Printable employee-roster report — one row per employee with role, ฝ่าย,
    contact + bank details and years of service. */
export function EmployeeReportDoc({ report }: { report: EmployeeReport }) {
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>รายงานรายชื่อพนักงาน</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Employee List</div>
          <div style={{ fontSize: 11.5 }}>{report.scopeLabel} · {report.totals.count} คน</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="n" style={{ ...th, width: '4%' }}>ลำดับ</th>
            <th style={{ ...th, width: '7%' }}>รหัส</th>
            <th style={th}>ชื่อ-สกุล</th>
            <th style={th}>ตำแหน่ง</th>
            <th className="c" style={{ ...th, width: '9%' }}>ฝ่าย</th>
            <th className="c" style={{ ...th, width: '8%' }}>Site</th>
            <th className="c" style={{ ...th, width: '7%' }}>สัญชาติ</th>
            <th style={{ ...th, width: '10%' }}>เบอร์ติดต่อ</th>
            <th style={{ ...th, width: '14%' }}>บัญชีธนาคาร</th>
            <th className="c" style={{ ...th, width: '10%' }}>วันเริ่มงาน</th>
            <th className="c" style={{ ...th, width: '8%' }}>อายุงาน</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={r.id} style={r.terminated ? { background: '#e5e7eb', color: '#6b7280' } : undefined}>
              <td className="n mono">{i + 1}</td>
              <td className="mono">{r.id}</td>
              <td>
                {r.name}{r.nickname ? <span style={{ color: faint }}> ({r.nickname})</span> : ''}
                {r.terminated ? <span style={{ color: '#6b7280', fontWeight: 600 }}> · พ้นสภาพ</span> : ''}
              </td>
              <td>{r.role}</td>
              <td className="c">{r.department}</td>
              <td className="c">{r.site || '—'}</td>
              <td className="c">{r.nationality || '—'}</td>
              <td className="mono" style={{ fontSize: 11 }}>{r.phone || '—'}</td>
              <td style={{ fontSize: 11 }}>
                {r.bankName || r.bankAccount
                  ? <>{r.bankName || ''}{r.bankAccount ? <span className="mono" style={{ color: faint }}> {r.bankAccount}</span> : ''}</>
                  : '—'}
              </td>
              <td className="c mono" style={{ fontSize: 11 }}>{r.startDate || '—'}</td>
              <td className="c mono">{r.years || '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="c" style={{ ...th, fontWeight: 700 }} colSpan={11}>
              รวม {report.totals.count} คน · ปฏิบัติงาน {report.totals.active} คน · พ้นสภาพ {report.totals.terminated} คน
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
