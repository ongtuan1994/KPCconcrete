import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { MixDesignReport } from '../../data/createdDocs'

function fmtCreated(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const PRIMARY = 'var(--kpc-primary)'
const PRIMARY_INK = 'var(--kpc-primary-ink)'
const PRIMARY_50 = 'var(--kpc-primary-50)'
const th: CSSProperties = { background: '#e9e9e9', color: '#111', borderColor: '#b8b8b8' }
const faint = '#9aa0a6'
const n = (v?: number) => (v ? v.toLocaleString() : '—')

/** Printable concrete mix-design report — themed, per-m³ quantities by product. */
export function MixDesignReportDoc({ report }: { report: MixDesignReport }) {
  const hasF = report.rows.some((r) => r.sikament)
  const hasPce = report.rows.some((r) => r.pce)
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>รายงานสูตรส่วนผสมคอนกรีต</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Mix Design ({report.scopeLabel})</div>
          <div style={{ fontSize: 11.5 }}>{report.rows.length} สูตร · ปริมาณต่อ 1 คิว</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="n" style={{ ...th, width: '4%' }}>ลำดับ</th>
            <th style={{ ...th, width: '14%' }}>รหัสสินค้า</th>
            <th style={th}>รายการ</th>
            <th className="c" style={{ ...th, width: '9%' }}>ปูน</th>
            <th className="n" style={{ ...th, width: '9%' }}>ปูน (กก.)</th>
            <th className="n" style={{ ...th, width: '9%' }}>ทราย (กก.)</th>
            <th className="n" style={{ ...th, width: '10%' }}>หิน (กก.)</th>
            <th className="n" style={{ ...th, width: '11%' }}>Plastomix (ล.)</th>
            {hasF && <th className="n" style={{ ...th, width: '10%' }}>Sikament (ล.)</th>}
            {hasPce && <th className="n" style={{ ...th, width: '8%' }}>PCE (ล.)</th>}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={r.code}>
              <td className="n mono">{i + 1}</td>
              <td className="mono">{r.code}</td>
              <td>{r.name}</td>
              <td className="c">{r.brand}</td>
              <td className="n mono">{n(r.cement)}</td>
              <td className="n mono">{n(r.sand)}</td>
              <td className="n mono">{n(r.aggregate)}</td>
              <td className="n mono">{n(r.plastomix)}</td>
              {hasF && <td className="n mono">{n(r.sikament)}</td>}
              {hasPce && <td className="n mono">{n(r.pce)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10, padding: '6px 10px', display: 'inline-block', background: PRIMARY_50, color: PRIMARY_INK, borderLeft: `3px solid ${PRIMARY}`, borderRadius: 2, fontSize: 11.5 }}>
        ปริมาณต่อ 1 คิว — ปูน/ทราย/หิน เป็นกิโลกรัม · น้ำยาเป็นลิตร
      </div>
    </div>
  )
}
