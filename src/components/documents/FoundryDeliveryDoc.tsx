import { DocShell, MetaRow, Signatures } from './DocShell'
import { customerLegal } from '../../data/selectors'
import type { FoundryDelivery } from '../../data/createdDocs'

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** Printable foundry goods-delivery note (ใบส่งสินค้าชั่วคราว). Logo + company
    header come from DocShell; lines list the foundry products, followed by an
    acknowledgement tick-box and a 3-column signature block. */
export function FoundryDeliveryDoc({ fd }: { fd: FoundryDelivery }) {
  const cust = customerLegal(fd.customer)
  /* Pad to a steady number of rows so the sheet keeps a consistent height. */
  const padRows = Math.max(0, 6 - fd.items.length)

  return (
    <DocShell docType="ใบส่งสินค้าชั่วคราว" copyLabel="DELIVERY NOTE">
      <div className="doc-meta-grid">
        <MetaRow k="นามลูกค้า :" v={cust.display} />
        <MetaRow k="เลขที่ส่งสินค้า :" v={fd.fdNo} mono />
        <MetaRow k="ที่อยู่ :" v={cust.address || '—'} />
        <MetaRow k="วันที่ :" v={fmtDate(fd.date)} mono />
        <MetaRow k="หน่วยงาน :" v={cust.unit || '—'} />
        <MetaRow k="ทะเบียนรถ :" v={fd.vehicle || '—'} mono />
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="ctr" style={{ width: 36 }}>ลำดับ</th>
            <th style={{ width: 130 }}>รหัสสินค้า</th>
            <th>รายการ</th>
            <th className="num" style={{ width: 80 }}>จำนวน</th>
            <th className="ctr" style={{ width: 60 }}>หน่วย</th>
          </tr>
        </thead>
        <tbody>
          {fd.items.map((it, i) => (
            <tr key={it.code + i}>
              <td className="ctr">{i + 1}</td>
              <td className="mono">{it.code}</td>
              <td className="th">{it.name}</td>
              <td className="num mono">{it.qty.toLocaleString()}</td>
              <td className="ctr">{it.unit}</td>
            </tr>
          ))}
          {Array.from({ length: padRows }).map((_, i) => (
            <tr className="spacer" key={`s${i}`}><td colSpan={5} /></tr>
          ))}
        </tbody>
      </table>

      {fd.note && (
        <div className="doc-foot">
          <div className="doc-words"><strong>หมายเหตุ:</strong> {fd.note}</div>
        </div>
      )}

      {/* Acknowledgement tick-box under the items. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 6px', fontSize: 13 }}>
        <span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #111', borderRadius: 2 }} />
        <span>ได้รับสินค้าในสภาพที่ถูกต้องเรียบร้อยสมบูรณ์</span>
      </div>

      <Signatures slots={[
        { cap: 'ผู้รับสินค้า' },
        { cap: 'พนักงานขนส่ง' },
        { cap: 'ผู้นำจ่ายสินค้า' },
      ]} />
    </DocShell>
  )
}
