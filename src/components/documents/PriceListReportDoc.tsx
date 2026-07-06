import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { PriceListReport, PriceListReportRow } from '../../data/createdDocs'

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

const thStyle: CSSProperties = { background: '#e9e9e9', color: '#111', borderColor: '#b8b8b8' }
const faint = '#9aa0a6'
const RED = '#d32f2f'

/** Ready-mixed concrete rows are further split by delivery-distance range, from
    the product-code prefix (On Site = KPCROS/KPCR2OS; the Over tiers = KPCR?2?OV
    21/31/41). Anything else falls into a trailing "อื่นๆ" sub-table. */
const DISTANCE_GROUPS: { label: string; test: (code: string) => boolean }[] = [
  { label: 'On Site', test: (c) => /^KPCR2?OS/i.test(c) },
  { label: 'Over 21–30', test: (c) => /^KPCR2?OV21/i.test(c) },
  { label: 'Over 31–40', test: (c) => /^KPCR2?OV31/i.test(c) },
  { label: 'Over 41–50', test: (c) => /^KPCR2?OV41/i.test(c) },
]

/** The four fixed distance sections (always present so an empty range shows
    "ไม่มี") plus อื่นๆ only when it actually has rows. */
function byDistance(rows: PriceListReportRow[]): { label: string; rows: PriceListReportRow[] }[] {
  const out = DISTANCE_GROUPS.map((g) => ({ label: g.label, rows: rows.filter((r) => g.test(r.code)) }))
  const matched = new Set(out.flatMap((o) => o.rows))
  const other = rows.filter((r) => !matched.has(r))
  if (other.length) out.push({ label: 'อื่นๆ', rows: other })
  return out
}

/** One price table. Empty groups render a red "ไม่มี" row. Foundry items priced
    per collection method show both ราคา (รับเอง / จัดส่ง) in the price cell. */
function PriceTable({ rows }: { rows: PriceListReportRow[] }) {
  return (
    <table className="trr-table">
      <thead>
        <tr>
          <th className="n" style={{ ...thStyle, width: '5%' }}>ลำดับ</th>
          <th style={{ ...thStyle, width: '11%' }}>สูตรการผลิต</th>
          <th style={{ ...thStyle, width: '14%' }}>รหัสสินค้า</th>
          <th style={thStyle}>รายการ</th>
          <th className="c" style={{ ...thStyle, width: '11%' }}>ปูนซีเมนต์</th>
          <th className="c" style={{ ...thStyle, width: '15%' }}>ระยะส่ง</th>
          <th className="c" style={{ ...thStyle, width: '8%' }}>หน่วย</th>
          <th className="n" style={{ ...thStyle, width: '15%' }}>ราคา/หน่วย</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="c" colSpan={8} style={{ color: RED, fontWeight: 700 }}>ไม่มี</td>
          </tr>
        ) : rows.map((r, i) => (
          <tr key={r.code}>
            <td className="n mono">{i + 1}</td>
            <td className="mono">{r.formulaNo || <span style={{ color: RED, fontWeight: 700 }}>ไม่มี</span>}</td>
            <td className="mono">{r.code}</td>
            <td>{r.name}</td>
            <td className="c">{r.brand || <span style={{ color: faint }}>—</span>}</td>
            <td className="c">{r.zone || <span style={{ color: faint }}>—</span>}</td>
            <td className="c">{r.unit}</td>
            <td className="n mono">
              {r.pickupPrices ? (
                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <span>รับเอง <strong>{money(r.pickupPrices['รับเอง'])}</strong></span>
                  <span>จัดส่ง <strong>{money(r.pickupPrices['จัดส่ง'])}</strong></span>
                </span>
              ) : (r.price ? money(r.price) : 'ภายใน')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Printable product price-list report — themed in the KPC brand colour, with a
    logo, products grouped by category (หมวดหมู่). The คอนกรีตผสมเสร็จ category is
    further split into separate tables per delivery-distance range. */
export function PriceListReportDoc({ report }: { report: PriceListReport }) {
  return (
    <div className="trip-report-sheet price-list-report">
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

      {report.groups.map((g) => {
        const isConcrete = g.label.includes('คอนกรีตผสมเสร็จ')
        return (
          <div key={g.label}>
            <div style={{
              fontWeight: 700, fontSize: 12.5, margin: '14px 0 5px', padding: '4px 10px',
              background: PRIMARY_50, color: PRIMARY_INK, borderLeft: `3px solid ${PRIMARY}`, borderRadius: 2,
            }}>
              {g.label} ({g.rows.length} รายการ)
            </div>
            {isConcrete ? (
              byDistance(g.rows).map((sub) => (
                <div key={sub.label} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: PRIMARY_INK, margin: '8px 0 4px', paddingLeft: 8, borderLeft: `3px solid ${PRIMARY}` }}>
                    {sub.label} <span style={{ fontWeight: 400, color: faint, fontSize: 11 }}>· {sub.rows.length} รายการ</span>
                  </div>
                  <PriceTable rows={sub.rows} />
                </div>
              ))
            ) : (
              <PriceTable rows={g.rows} />
            )}
          </div>
        )
      })}
    </div>
  )
}
