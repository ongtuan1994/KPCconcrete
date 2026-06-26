/* Creditors / accounts-payable master (เจ้าหนี้) — suppliers KPC buys from on
   credit (cement powder, materials, transport, tyres, spare parts, etc.).
   Seed base data; payment terms + credit limit mirror the customer-credit model.

   NOTE: `outstanding` (ยอดค้างชำระ) and `dueDate` (วันครบกำหนดชำระ) are SAMPLE
   values for demonstrating the payment-status column — replace with real AP data
   when available. Creditors with no current balance have outstanding 0. */

export interface Creditor {
  id: string
  name: string
  /** Payment basis — 'เครดิต' (with creditDays) or 'เงินสด'. */
  terms: 'เครดิต' | 'เงินสด'
  /** Credit period in days (only for terms === 'เครดิต'). */
  creditDays?: number
  /** Credit limit in baht. undefined = ไม่จำกัด (unlimited / not capped). */
  creditLimit?: number
  /** Optional category note, e.g. "ปูนผง", "ขนส่ง". */
  note?: string
  /** Outstanding payable balance in baht (0 / undefined = no balance due). */
  outstanding?: number
  /** Due date of the outstanding balance (ISO yyyy-mm-dd). */
  dueDate?: string
}

export const CREDITOR_MASTER: Creditor[] = [
  { id: "S0001", name: "บจก.ไถ่เชียงระนอง (ปูนผง)", terms: "เครดิต", creditDays: 15, creditLimit: 1000000, note: "ปูนผง", outstanding: 0 },
  { id: "S0002", name: "บจก.ไถ่เชียงระนอง (วัสดุอุปกรณ์)", terms: "เครดิต", creditDays: 30, note: "วัสดุอุปกรณ์", outstanding: 0 },
  { id: "S0003", name: "บจก.จริตสกุลวัสดุก่อสร้าง", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0004", name: "บจก.กิจไพศาลวัสดุ (ขนส่ง)", terms: "เครดิต", creditDays: 30, note: "ขนส่ง", outstanding: 0 },
  { id: "S0005", name: "บจก.กิจไพศาลวัสดุ", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0006", name: "บจก.วินิจบริการ", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0007", name: "บจก.ยุพาศิลาทอง", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0008", name: "หจก.ท่าทรายทรัพย์ไพศาล", terms: "เครดิต", creditDays: 15, outstanding: 0 },
  { id: "S0009", name: "หจก.เพรชมีชัยเทรดดิ้ง", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0010", name: "บจก.วาย พี โลจิสติกส์", terms: "เครดิต", creditDays: 15, outstanding: 0 },
  { id: "S0011", name: "หจก.เจริญผลการศิลา", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0012", name: "บจก.สมบูรณ์ศิลาทอง", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0013", name: "บจก.ลี้หย่งฮั้ว", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0014", name: "บจก.คอนกรีตซีแพคระนอง", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0015", name: "นายวรชัย แก้วแสงทอง", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0016", name: "บจก.เทพศิรินออโต้ไทร์", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0017", name: "บจก.ทุ่งสงทรัคเซลส์", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0018", name: "บจก.สงวนยางยนต์ชุมพร", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0019", name: "พ.เจริญยนต์", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0020", name: "บจก.ทุ่งคาคอนกรีต", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0021", name: "บจก.จิ้นเห้งอะไหล่", terms: "เครดิต", creditDays: 30, outstanding: 0 },
  { id: "S0022", name: "ร้านเอส คอนสตรัคชัน", terms: "เงินสด", outstanding: 0 },
  { id: "S0023", name: "บจก.เอ.เอ็ม.เอส.อาร์", terms: "เครดิต", creditDays: 30, outstanding: 0 },
]
