import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import type { PriceListReport, PriceListReportRow } from '../../data/createdDocs'

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Compact number for material quantities (no forced decimals). */
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
/** Shorten the cement-brand label in the narrow column — "ปูนปอร์ตแลนด์ SCG" → "SCG". */
const shortBrand = (b?: string) => (b && b.includes('SCG') ? 'SCG' : (b ?? ''))
/** Cement-cell tint — ดอกบัว = เขียวอ่อน · SCG = แดงอ่อน. */
function brandBg(b?: string): CSSProperties {
  if (!b) return {}
  if (b.includes('SCG')) return { background: '#fdecea' }
  if (b.includes('ดอกบัว')) return { background: '#e6f4ea' }
  return {}
}

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

/** Which distance section a row belongs to. The stored zone label (e.g. "On Site
    (≤20 km)") wins — so a hand-typed code lacking the OS00/OV.. marker still lands
    in the right section — otherwise fall back to the code-prefix test. */
function distanceLabelOf(r: PriceListReportRow): string | null {
  if (r.zone) {
    const g = DISTANCE_GROUPS.find((g) => r.zone!.startsWith(g.label))
    if (g) return g.label
  }
  return DISTANCE_GROUPS.find((g) => g.test(r.code))?.label ?? null
}

/** The four fixed distance sections (always present so an empty range shows
    "ไม่มี") plus อื่นๆ only when it actually has rows. */
function byDistance(rows: PriceListReportRow[]): { label: string; rows: PriceListReportRow[] }[] {
  const out = DISTANCE_GROUPS.map((g) => ({ label: g.label, rows: rows.filter((r) => distanceLabelOf(r) === g.label) }))
  const other = rows.filter((r) => distanceLabelOf(r) === null)
  if (other.length) out.push({ label: 'อื่นๆ', rows: other })
  return out
}

/** กำลังอัด (ksc) for sorting — the stored value, else the last 3 digits of the
    code (Lean = 000 → 0), so old reports without strengthKsc still sort right. */
function strengthOf(r: PriceListReportRow): number {
  if (r.strengthKsc != null) return r.strengthKsc
  const m = r.code.match(/(\d{3})$/)
  return m ? Number(m[1]) : 0
}

/** งดจำหน่าย sinks to the bottom of any listing (1 after 0). */
const disc = (r: PriceListReportRow) => (r.discontinued ? 1 : 0)

/** Within one distance, split by ปูนซีเมนต์ (ดอกบัว then SCG) and sort each brand
    Lean → กำลังอัดต่ำ → สูง (by ksc ascending; Lean = 0 sorts first), งดจำหน่าย last. */
function byBrand(rows: PriceListReportRow[]): { brand: string; rows: PriceListReportRow[] }[] {
  const order = (b?: string) => (b && b.includes('SCG') ? 1 : 0) /* ดอกบัว ก่อน SCG */
  const groups = new Map<string, PriceListReportRow[]>()
  for (const r of rows) {
    const key = r.brand || '—'
    const a = groups.get(key) ?? []; a.push(r); groups.set(key, a)
  }
  return [...groups.entries()]
    .map(([brand, rs]) => ({ brand, rows: rs.slice().sort((a, b) => disc(a) - disc(b) || strengthOf(a) - strengthOf(b)) }))
    .sort((a, b) => order(a.brand) - order(b.brand) || a.brand.localeCompare(b.brand))
}

/** One price table. Empty groups render a red "ไม่มี" row. Foundry items priced
    per collection method show both ราคา (รับเอง / จัดส่ง) in the price cell. */
function PriceTable({ rows, showMix }: { rows: PriceListReportRow[]; showMix?: boolean }) {
  const colCount = showMix ? 13 : 6
  const cellNum = (v?: number) => (v ? qty(v) : <span style={{ color: faint }}>—</span>)
  return (
    <table className="trr-table">
      <thead>
        <tr>
          <th className="n" style={{ ...thStyle, width: '3%' }}>ลำดับ</th>
          <th style={{ ...thStyle, width: showMix ? '11%' : '18%' }}>รหัสสินค้า</th>
          <th style={thStyle}>รายการ</th>
          <th className="c" style={{ ...thStyle, width: showMix ? '7%' : '12%' }}>ปูนซีเมนต์</th>
          <th className="c" style={{ ...thStyle, width: '5%' }}>หน่วย</th>
          {showMix && <>
            <th className="n" style={{ ...thStyle, width: '6%' }}>ปูน (กก.)</th>
            <th className="n" style={{ ...thStyle, width: '6%' }}>ทราย (กก.)</th>
            <th className="n" style={{ ...thStyle, width: '6%' }}>หิน (กก.)</th>
            <th className="n" style={{ ...thStyle, width: '5%' }}>น้ำ (ล.)</th>
            <th className="n" style={{ ...thStyle, width: '7%' }}>น้ำยาหน่วง (ล.)</th>
            <th className="n" style={{ ...thStyle, width: '7%' }}>น้ำยาเร่ง (ล.)</th>
            <th className="n" style={{ ...thStyle, width: '7%' }}>กันซึม (ล.)</th>
          </>}
          <th className="n" style={{ ...thStyle, width: showMix ? '10%' : '15%' }}>ราคา/หน่วย</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="c" colSpan={colCount} style={{ color: RED, fontWeight: 700 }}>ไม่มี</td>
          </tr>
        ) : rows.map((r, i) => (
          <tr key={r.code} style={r.discontinued ? { color: faint } : undefined}>
            <td className="n mono">{i + 1}</td>
            <td className="mono">{r.code}</td>
            <td>
              {r.name}
              {r.discontinued && <span style={{ color: RED, fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>· งดจำหน่าย</span>}
            </td>
            <td className="c" style={brandBg(r.brand)}>{r.brand ? shortBrand(r.brand) : <span style={{ color: faint }}>—</span>}</td>
            <td className="c">{r.unit}</td>
            {showMix && <>
              <td className="n mono">{r.mix ? qty(r.mix.cement) : <span style={{ color: faint }}>—</span>}</td>
              <td className="n mono">{r.mix ? qty(r.mix.sand) : <span style={{ color: faint }}>—</span>}</td>
              <td className="n mono">{r.mix ? qty(r.mix.aggregate) : <span style={{ color: faint }}>—</span>}</td>
              <td className="n mono">{r.mix ? qty(r.mix.water) : <span style={{ color: faint }}>—</span>}</td>
              {/* หน่วง = Plastomix-704 · เร่ง = PCE-1 Gold 500 SF (pce/accelerator) ·
                  กันซึม = SikaPlastocrete N (sikament/waterproof). */}
              <td className="n mono">{r.mix ? cellNum(r.mix.plastomix) : <span style={{ color: faint }}>—</span>}</td>
              <td className="n mono">{r.mix ? cellNum(r.mix.pce || r.mix.accelerator) : <span style={{ color: faint }}>—</span>}</td>
              <td className="n mono">{r.mix ? cellNum(r.mix.sikament || r.mix.waterproof) : <span style={{ color: faint }}>—</span>}</td>
            </>}
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
                  {sub.rows.length === 0 ? (
                    <PriceTable rows={[]} showMix />
                  ) : (
                    /* Within a distance: split by ปูนซีเมนต์, each sorted Lean → ต่ำ → สูง. */
                    byBrand(sub.rows).map((bg) => (
                      <div key={bg.brand} className="plr-block" style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#333', margin: '4px 0 3px', paddingLeft: 10 }}>
                          ปูน{shortBrand(bg.brand)} <span style={{ fontWeight: 400, color: faint }}>· {bg.rows.length} รายการ</span>
                        </div>
                        <PriceTable rows={bg.rows} showMix />
                      </div>
                    ))
                  )}
                </div>
              ))
            ) : (
              <div className="plr-block"><PriceTable rows={g.rows.slice().sort((a, b) => disc(a) - disc(b))} /></div>
            )}
          </div>
        )
      })}
    </div>
  )
}
