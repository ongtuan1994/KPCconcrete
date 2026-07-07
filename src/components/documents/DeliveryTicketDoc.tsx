import { DocShell, MetaRow, Signatures } from './DocShell'
import { customerLegal, qm, monthLabel, cleanProductName } from '../../data/selectors'
import { COMPANY, PRODUCT_MAP, VEHICLE_MAP, type DeliveryTicket } from '../../data/real'

/** Printable A4 layout for a delivery ticket — mirrors the tax-invoice
    structure (header, meta-grid, lines table, optional note, 4-column
    signature block). Price/amount are shown when known but typically
    blank since pricing is finalized when the tax invoice is issued. */
export function DeliveryTicketDoc({ ticket }: { ticket: DeliveryTicket }) {
  const cust = customerLegal(ticket.customer)
  const prod = PRODUCT_MAP[ticket.prod]
  const vehicle = ticket.vehicle ? VEHICLE_MAP[ticket.vehicle] : null
  const driver = ticket.driver || vehicle?.driver || ''

  return (
    <DocShell docType="ใบจ่ายคอนกรีต / ใบส่งสินค้า" copyLabel="DELIVERY TICKET">
      <div className="doc-meta-grid">
        <MetaRow k="นามลูกค้า :" v={cust.display} />
        <MetaRow k="เลขที่ใบจ่าย :" v={ticket.dtNo} mono />
        <MetaRow k="ที่อยู่ :" v={cust.address} />
        <MetaRow k="วันที่ :" v={ticket.date} mono />
        <MetaRow k="เลขประจำตัวผู้เสียภาษี :" v={<span className="mono">{cust.taxId}</span>} />
        <MetaRow k="งวด :" v={monthLabel(ticket.month)} />
        <MetaRow k="หน่วยงาน :" v={cust.unit || '—'} />
        <MetaRow k="ประเภท :" v={ticket.type} />
        {ticket.type === 'ขายลูกค้า' && (
          <MetaRow k="การรับของ :" v={ticket.pickup === 'รับเอง' ? 'ลูกค้ามารับเอง' : 'บริษัทจัดส่ง'} />
        )}
        <MetaRow k="หมายเลขรถ :" v={vehicle ? <span className="mono">รถ {vehicle.id} (สูงสุด {vehicle.maxM3} คิว)</span> : '—'} />
        <MetaRow k="พนักงานจัดส่ง :" v={driver || '—'} />
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="ctr" style={{ width: 36 }}>ลำดับ</th>
            <th style={{ width: 130 }}>รหัสสินค้า</th>
            <th>รายละเอียด</th>
            <th className="num" style={{ width: 64 }}>จำนวน</th>
            <th className="ctr" style={{ width: 50 }}>หน่วย</th>
            <th className="num" style={{ width: 80 }}>ราคา/หน่วย</th>
            <th className="num" style={{ width: 90 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="ctr">1</td>
            <td className="mono">{ticket.prod}</td>
            <td className="th">{cleanProductName(prod?.name ?? ticket.prod)}</td>
            <td className="num mono">{qm(ticket.m3)}</td>
            <td className="ctr">{prod?.unit ?? 'คิว'}</td>
            <td className="num mono">{ticket.price ? ticket.price.toLocaleString() : '—'}</td>
            <td className="num mono">{ticket.amount ? ticket.amount.toLocaleString() : '—'}</td>
          </tr>
          {/* Spacer rows keep the table at a consistent vertical rhythm even
              though a single ticket only has one line. */}
          {Array.from({ length: 3 }).map((_, i) => (
            <tr className="spacer" key={`s${i}`}>
              <td colSpan={7} />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-foot">
        <div className="doc-words">
          {ticket.note
            ? <><strong>หมายเหตุ:</strong> {ticket.note}</>
            : <span style={{ color: 'var(--kpc-text-faint)' }}>* ราคา/หน่วยและจำนวนเงินจะกำหนดตอนออกใบกำกับภาษี</span>}
        </div>
        <div className="doc-totals">
          <div className="trow"><span className="lab">วิธีชำระ</span><span className="val">{ticket.pay || '—'}</span></div>
          {ticket.invoice && <div className="trow"><span className="lab">อ้างใบกำกับ</span><span className="val">{ticket.invoice}</span></div>}
        </div>
      </div>

      <Signatures slots={[
        {
          cap: ticket.receiver ? `ผู้รับสินค้า · ${ticket.receiver}` : 'ผู้รับสินค้า',
          topCap: 'ได้รับสินค้าแล้วในสภาพที่เรียบร้อยและถูกต้อง',
        },
        { cap: 'ผู้ส่งสินค้า', topCap: driver || undefined },
        { cap: 'ผู้ออกเอกสาร', topCap: ticket.issuer || undefined },
        { cap: 'ผู้อนุมัติ', noDate: true, topCap: COMPANY.name },
      ]} />
    </DocShell>
  )
}
