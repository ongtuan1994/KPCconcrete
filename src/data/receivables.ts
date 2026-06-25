/* Accounts-receivable snapshot (ยอดค้างชำระลูกหนี้ปัจจุบัน).
   As of the latest reconciliation, ALL debtors are cleared EXCEPT the names
   listed here. Keyed by the canonical customer name in CUSTOMER_MASTER — a name
   absent from this map is treated as fully paid (outstanding 0).

   Names that arrived as spelling/spacing variants were mapped to their existing
   registry entry; e.g. "บจก.พีที เฮ้าส์ 3542" → "บจก.พี ที เฮ้า 3542",
   "หจก.รัตนดิลก" → "หจก.รัตนดิลกคอนสตรัคชั่น". Amounts that appeared twice
   (different document sets) are summed into one balance.

   NOTE: `dueDate` (วันครบกำหนดชำระ) is a SAMPLE value used to drive the payment-
   status countdown (เหลือกี่วัน / ครบกำหนด / เลยกำหนด) — replace with the real
   due date (วันที่วางบิล + จำนวนวันเครดิต) when available. */

export interface Receivable {
  amount: number   /* outstanding balance in baht */
  dueDate: string  /* ISO yyyy-mm-dd — payment due date */
}

export const AR_OUTSTANDING: Record<string, Receivable> = {
  'ช่างเลาะห์': { amount: 1867.50, dueDate: '2026-06-10' },
  'ช่างจรัญ': { amount: 19800, dueDate: '2026-06-28' },
  'คุณกุ้ง': { amount: 28787.50, dueDate: '2026-07-05' },
  'คุณสวย': { amount: 18100, dueDate: '2026-06-20' },
  'คุณต่อ': { amount: 13050, dueDate: '2026-06-25' },
  'ช่างสันติ': { amount: 38750, dueDate: '2026-07-12' },
  'บจก.พี ที เฮ้า 3542': { amount: 72050, dueDate: '2026-06-15' },
  'นายอัศวกรณ์ มิลินจารุภารัตน์': { amount: 25000, dueDate: '2026-07-20' },
  'พี่ทัด': { amount: 551971.24, dueDate: '2026-06-05' },                 /* 232,576.50 + 319,394.74 */
  'บจก.กิจกาญพิพัฒวรธรนพนันท์': { amount: 19325, dueDate: '2026-07-02' },
  'ช่างดำ': { amount: 62.50, dueDate: '2026-06-22' },
  'บจก.กิจไพศาลวัสดุ': { amount: 156778.88, dueDate: '2026-06-30' },       /* 22,830.00 + 133,948.88 */
  'พี่ประพล': { amount: 1450, dueDate: '2026-06-26' },
  'พี่ชาย': { amount: 283783.50, dueDate: '2026-06-18' },
  'บจก.วาสนาอดิศร': { amount: 4750, dueDate: '2026-07-08' },
  'หจก.รุ่งชัยการไฟฟ้าและก่อสร้าง': { amount: 93112.75, dueDate: '2026-06-12' },
  'บจก.ตลาดใหม่ จุ๋มจิ๋ม พลาซ่า': { amount: 172354.50, dueDate: '2026-07-15' },
  'โกยศ': { amount: 108682.50, dueDate: '2026-06-24' },
  'หจก.ว.พรชัยการก่อสร้าง': { amount: 6047.75, dueDate: '2026-07-01' },
  'หจก.พรผดุงการโยธา': { amount: 2912.50, dueDate: '2026-06-25' },
  'หจก.พร้อมสินและมิตรก่อสร้าง': { amount: 139990.50, dueDate: '2026-06-08' },
  'โรงเรียนสตรีระนอง': { amount: 11000, dueDate: '2026-07-10' },
  'ช่างตู่': { amount: 155150, dueDate: '2026-06-16' },
  'หจก.เอ.พี.พี.อิเลคทรอนิค แอนด์ คอนสตรัคชั่น': { amount: 205800, dueDate: '2026-06-28' },
  'ช่างคมกฤษ': { amount: 112026.50, dueDate: '2026-07-03' },
  'นายฐนโรจน์ จงประเสริฐสิริ': { amount: 324281, dueDate: '2026-06-02' },
  'บจก.เดอะ บาโรนี ระนอง': { amount: 89790, dueDate: '2026-07-18' },
  'บจก.แน่นแฟ้น': { amount: 14760, dueDate: '2026-06-21' },
  'หจก.รัตนดิลกคอนสตรัคชั่น': { amount: 328310.17, dueDate: '2026-06-10' },
  'คุณกิติมา พิชิ': { amount: 4005.60, dueDate: '2026-07-06' },
  'โกกิจ': { amount: 28712.40, dueDate: '2026-06-27' },
  'หจก.ชุมพร ดีเวล๊อปเมนต์': { amount: 4520.75, dueDate: '2026-07-22' },
  'บจก.ไถ่เชียงระนอง': { amount: 20905.50, dueDate: '2026-06-19' },
}

/** Total current receivables across all debtors. */
export const AR_OUTSTANDING_TOTAL = Object.values(AR_OUTSTANDING).reduce((s, r) => s + r.amount, 0)
