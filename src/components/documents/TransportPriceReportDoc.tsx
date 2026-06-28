import type { CSSProperties } from 'react'
import { COMPANY } from '../../data/real'
import { qm } from '../../data/selectors'
import type { TransportPriceReport } from '../../data/createdDocs'

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

/** Printable transport-surcharge price report — themed in the KPC brand colour,
    with logo and the under-load fee schedule. */
export function TransportPriceReportDoc({ report }: { report: TransportPriceReport }) {
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
          <div style={{ fontSize: 16, fontWeight: 700, color: PRIMARY_INK }}>รายงานราคาค่าขนส่ง</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>(ไม่เต็มเที่ยว · คิดเมื่อต่ำกว่า {qm(report.fullM3)} คิว)</div>
          <div style={{ fontSize: 11.5 }}>ณ วันที่ {report.toLabel} · {report.fees.length} ระดับ</div>
          <div style={{ fontSize: 10.5, color: faint }}>สร้างเมื่อ {fmtCreated(report.createdAt)}{report.createdBy ? ` · โดย ${report.createdBy}` : ''}</div>
        </div>
      </div>

      {report.fuelPrice !== undefined && (
        <div style={{
          margin: '0 0 10px', padding: '6px 10px', display: 'inline-block',
          background: PRIMARY_50, color: PRIMARY_INK, borderLeft: `3px solid ${PRIMARY}`, borderRadius: 2, fontSize: 12,
        }}>
          ⛽ ราคาน้ำมันไฮดีเซลอ้างอิง ฿{report.fuelPrice.toFixed(2)} /ลิตร{report.fuelAsOf ? ` (ณ ${report.fuelAsOf})` : ''}
        </div>
      )}

      <table className="trr-table">
        <thead>
          <tr>
            <th className="n" style={{ ...thStyle, width: '8%' }}>ลำดับ</th>
            <th className="c" style={{ ...thStyle, width: '18%' }}>จำนวนคิว</th>
            <th className="c" style={{ ...thStyle, width: '20%' }}>ขาดจาก {qm(report.fullM3)} คิว</th>
            <th className="n" style={{ ...thStyle, width: '22%' }}>ราคาก่อน VAT</th>
            <th className="n" style={{ ...thStyle, width: '22%' }}>ราคารวม VAT</th>
          </tr>
        </thead>
        <tbody>
          {report.fees.map((r, i) => (
            <tr key={r.m3}>
              <td className="n mono">{i + 1}</td>
              <td className="c mono">{qm(r.m3)}</td>
              <td className="c mono" style={{ color: faint }}>{qm(report.fullM3 - r.m3)}</td>
              <td className="n mono">{money(Math.round((r.totalWithVat / 1.07) * 100) / 100)}</td>
              <td className="n mono"><strong>{money(r.totalWithVat)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
