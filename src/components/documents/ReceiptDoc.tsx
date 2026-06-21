import { DocShell, MetaRow, Signatures } from './DocShell'
import { baht, customerLegal, type Receipt, INVOICES } from '../../data/selectors'
import { bahtText } from '../../data/bahtText'

export function ReceiptDoc({ rc }: { rc: Receipt }) {
  const invs = INVOICES.filter((i) => rc.invoiceNos.includes(i.no))
  const cust = customerLegal(rc.customer)
  return (
    <DocShell docType="ใบเสร็จรับเงิน" copyLabel="ต้นฉบับ / Original">
      <div className="doc-meta-grid">
        <MetaRow k="นามลูกค้า :" v={cust.display} />
        <MetaRow k="เลขที่ :" v={rc.no} mono />
        <MetaRow k="ที่อยู่ :" v={cust.address} />
        <MetaRow k="วันที่ :" v={rc.date} mono />
        <MetaRow k="เลขประจำตัวผู้เสียภาษี :" v={<span className="mono">{cust.taxId}</span>} />
        <MetaRow k="วิธีรับชำระ :" v={rc.method || '—'} />
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="ctr" style={{ width: 36 }}>ลำดับ</th>
            <th>เลขที่ใบกำกับ / ใบแจ้งหนี้</th>
            <th className="ctr" style={{ width: 90 }}>ลงวันที่</th>
            <th className="num" style={{ width: 110 }}>จำนวนเงิน</th>
            <th className="num" style={{ width: 110 }}>ยอดชำระ</th>
          </tr>
        </thead>
        <tbody>
          {invs.map((inv, i) => (
            <tr key={inv.no}>
              <td className="ctr">{i + 1}</td>
              <td className="mono">{inv.no}</td>
              <td className="ctr mono">{inv.date}</td>
              <td className="num mono">{baht(inv.total)}</td>
              <td className="num mono">{baht(inv.total)}</td>
            </tr>
          ))}
          {invs.length < 4 &&
            Array.from({ length: 4 - invs.length }).map((_, i) => (
              <tr className="spacer" key={`s${i}`}>
                <td colSpan={5} />
              </tr>
            ))}
        </tbody>
      </table>

      <div className="doc-foot">
        <div className="doc-words">
          <strong>({bahtText(rc.amount)})</strong>
        </div>
        <div className="doc-totals">
          <div className="trow grand"><span className="lab">รับเงินรวมทั้งสิ้น</span><span className="val">{baht(rc.amount)}</span></div>
        </div>
      </div>

      <Signatures left="ผู้รับเงิน" right="ในนามบริษัท" />
    </DocShell>
  )
}
