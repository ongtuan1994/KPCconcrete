import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import { qm } from '../../data/selectors'
import type { StockReconcile } from '../../data/createdDocs'

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtThaiDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  return `${d} ${months[m - 1]} ${y + 543}`
}
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

/** Printable stock reconciliation (ใบกระทบยอดคงคลัง) — system vs counted, with
    variance %, valued loss, and per-line notes. Does not change stock balances. */
export function StockReconcileDoc({ rec }: { rec: StockReconcile }) {
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>ใบกระทบยอดคงคลัง</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Stock Reconciliation</div>
          <div style={{ fontSize: 11.5 }}>วันที่ {fmtThaiDate(rec.date)} · {rec.lines.length} รายการ</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(rec.createdAt)}{rec.createdBy ? ` · โดย ${rec.createdBy}` : ''}</div>
          {rec.status === 'approved'
            ? <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d', marginTop: 2 }}>✓ อนุมัติแล้ว{rec.approvedBy ? ` · ${rec.approvedBy}` : ''}</div>
            : rec.status === 'pending'
              ? <div style={{ fontSize: 11.5, fontWeight: 700, color: '#b45309', marginTop: 2 }}>● รออนุมัติ</div>
              : null}
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="n" style={{ ...th, width: '4%' }}>ลำดับ</th>
            <th style={th}>วัตถุดิบ</th>
            <th className="n" style={th}>คงคลัง (ระบบ)</th>
            <th className="n" style={th}>นับจริง</th>
            <th className="n" style={th}>ผลต่าง</th>
            <th className="n" style={th}>%</th>
            <th className="n" style={th}>ต้นทุน/หน่วย</th>
            <th className="n" style={th}>มูลค่าส่วนต่าง</th>
            <th style={th}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {rec.lines.map((l, i) => {
            const short = l.diff < 0
            return (
              <tr key={l.code}>
                <td className="n mono">{i + 1}</td>
                <td>{l.material} <span style={{ color: faint, fontSize: 10 }}>({l.unit})</span></td>
                <td className="n mono">{qm(l.systemQty)}</td>
                <td className="n mono">{qm(l.countedQty)}</td>
                <td className="n mono" style={{ color: l.diff === 0 ? faint : short ? '#b91c1c' : '#15803d', fontWeight: l.diff ? 700 : 400 }}>
                  {l.diff > 0 ? '+' : ''}{qm(l.diff)}
                </td>
                <td className="n mono" style={{ color: l.diff === 0 ? faint : short ? '#b91c1c' : '#15803d' }}>
                  {l.systemQty === 0 ? '—' : `${l.diffPct > 0 ? '+' : ''}${l.diffPct.toFixed(1)}%`}
                </td>
                <td className="n mono">{money(l.unitCost)}</td>
                <td className="n mono" style={{ color: l.diffValue < 0 ? '#b91c1c' : l.diffValue > 0 ? '#15803d' : faint }}>
                  {l.diffValue > 0 ? '+' : ''}{money(l.diffValue)}
                </td>
                <td style={{ fontSize: 11 }}>{l.note || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', fontSize: 13 }}>
        <div>มูลค่าส่วนต่างสุทธิ : <strong className="mono">{rec.totalDiffValue > 0 ? '+' : ''}{money(rec.totalDiffValue)}</strong> บาท</div>
        <div style={{ fontSize: 15 }}>
          ต้นทุนที่เสียหาย/สูญหาย (เฉพาะที่ขาด) : <strong className="mono" style={{ color: '#b91c1c' }}>{money(rec.lossValue)}</strong> บาท
        </div>
      </div>

      {rec.note && <div style={{ marginTop: 12, fontSize: 12, color: '#444' }}><strong>หมายเหตุรวม:</strong> {rec.note}</div>}

      <div style={{ marginTop: 24, fontSize: 11, color: faint }}>
        * เอกสารนี้เป็นการบันทึกผลการกระทบยอดเพื่อตรวจสอบ — ระบบไม่ได้ปรับยอดคงคลังตามจำนวนที่นับจริง
      </div>

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-around', gap: 24, textAlign: 'center', fontSize: 12 }}>
        <div>
          <div style={{ borderTop: '1px dotted #888', width: 160, margin: '28px auto 4px' }} />
          ผู้ตรวจนับ
        </div>
        <div>
          <div style={{ borderTop: '1px dotted #888', width: 160, margin: '28px auto 4px' }} />
          ผู้ตรวจสอบ
        </div>
        <div>
          <div style={{ borderTop: '1px dotted #888', width: 160, margin: '28px auto 4px' }} />
          ผู้อนุมัติ
        </div>
      </div>
    </div>
  )
}
