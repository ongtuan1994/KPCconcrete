import { DocShell, MetaRow, Signatures } from './DocShell'
import { baht, qm, customerLegal, type Invoice } from '../../data/selectors'
import { bahtText } from '../../data/bahtText'
import { COMPANY } from '../../data/real'

export function TaxInvoiceDoc({ inv }: { inv: Invoice }) {
  const cust = customerLegal(inv.customer)
  return (
    <DocShell docType="ใบกำกับภาษี / ใบส่งสินค้า" copyLabel="TAX INVOICE / DELIVERY NOTE">
      <div className="doc-meta-grid">
        <MetaRow k="นามลูกค้า :" v={cust.display} />
        <MetaRow k="เลขที่ :" v={inv.no} mono />
        <MetaRow k="ที่อยู่ :" v={cust.address} />
        <MetaRow k="วันที่ :" v={inv.date} mono />
        <MetaRow k="เลขประจำตัวผู้เสียภาษี :" v={<span className="mono">{cust.taxId}</span>} />
        <MetaRow k="กำหนดชำระ :" v={inv.dueDate} mono />
        <MetaRow k="หน่วยงาน :" v={cust.unit || '—'} />
        <MetaRow k="อ้างถึงใบส่งสินค้า :" v={<span className="mono">{inv.refs.join(', ')}</span>} />
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="ctr" style={{ width: 36 }}>ลำดับ</th>
            <th style={{ width: 110 }}>รหัสสินค้า</th>
            <th>รายละเอียด</th>
            <th className="num" style={{ width: 60 }}>จำนวน</th>
            <th className="ctr" style={{ width: 44 }}>หน่วย</th>
            <th className="num" style={{ width: 80 }}>ราคา/หน่วย</th>
            <th className="num" style={{ width: 96 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td className="ctr">{i + 1}</td>
              <td className="mono">{l.code}</td>
              <td className="th">{l.name}</td>
              <td className="num mono">{qm(l.qty)}</td>
              <td className="ctr">{l.unit}</td>
              <td className="num mono">{l.price.toLocaleString()}</td>
              <td className="num mono">{baht(l.amount)}</td>
            </tr>
          ))}
          {inv.lines.length < 4 &&
            Array.from({ length: 4 - inv.lines.length }).map((_, i) => (
              <tr className="spacer" key={`s${i}`}>
                <td colSpan={7} />
              </tr>
            ))}
        </tbody>
      </table>

      <div className="doc-foot">
        <div className="doc-words">
          <strong>({bahtText(inv.total)})</strong>
        </div>
        <div className="doc-totals">
          <div className="trow"><span className="lab">รวมเป็นเงิน</span><span className="val">{baht(inv.subtotal)}</span></div>
          <div className="trow"><span className="lab">ภาษีมูลค่าเพิ่ม 7%</span><span className="val">{baht(inv.vat)}</span></div>
          <div className="trow grand"><span className="lab">จำนวนเงินรวมทั้งสิ้น</span><span className="val">{baht(inv.total)}</span></div>
        </div>
      </div>

      <Signatures slots={[
        { cap: 'ผู้รับสินค้า', topCap: 'ได้รับสินค้าแล้วในสภาพที่เรียบร้อยและถูกต้อง' },
        { cap: 'ผู้ส่งสินค้า' },
        { cap: 'ผู้ออกเอกสาร' },
        { cap: 'ผู้อนุมัติ', noDate: true, topCap: COMPANY.name },
      ]} />
    </DocShell>
  )
}
