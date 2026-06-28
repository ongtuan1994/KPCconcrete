import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { PriceListReport } from '../../data/createdDocs'

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtCreated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* Company theme colours (mirrors the CSS vars in index.css). */
const PRIMARY = 'var(--kpc-primary)'
const PRIMARY_INK = 'var(--kpc-primary-ink)'
const PRIMARY_50 = 'var(--kpc-primary-50)'

const thStyle: CSSProperties = { background: PRIMARY, color: '#fff', borderColor: PRIMARY }
const faint = '#9aa0a6'

/** Printable product price-list report — themed in the KPC brand colour, with a
    logo, products grouped by category (หมวดหมู่), each group numbered from 1.
    Reuses the shared trip-report table layout (borders/padding). */
export function PriceListReportDoc({ report }: { report: PriceListReport }) {
  /* Show the การรับของ column only when at least one row actually has it. */
  const hasPickup = report.groups.some((g) => g.rows.some((r) => r.pickup))
  return (
    <div className="trip-report-sheet">
      {/* Themed header with logo */}
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>รายงานราคาสินค้า</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>({report.scopeLabel})</div>
          <div style={{ fontSize: 11.5 }}>ณ วันที่ {report.toLabel} · {report.totalItems} รายการ</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      {report.groups.map((g) => (
        <div key={g.label}>
          <div style={{
            fontWeight: 700, fontSize: 12.5, margin: '14px 0 5px', padding: '4px 10px',
            background: PRIMARY_50, color: PRIMARY_INK, borderLeft: `3px solid ${PRIMARY}`, borderRadius: 2,
          }}>
            {g.label} ({g.rows.length} รายการ)
          </div>
          <table className="trr-table">
            <thead>
              <tr>
                <th className="n" style={{ ...thStyle, width: '5%' }}>ลำดับ</th>
                <th style={{ ...thStyle, width: '15%' }}>รหัสสินค้า</th>
                <th style={thStyle}>รายการ</th>
                <th className="c" style={{ ...thStyle, width: '11%' }}>ปูนซีเมนต์</th>
                <th className="c" style={{ ...thStyle, width: '15%' }}>ระยะส่ง</th>
                <th className="c" style={{ ...thStyle, width: '8%' }}>หน่วย</th>
                {hasPickup && <th className="c" style={{ ...thStyle, width: '10%' }}>การรับของ</th>}
                <th className="n" style={{ ...thStyle, width: '12%' }}>ราคา/หน่วย</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r.code}>
                  <td className="n mono">{i + 1}</td>
                  <td className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  <td className="c">{r.brand || <span style={{ color: faint }}>—</span>}</td>
                  <td className="c">{r.zone || <span style={{ color: faint }}>—</span>}</td>
                  <td className="c">{r.unit}</td>
                  {hasPickup && <td className="c">{r.pickup || <span style={{ color: faint }}>—</span>}</td>}
                  <td className="n mono">{r.price ? money(r.price) : 'ภายใน'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
