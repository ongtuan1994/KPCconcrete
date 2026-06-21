import { PageHeader } from '../components/Layout'
import { DataTable, type Column } from '../components/DataTable'
import { TRANSPORT_FEES, TRANSPORT_FULL_M3, type TransportFee } from '../data/real'
import { baht, qm } from '../data/selectors'

export function TransportPricing() {
  /* Base rate (excl. VAT) is the step delta, so we display both the VAT-inclusive
     headline price (matches the printed sheet) and the per-คิว rate behind it. */
  const baseExclVat = Math.round((TRANSPORT_FEES[0].totalWithVat / 1.07) / TRANSPORT_FULL_M3 * 100) / 100
  /* baseExclVat = 400 → confirms the 107 บาท / 0.25 คิว step shown in the sheet. */

  const columns: Column<TransportFee>[] = [
    { key: 'm3', header: 'จำนวนคิว', align: 'center', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'short', header: 'ขาดจาก 3 คิว', align: 'center', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{qm(TRANSPORT_FULL_M3 - r.m3)}</span> },
    { key: 'fee', header: 'จำนวนราคารวม VAT', align: 'right', cell: (r) => <span className="mono"><strong>{baht(r.totalWithVat)}</strong></span>, className: 'amt' },
  ]

  return (
    <>
      <PageHeader
        title="ราคาค่าขนส่ง"
        sub={`Transport Surcharge · ค่าขนส่งไม่เต็มเที่ยว — เก็บเพิ่มเมื่อปริมาณส่งน้อยกว่า ${qm(TRANSPORT_FULL_M3)} คิว`}
      />

      <div style={{
        marginBottom: 20,
        padding: '14px 16px',
        background: 'var(--kpc-primary-50)',
        border: '1px solid var(--kpc-primary-100)',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.6,
      }}>
        <div><strong>หลักการคิด:</strong> หากส่งคอนกรีตได้น้อยกว่า {qm(TRANSPORT_FULL_M3)} คิว/เที่ยว จะคิดค่าขนส่งเพิ่มตามคิวที่ขาด — ขั้นละ 0.25 คิว (107 บาท รวม VAT) เทียบเท่ากับฐาน {baht(baseExclVat)} ต่อคิวก่อน VAT</div>
        <div style={{ marginTop: 4, color: 'var(--kpc-text-muted)' }}>* ใช้ตอนออกใบกำกับภาษี — เมื่อระบบรู้ปริมาณส่งจริงจากใบจ่ายคอนกรีต</div>
      </div>

      <DataTable
        columns={columns}
        rows={TRANSPORT_FEES}
        pageSize={TRANSPORT_FEES.length}
        totalLabel={(_f, _t, total) => `รวม ${total} ระดับการขนส่งไม่เต็มเที่ยว`}
      />
    </>
  )
}
