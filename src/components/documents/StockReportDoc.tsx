import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import { qm } from '../../data/selectors'
import type { StockReport } from '../../data/createdDocs'

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

/** Printable raw-material stock report — balance + period in/out by material. */
export function StockReportDoc({ report }: { report: StockReport }) {
  const hasMovement = report.rows.some((r) => r.received || r.issued)
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>รายงานคลังวัตถุดิบ</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Raw Material Stock</div>
          <div style={{ fontSize: 11.5 }}>{report.scopeLabel} · {report.rows.length} รายการ</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      <table className="trr-table">
        <thead>
          <tr>
            <th className="n" style={{ ...th, width: '5%' }}>ลำดับ</th>
            <th style={{ ...th, width: '12%' }}>รหัส</th>
            <th style={th}>วัตถุดิบ</th>
            {hasMovement && <th className="n" style={{ ...th, width: '13%' }}>รับเข้า</th>}
            {hasMovement && <th className="n" style={{ ...th, width: '13%' }}>จ่ายออก</th>}
            <th className="n" style={{ ...th, width: '13%' }}>คงเหลือ</th>
            <th className="c" style={{ ...th, width: '9%' }}>หน่วย</th>
            <th className="c" style={{ ...th, width: '12%' }}>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={r.code}>
              <td className="n mono">{i + 1}</td>
              <td className="mono">{r.code}</td>
              <td>{r.material}</td>
              {hasMovement && <td className="n mono" style={{ color: r.received ? '#15803d' : faint }}>{r.received ? `+${qm(r.received)}` : '—'}</td>}
              {hasMovement && <td className="n mono" style={{ color: r.issued ? '#b91c1c' : faint }}>{r.issued ? `−${qm(r.issued)}` : '—'}</td>}
              <td className="n mono" style={{ fontWeight: 700, color: r.balance <= 0 ? '#b91c1c' : '#111' }}>{qm(r.balance)}</td>
              <td className="c">{r.unit}</td>
              <td className="c">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Movement history (รับเข้า / จ่ายออก) for the period. */}
      <div style={{ fontSize: 13, fontWeight: 700, color: PRIMARY_INK, margin: '18px 0 6px' }}>
        ประวัติการเคลื่อนไหวสต๊อก (รับเข้า / จ่ายออก) · {report.movements.length} รายการ
      </div>
      {report.movements.length === 0 ? (
        <div style={{ fontSize: 12, color: faint }}>ไม่มีการเคลื่อนไหวในช่วงนี้</div>
      ) : (
        <table className="trr-table">
          <thead>
            <tr>
              <th style={{ ...th, width: '12%' }}>วันที่</th>
              <th className="c" style={{ ...th, width: '10%' }}>ประเภท</th>
              <th style={th}>วัตถุดิบ</th>
              <th className="n" style={{ ...th, width: '14%' }}>จำนวน</th>
              <th style={{ ...th, width: '16%' }}>เอกสารอ้างอิง</th>
              <th style={{ ...th, width: '22%' }}>รายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            {report.movements.map((mv, i) => (
              <tr key={i}>
                <td className="mono">{mv.date}</td>
                <td className="c" style={{ color: mv.kind === 'in' ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{mv.kind === 'in' ? 'รับเข้า' : 'จ่ายออก'}</td>
                <td>{mv.material}</td>
                <td className="n mono" style={{ color: mv.kind === 'in' ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{mv.kind === 'in' ? '+' : '−'}{qm(mv.qty)} {mv.unit}</td>
                <td className="mono">{mv.ref || '—'}</td>
                <td style={{ fontSize: 11 }}>{mv.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
