import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { MixDesignReport, MixDesignReportRow } from '../../data/createdDocs'

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
const RED = '#d32f2f'
const n = (v?: number) => (v ? v.toLocaleString() : '—')

/** Delivery-distance sections, split by the mix-design code prefix:
    On Site (KPCROS / KPCR2OS) then the Over 21–30 / 31–40 / 41–50 km tiers
    (KPCR?2?OV21/31/41). Anything else falls into a trailing "อื่นๆ" section. */
const DISTANCE_GROUPS: { label: string; test: (code: string) => boolean }[] = [
  { label: 'On Site', test: (c) => /^KPCR2?OS/i.test(c) },
  { label: 'Over 21–30 กม.', test: (c) => /^KPCR2?OV21/i.test(c) },
  { label: 'Over 31–40 กม.', test: (c) => /^KPCR2?OV31/i.test(c) },
  { label: 'Over 41–50 กม.', test: (c) => /^KPCR2?OV41/i.test(c) },
]

function groupByDistance(rows: MixDesignReportRow[]): { label: string; rows: MixDesignReportRow[] }[] {
  /* Always keep the four distance sections (even when empty, so a range with no
     สูตร is shown as "ไม่มี"). อื่นๆ only appears when it actually has rows. */
  const out = DISTANCE_GROUPS.map((g) => ({ label: g.label, rows: rows.filter((r) => g.test(r.code)) }))
  const matched = new Set(out.flatMap((o) => o.rows))
  const other = rows.filter((r) => !matched.has(r))
  if (other.length) out.push({ label: 'อื่นๆ', rows: other })
  return out
}

/** One distance-section table. Columns match across sections (hasF/hasPce are
    computed from the whole report) so the split tables stay aligned. */
function MixTable({ rows, hasF, hasPce }: { rows: MixDesignReportRow[]; hasF: boolean; hasPce: boolean }) {
  return (
    <table className="trr-table">
      <thead>
        <tr>
          <th className="n" style={{ ...th, width: '4%' }}>ลำดับ</th>
          <th style={{ ...th, width: '10%' }}>เลขที่สูตร</th>
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
        {rows.length === 0 ? (
          <tr>
            <td className="c" colSpan={9 + (hasF ? 1 : 0) + (hasPce ? 1 : 0)} style={{ color: RED, fontWeight: 700 }}>
              ไม่มี
            </td>
          </tr>
        ) : rows.map((r, i) => (
          <tr key={r.code}>
            <td className="n mono">{i + 1}</td>
            <td className="mono">{r.formulaNo ?? '—'}</td>
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
  )
}

/** Printable concrete mix-design report — themed, per-m³ quantities by product,
    split into separate tables per delivery-distance range. */
export function MixDesignReportDoc({ report }: { report: MixDesignReport }) {
  const hasF = report.rows.some((r) => r.sikament)
  const hasPce = report.rows.some((r) => r.pce)
  const groups = groupByDistance(report.rows)
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
          <div style={{ fontSize: 11.5 }}>{report.rows.length} สูตร · ปริมาณต่อ 1 คิว · แยกตามระยะส่ง</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.label} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PRIMARY_INK, margin: '6px 0', paddingLeft: 8, borderLeft: `3px solid ${PRIMARY}` }}>
            {g.label} <span style={{ fontWeight: 400, color: faint, fontSize: 11.5 }}>· {g.rows.length} สูตร</span>
          </div>
          <MixTable rows={g.rows} hasF={hasF} hasPce={hasPce} />
        </div>
      ))}

      <div style={{ marginTop: 10, padding: '6px 10px', display: 'inline-block', background: PRIMARY_50, color: PRIMARY_INK, borderLeft: `3px solid ${PRIMARY}`, borderRadius: 2, fontSize: 11.5 }}>
        ปริมาณต่อ 1 คิว — ปูน/ทราย/หิน เป็นกิโลกรัม · น้ำยาเป็นลิตร
      </div>
    </div>
  )
}
