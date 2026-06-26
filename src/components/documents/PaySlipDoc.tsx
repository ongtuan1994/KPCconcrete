import { COMPANY } from '../../data/real'
import { bahtText } from '../../data/bahtText'
import type { PayrollPayment } from '../../data/createdDocs'

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
function fmtMonthFull(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`
}
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Show a dash for zero amounts, like the printed slip. */
const cell = (n: number) => (n ? money(n) : '-')

/** Printable salary pay slip (ใบทำจ่ายเงินเดือน) with the KPC logo. */
export function PaySlipDoc({ pp }: { pp: PayrollPayment }) {
  /* Mixer-truck drivers label เงินพิเศษ / อื่นๆ as ค่าเที่ยววิ่ง / ค่ารักษารถ. */
  const isTransport = pp.department === 'ฝ่ายขนส่งรถโม่'
  const specialLabel = isTransport ? 'ค่าเที่ยววิ่ง' : 'เงินพิเศษ'
  const otherLabel = isTransport ? 'ค่ารักษารถ' : 'อื่นๆ'
  /* Non-transport staff use the รักษารถ slot for OT pay. */
  const vehicleLabel = isTransport ? 'รักษารถ' : 'OT'
  return (
    <div className="doc-sheet payslip">
      <div className="ps-title"><span>Payment Slip</span></div>

      <div className="ps-headrow">
        <div className="ps-co">
          <img src="/logo.jpg" alt="KPC กิจไพศาลคอนกรีต" />
          <div className="ps-co-info">
            <div>{COMPANY.name}</div>
            <div>{COMPANY.address}</div>
            <div>เลขประจำตัวผู้เสียภาษี {COMPANY.taxId}</div>
          </div>
        </div>
        <div className="ps-month">ประจำเดือน: <u>{fmtMonthFull(pp.payMonth)}</u></div>
      </div>

      <table className="ps-table">
        <tbody>
          {/* Employee header */}
          <tr>
            <td className="ps-h" colSpan={3}>ชื่อ-สกุล</td>
            <td className="ps-h">ตำแหน่ง</td>
            <td className="ps-h">ฝ่าย</td>
            <td className="ps-h" colSpan={2}>เลขที่บัญชี</td>
          </tr>
          <tr>
            <td colSpan={3}>{pp.employeeName}</td>
            <td>{pp.position || '-'}</td>
            <td>{pp.department || '-'}</td>
            <td colSpan={2} className="ps-num">{pp.bankAccount || ''}</td>
          </tr>

          {/* Income */}
          <tr>
            <td className="ps-sec" rowSpan={2}>รายได้</td>
            <td className="ps-h">เงินเดือน</td>
            <td className="ps-h">ประสบการณ์</td>
            <td className="ps-h">{specialLabel}</td>
            <td className="ps-h">{vehicleLabel}</td>
            <td className="ps-h">{otherLabel}</td>
            <td className="ps-h">รวมรับ</td>
          </tr>
          <tr>
            <td className="ps-num">{cell(pp.baseSalary)}</td>
            <td className="ps-num">{cell(pp.experiencePay)}</td>
            <td className="ps-num">{cell(pp.specialPay)}</td>
            <td className="ps-num">{cell(pp.vehiclePay)}</td>
            <td className="ps-num">{cell(pp.otherIncome)}</td>
            <td className="ps-num">{cell(pp.totalIncome)}</td>
          </tr>

          {/* Deductions */}
          <tr>
            <td className="ps-sec" rowSpan={2}>เงินหัก</td>
            <td className="ps-h">ประกันสังคม</td>
            <td className="ps-h">เบิกล่วงหน้า</td>
            <td className="ps-h"></td>
            <td className="ps-h"></td>
            <td className="ps-h">อื่นๆ</td>
            <td className="ps-h">รวมหัก</td>
          </tr>
          <tr>
            <td className="ps-num">{cell(pp.socialSecurity)}</td>
            <td className="ps-num">{cell(pp.advance)}</td>
            <td>-</td>
            <td>-</td>
            <td className="ps-num">{cell(pp.otherDeduction)}</td>
            <td className="ps-num">{cell(pp.totalDeduction)}</td>
          </tr>

          {/* Net */}
          <tr>
            <td className="ps-sec" colSpan={6}>เงินได้สุทธิ</td>
            <td className="ps-sec">คงเหลือ</td>
          </tr>
          <tr>
            <td className="ps-words" colSpan={6}>{bahtText(pp.netAmount)}</td>
            <td className="ps-net">{money(pp.netAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="ps-sign">
        <div>ลงชื่อ........................................ผู้รับเงิน</div>
        <div>(........................................)</div>
      </div>

      <div className="ps-note">
        **หมายเหตุ** ห้ามพนักงานคนใดเปิดเผยเงินเดือนของตัวเอง มิฉะนั้นจะมีผลต่อการปรับเงินเดือน และโบนัส ของท่านด้วย
      </div>
    </div>
  )
}
