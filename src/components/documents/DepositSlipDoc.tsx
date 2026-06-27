import { bahtText } from '../../data/bahtText'
import type { PayrollPayment } from '../../data/createdDocs'

/* Print offsets (in mm) onto the pre-printed ttb pay-in / deposit slip, laid out
   in landscape on a fixed 9 × 4 inch page (≈ 228.6 × 101.6 mm). Adjust these
   constants to nudge the text so it lines up with the boxes on your physical form. */
const POS = {
  /** Account-number digits — spread across the form's digit boxes (A/C No. row). */
  account: { left: 27, top: 26, fontSize: 15, letterSpacing: 3 },
  /** A/C Name — same row as the account boxes, after the "ชื่อบัญชี" label. */
  name: { left: 120, top: 24, fontSize: 13 },
  /** Transfer-type tick ("/") on the เงินสด Cash checkbox, left side. */
  slash: { left: 21, top: 53, fontSize: 15 },
  /** Amount in Thai words — centred inside the Amount (Letter) cell. */
  words: { left: 88, top: 62, width: 78, fontSize: 13 },
  /** Amount in figures — Amount (Numeric) column, right side. */
  amount: { left: 182, top: 62, fontSize: 14 },
} as const

const mm = (n: number) => `${n}mm`

/** Printable bank deposit / pay-in slip (ใบนำฝาก) for a payroll payment.
    `account` lets the caller pass the resolved employee bank account; falls
    back to the one stamped on the payment record. */
export function DepositSlipDoc({ pp, account }: { pp: PayrollPayment; account?: string }) {
  const acct = (account || pp.bankAccount || '').trim()
  /* Dashes become spaces so letter-spacing opens a wider gap between the
     account-number groups, matching the boxes on the printed form. */
  const acctSpaced = acct.replace(/-/g, ' ')
  const amount = pp.netAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })

  return (
    <div className="deposit-wrap">
      <div className="deposit-sheet">
        <div
          className="dep-field dep-acct"
          style={{ left: mm(POS.account.left), top: mm(POS.account.top), fontSize: `${POS.account.fontSize}pt`, letterSpacing: mm(POS.account.letterSpacing) }}
        >
          {acctSpaced}
        </div>

        <div
          className="dep-field"
          style={{ left: mm(POS.name.left), top: mm(POS.name.top), fontSize: `${POS.name.fontSize}pt` }}
        >
          {pp.employeeName}
        </div>

        <div
          className="dep-field"
          style={{ left: mm(POS.slash.left), top: mm(POS.slash.top), fontSize: `${POS.slash.fontSize}pt` }}
        >
          /
        </div>

        <div
          className="dep-field"
          style={{ left: mm(POS.words.left), top: mm(POS.words.top), width: mm(POS.words.width), textAlign: 'center', fontSize: `${POS.words.fontSize}pt` }}
        >
          ({bahtText(pp.netAmount)})
        </div>

        <div
          className="dep-field dep-amount"
          style={{ left: mm(POS.amount.left), top: mm(POS.amount.top), fontSize: `${POS.amount.fontSize}pt` }}
        >
          {amount}
        </div>
      </div>
    </div>
  )
}
