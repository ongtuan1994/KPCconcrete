import { DocShell, MetaRow, Signatures } from './DocShell'
import { baht, customerLegal, type BillingNote } from '../../data/selectors'
import { bahtText } from '../../data/bahtText'

export function BillingNoteDoc({ bn }: { bn: BillingNote }) {
  const cust = customerLegal(bn.customer)
  /* นามลูกค้า — the entered ชื่อนิติบุคคล for a company issue, the person's name for an
     individual issue; legacy notes (no entityType) keep the registry display name. */
  const displayName =
    bn.entityType === 'company' ? (bn.legalName || cust.display)
      : bn.entityType === 'person' ? cust.person
        : cust.display
  return (
    <DocShell docType="ใบวางบิล / ใบแจ้งหนี้" copyLabel="ต้นฉบับ / Original">
      <div className="doc-meta-grid">
        <MetaRow k="นามลูกค้า :" v={displayName} />
        <MetaRow k="เลขที่เอกสาร :" v={bn.no} mono />
        <MetaRow k="ที่อยู่ :" v={cust.address} />
        <MetaRow k="เลขประจำตัวผู้เสียภาษี :" v={
          <span>
            <span className="mono">{cust.taxId}</span>
            {bn.taxBranch && <span> · {bn.taxBranch === 'branch' ? `สาขาที่ ${bn.branchCode}` : 'สำนักงานใหญ่'}</span>}
          </span>
        } />
        <MetaRow k="หน่วยงาน :" v={cust.unit || '—'} />
        <MetaRow k="จำนวนรายการ :" v={`${bn.invoices.length} ใบ`} />
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="ctr" style={{ width: 36 }}>ลำดับ</th>
            <th>เลขที่ใบกำกับ / บิล</th>
            <th className="ctr" style={{ width: 90 }}>วันที่</th>
            <th className="ctr" style={{ width: 90 }}>ครบกำหนด</th>
            <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {bn.invoices.map((inv, i) => (
            <tr key={inv.no}>
              <td className="ctr">{i + 1}</td>
              <td className="mono">{inv.no}</td>
              <td className="ctr mono">{inv.date}</td>
              <td className="ctr mono">{inv.dueDate}</td>
              <td className="num mono">{baht(inv.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="doc-foot">
        <div className="doc-words">
          <strong>({bahtText(bn.total)})</strong>
        </div>
        <div className="doc-totals">
          <div className="trow grand"><span className="lab">รวมยอดวางบิล</span><span className="val">{baht(bn.total)}</span></div>
        </div>
      </div>

      <Signatures left="ผู้รับวางบิล" right="ผู้วางบิล" />
    </DocShell>
  )
}
