import { DocShell, MetaRow, Signatures } from './DocShell'
import { qm, cleanProductName, cementBrandSuffix, customerLegal } from '../../data/selectors'
import { bahtText } from '../../data/bahtText'
import { COMPANY, TRANSPORT_FEES, TRANSPORT_FULL_M3, transportFeeForM3In } from '../../data/real'
import { useCreatedDocs, type Quotation } from '../../data/createdDocs'

const r2 = (n: number) => Math.round(n * 100) / 100
const num2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Convert an ISO yyyy-mm-dd to Thai d/m/พ.ศ. */
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** Printable price quotation (ใบเสนอราคา / Quotation).
    - showVat: line prices are VAT-inclusive; the บ box breaks out
      ราคาก่อน VAT / ภาษีมูลค่าเพิ่ม 7% / รวมทั้งสิ้น.
    - !showVat: the VAT rows are left blank — the quoted price is final. */
export function QuotationDoc({ quo }: { quo: Quotation }) {
  const created = useCreatedDocs()
  /* Current effective transport schedule = head of the adjustments log, else the
     seed. Same source the invoice form charges from. */
  const transportFees = created.transportAdjustments[0]?.fees ?? TRANSPORT_FEES
  const cust = customerLegal(quo.customer)
  const productGross = r2(quo.items.reduce((s, l) => s + l.qty * l.price, 0))
  const discountTotal = r2(quo.items.reduce((s, l) => s + l.qty * (l.discount ?? 0), 0))
  const productNet = r2(quo.items.reduce((s, l) => s + l.amount, 0))

  /* ค่าขนส่งไม่เต็มเที่ยว — charged on the total concrete volume (คิว items) when it
     is under a full 3-คิว load. VAT-inclusive; appended as an extra line and folded
     into the totals so รวมทั้งสิ้น already includes it. */
  const concreteQty = quo.items.filter((l) => l.unit === 'คิว').reduce((s, l) => s + l.qty, 0)
  const steppedQty = Math.round(concreteQty * 4) / 4
  const transportFee = quo.showTransportFee ? transportFeeForM3In(concreteQty, transportFees) : 0
  const transportShort = transportFee > 0 ? r2(TRANSPORT_FULL_M3 - steppedQty) : 0

  const gross = r2(productGross + transportFee)
  const net = r2(productNet + transportFee)
  const preVat = quo.showVat ? r2(net / 1.07) : net
  const vat = quo.showVat ? r2(net - preVat) : 0

  /* Product lines + optional transport line, for spacer-row fill. */
  const rowCount = quo.items.length + (transportFee > 0 ? 1 : 0)

  const termsText = quo.terms === 'เครดิต'
    ? `เครดิต ${quo.creditDays ?? 30} วัน`
    : 'เงินสด'

  return (
    <DocShell docType="ใบเสนอราคา / Quotation" copyLabel="QUOTATION">
      <div className="doc-meta-grid">
        <MetaRow k="ชื่อลูกค้า :" v={cust.display} />
        <MetaRow k="เลขที่ :" v={quo.qtNo} mono />
        <MetaRow k="ที่อยู่ :" v={cust.address} />
        <MetaRow k="วันที่ :" v={fmtDate(quo.date)} mono />
        <MetaRow k="เลขประจำตัวผู้เสียภาษี :" v={<span className="mono">{cust.taxId}</span>} />
        <MetaRow k="เงื่อนไขการชำระ :" v={termsText} />
        <MetaRow k="หน่วยงาน :" v={cust.unit || '—'} />
        <MetaRow k="ยืนราคาภายใน :" v={`${quo.validDays ?? 30} วัน`} />
      </div>

      <table className="doc-lines">
        <thead>
          <tr>
            <th className="ctr" style={{ width: 36 }}>ลำดับ</th>
            <th style={{ width: 110 }}>รหัสสินค้า</th>
            <th>รายละเอียด</th>
            <th className="num" style={{ width: 56 }}>จำนวน</th>
            <th className="ctr" style={{ width: 40 }}>หน่วย</th>
            <th className="num" style={{ width: 82 }}>ราคา/หน่วย</th>
            <th className="num" style={{ width: 72 }}>ส่วนลด</th>
            <th className="num" style={{ width: 92 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {quo.items.map((l, i) => (
            <tr key={i}>
              <td className="ctr">{i + 1}</td>
              <td className="mono">{l.code}</td>
              <td className="th">{cleanProductName(l.name)}{quo.showCementBrand && cementBrandSuffix(l.code) ? ` ${cementBrandSuffix(l.code)}` : ''}</td>
              <td className="num mono">{qm(l.qty)}</td>
              <td className="ctr">{l.unit}</td>
              <td className="num mono">{num2(l.price)}</td>
              <td className="num mono">{l.discount ? num2(l.discount) : '-'}</td>
              <td className="num mono">{num2(l.amount)}</td>
            </tr>
          ))}
          {transportFee > 0 && (
            <tr>
              <td className="ctr">{quo.items.length + 1}</td>
              <td className="mono">-</td>
              <td className="th">ค่าขนส่ง (สั่งไม่ถึง {qm(TRANSPORT_FULL_M3)} คิว/เที่ยว — ขาด {qm(transportShort)} คิว)</td>
              <td className="num mono">-</td>
              <td className="ctr">-</td>
              <td className="num mono">{num2(transportFee)}</td>
              <td className="num mono">-</td>
              <td className="num mono">{num2(transportFee)}</td>
            </tr>
          )}
          {rowCount < 4 &&
            Array.from({ length: 4 - rowCount }).map((_, i) => (
              <tr className="spacer" key={`s${i}`}>
                <td colSpan={8} />
              </tr>
            ))}
        </tbody>
      </table>

      <div className="doc-foot">
        <div className="doc-words">
          <div style={{ fontSize: 11, lineHeight: 1.7 }}>
            <strong>เงื่อนไขการเสนอราคา</strong><br />
            1. ราคาที่เสนอรวมภาษีมูลค่าเพิ่มแล้ว<br />
            2. ราคาที่เสนอยังไม่รวมค่าขนส่งตามที่บริษัทฯกำหนด
          </div>
          <div style={{ marginTop: 8 }}><strong>({bahtText(net)})</strong></div>
        </div>
        <div className="doc-totals">
          <div className="trow"><span className="lab">รวมเงิน</span><span className="val">{num2(gross)}</span></div>
          <div className="trow"><span className="lab">ส่วนลด</span><span className="val">{discountTotal ? num2(discountTotal) : '-'}</span></div>
          <div className="trow"><span className="lab">ราคาก่อน VAT</span><span className="val">{quo.showVat ? num2(preVat) : '-'}</span></div>
          <div className="trow"><span className="lab">ภาษีมูลค่าเพิ่ม 7%</span><span className="val">{quo.showVat ? num2(vat) : '-'}</span></div>
          <div className="trow grand"><span className="lab">รวมราคาทั้งสิ้น</span><span className="val">{num2(net)}</span></div>
        </div>
      </div>

      <Signatures slots={[
        { cap: 'ผู้สั่งซื้อ (Customer)' },
        { cap: 'ผู้จัดทำเอกสาร' },
        { cap: 'ผู้มีอำนาจอนุมัติ', topCap: COMPANY.name },
      ]} />
    </DocShell>
  )
}
