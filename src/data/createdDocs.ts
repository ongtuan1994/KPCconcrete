/* In-app store for user-created documents (tax invoices, billing notes, receipts,
   delivery tickets). Persists to localStorage so issued documents survive page refreshes.
   Issued docs are merged with the derived real-data lists in each page.

   `hidden` tracks IDs of seed (real-data) records the user removed in dev mode.
   The delete UI is gated on `import.meta.env.DEV`, so this state stays empty in prod. */

import { useMemo, useSyncExternalStore } from 'react'
import type { Invoice, BillingNote, Receipt } from './selectors'
import { CUSTOMER_MASTER, PRODUCTS, STOCK_MATERIALS, DIESEL_PRICE_PER_LITER, VEHICLES, type DeliveryTicket, type Customer, type Product } from './real'

/** Codes of the seed foundry stock materials (site: 'foundry') — used to tell a
    re-added seed material from a genuinely new one. */
const STOCK_SEED_FOUNDRY_CODES = new Set(STOCK_MATERIALS.filter((m) => m.site === 'foundry').map((m) => m.code))
import type { MixDesign } from './mixDesign'
import type { FoundryFormula } from './foundryFormula'
import type { Employee } from './employees'
import { CREDITOR_MASTER, type Creditor } from './creditors'
import type { ImportedTaxRow } from './taxReports'
import { currentUserName } from './auth'
import { createRemoteSync } from './supabase'

/** Audit stamp applied to every newly saved record: who saved it and when.
    `createdBy` is the logged-in username; `createdAt` is an ISO timestamp. */
export interface AuditStamp {
  createdBy?: string
  createdAt?: string
}

/** Apply the saver + timestamp to a record. Keeps any createdAt the caller
    already set (e.g. backdated docs) but always records the current user. */
function stamp<T extends AuditStamp>(rec: T): T {
  return { ...rec, createdBy: currentUserName(), createdAt: rec.createdAt ?? new Date().toISOString() }
}

/** Editable subset of Customer fields — phone/credit kept on top of the master. */
export type CustomerEdit = Partial<Pick<Customer, 'phone' | 'creditLimit' | 'creditDays' | 'address' | 'taxId' | 'legalName' | 'customerName' | 'unit'>>

/** Editable subset of Employee fields kept on top of the EMPLOYEES roster. */
export type EmployeeEdit = Partial<Pick<Employee, 'nickname' | 'role' | 'department' | 'site' | 'nationality' | 'startDate' | 'phone' | 'bankName' | 'bankAccount'>>

/** Editable subset of Creditor (ซัพพลายเออร์) fields merged on top of the
    creditor master (and suppliersAdded). Keyed by supplier id. */
export type SupplierEdit = Partial<Pick<Creditor, 'name' | 'terms' | 'creditDays' | 'creditLimit' | 'note'>>

/** Editable subset of Product fields merged on top of PRODUCTS (and productsAdded).
    Keyed by product code. Covers everything the เพิ่ม/แก้ไขสินค้า form can change
    except the code/site/category, which are fixed by the code itself. */
export type ProductEdit = Partial<Pick<Product, 'name' | 'unit' | 'price' | 'pickup' | 'pickupPrices' | 'strengthKsc' | 'formulaCode' | 'cementBrand' | 'zone' | 'discontinued'>>

/** One row in the product-price adjustment log. Stored newest-first so the
    head element gives the current effective product prices. */
export interface PriceAdjustment {
  at: string         /* ISO timestamp of when the adjustment was applied */
  by?: string        /* optional staff name */
  note?: string      /* optional reason / context */
  /** Effective price overrides after this entry — code → new price (incl. VAT).
      Cumulative: the snapshot already merges every prior change forward. */
  prices: Record<string, number>
  /** Rows that actually changed compared to the previous schedule (for display). */
  changes: { code: string; from: number; to: number }[]
}

/** One row in the transport-rate adjustment log. Stored newest-first so
    the head element gives the current effective fee schedule. */
export interface TransportRateAdjustment {
  at: string         /* ISO timestamp of when the adjustment was applied */
  by?: string        /* optional staff name */
  note?: string      /* optional reason / context */
  /** Effective fee schedule (VAT-inclusive) after this adjustment — full snapshot. */
  fees: { m3: number; totalWithVat: number }[]
  /** Rows that actually changed compared to the previous schedule (for display).
      Empty array on a baseline entry that established the very first schedule. */
  changes: { m3: number; from: number; to: number }[]
  /** Hi-Diesel S retail price (baht/litre) at the time of the adjustment. */
  fuelPrice?: number
  /** Display string for the fuel price effective date, e.g. "22 มิ.ย. 2569". */
  fuelPriceAsOf?: string
}

/** One product line on a sales order (ใบสั่งขาย). */
export interface SalesOrderItem {
  code: string   /* product code from PRODUCTS */
  name: string   /* snapshot of the product name at order time */
  qty: number    /* ordered quantity */
  unit: string   /* unit snapshot (e.g. คิว) */
}

/** Production status of a sales order.
    - 'รอผลิต' (waiting): just created, no delivery ticket issued yet.
    - 'ผลิต' (produced): a delivery ticket has been issued from this order. */
export type SalesOrderStatus = 'รอผลิต' | 'ผลิต'

/** A customer's advance order (ใบสั่งขาย). The plant records what a customer
    has reserved ahead of delivery; tax invoices / delivery tickets are issued
    later against it. Persisted to localStorage like other created docs. */
export interface SalesOrder {
  id: string         /* same as soNo — stable key */
  soNo: string       /* running document number, e.g. SO00001 */
  orderDate: string  /* ISO yyyy-mm-dd — defaults to today */
  useDate: string    /* ISO yyyy-mm-dd — date the customer wants to use it */
  customer: string
  /** Which SITE the ordered products come from: 'plant' = สินค้าแพล้นปูน (คอนกรีต,
      issued as ใบจ่ายคอนกรีต), 'foundry' = สินค้าโรงหล่อ (issued as ใบส่งสินค้าโรงหล่อ).
      Optional for orders saved before the field existed (treated as 'plant'). */
  site?: 'plant' | 'foundry'
  items: SalesOrderItem[]
  status: SalesOrderStatus
  note?: string
  /** Optional uploaded customer PO as evidence (stored as a data URL). */
  attachment?: { name: string; type: string; dataUrl: string }
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string  /* ISO timestamp of when the order was saved */
}

/** One priced line on a quotation (ใบเสนอราคา). */
export interface QuotationItem {
  code: string      /* product code from PRODUCTS */
  name: string      /* snapshot of the product name at quote time */
  qty: number
  unit: string      /* unit snapshot (e.g. คิว) */
  price: number     /* unit price as quoted — VAT-inclusive when showVat, else plain */
  discount?: number /* per-unit discount (same basis as price) */
  amount: number    /* qty × (price − discount) */
}

/** A price quotation (ใบเสนอราคา). Can be issued VAT-inclusive (showVat: the doc
    breaks out ราคาก่อน VAT / VAT 7% / รวมทั้งสิ้น) or without VAT (those rows are
    left blank and the quoted price is final). Persisted like other created docs. */
export interface Quotation {
  id: string          /* same as qtNo — stable key */
  qtNo: string        /* document number, e.g. QT690710-001 */
  date: string        /* ISO yyyy-mm-dd — issue date */
  customer: string
  /** เงื่อนไขการชำระ */
  terms: 'เงินสด' | 'เครดิต'
  creditDays?: number /* credit period in days (when terms === 'เครดิต') */
  validDays?: number  /* วันยืนราคา — days the quoted price is held */
  /** true = show the VAT breakdown; false = hide it (prices are the final quote). */
  showVat: boolean
  /** true = print the cement brand suffix "(ดอกบัว)" / "(SCG)" after each product
      name in the doc. Defaults to false (brand hidden). */
  showCementBrand?: boolean
  /** true = print the ค่าขนส่งไม่เต็มเที่ยว schedule (surcharge for orders under
      3 คิว/เที่ยว) on the doc. Defaults to false (hidden). */
  showTransportFee?: boolean
  items: QuotationItem[]
  note?: string
  createdBy?: string
  createdAt: string
}

/* ───────── Foundry BOQ (ถอดแบบ BOQ โรงหล่อ) ───────── */

/** Raw-material identifiers used in a foundry BOQ takeoff. See BOQ_MATERIALS in
    ./foundryBoq for the seed labels, units, input modes and kg/m factors.
    `(string & {})` keeps the seed keys as autocomplete hints while allowing
    user-added material codes (see FoundryMaterial) as keys too — those always
    use 'direct' mode (the quantity is typed straight in). */
export type FoundryMaterialKey =
  | 'concrete' | 'db16' | 'db12' | 'rb9' | 'rb6'
  | 'pcw4' | 'pcw5' | 'pcw7' | 'stir28' | 'stir4' | 'stir6'
  | 'plate9' | 'plate6' | 'box24'
  | (string & {})

/** A user-added foundry raw material — shared between the คลังวัตถุดิบโรงหล่อ stock
    page (as a stock row) and the ถอดแบบ BOQ โรงหล่อ BOQ page (as a direct-mode
    takeoff material). `code` is the stable key used on both. */
export interface FoundryMaterial {
  code: string
  name: string
  en?: string
  unit: string
  reorder?: number
  cost?: number
}

/** One material takeoff line — stores the raw inputs the user typed; the output
    quantity (per unit) is derived from the material's mode in ./foundryBoq. Only
    the inputs relevant to that material's mode are set. */
export interface FoundryBoqMaterial {
  key: FoundryMaterialKey
  value?: number       /* direct mode — output typed directly */
  length?: number      /* lengthCount — ความยาวเหล็ก / ความยาวคาน */
  count?: number       /* lengthCount / countFixed — จำนวนเส้น */
  beamLength?: number  /* lengthSpacing — ความยาวคาน */
  spacing?: number     /* lengthSpacing — ระยะห่าง */
}

/** Foundry product families a BOQ can be taken off for. */
export type FoundryProductType = 'คาน' | 'เสาเข็ม' | 'เสาอาคาร'

/** One product within a BOQ project — a product family, its code, the number of
    units produced, and the per-unit material takeoff. Project total per material
    = per-unit output × qty. */
export interface FoundryBoqProduct {
  id: string
  type: FoundryProductType
  detail?: string  /* รายละเอียด — free-text description of the product */
  code: string     /* เลขของสินค้า */
  qty: number      /* จำนวนตัวที่ผลิต */
  materials: FoundryBoqMaterial[]
}

/** A foundry material takeoff / cost estimate for one project or customer
    (ถอดแบบ BOQ โรงหล่อ). Persisted like other created docs. */
export interface FoundryBoq {
  id: string        /* same as no — stable key */
  no: string        /* running document number, e.g. BOQ00001 */
  project: string   /* ชื่อโครงการ / ลูกค้า */
  date: string      /* ISO yyyy-mm-dd */
  products: FoundryBoqProduct[]
  note?: string
  createdBy?: string
  createdAt: string
}

/** A partial (installment) payment recorded against a tax invoice (ผ่อนชำระ).
    ยอดคงค้าง = invoice.total − Σ(payments for that invoice). */
export interface InvoicePayment {
  id: string
  invoiceNo: string   /* Invoice.no this payment settles */
  amount: number      /* baht paid this installment */
  date: string        /* ISO yyyy-mm-dd */
  method?: string     /* เงินสด / โอน / เช็ค */
  note?: string
  createdBy?: string
  createdAt?: string
}

/* ───────── การซื้อ / การจ่าย (Purchasing / Payments) ───────── */

/** Payment method for outgoing payments (purchases / payroll). */
export type PayMethodOut = 'เงินสดย่อย' | 'โอน' | 'เช็ค'

/** One line on a purchase order (ใบสั่งซื้อ). */
export interface PurchaseOrderItem {
  desc: string   /* item / material description */
  qty: number
  unit: string   /* e.g. ตัน, ถุง, เที่ยว, ชิ้น */
  price: number  /* unit price (baht) */
}
export type PurchaseStatus = 'รอรับของ' | 'รับของแล้ว'
/** Purchase order — buying materials/goods from a supplier (เจ้าหนี้/ซัพพลายเออร์). */
export interface PurchaseOrder {
  id: string         /* = poNo */
  poNo: string       /* running no., e.g. PO00001 */
  orderDate: string  /* ISO yyyy-mm-dd */
  dueDate: string    /* ISO — expected delivery date (optional value) */
  supplier: string
  items: PurchaseOrderItem[]
  status: PurchaseStatus
  note?: string
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string
}

/** Goods / material payment voucher (ใบทำจ่ายสินค้า/วัสดุ) — recording a payment
    made to a supplier for purchased goods. */
/** One product / material line on a goods-payment voucher.
    Line total = qty × unitPrice. */
export interface GoodsPaymentItem {
  name: string
  qty: number
  unitPrice: number
}

/** ประเภทบัญชี cost center recorded on a บันทึกรายจ่าย / ใบสำคัญจ่าย. Free-form so
    users can add their own (from the ประเภทบัญชี cost center page or inline in the
    two forms); the built-ins below are always offered first. */
export type GoodsPaymentCategory = string
/** Built-in ประเภทบัญชี cost center — always shown first in the pickers. */
export const GOODS_PAYMENT_CATEGORIES: GoodsPaymentCategory[] = [
  'สินทรัพย์', 'ค่าน้ำมัน', 'ค่าไฟฟ้า', 'ค่าวัสดุสิ้นเปลือง',
  'ค่าอะไหล่และเครื่องมือ', 'ค่าใช้จ่ายยานพาหนะ', 'ค่าบริการ', 'ค่าซื้อวัตถุดิบ',
]
/** For a 'ค่าซื้อวัตถุดิบ' voucher — which SITE the raw materials are for. */
export type GoodsPaymentSite = 'แพล้นปูน' | 'โรงหล่อ'

/** สินทรัพย์ (asset registry) — vehicles / equipment owned per SITE. */
export interface Asset {
  id: string
  name: string          /* ชื่อสินทรัพย์ เช่น "รถโม่ 001" */
  type?: string         /* ประเภท เช่น รถโม่ / รถกะบะ / รถโฟล์คลิฟท์ */
  plate?: string        /* ทะเบียน (ถ้ามี) */
  site: GoodsPaymentSite /* แพล้นปูน / โรงหล่อ — เลือกเสมอ */
  vehicleId?: string    /* ผูกกับหมายเลขรถโม่ (VEHICLES) ถ้าเป็นรถโม่ */
  note?: string
  createdBy?: string
  createdAt?: string
}

/** Seed asset list — the 4 mixer trucks (แพล้นปูน) plus the foundry (โรงหล่อ)
    pickup and forklift. Applied once; add/edit/delete then persist over it. */
export const SEED_ASSETS: Asset[] = [
  ...VEHICLES.map((v) => ({ id: `asset_veh_${v.id}`, name: `รถโม่ ${v.id}`, type: 'รถโม่', plate: v.plate, site: 'แพล้นปูน' as GoodsPaymentSite, vehicleId: v.id })),
  { id: 'asset_pickup_bg6262', name: 'รถกะบะ', type: 'รถกะบะ', plate: 'บง 6262', site: 'โรงหล่อ' },
  { id: 'asset_forklift_1', name: 'รถโฟล์คลิฟท์', type: 'รถโฟล์คลิฟท์', site: 'โรงหล่อ' },
]

export interface GoodsPayment {
  id: string         /* = gpNo */
  gpNo: string       /* voucher no. PVYYMMDD-XXXX, e.g. PV690718-0001 */
  payDate: string    /* ISO */
  supplier: string
  /** ประเภทค่าใช้จ่าย (expense category). Optional for legacy vouchers. */
  category?: GoodsPaymentCategory
  /** SITE — only when category is 'ค่าซื้อวัตถุดิบ' (แพล้นปูน / โรงหล่อ). */
  site?: GoodsPaymentSite
  /** Itemised product/material lines. When present, `amount` = Σ(qty×unitPrice). */
  items?: GoodsPaymentItem[]
  amount: number     /* baht paid */
  method: PayMethodOut
  chequeNo?: string  /* เลขที่เช็ค — required when method is 'เช็ค' */
  ref?: string       /* optional reference — PO no. / invoice no. */
  /** Whether this voucher records VAT (ลง VAT). Defaults to true when omitted. */
  withVat?: boolean
  /** เดือนที่ยื่น VAT ("YYYY-MM") — which filing period the purchase-tax report
      counts this voucher under. Defaults to the ออกใบ (payDate) month; editable
      later. Only meaningful when ลง VAT. Unset ⇒ fall back to payDate's month. */
  vatMonth?: string
  /** Supplier's tax-invoice number (เลขที่ใบกำกับ) — shown as the doc no. in
      the purchase-tax report when this voucher is ลง VAT. */
  taxInvoiceNo?: string
  note?: string
  /** บันทึกรายจ่าย ids this voucher was issued from — recorded on cancel so the
      linked expenses can be reverted to unbilled (and re-linked on restore). */
  expenseIds?: string[]
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string
}

/** บันทึกรายจ่าย — a recorded expense line, categorised and split by SITE, that
    can later be turned into one or more ใบสำคัญจ่าย (goods-payment voucher). Kept
    separate from GoodsPayment so expenses can be logged before a voucher is issued
    and grouped onto a voucher in batches. */
export interface ExpenseRecord {
  id: string          /* internal id, e.g. ex_<timestamp> */
  date: string        /* ISO yyyy-mm-dd — expense date */
  category: GoodsPaymentCategory
  site: GoodsPaymentSite      /* แพล้นปูน / โรงหล่อ — required on every expense */
  supplier?: string   /* ผู้รับเงิน / ซัพพลายเออร์ (optional) */
  detail?: string     /* รายละเอียดค่าใช้จ่าย */
  amount: number      /* baht — for ค่าน้ำมัน this equals liters × pricePerLiter */
  withVat?: boolean   /* ลง VAT — defaults to true when omitted */
  /** Fuel (ค่าน้ำมัน) details — present only when category === 'ค่าน้ำมัน'. */
  vehicleId?: string       /* รถโม่ ที่เติมน้ำมัน */
  liters?: number          /* จำนวนลิตรที่เติม */
  pricePerLiter?: number   /* ราคาต่อลิตร (ไฮดีเซล) */
  odometer?: number        /* เข็มไมล์ (กม.) ณ เวลาที่เติม */
  note?: string
  /** เลขที่ใบสำคัญจ่ายที่ออกจากรายการนี้ — set once billed (links back to the voucher). */
  voucherNo?: string
  createdBy?: string
  createdAt: string
}

/** A ไฮดีเซล pump price effective from a given date (yyyy-mm-dd). The price for any
    fill date is the latest entry with `date` on or before it. Built up automatically
    as ค่าน้ำมัน records are saved. */
export interface DieselPrice { date: string; price: number }

/** ราคาไฮดีเซล (บาท/ลิตร) effective on `onDate` — the newest schedule entry dated on
    or before it, falling back to the seed rate when the schedule has nothing earlier. */
export function dieselPriceOn(prices: DieselPrice[], onDate: string): number {
  let best: DieselPrice | null = null
  for (const p of prices) {
    if (p.date <= onDate && (!best || p.date > best.date)) best = p
  }
  return best ? best.price : DIESEL_PRICE_PER_LITER
}

/** Payroll payment voucher (ใบทำจ่ายเงินเดือน) — recording a salary payment to
    an employee. Mirrors the printed pay-slip breakdown.
    netAmount = totalIncome − totalDeduction. */
export interface PayrollPayment {
  id: string         /* = ppNo */
  ppNo: string       /* running no., e.g. PR00001 */
  payMonth: string   /* "YYYY-MM" the salary is for */
  employeeId: string
  employeeName: string
  position?: string  /* ตำแหน่ง — snapshot of employee role */
  department?: string /* ฝ่าย — snapshot (Thai label) */
  bankAccount?: string /* เลขที่บัญชี */
  /* แรงงานรายวัน: เงินเดือน = daysWorked × dailyWage (optional, day-rate only) */
  daysWorked?: number  /* จำนวนวันทำงาน */
  dailyWage?: number   /* อัตราเงินรายวัน */
  /* รายได้ (income) */
  baseSalary: number     /* เงินเดือน (รายเดือน หรือ ผลรวมรายวัน) */
  experiencePay: number  /* ประสบการณ์ */
  specialPay: number     /* เงินพิเศษ */
  vehiclePay: number     /* รักษารถ */
  otherIncome: number    /* อื่นๆ */
  totalIncome: number    /* รวมรับ */
  /* เงินหัก (deductions) */
  socialSecurity: number /* ประกันสังคม */
  advance: number        /* เบิกล่วงหน้า */
  otherDeduction: number /* อื่นๆ */
  totalDeduction: number /* รวมหัก */
  netAmount: number      /* เงินได้สุทธิ */
  payDate: string    /* ISO */
  method: PayMethodOut
  note?: string
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string
}

/** Advance withdrawal (เบิกล่วงหน้า) — money paid to an employee before payday,
    deducted from that period's payroll. `payMonth` ties it to the งวด it offsets. */
export interface AdvancePayment {
  id: string         /* = advNo */
  advNo: string      /* running no., e.g. ADV00001 */
  date: string       /* ISO date the advance was paid */
  payMonth: string   /* "YYYY-MM" the period it is deducted from */
  employeeId: string
  employeeName: string
  amount: number
  method: PayMethodOut
  note?: string
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string
}

/** One leave record (บันทึกวันลา) for an employee — a date range and the number
    of leave days it consumes (0.5 = ครึ่งวัน). */
export interface LeaveRecord {
  id: string
  employeeId: string
  employeeName: string
  from: string        /* ISO date */
  to: string          /* ISO date (= from for a single day) */
  days: number        /* จำนวนวันลา */
  /** ครึ่งวัน — 'morning' = ครึ่งเช้า (ลาเช้า), 'afternoon' = ครึ่งบ่าย (ลาบ่าย).
      ใช้ค่าเดียวกับ attendance.leave เพื่อเช็คต่อในบันทึกลงเวลางาน. ตั้งเมื่อ days = 0.5. */
  half?: 'morning' | 'afternoon'
  leaveType?: string  /* ลากิจ / ลาป่วย / ลาพักร้อน */
  note?: string
  createdBy?: string
  createdAt: string
}

/** Standing salary structure per employee (ปรับโครงสร้างเงินเดือน) — the base
    figures used to pre-fill payroll vouchers. Keyed by Employee.id. */
export interface SalaryStructure {
  baseSalary: number      /* ค่าเงินเดือน (พนักงานรายเดือน) */
  dailyWage: number       /* เงินรายวัน (แรงงานรายวัน) — 0 ถ้าไม่ใช่รายวัน */
  experiencePay: number   /* ค่าประสบการณ์ */
  socialSecurity: number  /* ค่าประกันสังคม (ปกส.) */
  otRatePerMinute: number /* อัตราค่าแรงโอที — บาท/นาที (เช่น 1.5) */
  /* รับเงิน OT จากบันทึกลงเวลางานไหม — undefined/true = รับ, false = ไม่รับ
     (ตอนทำใบจ่ายเงินเดือนช่อง OT จะถูกปิด). */
  otEligible?: boolean
  /* รับค่าคอมมิชชั่นไหม — undefined/true = รับ, false = ไม่รับ
     (หน้าบันทึกค่าคอมมิชชั่นจะไม่แสดงพนักงานคนนี้). */
  commissionEligible?: boolean
  /* ร่วมค่าเที่ยวรถโม่ไหม — default = false (ไม่ร่วม). ฝ่ายจัดส่งทุกคน +
     ผู้จัดการที่ร่วม = true, คนอื่น = false. */
  truckTripEligible?: boolean
  /* สิทธิ์วันลา (วัน/ปี) — ปรับได้จากหน้าปรับโครงสร้าง. */
  leaveDays?: number
  lastAdjustedAt?: string /* ISO timestamp ของการปรับเงินเดือนครั้งล่าสุด */
}

/** One changed field within a salary-structure adjustment. */
export interface StructureChange { label: string; from: number; to: number }
/** History entry for a salary-structure adjustment (ประวัติการปรับโครงสร้าง). */
export interface SalaryStructureAdjustment {
  at: string          /* ISO timestamp */
  by?: string         /* username of the saver (audit) */
  employeeId: string
  employeeName: string
  changes: StructureChange[]
}

/** One delivery ticket's mixer-truck trip record (บันทึกเที่ยวรถโม่ตามใบจ่าย),
    keyed by DeliveryTicket.dtNo. Only customer (ขายลูกค้า) tickets earn a trip fee;
    โรงหล่อ / ใช้เอง tickets are logged but never charged. */
export interface TruckTripEntry {
  over20?: boolean   /* วิ่งเกิน 20 กม. → higher per-trip rate */
  ot18?: boolean     /* วิ่งหลัง 18:00 → +10 บาท */
  ot22?: boolean     /* วิ่งหลัง 22:00 → +10 บาท */
  /** Per-ticket driver override — defaults to the delivering truck's driver.
      The truck itself is read straight from the delivery ticket (not editable). */
  driver?: string
}

/* ───────── รายงานทั่วไป (General reports — saved snapshots) ───────── */

/** One detail line in a saved mixer-truck-trip report. */
export interface TruckTripReportRow {
  trip: number       /* running customer-trip number (0 for โรงหล่อ/ใช้เอง) */
  forLabel: string   /* ลูกค้า / โรงหล่อ / ใช้เอง */
  monthLabel: string /* short Thai month, e.g. เม.ย. */
  date: string       /* DD/MM/YY as printed on the ticket */
  dp: string         /* delivery-ticket DP number */
  vehicle: string    /* '' when the ticket has no truck */
  plate: string
  driver: string
  m3: number
  over20: boolean
  ot18: boolean
  ot22: boolean
  fee: number
}
/** Per-truck rollup row in a saved report. */
export interface TruckTripReportTruck {
  vehicle: string; plate: string; wheel: string; driver: string
  trips: number; normal: number; over: number; ot18: number; ot22: number; m3: number; fee: number
}
/** One employee's commission line in a saved commission report. */
export interface CommissionLine { name: string; rate: number; amount: number }

/** Standing commission rate per employee (บาท/คิว) — editable, persisted, and
    snapshotted into each report. Defaults mirror the company's paper form. */
export interface CommissionRate { name: string; rate: number }
export const DEFAULT_COMMISSION_RATES: CommissionRate[] = [
  { name: 'นายสหรัฐ เพ็ชรฉิม', rate: 3.0 },
  { name: 'นายชัยวัฒน์ ขุนเพ็ชร', rate: 2.0 },
  { name: 'นายกฤษฎา ปิ่นเกตุ', rate: 1.5 },
  { name: 'นางสาวเพียงแข ตันยุชน', rate: 1.5 },
]

/* Fields common to every saved report shown under the รายงานทั่วไป menu. */
/** One line on a foundry goods-delivery note (ใบส่งสินค้าโรงหล่อ). */
export interface FoundryDeliveryItem {
  code: string
  name: string
  unit: string
  qty: number
  /** การรับของ for price-by-pickup items (เสาไอ) — รับเอง / จัดส่ง. */
  pickup?: 'รับเอง' | 'จัดส่ง'
}
/** Foundry goods-delivery note (ใบส่งสินค้าชั่วคราว · โรงหล่อ) — a non-priced
    delivery slip for foundry products. The delivery number is keyed in by hand. */
export interface FoundryDelivery {
  id: string          /* = fdNo */
  fdNo: string        /* เลขที่ส่งสินค้า — entered manually */
  date: string        /* ISO yyyy-mm-dd */
  customer: string
  vehicle: string     /* ทะเบียนรถ */
  items: FoundryDeliveryItem[]
  note?: string
  createdBy?: string
  createdAt: string
}

/** A calendar appointment (นัดหมาย) shown on the owner's + invitees' calendars. */
export interface Appointment {
  id: string
  date: string        /* ISO yyyy-mm-dd */
  time?: string       /* optional HH:mm */
  title: string
  note?: string
  owner: string       /* username who created it */
  invitees: string[]  /* usernames the appointment is also shown to */
  createdBy?: string
  createdAt?: string
}
/** A private to-do note (สิ่งที่ต้องทำ) — visible only to its owner. */
export interface TodoNote {
  id: string
  owner: string       /* username */
  text: string
  done: boolean
  createdBy?: string
  createdAt?: string
}

/** A raw-material stock receipt (รับเข้าวัตถุดิบ) — adds to the on-hand balance. */
export interface StockReceipt {
  id: string
  code: string        /* StockMaterial.code */
  material: string    /* name snapshot */
  unit: string
  qty: number         /* received quantity (positive) */
  date: string        /* ISO yyyy-mm-dd */
  supplier?: string
  voucherNo?: string  /* เลขใบสำคัญจ่าย (related goods-payment voucher) */
  /* Foundry receipts — production report references. */
  reportBook?: string /* เล่มใบรายงาน */
  reportNo?: string   /* เลขที่ใบรายงาน */
  bench?: string      /* แท่นผลิต */
  note?: string
  createdBy?: string
  createdAt?: string
}

/** Movement direction in the manual per-material stock card. */
export type StockMovementKind = 'in' | 'out'
/** One line in the manual plant raw-material stock card (บันทึกวัตถุดิบแยกประเภท):
    a รับเข้า (kind 'in', with unit price + amount) or จ่ายออก (kind 'out') for one
    plant material, mirroring the paper stock card. The running คงเหลือ is derived
    (ยอดยกมา + Σรับ − Σจ่าย); it is not stored on the row. */
export interface StockMovement {
  id: string
  code: string           /* StockMaterial.code (plant material) */
  kind: StockMovementKind
  date: string           /* ISO yyyy-mm-dd */
  qty: number            /* positive quantity moved */
  unitPrice?: number     /* หน่วยละ (บาท/หน่วย) — รับเข้า only */
  amount?: number        /* จำนวนเงิน = qty × unitPrice — รับเข้า only */
  supplier?: string      /* ผู้จำหน่าย — รับเข้า only, optional, editable later */
  voucherNo?: string     /* เลขที่ใบสำคัญ — editable after the fact */
  note?: string          /* หมายเหตุ */
  createdBy?: string
  createdAt?: string
}

/** One material line in a stock reconciliation (กระทบยอดคงคลัง). */
export interface StockReconcileLine {
  code: string
  material: string
  unit: string
  systemQty: number   /* on-hand per system at reconcile time */
  countedQty: number  /* physical count */
  diff: number        /* countedQty − systemQty (negative = ขาด/หาย) */
  diffPct: number     /* diff / systemQty × 100 */
  unitCost: number    /* บาท/หน่วย used for valuation */
  diffValue: number   /* diff × unitCost */
  note?: string
}
/** Approval state of a reconciliation. draft → pending (รออนุมัติ) → approved
    (Board approves; counted quantities are then applied to stock). */
export type StockReconcileStatus = 'draft' | 'pending' | 'approved'
/** A stock reconciliation snapshot — recorded for audit. Counted quantities are
    applied to the on-hand balance only once a Board user approves it. */
export interface StockReconcile {
  id: string
  /** Which stock this reconciles — plant raw materials (default), foundry
      products, or foundry raw materials. */
  scope?: 'material' | 'foundry' | 'foundry-material'
  date: string        /* ISO yyyy-mm-dd */
  lines: StockReconcileLine[]
  totalDiffValue: number  /* Σ diffValue (net, signed) */
  lossValue: number       /* Σ of shortages only (positive baht damaged/lost) */
  note?: string
  status: StockReconcileStatus
  requestedBy?: string
  requestedAt?: string
  approvedBy?: string
  approvedAt?: string
  createdBy?: string
  createdAt?: string
}

/** Employee termination record (สิ้นสภาพพนักงาน) — one per employee. Triggers a
    notification to Board users. */
export interface EmployeeTermination {
  id: string          /* = empId */
  empId: string
  empName: string
  createdBy?: string   /* who marked the termination */
  createdAt?: string
}

interface GeneralReportBase {
  id: string
  title: string      /* e.g. "บันทึกเที่ยวรถโม่ 03/01/2569 ถึง 28/04/2569" */
  fromLabel: string  /* DD/MM/พ.ศ. */
  toLabel: string
  createdBy?: string
  createdAt: string
}
/** Mixer-truck-trip report snapshot. */
export interface TruckTripReport extends GeneralReportBase {
  kind: 'truck-trips'
  rows: TruckTripReportRow[]
  trucks: TruckTripReportTruck[]
  drivers: { driver: string; trips: number; fee: number }[]
  totals: { totalM3: number; tripTotal: number; feeTotal: number }
}
/** One delivery-ticket detail line in a saved commission report (each รายการ in
    the selected range). `counted` = a customer sale that feeds the commission
    volume; false rows are โรงหล่อ/ใช้เอง (shown pink, excluded from the total). */
export interface CommissionReportTicket {
  date: string      /* DD/MM/YY as printed on the ticket */
  dp: string        /* delivery-ticket ref / DP number */
  customer: string
  prod: string      /* short product label */
  type: string      /* ขายลูกค้า / โรงหล่อ / ใช้เอง */
  m3: number
  counted: boolean  /* true = ขายลูกค้า (นับรวมยอด); false = โรงหล่อ/ใช้เอง (สีชมพู) */
}
/** Sales-commission report snapshot — commission = rate (บาท/คิว) × ยอดขายให้
    ลูกค้า (คิว), paid only when the volume qualifies (≥ 490 คิว). */
export interface CommissionReport extends GeneralReportBase {
  kind: 'commission'
  volumeM3: number   /* concrete sold to customers in the range (คิว) */
  qualifies: boolean /* volume ≥ 490 — pays only when true */
  status: string     /* human-readable threshold status */
  lines: CommissionLine[]
  total: number
  /** Per-ticket detail for the selected range (customer + foundry), sorted by
      date. Optional so reports saved before this field parse cleanly. */
  tickets?: CommissionReportTicket[]
}
/** One employee's row in a saved time-attendance report. */
export interface AttendanceReportEmployee {
  empId: string
  empName: string
  days: number       /* จำนวนวันที่มา (records in range) */
  lateMin: number    /* สายรวม (นาที) */
  leaveDays: number  /* ลา (วัน) — ลาครึ่งวัน (ลาเช้า/ลาบ่าย) นับ 0.5 ต่อครั้ง */
  forgotCount: number /* ลืมลงเวลา (ครั้ง) — วันที่ลืมขาเข้า/ขาออก ในช่วง */
  otRawMin: number   /* ล่วงเวลารวม (นาที) — เวลาที่อยู่เกินเลิกงาน ก่อนหักสาย */
  otMin: number      /* OT สุทธิ (นาที) — หลังหักสาย; 0 when not OT-eligible (shown as "-") */
  otEligible: boolean /* false → OT columns show "-" */
}
/** One day's clock-in/out detail for the per-employee daily breakdown table.
    Times are the effective (auto-filled where forgotten) values shown in the grid. */
export interface AttendanceReportDay {
  empId: string
  empName: string
  date: string           /* DD/MM/พ.ศ. */
  clockIn: string        /* effective เข้า ('' when none) */
  clockOut: string       /* effective ออก ('' when none) */
  forgot: 'in' | 'out' | null  /* ลืมขาเข้า / ลืมขาออก */
  leave: 'morning' | 'afternoon' | null  /* ลาเช้า / ลาบ่าย */
  otRawMin: number       /* ล่วงเวลา (นาที) — effective, ก่อนหักสาย */
  lateMin: number        /* สาย (นาที) — effective */
  otMin: number          /* OT สุทธิ (นาที) — effective, per day (หลังหักสาย) */
  source: 'scan' | 'manual'
}
/** Time-attendance report snapshot (บันทึกลงเวลางาน) — per-employee วัน/สาย/OT. */
export interface AttendanceReport extends GeneralReportBase {
  kind: 'attendance'
  /** Actual data coverage — earliest/latest record date present in the report
      (DD/MM/พ.ศ.). Differs from from/toLabel, which are the selected filter range
      (whose `to` may run ahead of the latest data that actually exists). */
  dataFromLabel?: string
  dataToLabel?: string
  employees: AttendanceReportEmployee[]
  /** Daily เข้า–ออก detail, sorted by employee then date (person-by-person).
      Optional so reports saved before this field parse cleanly. */
  days?: AttendanceReportDay[]
  totals: { employees: number; days: number; leaveDays: number; lateMin: number; forgotCount: number; otRawMin: number; otMin: number }
}
/** One product row in a saved price-list report. */
export interface PriceListReportRow {
  formulaNo?: string /* สูตรการผลิต — CFx-xxx (แพล้นปูน) / FFxx-xxx (โรงหล่อ); optional for older reports */
  code: string
  name: string
  brand?: string     /* ปูนซีเมนต์ — ดอกบัว / SCG (concrete items only) */
  zone?: string      /* ระยะส่ง — e.g. "On Site (≤20 km)" (concrete items only) */
  strengthKsc?: number /* กำลังอัด (ksc) — 0 = Lean; used to sort Lean→low→high */
  unit: string
  pickup?: string    /* การรับของ — รับเอง / จัดส่ง (foundry items only) */
  /** Foundry items priced per collection method — shown as two prices in the
      ราคา/หน่วย cell (รับเอง / จัดส่ง). */
  pickupPrices?: { 'รับเอง': number; 'จัดส่ง': number }
  price: number
  /** สูตรวัตถุดิบ (Mix Design) per 1 คิว — concrete/plant items only. */
  mix?: { cement: number; sand: number; aggregate: number; water: number; plastomix?: number; sikament?: number; pce?: number; accelerator?: number; waterproof?: number }
  /** สถานะการขาย — true = งดจำหน่าย (shown at the bottom, tagged). Unset = จำหน่าย. */
  discontinued?: boolean
}
/** One category group (หมวดหมู่) in a price-list report. */
export interface PriceListReportGroup { label: string; rows: PriceListReportRow[] }
/** Price-list snapshot (ราคาสินค้า) — products grouped by category, listed down. */
export interface PriceListReport extends GeneralReportBase {
  kind: 'price-list'
  scopeLabel: string  /* which SITE/filter the snapshot covers, e.g. "โรงหล่อ" */
  groups: PriceListReportGroup[]
  totalItems: number
}
/** Transport-surcharge price snapshot (ราคาค่าขนส่งไม่เต็มเที่ยว). */
export interface TransportPriceReport extends GeneralReportBase {
  kind: 'transport-pricing'
  fees: { m3: number; totalWithVat: number }[]
  fullM3: number      /* full-load คิว threshold (ค่าขนส่งคิดเมื่อต่ำกว่านี้) */
  fuelPrice?: number  /* Hi-Diesel snapshot บาท/ลิตร */
  fuelAsOf?: string
}
/** One payroll-payment row in a saved payroll report (mirrors PayrollPayment). */
export interface PayrollReportRow {
  ppNo: string
  employeeName: string
  department?: string
  daysWorked?: number
  dailyWage?: number
  baseSalary: number
  experiencePay: number
  specialPay: number
  vehiclePay: number      /* OT amount (ทั่วไป) หรือ ค่าเที่ยววิ่ง (ฝ่ายขนส่ง) */
  otherIncome: number
  totalIncome: number
  socialSecurity: number
  advance: number
  otherDeduction: number
  totalDeduction: number
  netAmount: number
}
/** Group a payroll report filters into: plant / foundry-Thai / foundry-Myanmar / all. */
export type PayrollReportScope = 'plant' | 'foundry-thai' | 'foundry-myanmar' | 'all'
/** One group's table inside a bundled payroll report (printed one per page). */
export interface PayrollReportSection {
  label: string           /* e.g. "เงินเดือนแพล้นปูน" */
  rows: PayrollReportRow[]
  totals: { income: number; deduction: number; net: number }
}
/** Payroll payout report (รายงานการจ่ายเงินเดือน). Bundles all groups —
    รวม / แพล้นปูน / โรงหล่อไทย / โรงหล่อพม่า — as `sections`, one table per
    printed page. `rows`/`totals` mirror the รวม section for backward-compat with
    reports saved before `sections` existed. */
export interface PayrollReport extends GeneralReportBase {
  kind: 'payroll'
  scope: PayrollReportScope
  scopeLabel: string
  payMonthLabel: string   /* e.g. "พฤษภาคม 2569" */
  rows: PayrollReportRow[]
  totals: { income: number; deduction: number; net: number }
  /** Per-group tables (page 1 รวม, 2 แพล้นปูน, 3 โรงหล่อไทย, 4 โรงหล่อพม่า). */
  sections?: PayrollReportSection[]
}
/** One mix-design row in a saved report (kg/m³ + admixture ลิตร/m³). */
export interface MixDesignReportRow {
  formulaNo?: string  /* เลขที่สูตร — CF0-xxx / CF2-xxx (optional for reports saved before it existed) */
  code: string
  name: string
  brand: string       /* 'SCG' | 'ดอกบัว' */
  cement: number
  sand: number
  aggregate: number
  plastomix?: number
  sikament?: number
  pce?: number
}
/** Mix-design report (รายงานสูตรส่วนผสมคอนกรีต). */
export interface MixDesignReport extends GeneralReportBase {
  kind: 'mix-design'
  scopeLabel: string
  rows: MixDesignReportRow[]
}
/** One row in a saved foundry-formula report (reinforcement per 1 piece). */
export interface FoundryFormulaReportRow {
  formulaNo: string   /* FFGS/FFIP/FFCW-xxx */
  code: string
  name: string
  kind: string        /* Thai kind label — แผ่นพื้น / เสาไอ / แผ่นผนัง */
  dims?: string       /* ขนาด ก×หนา×ยาว (ม.) */
  wireMesh?: number   /* ตะแกรงเหล็กไวร์เมช (ผืน) */
  tieSteel?: number   /* เหล็กปลอก (ตัว) */
  pcWire?: number     /* ลวดอัดแรง (เส้น) */
  concrete?: number   /* คอนกรีต (ลบ.ม.) */
}
/** Foundry production-formula report (รายงานสูตรผลิตโรงหล่อ). */
export interface FoundryFormulaReport extends GeneralReportBase {
  kind: 'foundry-formula'
  scopeLabel: string
  rows: FoundryFormulaReportRow[]
}
/** One material row in a saved stock report. */
export interface StockReportRow {
  code: string
  material: string
  unit: string
  received: number   /* รับเข้าในช่วง */
  issued: number     /* จ่ายออกในช่วง */
  balance: number    /* คงเหลือ ณ สิ้นช่วง */
  reorder: number
  status: string
}
/** One movement line (รับเข้า/จ่ายออก) included in a stock report. */
export interface StockReportMovement {
  date: string
  kind: 'in' | 'out'
  material: string
  unit: string
  qty: number
  ref: string
  detail?: string
}
/** Raw-material stock report (รายงานคลังวัตถุดิบ) for a period. */
export interface StockReport extends GeneralReportBase {
  kind: 'stock'
  heading?: string    /* doc title — defaults to "รายงานคลังวัตถุดิบ" */
  scopeLabel: string
  rows: StockReportRow[]
  movements: StockReportMovement[]
}
/** One debtor/creditor row in a saved ลูกหนี้ / เจ้าหนี้ report. Common fields
    carry for both sides; the side-specific columns are optional. */
export interface LedgerReportRow {
  name: string
  detail?: string     /* creditor note / supplier code; blank for debtors */
  terms?: string      /* creditor: เงินสด / เครดิต N วัน (creditors only) */
  tickets?: number    /* debtor: number of delivery tickets (debtors only) */
  m3?: number         /* debtor: total volume in คิว (debtors only) */
  sales?: number      /* debtor: ยอดซื้อในช่วง (debtors only) */
  outstanding: number /* ค้างชำระ (both sides) */
  dueLabel?: string   /* วันครบกำหนด — dd/mm/พ.ศ., blank when none */
  status: string      /* สถานะการชำระ — human-readable */
  overdue: boolean    /* true → เลยกำหนด (drives the overdue tally) */
}
/** Debtors / creditors snapshot (รายงานลูกหนี้ / เจ้าหนี้). One report covers a
    single side; the toggle on the ลูกหนี้ / เจ้าหนี้ page chooses which. */
export interface LedgerReport extends GeneralReportBase {
  kind: 'ledger'
  side: 'debtors' | 'creditors'
  scopeLabel: string  /* period / filter the snapshot covers (e.g. "ทั้งปี 2569") */
  rows: LedgerReportRow[]
  totals: { count: number; outstanding: number; overdue: number; sales?: number }
}
/** One employee row in a saved รายชื่อพนักงาน report. Labels are snapshotted in
    Thai so the printed sheet is self-contained. */
export interface EmployeeReportRow {
  id: string
  name: string
  nickname?: string
  role: string
  department: string  /* ฝ่าย — Thai label */
  site?: string       /* Site — Thai label, blank when unset */
  nationality?: string
  phone?: string
  bankName?: string
  bankAccount?: string
  startDate?: string  /* ISO yyyy-mm-dd as displayed */
  years?: string      /* อายุงาน display (e.g. "2 ปี 3 เดือน") */
  terminated: boolean /* true → สิ้นสภาพ */
}
/** Employee roster snapshot (รายงานรายชื่อพนักงาน) for a department filter. */
export interface EmployeeReport extends GeneralReportBase {
  kind: 'employees'
  scopeLabel: string  /* filter the snapshot covers, e.g. "ทั้งหมด" / "ฝ่ายผลิต" */
  rows: EmployeeReportRow[]
  totals: { count: number; active: number; terminated: number }
}
/** Monthly expense report (ค่าใช้จ่าย · ลง VAT) — one row per month, one column
    per expense category (excludes ค่าซื้อวัตถุดิบ). `values` align to `categories`. */
export interface ExpenseReport extends GeneralReportBase {
  kind: 'expense'
  scopeLabel: string
  categories: string[]
  rows: { month: string; values: number[]; total: number }[]
  colTotals: number[]
  grandTotal: number
}

/** One SITE's amounts on a purchase-account row (VAT split). */
export interface PurchaseSiteAmount { base: number; vat: number; total: number }
/** Purchase account (บัญชีซื้อสินค้า · ค่าซื้อวัตถุดิบ ลง VAT) — one row per month,
    split into แพล้นปูน (left) and โรงหล่อ (right), each with base + VAT + total. */
export interface PurchaseAccountReport extends GeneralReportBase {
  kind: 'purchase-account'
  scopeLabel: string
  rows: { month: string; plant: PurchaseSiteAmount; foundry: PurchaseSiteAmount }[]
  totals: { plant: PurchaseSiteAmount; foundry: PurchaseSiteAmount }
}

/** One employee's line on a mid-month advance sheet (เบิกเงินกลางเดือน). */
export interface MidMonthAdvanceRow {
  employeeId: string
  date: string        /* DD/MM/พ.ศ.(2 หลัก) — e.g. "15/06/69" */
  name: string        /* ชื่อ-สกุล */
  nickname?: string   /* ชื่อเล่น */
  role: string        /* "พนักงาน" column — short role label, e.g. "พจส." / "ผลิต" / "คนงาน" */
  amount: number      /* จำนวนเงินที่เบิก (0 พิมพ์เป็น "-") */
  receiver?: string   /* ผู้รับเงิน (ปกติเว้นไว้ให้เซ็น) */
}
/** One page of the mid-month advance report (แพล้นปูน หรือ โรงหล่อคนพม่า). */
export interface MidMonthAdvanceSection {
  key: 'plant' | 'foundry-thai' | 'foundry'
  heading: string     /* หัวข้อบนหน้ากระดาษ เช่น "เงินเบิกกลางเดือนแพล้นปูน" */
  rows: MidMonthAdvanceRow[]
  total: number
}
/** Mid-month salary-advance report (เบิกเงินกลางเดือน) — one report per เดือน,
    two pages: แพล้นปูน (คนไทย) + โรงหล่อ (คนงานพม่า). */
export interface MidMonthAdvanceReport extends GeneralReportBase {
  kind: 'mid-month-advance'
  monthLabel: string  /* "มิถุนายน 2569" */
  payer?: string      /* ผู้จ่าย (ไม่บังคับ) */
  sections: MidMonthAdvanceSection[]
  totals: { amount: number }  /* รวมทั้งสองหน้า */
}

/** One fill line in a saved ค่าน้ำมันรถ report (snapshot of a ค่าน้ำมัน expense). */
export interface FuelReportRow {
  date: string             /* ISO yyyy-mm-dd */
  reg: string              /* ทะเบียนรถ (plate / name) */
  driver?: string          /* พนง.ขับรถ — 'all' mode */
  site?: GoodsPaymentSite  /* SITE — 'all' mode */
  mixer: boolean           /* true ⇒ liters count in the ลิตร(รถปูน) column */
  liters?: number
  pricePerLiter?: number
  amount: number
  odometer?: number        /* เข็มไมล์ — 'mixer' mode */
  baseline?: boolean       /* ยอดยกมา (last fill before the range) — 'mixer' mode */
}
/** One per-truck summary line in a saved ค่าน้ำมันรถ report. */
export interface FuelReportSummaryRow {
  reg: string
  liters: number
  amount: number
  count?: number            /* 'all' mode: จำนวนครั้งที่เติม */
  km?: number               /* 'mixer' mode: กิโลเมตรที่วิ่งได้ */
  kmPerL?: number | null    /* 'mixer' mode: อัตราสิ้นเปลือง */
  bahtPerKm?: number | null /* 'mixer' mode: บาท/กิโลเมตร */
}
/** Saved ค่าน้ำมันรถ report — mode 'all' (ทุกคัน · 2 SITE) or 'mixer' (รถโม่ +
    อัตราสิ้นเปลือง). Denormalised so the Doc is a pure renderer. */
export interface FuelUsageReport extends GeneralReportBase {
  kind: 'fuel'
  mode: 'all' | 'mixer'
  rows: FuelReportRow[]
  summary: FuelReportSummaryRow[]
  totals: { liters: number; mixerLiters: number; otherLiters: number; amount: number; count: number }
}

export type GeneralReport = TruckTripReport | CommissionReport | AttendanceReport | PriceListReport | TransportPriceReport | PayrollReport | MixDesignReport | FoundryFormulaReport | StockReport | LedgerReport | EmployeeReport | ExpenseReport | PurchaseAccountReport | MidMonthAdvanceReport | FuelUsageReport

const KEY = 'kpc.createdDocs.v1'

interface Hidden {
  tickets: string[]
  invoices: string[]
  billingNotes: string[]
  receipts: string[]
  /** Employee ids deleted from the roster (hides seed employees; added ones are
      removed from employeesAdded outright). */
  employees: string[]
  /** Product codes deleted from the price list (hides seed products; added ones
      are removed from productsAdded outright). */
  products: string[]
}

/** A deleted ใบจ่ายคอนกรีต kept for the audit-history table — the full ticket
    snapshot plus who removed it and when. */
export interface DeletedTicket extends DeliveryTicket {
  deletedAt: string
  deletedBy: string
}

/** Deleted records kept for their pages' audit-history tables (snapshot + who/when). */
export interface DeletedSalesOrder extends SalesOrder { deletedAt: string; deletedBy: string }
export interface DeletedQuotation extends Quotation { deletedAt: string; deletedBy: string }
export interface DeletedFoundryBoq extends FoundryBoq { deletedAt: string; deletedBy: string }
export interface DeletedPurchaseOrder extends PurchaseOrder { deletedAt: string; deletedBy: string }
export interface DeletedGoodsPayment extends GoodsPayment { deletedAt: string; deletedBy: string }
export interface DeletedExpenseRecord extends ExpenseRecord { deletedAt: string; deletedBy: string }
export interface DeletedInvoice extends Invoice { deletedAt: string; deletedBy: string }
export interface DeletedReceipt extends Receipt { deletedAt: string; deletedBy: string }
export interface DeletedFoundryDelivery extends FoundryDelivery { deletedAt: string; deletedBy: string }

export interface CreatedDocs {
  invoices: Invoice[]
  billingNotes: BillingNote[]
  receipts: Receipt[]
  tickets: DeliveryTicket[]
  hidden: Hidden
  /** Per-customer edits (keyed by Customer.id) merged on top of CUSTOMER_MASTER. */
  customerEdits: Record<string, CustomerEdit>
  /** New customers added through quick-add forms (e.g. inside NewDeliveryTicketForm). */
  customersAdded: Customer[]
  /** New suppliers added through quick-add forms (e.g. inside the ใบสั่งซื้อ / ใบสำคัญจ่าย forms). */
  suppliersAdded: Creditor[]
  /** Per-supplier edits (keyed by Creditor.id) merged on top of CREDITOR_MASTER + suppliersAdded. */
  supplierEdits: Record<string, SupplierEdit>
  /** New products added through the เพิ่มสินค้า form on the ราคาสินค้า page — newest first. */
  productsAdded: Product[]
  /** Per-product edits (keyed by Product.code) merged on top of PRODUCTS + productsAdded. */
  productEdits: Record<string, ProductEdit>
  /** New concrete mix designs added on the Mix Design page — newest first. */
  mixDesignsAdded: MixDesign[]
  /** Per-formula edits (keyed by MixDesign.code) merged on top of the seed MIX_DESIGNS. */
  mixDesignEdits: Record<string, Partial<MixDesign>>
  /** Foundry production formulas (สูตรผลิตโรงหล่อ), keyed by product code — newest first. */
  foundryFormulas: FoundryFormula[]
  /** History of transport-rate adjustments — newest first. */
  transportAdjustments: TransportRateAdjustment[]
  /** History of product-price adjustments — newest first. */
  priceAdjustments: PriceAdjustment[]
  /** Per-employee edits (keyed by Employee.id) merged on top of EMPLOYEES. */
  employeeEdits: Record<string, EmployeeEdit>
  /** New employees added through the quick-add form on the Employees page. */
  employeesAdded: Employee[]
  /** Customer advance orders (ใบสั่งขาย) — newest first. */
  salesOrders: SalesOrder[]
  /** Price quotations (ใบเสนอราคา) — newest first. */
  quotations: Quotation[]
  /** Foundry material takeoffs / BOQ estimates (ถอดแบบ BOQ โรงหล่อ) — newest first. */
  foundryBoqs: FoundryBoq[]
  /** Purchase orders (ใบสั่งซื้อ) — newest first. */
  purchaseOrders: PurchaseOrder[]
  /** Goods/material payment vouchers (ใบทำจ่ายสินค้า/วัสดุ) — newest first. */
  goodsPayments: GoodsPayment[]
  /** บันทึกรายจ่าย — recorded expenses awaiting/linked to vouchers, newest first. */
  expenseRecords: ExpenseRecord[]
  /** User-added ประเภทบัญชี cost center (beyond GOODS_PAYMENT_CATEGORIES). */
  costCenters: string[]
  /** สินทรัพย์ (asset registry) — seeded from SEED_ASSETS, then user-maintained. */
  assets: Asset[]
  /** ไฮดีเซล price schedule (บาท/ลิตร by date) — prefills the ค่าน้ำมัน form from the
      rate effective on the fill date. A point is upserted each time a fuel expense
      is saved, so the schedule tracks pump-price changes over time. */
  dieselPrices: DieselPrice[]
  /** Foundry goods-delivery notes (ใบส่งสินค้าโรงหล่อ) — newest first. */
  foundryDeliveries: FoundryDelivery[]
  /** Payroll payment vouchers (ใบทำจ่ายเงินเดือน) — newest first. */
  payrollPayments: PayrollPayment[]
  /** Standing salary structure per employee (keyed by Employee.id). */
  salaryStructures: Record<string, SalaryStructure>
  /** Advance withdrawals (เบิกล่วงหน้า) — newest first. */
  advances: AdvancePayment[]
  /** Leave records (บันทึกวันลา) — newest first. */
  leaveRecords: LeaveRecord[]
  /** History of salary-structure adjustments — newest first. */
  salaryStructureAdjustments: SalaryStructureAdjustment[]
  /** Mixer-truck trip log keyed by DeliveryTicket.dtNo (บันทึกเที่ยวรถโม่). */
  truckTrips: Record<string, TruckTripEntry>
  /** Saved general reports (รายงานทั่วไป) — newest first. */
  generalReports: GeneralReport[]
  /** Standing commission rates per employee (บาท/คิว) for the commission page. */
  commissionRates: CommissionRate[]
  /** Employees marked สิ้นสภาพ — newest first. Notifies Board users. */
  terminations: EmployeeTermination[]
  /** Calendar appointments (งานของฉัน · นัดหมาย). */
  appointments: Appointment[]
  /** Private to-do notes (งานของฉัน · สิ่งที่ต้องทำ). */
  todoNotes: TodoNote[]
  /** Raw-material stock receipts (รับเข้าวัตถุดิบ) — newest first. */
  stockReceipts: StockReceipt[]
  /** Manual plant raw-material stock-card movements (บันทึกวัตถุดิบแยกประเภท) —
      รับเข้า + จ่ายออก, newest first. */
  stockMovements: StockMovement[]
  /** ยอดยกมา (opening balance) per plant material code for the stock-card ledger. */
  stockOpenings: Record<string, number>
  /** As-of date (ISO yyyy-mm-dd) of each ยอดยกมา, keyed by the same material code.
      Optional/informational — labels the ยกมา row; absent for legacy openings. */
  stockOpeningDates: Record<string, string>
  /** Foundry finished-goods stock receipts (รับเข้าสต๊อกสินค้าโรงหล่อ) — newest first. */
  foundryReceipts: StockReceipt[]
  /** Stock reconciliations (กระทบยอดคงคลัง) — newest first. */
  stockReconciles: StockReconcile[]
  /** Per-material unit cost (ต้นทุน/หน่วย · บาท) keyed by StockMaterial.code —
      merged on top of the seed `cost`. Editable from the คลังวัตถุดิบ page. */
  stockCosts: Record<string, number>
  /** User-added foundry raw materials (คลังวัตถุดิบโรงหล่อ) — also surface on the
      ถอดแบบ BOQ โรงหล่อ page. Newest first. */
  foundryMaterialsAdded: FoundryMaterial[]
  /** Codes of seed foundry stock materials the user removed (hides them from the
      คลังวัตถุดิบโรงหล่อ list). */
  foundryMaterialsHidden: string[]
  /** Historical tax rows imported from Excel/CSV (รายงานภาษีซื้อ/ขาย ย้อนหลัง). */
  taxImports: ImportedTaxRow[]
  /** Installment payments recorded against tax invoices (ผ่อนชำระใบกำกับ). */
  invoicePayments: InvoicePayment[]
  /** Audit history of deleted ใบจ่ายคอนกรีต (newest first) — shown below the list. */
  deletedTickets: DeletedTicket[]
  /** Audit history of deleted ใบสั่งขาย (เฉพาะรอผลิต) — newest first. */
  deletedSalesOrders: DeletedSalesOrder[]
  /** Audit history of deleted ใบเสนอราคา — newest first. */
  deletedQuotations: DeletedQuotation[]
  /** Audit history of deleted ถอดแบบ BOQ โรงหล่อ — newest first. */
  deletedFoundryBoqs: DeletedFoundryBoq[]
  /** Audit history of deleted ใบสั่งซื้อ — newest first. */
  deletedPurchaseOrders: DeletedPurchaseOrder[]
  /** Audit history of deleted ใบสำคัญจ่าย — newest first. */
  deletedGoodsPayments: DeletedGoodsPayment[]
  /** Audit history of deleted บันทึกรายจ่าย — newest first. */
  deletedExpenseRecords: DeletedExpenseRecord[]
  /** Audit history of deleted ใบกำกับภาษี — newest first. */
  deletedInvoices: DeletedInvoice[]
  /** Audit history of deleted ใบเสร็จรับเงิน — newest first. */
  deletedReceipts: DeletedReceipt[]
  /** Audit history of deleted ใบส่งสินค้าโรงหล่อ — newest first. */
  deletedFoundryDeliveries: DeletedFoundryDelivery[]
}

const emptyHidden: Hidden = { tickets: [], invoices: [], billingNotes: [], receipts: [], employees: [], products: [] }
const empty: CreatedDocs = { invoices: [], billingNotes: [], receipts: [], tickets: [], hidden: emptyHidden, customerEdits: {}, customersAdded: [], suppliersAdded: [], supplierEdits: {}, productsAdded: [], productEdits: {}, mixDesignsAdded: [], mixDesignEdits: {}, foundryFormulas: [], transportAdjustments: [], priceAdjustments: [], employeeEdits: {}, employeesAdded: [], salesOrders: [], quotations: [], foundryBoqs: [], purchaseOrders: [], goodsPayments: [], expenseRecords: [], costCenters: [], dieselPrices: [], assets: SEED_ASSETS, foundryDeliveries: [], payrollPayments: [], salaryStructures: {}, advances: [], leaveRecords: [], salaryStructureAdjustments: [], truckTrips: {}, generalReports: [], commissionRates: DEFAULT_COMMISSION_RATES, terminations: [], appointments: [], todoNotes: [], stockReceipts: [], stockMovements: [], stockOpenings: {}, stockOpeningDates: {}, foundryReceipts: [], stockReconciles: [], stockCosts: {}, foundryMaterialsAdded: [], foundryMaterialsHidden: [], taxImports: [], invoicePayments: [], deletedTickets: [], deletedSalesOrders: [], deletedQuotations: [], deletedFoundryBoqs: [], deletedPurchaseOrders: [], deletedGoodsPayments: [], deletedExpenseRecords: [], deletedInvoices: [], deletedReceipts: [], deletedFoundryDeliveries: [] }

const _masterPriceByCode = new Map(PRODUCTS.map((p) => [p.code, p.price]))

/** Backfill the exact VAT-inclusive figures on an invoice saved before the
 *  priceInclVat/amountInclVat fields existed, so the printed per-unit price / amount
 *  match the master price exactly instead of the lossy pre-VAT round-trip
 *  (e.g. 154.00 → 154.01). Only lines charged at the standard master price get the
 *  incl fields; the stored pre-VAT `price`/`amount` and the invoice totals are never
 *  changed, so no financial record is altered — this only sharpens the derived
 *  VAT-inclusive display columns. */
export function backfillInvoiceInclVat(inv: Invoice): Invoice {
  let changed = false
  const lines = inv.lines.map((l) => {
    if (l.priceInclVat != null) return l // already exact (new invoices)
    const master = _masterPriceByCode.get(l.code)
    if (master == null) return l
    if (Math.round((master / 1.07) * 100) / 100 !== l.price) return l // custom price → leave as-is
    changed = true
    const discInclVat = l.discount != null ? Math.round(l.discount * 1.07 * 100) / 100 : 0
    const amountInclVat = Math.round(l.qty * (master - discInclVat) * 100) / 100
    // Attach the exact amount only when it stays consistent with the stored pre-VAT amount.
    const consistent = Math.abs(Math.round((amountInclVat / 1.07) * 100) / 100 - l.amount) <= 0.01
    return consistent ? { ...l, priceInclVat: master, amountInclVat } : { ...l, priceInclVat: master }
  })
  return changed ? { ...inv, lines } : inv
}

function read(): CreatedDocs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const v = JSON.parse(raw) as Partial<CreatedDocs>
    return {
      invoices: (v.invoices ?? []).map(backfillInvoiceInclVat),
      billingNotes: v.billingNotes ?? [],
      receipts: v.receipts ?? [],
      tickets: v.tickets ?? [],
      hidden: { ...emptyHidden, ...(v.hidden ?? {}) },
      customerEdits: v.customerEdits ?? {},
      customersAdded: v.customersAdded ?? [],
      suppliersAdded: v.suppliersAdded ?? [],
      supplierEdits: v.supplierEdits ?? {},
      productsAdded: v.productsAdded ?? [],
      productEdits: v.productEdits ?? {},
      mixDesignsAdded: v.mixDesignsAdded ?? [],
      mixDesignEdits: v.mixDesignEdits ?? {},
      foundryFormulas: v.foundryFormulas ?? [],
      /* Drop legacy entries (pre-multi-row format) that lack the `fees` array. */
      transportAdjustments: (v.transportAdjustments ?? []).filter((a) => Array.isArray((a as TransportRateAdjustment).fees)),
      priceAdjustments: (v.priceAdjustments ?? []).filter((a) => a && typeof (a as PriceAdjustment).prices === 'object'),
      employeeEdits: v.employeeEdits ?? {},
      employeesAdded: v.employeesAdded ?? [],
      /* Backfill status on orders saved before the field existed. */
      salesOrders: (v.salesOrders ?? []).map((s) => ({ ...s, status: s.status ?? 'รอผลิต' })),
      quotations: v.quotations ?? [],
      foundryBoqs: v.foundryBoqs ?? [],
      purchaseOrders: (v.purchaseOrders ?? []).map((p) => ({ ...p, status: p.status ?? 'รอรับของ' })),
      goodsPayments: v.goodsPayments ?? [],
      expenseRecords: v.expenseRecords ?? [],
      costCenters: v.costCenters ?? [],
      /* Migrate the legacy single last-used price into an open-ended schedule point. */
      dieselPrices: v.dieselPrices ?? (() => {
        const legacy = (v as { dieselPricePerLiter?: number }).dieselPricePerLiter
        return typeof legacy === 'number' ? [{ date: '2000-01-01', price: legacy }] : []
      })(),
      /* Seed the asset registry on first run (existing browsers had no field). */
      assets: v.assets ?? SEED_ASSETS,
      foundryDeliveries: v.foundryDeliveries ?? [],
      /* Backfill the detailed pay-slip fields for records saved before the
         breakdown existed (older shape only had additions/deductions). */
      payrollPayments: (v.payrollPayments ?? []).map((p) => {
        const r = p as PayrollPayment & { additions?: number; deductions?: number }
        const baseSalary = r.baseSalary ?? 0
        const experiencePay = r.experiencePay ?? 0
        const specialPay = r.specialPay ?? 0
        const vehiclePay = r.vehiclePay ?? 0
        const otherIncome = r.otherIncome ?? r.additions ?? 0
        const socialSecurity = r.socialSecurity ?? 0
        const advance = r.advance ?? 0
        const otherDeduction = r.otherDeduction ?? r.deductions ?? 0
        const totalIncome = r.totalIncome ?? (baseSalary + experiencePay + specialPay + vehiclePay + otherIncome)
        const totalDeduction = r.totalDeduction ?? (socialSecurity + advance + otherDeduction)
        return {
          ...r, baseSalary, experiencePay, specialPay, vehiclePay, otherIncome, totalIncome,
          socialSecurity, advance, otherDeduction, totalDeduction,
          netAmount: r.netAmount ?? (totalIncome - totalDeduction),
        }
      }),
      salaryStructures: v.salaryStructures ?? {},
      advances: v.advances ?? [],
      leaveRecords: v.leaveRecords ?? [],
      salaryStructureAdjustments: v.salaryStructureAdjustments ?? [],
      truckTrips: v.truckTrips ?? {},
      generalReports: v.generalReports ?? [],
      commissionRates: v.commissionRates ?? DEFAULT_COMMISSION_RATES,
      terminations: v.terminations ?? [],
      appointments: v.appointments ?? [],
      todoNotes: v.todoNotes ?? [],
      stockReceipts: v.stockReceipts ?? [],
      stockMovements: v.stockMovements ?? [],
      stockOpenings: v.stockOpenings ?? {},
      stockOpeningDates: v.stockOpeningDates ?? {},
      foundryReceipts: v.foundryReceipts ?? [],
      stockReconciles: v.stockReconciles ?? [],
      stockCosts: v.stockCosts ?? {},
      foundryMaterialsAdded: v.foundryMaterialsAdded ?? [],
      foundryMaterialsHidden: v.foundryMaterialsHidden ?? [],
      /* Backfill year on rows imported before the year dimension existed (the
         original seed/imports were พ.ศ. 2569). */
      taxImports: (v.taxImports ?? []).map((r) => ({ ...r, year: r.year ?? 2569 })),
      invoicePayments: v.invoicePayments ?? [],
      deletedTickets: v.deletedTickets ?? [],
      deletedSalesOrders: v.deletedSalesOrders ?? [],
      deletedQuotations: v.deletedQuotations ?? [],
      deletedFoundryBoqs: v.deletedFoundryBoqs ?? [],
      deletedPurchaseOrders: v.deletedPurchaseOrders ?? [],
      deletedGoodsPayments: v.deletedGoodsPayments ?? [],
      deletedExpenseRecords: v.deletedExpenseRecords ?? [],
      deletedInvoices: v.deletedInvoices ?? [],
      deletedReceipts: v.deletedReceipts ?? [],
      deletedFoundryDeliveries: v.deletedFoundryDeliveries ?? [],
    }
  } catch {
    return empty
  }
}

let state: CreatedDocs = read()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/* Pushes state to the shared Supabase row (no-op until sync is wired below). */
let pushRemote: (data: CreatedDocs) => void = () => {}

function commit(next: CreatedDocs) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  notify()
  pushRemote(state)
}

/* ── Cross-browser sync via Supabase (falls back to localStorage-only) ── */
const remote = createRemoteSync<Partial<CreatedDocs>>(
  'createdDocs',
  (data) => {
    /* Remote change (another browser saved) → adopt it. Merge over `empty` so a
       blob from an older schema still has every key. `hidden` is merged one level
       deeper so a remote blob predating the products/employees keys still yields
       arrays (otherwise removeProduct's [...hidden.products] spread throws). Does
       NOT push back. */
    state = { ...empty, ...data, hidden: { ...emptyHidden, ...(data.hidden ?? {}) } }
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
    notify()
  },
  () => state,
)
pushRemote = remote.push
remote.start()

export function addInvoice(inv: Invoice) {
  commit({ ...state, invoices: [stamp(inv), ...state.invoices] })
}
/** Correct the number of a user-created invoice (fixing a wrong เลขที่ใบกำกับ).
    Only affects created invoices; seed/imported ones are read-only. */
export function updateInvoiceNo(oldNo: string, newNo: string) {
  commit({ ...state, invoices: state.invoices.map((i) => (i.no === oldNo ? { ...i, no: newNo } : i)) })
}

/* Installment payments against invoices (ผ่อนชำระใบกำกับ). */
export function addInvoicePayment(p: Omit<InvoicePayment, 'createdBy' | 'createdAt'>) {
  commit({ ...state, invoicePayments: [stamp(p as InvoicePayment), ...state.invoicePayments] })
}
export function removeInvoicePayment(id: string) {
  commit({ ...state, invoicePayments: state.invoicePayments.filter((p) => p.id !== id) })
}
export function addBillingNote(bn: BillingNote) {
  commit({ ...state, billingNotes: [stamp(bn), ...state.billingNotes] })
}
export function addReceipt(rc: Receipt) {
  commit({ ...state, receipts: [stamp(rc), ...state.receipts] })
}
export function addTicket(t: DeliveryTicket) {
  commit({ ...state, tickets: [stamp(t), ...state.tickets] })
}
/** Bulk-add imported tickets, skipping any whose dtNo already exists among the
    user-created tickets (seed dtNos are excluded by the caller). Returns count added. */
export function addTickets(tickets: DeliveryTicket[]): number {
  const seen = new Set(state.tickets.map((t) => t.dtNo))
  const fresh = tickets.filter((t) => { if (seen.has(t.dtNo)) return false; seen.add(t.dtNo); return true })
  if (fresh.length === 0) return 0
  commit({ ...state, tickets: [...fresh.map((t) => stamp(t)), ...state.tickets] })
  return fresh.length
}
/** Patch a user-created ticket in place (e.g. to link its sales order). */
export function updateTicket(dtNo: string, patch: Partial<DeliveryTicket>) {
  commit({ ...state, tickets: state.tickets.map((t) => (t.dtNo === dtNo ? { ...t, ...patch } : t)) })
}
/** Next running sales-order number (SO00001, …). */
export function nextSoNo(existing: SalesOrder[]): string {
  let max = 0
  for (const s of existing) {
    const n = parseInt(s.soNo.replace(/^SO/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `SO${String(max + 1).padStart(5, '0')}`
}

/* Removal — works on both user-created docs (removed from list) and seed docs (hidden). */
/** Delete a tax invoice (ใบกำกับภาษี) and keep an audit snapshot. Takes the full
    record so a seed/imported invoice (which has no store entry) can still be
    snapshotted; created ones are removed from the list, seed ones hidden by no. */
export function removeInvoice(inv: Invoice) {
  const wasCreated = state.invoices.some((i) => i.no === inv.no)
  commit({
    ...state,
    invoices: state.invoices.filter((i) => i.no !== inv.no),
    hidden: wasCreated ? state.hidden : { ...state.hidden, invoices: [...state.hidden.invoices, inv.no] },
    deletedInvoices: [stampDeleted(inv), ...state.deletedInvoices.filter((d) => d.no !== inv.no)],
  })
}
/** Undo a removeInvoice — re-adds a user-created invoice or un-hides a seed one,
    and drops it from the deletion history. */
export function restoreInvoice(no: string) {
  const rec = state.deletedInvoices.find((d) => d.no === no)
  if (!rec) return
  const wasSeed = state.hidden.invoices.includes(no)
  commit({
    ...state,
    deletedInvoices: state.deletedInvoices.filter((d) => d.no !== no),
    hidden: wasSeed ? { ...state.hidden, invoices: state.hidden.invoices.filter((x) => x !== no) } : state.hidden,
    invoices: wasSeed ? state.invoices : [unstampDeleted(rec) as Invoice, ...state.invoices],
  })
}
export function removeBillingNote(no: string) {
  const wasCreated = state.billingNotes.some((b) => b.no === no)
  commit({
    ...state,
    billingNotes: state.billingNotes.filter((b) => b.no !== no),
    hidden: wasCreated ? state.hidden : { ...state.hidden, billingNotes: [...state.hidden.billingNotes, no] },
  })
}
/** Delete a receipt (ใบเสร็จรับเงิน) and keep an audit snapshot. Full record so a
    seed receipt (no store entry) can still be snapshotted. */
export function removeReceipt(rc: Receipt) {
  const wasCreated = state.receipts.some((r) => r.no === rc.no)
  commit({
    ...state,
    receipts: state.receipts.filter((r) => r.no !== rc.no),
    hidden: wasCreated ? state.hidden : { ...state.hidden, receipts: [...state.hidden.receipts, rc.no] },
    deletedReceipts: [stampDeleted(rc), ...state.deletedReceipts.filter((d) => d.no !== rc.no)],
  })
}
/** Undo a removeReceipt — re-adds a user-created receipt or un-hides a seed one. */
export function restoreReceipt(no: string) {
  const rec = state.deletedReceipts.find((d) => d.no === no)
  if (!rec) return
  const wasSeed = state.hidden.receipts.includes(no)
  commit({
    ...state,
    deletedReceipts: state.deletedReceipts.filter((d) => d.no !== no),
    hidden: wasSeed ? { ...state.hidden, receipts: state.hidden.receipts.filter((x) => x !== no) } : state.hidden,
    receipts: wasSeed ? state.receipts : [unstampDeleted(rec) as Receipt, ...state.receipts],
  })
}
export function removeTicket(t: DeliveryTicket) {
  const wasCreated = state.tickets.some((x) => x.dtNo === t.dtNo)
  const record: DeletedTicket = { ...t, deletedAt: new Date().toISOString(), deletedBy: currentUserName() }
  commit({
    ...state,
    tickets: state.tickets.filter((x) => x.dtNo !== t.dtNo),
    /* Seed/imported tickets have no store record — hide them by dtNo instead. */
    hidden: wasCreated ? state.hidden : { ...state.hidden, tickets: [...state.hidden.tickets, t.dtNo] },
    /* Keep an audit trail (newest first); replace any prior record for the same no. */
    deletedTickets: [record, ...state.deletedTickets.filter((d) => d.dtNo !== t.dtNo)],
  })
}

/** Undo a deletion recorded by removeTicket — re-adds a user-created ticket or
    un-hides a seed one, and drops it from the deletion history. */
export function restoreTicket(dtNo: string) {
  const rec = state.deletedTickets.find((d) => d.dtNo === dtNo)
  if (!rec) return
  const ticket = { ...rec } as Partial<DeletedTicket>
  delete ticket.deletedAt
  delete ticket.deletedBy
  const wasSeed = state.hidden.tickets.includes(dtNo)
  commit({
    ...state,
    deletedTickets: state.deletedTickets.filter((d) => d.dtNo !== dtNo),
    hidden: wasSeed ? { ...state.hidden, tickets: state.hidden.tickets.filter((x) => x !== dtNo) } : state.hidden,
    tickets: wasSeed ? state.tickets : [ticket as DeliveryTicket, ...state.tickets],
  })
}

/* Sales orders (ใบสั่งขาย) — created docs only, no seed data to hide. */
export function addSalesOrder(so: SalesOrder) {
  commit({ ...state, salesOrders: [stamp(so), ...state.salesOrders] })
}
/** Stamp a record with who deleted it and when, for the audit-history tables. */
function stampDeleted<T>(rec: T): T & { deletedAt: string; deletedBy: string } {
  return { ...rec, deletedAt: new Date().toISOString(), deletedBy: currentUserName() }
}
/** Strip the deletion metadata so a history record can be re-added to its list. */
function unstampDeleted<T extends { deletedAt: string; deletedBy: string }>(rec: T): Omit<T, 'deletedAt' | 'deletedBy'> {
  const copy = { ...rec } as Partial<T>
  delete copy.deletedAt
  delete copy.deletedBy
  return copy as Omit<T, 'deletedAt' | 'deletedBy'>
}

export function removeSalesOrder(soNo: string) {
  const rec = state.salesOrders.find((s) => s.soNo === soNo)
  commit({
    ...state,
    salesOrders: state.salesOrders.filter((s) => s.soNo !== soNo),
    deletedSalesOrders: rec ? [stampDeleted(rec), ...state.deletedSalesOrders.filter((d) => d.soNo !== soNo)] : state.deletedSalesOrders,
  })
}
/** Undo a ใบสั่งขาย deletion — re-add it to the list and drop the history row. */
export function restoreSalesOrder(soNo: string) {
  const rec = state.deletedSalesOrders.find((d) => d.soNo === soNo)
  if (!rec) return
  commit({
    ...state,
    deletedSalesOrders: state.deletedSalesOrders.filter((d) => d.soNo !== soNo),
    salesOrders: [unstampDeleted(rec) as SalesOrder, ...state.salesOrders],
  })
}
/** Replace an existing sales order (matched by soNo) with an edited version. */
export function updateSalesOrder(so: SalesOrder) {
  commit({ ...state, salesOrders: state.salesOrders.map((s) => (s.soNo === so.soNo ? so : s)) })
}
/** Flip a sales order to 'ผลิต' once a delivery ticket is issued from it. */
export function markSalesOrderProduced(soNo: string) {
  commit({ ...state, salesOrders: state.salesOrders.map((s) => (s.soNo === soNo ? { ...s, status: 'ผลิต' } : s)) })
}

/* Quotations (ใบเสนอราคา) — created docs only, no seed data. */
export function addQuotation(q: Quotation) {
  commit({ ...state, quotations: [stamp(q), ...state.quotations] })
}
/** Replace an existing quotation (matched by qtNo) with an edited version. */
export function updateQuotation(q: Quotation) {
  commit({ ...state, quotations: state.quotations.map((x) => (x.qtNo === q.qtNo ? q : x)) })
}
export function removeQuotation(qtNo: string) {
  const rec = state.quotations.find((q) => q.qtNo === qtNo)
  commit({
    ...state,
    quotations: state.quotations.filter((q) => q.qtNo !== qtNo),
    deletedQuotations: rec ? [stampDeleted(rec), ...state.deletedQuotations.filter((d) => d.qtNo !== qtNo)] : state.deletedQuotations,
  })
}
/** Undo a ใบเสนอราคา deletion — re-add it to the list and drop the history row. */
export function restoreQuotation(qtNo: string) {
  const rec = state.deletedQuotations.find((d) => d.qtNo === qtNo)
  if (!rec) return
  commit({
    ...state,
    deletedQuotations: state.deletedQuotations.filter((d) => d.qtNo !== qtNo),
    quotations: [unstampDeleted(rec) as Quotation, ...state.quotations],
  })
}

/* Foundry BOQ estimates (ถอดแบบ BOQ โรงหล่อ) — created docs only. */
export function addFoundryBoq(b: FoundryBoq) {
  commit({ ...state, foundryBoqs: [stamp(b), ...state.foundryBoqs] })
}
/** Replace an existing BOQ estimate (matched by no) with an edited version. */
export function updateFoundryBoq(b: FoundryBoq) {
  commit({ ...state, foundryBoqs: state.foundryBoqs.map((x) => (x.no === b.no ? b : x)) })
}
export function removeFoundryBoq(no: string) {
  const rec = state.foundryBoqs.find((b) => b.no === no)
  commit({
    ...state,
    foundryBoqs: state.foundryBoqs.filter((b) => b.no !== no),
    deletedFoundryBoqs: rec ? [stampDeleted(rec), ...state.deletedFoundryBoqs.filter((d) => d.no !== no)] : state.deletedFoundryBoqs,
  })
}
/** Undo a BOQ estimate deletion — re-add it to the list and drop the history row. */
export function restoreFoundryBoq(no: string) {
  const rec = state.deletedFoundryBoqs.find((d) => d.no === no)
  if (!rec) return
  commit({
    ...state,
    deletedFoundryBoqs: state.deletedFoundryBoqs.filter((d) => d.no !== no),
    foundryBoqs: [unstampDeleted(rec) as FoundryBoq, ...state.foundryBoqs],
  })
}

/* Purchase orders (ใบสั่งซื้อ). */
export function addPurchaseOrder(po: PurchaseOrder) {
  commit({ ...state, purchaseOrders: [stamp(po), ...state.purchaseOrders] })
}
export function updatePurchaseOrder(po: PurchaseOrder) {
  commit({ ...state, purchaseOrders: state.purchaseOrders.map((p) => (p.poNo === po.poNo ? po : p)) })
}
export function removePurchaseOrder(poNo: string) {
  const rec = state.purchaseOrders.find((p) => p.poNo === poNo)
  commit({
    ...state,
    purchaseOrders: state.purchaseOrders.filter((p) => p.poNo !== poNo),
    deletedPurchaseOrders: rec ? [stampDeleted(rec), ...state.deletedPurchaseOrders.filter((d) => d.poNo !== poNo)] : state.deletedPurchaseOrders,
  })
}
/** Undo a ใบสั่งซื้อ deletion — re-add it to the list and drop the history row. */
export function restorePurchaseOrder(poNo: string) {
  const rec = state.deletedPurchaseOrders.find((d) => d.poNo === poNo)
  if (!rec) return
  commit({
    ...state,
    deletedPurchaseOrders: state.deletedPurchaseOrders.filter((d) => d.poNo !== poNo),
    purchaseOrders: [unstampDeleted(rec) as PurchaseOrder, ...state.purchaseOrders],
  })
}
/** Flip a purchase order to 'รับของแล้ว' (e.g. when goods arrive / a payment is made). */
export function markPurchaseOrderReceived(poNo: string) {
  commit({ ...state, purchaseOrders: state.purchaseOrders.map((p) => (p.poNo === poNo ? { ...p, status: 'รับของแล้ว' } : p)) })
}

/* Goods/material payment vouchers (ใบทำจ่ายสินค้า/วัสดุ). */
export function addGoodsPayment(gp: GoodsPayment) {
  commit({ ...state, goodsPayments: [stamp(gp), ...state.goodsPayments] })
}
/** Patch fields of an existing ใบสำคัญจ่าย in place (e.g. the เดือนยื่น VAT). */
export function updateGoodsPayment(gpNo: string, patch: Partial<GoodsPayment>) {
  commit({ ...state, goodsPayments: state.goodsPayments.map((g) => (g.gpNo === gpNo ? { ...g, ...patch } : g)) })
}
export function removeGoodsPayment(gpNo: string) {
  const rec = state.goodsPayments.find((g) => g.gpNo === gpNo)
  if (!rec) return
  /* Cancelling a voucher reverts its linked บันทึกรายจ่าย to "ยังไม่ออกใบสำคัญจ่าย".
     Remember which ones (derived from their current voucherNo) so a later restore can
     re-link them without double-billing. */
  const linkedIds = state.expenseRecords.filter((e) => e.voucherNo === gpNo).map((e) => e.id)
  const deletedRec = linkedIds.length ? { ...rec, expenseIds: linkedIds } : rec
  commit({
    ...state,
    goodsPayments: state.goodsPayments.filter((g) => g.gpNo !== gpNo),
    deletedGoodsPayments: [stampDeleted(deletedRec), ...state.deletedGoodsPayments.filter((d) => d.gpNo !== gpNo)],
    expenseRecords: linkedIds.length
      ? state.expenseRecords.map((e) => (e.voucherNo === gpNo ? { ...e, voucherNo: undefined } : e))
      : state.expenseRecords,
  })
}
/** Undo a ใบสำคัญจ่าย deletion — re-add it to the list, drop the history row, and
    re-stamp any บันทึกรายจ่าย it had been issued from back to this voucher. */
export function restoreGoodsPayment(gpNo: string) {
  const rec = state.deletedGoodsPayments.find((d) => d.gpNo === gpNo)
  if (!rec) return
  const gp = unstampDeleted(rec) as GoodsPayment
  const ids = new Set(gp.expenseIds ?? [])
  commit({
    ...state,
    deletedGoodsPayments: state.deletedGoodsPayments.filter((d) => d.gpNo !== gpNo),
    goodsPayments: [gp, ...state.goodsPayments],
    expenseRecords: ids.size
      ? state.expenseRecords.map((e) => (ids.has(e.id) ? { ...e, voucherNo: gpNo } : e))
      : state.expenseRecords,
  })
}

/* บันทึกรายจ่าย (expense records). */
export function addExpenseRecord(ex: ExpenseRecord) {
  commit({ ...state, expenseRecords: [stamp(ex), ...state.expenseRecords] })
}
export function updateExpenseRecord(id: string, patch: Partial<ExpenseRecord>) {
  commit({ ...state, expenseRecords: state.expenseRecords.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
}
export function removeExpenseRecord(id: string) {
  const rec = state.expenseRecords.find((e) => e.id === id)
  commit({
    ...state,
    expenseRecords: state.expenseRecords.filter((e) => e.id !== id),
    deletedExpenseRecords: rec ? [stampDeleted(rec), ...state.deletedExpenseRecords.filter((d) => d.id !== id)] : state.deletedExpenseRecords,
  })
}
/** Undo an expense-record deletion. */
export function restoreExpenseRecord(id: string) {
  const rec = state.deletedExpenseRecords.find((d) => d.id === id)
  if (!rec) return
  commit({
    ...state,
    deletedExpenseRecords: state.deletedExpenseRecords.filter((d) => d.id !== id),
    expenseRecords: [unstampDeleted(rec) as ExpenseRecord, ...state.expenseRecords],
  })
}
/** Stamp the given expense records with the voucher no. issued for them (links
    each บันทึกรายจ่าย back to its ใบสำคัญจ่าย, so they aren't billed twice). */
export function markExpenseRecordsBilled(ids: string[], voucherNo: string) {
  const set = new Set(ids)
  commit({ ...state, expenseRecords: state.expenseRecords.map((e) => (set.has(e.id) ? { ...e, voucherNo } : e)) })
}
/** Record the ไฮดีเซล price on a fill date (upsert by date), so future ค่าน้ำมัน
    records prefill the rate effective on their own date. No-op on invalid input or
    when the same date already holds this price. */
export function recordDieselPrice(date: string, price: number) {
  if (!date || !price || price <= 0) return
  const rounded = Math.round(price * 100) / 100
  const existing = state.dieselPrices.find((p) => p.date === date)
  if (existing && existing.price === rounded) return
  const rest = state.dieselPrices.filter((p) => p.date !== date)
  commit({ ...state, dieselPrices: [...rest, { date, price: rounded }].sort((a, b) => a.date.localeCompare(b.date)) })
}

/* สินทรัพย์ (asset registry). */
export function addAsset(a: Asset) {
  commit({ ...state, assets: [stamp(a), ...state.assets] })
}
export function updateAsset(id: string, patch: Partial<Asset>) {
  commit({ ...state, assets: state.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
}
export function removeAsset(id: string) {
  commit({ ...state, assets: state.assets.filter((a) => a.id !== id) })
}

/* Foundry goods-delivery notes (ใบส่งสินค้าโรงหล่อ). */
export function addFoundryDelivery(fd: FoundryDelivery) {
  commit({ ...state, foundryDeliveries: [stamp(fd), ...state.foundryDeliveries] })
}
/** Delete a foundry goods-delivery note (ใบส่งสินค้าโรงหล่อ) and keep an audit
    snapshot. These are all user-created (no seed data). */
export function removeFoundryDelivery(fd: FoundryDelivery) {
  commit({
    ...state,
    foundryDeliveries: state.foundryDeliveries.filter((f) => f.fdNo !== fd.fdNo),
    deletedFoundryDeliveries: [stampDeleted(fd), ...state.deletedFoundryDeliveries.filter((d) => d.fdNo !== fd.fdNo)],
  })
}
/** Undo a removeFoundryDelivery — re-adds the note and drops it from history. */
export function restoreFoundryDelivery(fdNo: string) {
  const rec = state.deletedFoundryDeliveries.find((d) => d.fdNo === fdNo)
  if (!rec) return
  commit({
    ...state,
    deletedFoundryDeliveries: state.deletedFoundryDeliveries.filter((d) => d.fdNo !== fdNo),
    foundryDeliveries: [unstampDeleted(rec) as FoundryDelivery, ...state.foundryDeliveries],
  })
}

/* Employee terminations (สิ้นสภาพพนักงาน) — notifies Board users. */
export function addEmployeeTermination(empId: string, empName: string) {
  if (state.terminations.some((t) => t.empId === empId)) return
  const rec: EmployeeTermination = { id: empId, empId, empName }
  commit({ ...state, terminations: [stamp(rec), ...state.terminations] })
}
export function removeEmployeeTermination(empId: string) {
  commit({ ...state, terminations: state.terminations.filter((t) => t.empId !== empId) })
}

/* Calendar appointments + to-do notes (งานของฉัน). */
export function addAppointment(a: Omit<Appointment, 'createdBy' | 'createdAt'>) {
  commit({ ...state, appointments: [stamp(a as Appointment), ...state.appointments] })
}
export function removeAppointment(id: string) {
  commit({ ...state, appointments: state.appointments.filter((a) => a.id !== id) })
}
/** Patch an appointment (e.g. reschedule the date) — owner-driven edits. */
export function updateAppointment(id: string, patch: Partial<Pick<Appointment, 'date' | 'time' | 'title' | 'note' | 'invitees'>>) {
  commit({ ...state, appointments: state.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
}
export function addTodoNote(owner: string, text: string) {
  const rec: TodoNote = { id: `td_${Date.now()}`, owner, text, done: false }
  commit({ ...state, todoNotes: [stamp(rec), ...state.todoNotes] })
}
export function toggleTodoNote(id: string) {
  commit({ ...state, todoNotes: state.todoNotes.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
}
export function removeTodoNote(id: string) {
  commit({ ...state, todoNotes: state.todoNotes.filter((t) => t.id !== id) })
}

/* Raw-material stock receipts (รับเข้าวัตถุดิบ). */
export function addStockReceipt(r: Omit<StockReceipt, 'createdBy' | 'createdAt'>) {
  commit({ ...state, stockReceipts: [stamp(r as StockReceipt), ...state.stockReceipts] })
}
export function removeStockReceipt(id: string) {
  commit({ ...state, stockReceipts: state.stockReceipts.filter((r) => r.id !== id) })
}

/* ── Manual plant stock-card movements (บันทึกวัตถุดิบแยกประเภท) ── */
export function addStockMovement(m: Omit<StockMovement, 'createdBy' | 'createdAt'>) {
  commit({ ...state, stockMovements: [stamp(m as StockMovement), ...state.stockMovements] })
}
/** Patch a movement in place — used to correct the เลขที่ใบสำคัญ (or other fields)
    after it was saved. */
export function updateStockMovement(id: string, patch: Partial<Pick<StockMovement, 'date' | 'qty' | 'unitPrice' | 'amount' | 'supplier' | 'voucherNo' | 'note'>>) {
  commit({ ...state, stockMovements: state.stockMovements.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
}
export function removeStockMovement(id: string) {
  commit({ ...state, stockMovements: state.stockMovements.filter((m) => m.id !== id) })
}
/** Set (or clear) the ยอดยกมา (opening balance) for a plant material's stock card,
    keyed by StockMaterial.code. Pass undefined / non-finite to clear (⇒ 0). The
    optional `date` (ISO yyyy-mm-dd) records the as-of date of that opening balance. */
export function setStockOpening(code: string, opening: number | undefined, date?: string) {
  const next = { ...state.stockOpenings }
  const nextDates = { ...state.stockOpeningDates }
  if (opening === undefined || !Number.isFinite(opening)) { delete next[code]; delete nextDates[code] }
  else {
    next[code] = opening
    if (date) nextDates[code] = date; else delete nextDates[code]
  }
  commit({ ...state, stockOpenings: next, stockOpeningDates: nextDates })
}
/** Set (or clear) the stored unit cost (ต้นทุน/หน่วย · บาท) for a stock material,
    keyed by StockMaterial.code. Pass undefined / a non-finite / negative value to
    clear it (display then falls back to the seed cost). */
export function setStockCost(code: string, cost: number | undefined) {
  const next = { ...state.stockCosts }
  if (cost === undefined || !Number.isFinite(cost) || cost < 0) delete next[code]
  else next[code] = cost
  commit({ ...state, stockCosts: next })
}
/** Add a new foundry raw material (คลังวัตถุดิบโรงหล่อ). Also appears on the
    ถอดแบบ BOQ โรงหล่อ page. If `code` was previously a hidden seed material,
    un-hide it instead of adding a duplicate. */
export function addFoundryMaterial(m: FoundryMaterial) {
  const isSeed = STOCK_SEED_FOUNDRY_CODES.has(m.code)
  commit({
    ...state,
    foundryMaterialsAdded: isSeed ? state.foundryMaterialsAdded : [m, ...state.foundryMaterialsAdded.filter((x) => x.code !== m.code)],
    foundryMaterialsHidden: state.foundryMaterialsHidden.filter((c) => c !== m.code),
  })
}
/** Remove a foundry raw material by code. User-added ones are dropped outright;
    seed ones are hidden. Its stored unit cost (if any) is cleared too. */
export function removeFoundryMaterial(code: string) {
  const wasAdded = state.foundryMaterialsAdded.some((m) => m.code === code)
  const nextCosts = { ...state.stockCosts }; delete nextCosts[code]
  commit({
    ...state,
    foundryMaterialsAdded: state.foundryMaterialsAdded.filter((m) => m.code !== code),
    foundryMaterialsHidden: wasAdded || state.foundryMaterialsHidden.includes(code)
      ? state.foundryMaterialsHidden
      : [...state.foundryMaterialsHidden, code],
    stockCosts: nextCosts,
  })
}

/* Foundry finished-goods stock receipts (รับเข้าสต๊อกสินค้าโรงหล่อ). */
export function addFoundryReceipt(r: Omit<StockReceipt, 'createdBy' | 'createdAt'>) {
  commit({ ...state, foundryReceipts: [stamp(r as StockReceipt), ...state.foundryReceipts] })
}
export function removeFoundryReceipt(id: string) {
  commit({ ...state, foundryReceipts: state.foundryReceipts.filter((r) => r.id !== id) })
}

/* Stock reconciliations (กระทบยอดคงคลัง) — recorded only; do not change balances. */
export function addStockReconcile(rec: Omit<StockReconcile, 'createdBy' | 'createdAt'>) {
  commit({ ...state, stockReconciles: [stamp(rec as StockReconcile), ...state.stockReconciles] })
}
export function removeStockReconcile(id: string) {
  commit({ ...state, stockReconciles: state.stockReconciles.filter((r) => r.id !== id) })
}
/** Submit a reconciliation for Board approval (รออนุมัติ). */
export function requestStockReconcileApproval(id: string) {
  commit({
    ...state,
    stockReconciles: state.stockReconciles.map((r) =>
      r.id === id ? { ...r, status: 'pending', requestedBy: currentUserName(), requestedAt: new Date().toISOString() } : r),
  })
}
/** Board approves a reconciliation — counted quantities then apply to stock. */
export function approveStockReconcile(id: string) {
  commit({
    ...state,
    stockReconciles: state.stockReconciles.map((r) =>
      r.id === id ? { ...r, status: 'approved', approvedBy: currentUserName(), approvedAt: new Date().toISOString() } : r),
  })
}

/* Payroll payment vouchers (ใบทำจ่ายเงินเดือน). */
export function addPayrollPayment(pp: PayrollPayment) {
  commit({ ...state, payrollPayments: [stamp(pp), ...state.payrollPayments] })
}
export function removePayrollPayment(ppNo: string) {
  commit({ ...state, payrollPayments: state.payrollPayments.filter((p) => p.ppNo !== ppNo) })
}

/* Salary structure per employee (ปรับโครงสร้างเงินเดือน). */
export function setSalaryStructure(employeeId: string, structure: SalaryStructure) {
  commit({ ...state, salaryStructures: { ...state.salaryStructures, [employeeId]: structure } })
}
/** Append a salary-structure adjustment to the history log (newest first). */
export function addSalaryStructureAdjustment(adj: SalaryStructureAdjustment) {
  commit({ ...state, salaryStructureAdjustments: [{ ...adj, by: adj.by || currentUserName() }, ...state.salaryStructureAdjustments] })
}

/* Advance withdrawals (เบิกล่วงหน้า). */
export function addAdvance(a: AdvancePayment) {
  commit({ ...state, advances: [stamp(a), ...state.advances] })
}
export function addLeaveRecord(r: LeaveRecord) {
  commit({ ...state, leaveRecords: [stamp(r), ...state.leaveRecords] })
}
export function removeLeaveRecord(id: string) {
  commit({ ...state, leaveRecords: state.leaveRecords.filter((r) => r.id !== id) })
}
export function removeAdvance(advNo: string) {
  commit({ ...state, advances: state.advances.filter((a) => a.advNo !== advNo) })
}

export function restoreAllHidden() {
  commit({ ...state, hidden: emptyHidden })
}

/* ───────── Imported historical tax rows (นำเข้ารายงานภาษี ย้อนหลัง) ───────── */
/** Identity of an imported tax row for duplicate detection: same side, date,
    doc no., name, value and VAT ⇒ treated as the same record. */
export const taxImportKey = (r: ImportedTaxRow) => `${r.kind}|${r.date}|${r.docNo}|${r.name}|${r.value}|${r.vat}`
/** Append imported tax rows, skipping any that duplicate rows already imported
    (matched by kind/date/doc/name/value/vat). Returns the number actually added. */
export function addTaxImports(rows: ImportedTaxRow[]): number {
  const seen = new Set(state.taxImports.map(taxImportKey))
  const fresh = rows.filter((r) => { const k = taxImportKey(r); if (seen.has(k)) return false; seen.add(k); return true })
  if (fresh.length === 0) return 0
  commit({ ...state, taxImports: [...state.taxImports, ...fresh] })
  return fresh.length
}
/** Drop imported tax rows for one report side (sale / purchase). When `year`
    is given, only that year's rows are removed; otherwise all years. */
export function clearTaxImports(kind: 'sale' | 'purchase', year?: number) {
  commit({ ...state, taxImports: state.taxImports.filter((r) => !(r.kind === kind && (year === undefined || r.year === year))) })
}

export function addCustomer(c: Customer) {
  commit({ ...state, customersAdded: [stamp(c), ...state.customersAdded] })
}

/** Resolve a customer from the LIVE registry (ทะเบียนลูกค้า) by its name key —
    quick-added customers first (they can shadow a seed name), then the seed
    master, with per-id edits (customerEdits) applied. Returns undefined when the
    name isn't registered. This is what documents should use so that addresses /
    tax IDs entered in the registry actually appear, instead of the static seed. */
export function liveCustomerByName(name: string): Customer | undefined {
  const withEdit = (c: Customer): Customer => {
    const e = state.customerEdits[c.id]
    return e ? { ...c, ...e } : c
  }
  const added = state.customersAdded.find((c) => c.name === name)
  if (added) return withEdit(added)
  const seed = CUSTOMER_MASTER.find((c) => c.name === name)
  return seed ? withEdit(seed) : undefined
}

/** Push a brand-new supplier (ซัพพลายเออร์) to the head of the user-added list.
    Creditor carries no audit fields, so no stamp is applied. */
export function addSupplier(c: Creditor) {
  commit({ ...state, suppliersAdded: [c, ...state.suppliersAdded] })
}

/** Add a new ประเภทบัญชี cost center. No-op on blank input or a name that already
    exists (built-in or user-added, case-insensitive). Returns the stored name. */
export function addCostCenter(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  const exists = [...GOODS_PAYMENT_CATEGORIES, ...state.costCenters].some((c) => c.toLowerCase() === trimmed.toLowerCase())
  if (!exists) commit({ ...state, costCenters: [...state.costCenters, trimmed] })
  return trimmed
}
/** Remove a user-added ประเภทบัญชี cost center (built-ins can't be removed). */
export function removeCostCenter(name: string) {
  commit({ ...state, costCenters: state.costCenters.filter((c) => c !== name) })
}
/** Merge an edit onto a supplier (by id) — works for both master and added
    suppliers; the display list applies supplierEdits on top. Empty / undefined
    values clear that key so display falls back to the base record. */
export function updateSupplier(id: string, edit: SupplierEdit) {
  const merged: SupplierEdit = { ...(state.supplierEdits[id] ?? {}), ...edit }
  for (const k of Object.keys(merged) as (keyof SupplierEdit)[]) {
    const v = merged[k]
    if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete merged[k]
  }
  const next = { ...state.supplierEdits }
  if (Object.keys(merged).length === 0) delete next[id]
  else next[id] = merged
  commit({ ...state, supplierEdits: next })
}
/** Next running supplier id (S0001, …) across the master + user-added list. */
export function nextSupplierId(existing: Creditor[]): string {
  let max = 0
  for (const c of existing) {
    const n = parseInt(c.id.replace(/^S/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `S${String(max + 1).padStart(4, '0')}`
}

/* ───────── Products (สินค้า · ราคาสินค้า) ───────── */
/** Push a brand-new product to the head of the user-added list. */
export function addProduct(p: Product) {
  commit({ ...state, productsAdded: [p, ...state.productsAdded] })
}
/** Merge an edit onto a product (by code). Empty-string / undefined values clear
    that key so display falls back to the base product (seed or added). */
export function updateProduct(code: string, edit: ProductEdit) {
  const merged: ProductEdit = { ...(state.productEdits[code] ?? {}), ...edit }
  for (const k of Object.keys(merged) as (keyof ProductEdit)[]) {
    const v = merged[k]
    if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete merged[k]
  }
  const next = { ...state.productEdits }
  if (Object.keys(merged).length === 0) delete next[code]
  else next[code] = merged
  commit({ ...state, productEdits: next })
}
/** Delete a product from the price list. User-added products are removed
    outright (+ their edit overlay dropped); seed products (defined in code)
    can't be removed from the array, so they're hidden by code instead. Restore
    via ตั้งค่า → กู้คืนรายการที่ซ่อน. */
export function removeProduct(code: string) {
  const wasAdded = state.productsAdded.some((p) => p.code === code)
  const nextEdits = { ...state.productEdits }
  delete nextEdits[code]
  commit({
    ...state,
    productsAdded: state.productsAdded.filter((p) => p.code !== code),
    productEdits: nextEdits,
    hidden: wasAdded ? state.hidden : { ...state.hidden, products: [...(state.hidden.products ?? []), code] },
  })
}
/** True when a product code belongs to a user-added product (vs a seed product). */
export function isAddedProduct(code: string): boolean {
  return state.productsAdded.some((p) => p.code === code)
}

/** Rename a USER-ADDED product's code, updating every reference across created
    data: the edit overlay, formulaCode links, price adjustments, mix designs,
    foundry formulas, and the user's tickets / invoices / sales orders / foundry
    deliveries. Seed products keep their code (delete + re-add instead). No-op if
    oldCode isn't user-added, newCode is taken, or the codes are equal. */
export function renameProduct(oldCode: string, newCode: string) {
  if (oldCode === newCode || !newCode) return
  if (!state.productsAdded.some((p) => p.code === oldCode)) return
  if (state.productsAdded.some((p) => p.code === newCode)) return

  const productsAdded = state.productsAdded.map((p) => {
    let np = p.code === oldCode ? { ...p, code: newCode } : p
    if (np.formulaCode === oldCode) np = { ...np, formulaCode: newCode }
    return np
  })
  const productEdits: Record<string, ProductEdit> = {}
  for (const [k, e] of Object.entries(state.productEdits)) {
    productEdits[k === oldCode ? newCode : k] = e.formulaCode === oldCode ? { ...e, formulaCode: newCode } : e
  }
  const priceAdjustments = state.priceAdjustments.map((adj) => {
    if (!adj.prices || adj.prices[oldCode] === undefined) return adj
    const prices = { ...adj.prices }; prices[newCode] = prices[oldCode]; delete prices[oldCode]
    return { ...adj, prices }
  })
  const mixDesignsAdded = state.mixDesignsAdded.map((m) => (m.code === oldCode ? { ...m, code: newCode } : m))
  const mixDesignEdits: Record<string, Partial<MixDesign>> = {}
  for (const [k, v] of Object.entries(state.mixDesignEdits)) mixDesignEdits[k === oldCode ? newCode : k] = v
  const foundryFormulas = state.foundryFormulas.map((f) => (f.code === oldCode ? { ...f, code: newCode } : f))
  const tickets = state.tickets.map((t) => (t.prod === oldCode ? { ...t, prod: newCode } : t))
  const invoices = state.invoices.map((inv) =>
    inv.lines.some((l) => l.code === oldCode) ? { ...inv, lines: inv.lines.map((l) => (l.code === oldCode ? { ...l, code: newCode } : l)) } : inv)
  const salesOrders = state.salesOrders.map((so) =>
    so.items.some((it) => it.code === oldCode) ? { ...so, items: so.items.map((it) => (it.code === oldCode ? { ...it, code: newCode } : it)) } : so)
  const foundryDeliveries = state.foundryDeliveries.map((fd) =>
    fd.items.some((it) => it.code === oldCode) ? { ...fd, items: fd.items.map((it) => (it.code === oldCode ? { ...it, code: newCode } : it)) } : fd)

  commit({ ...state, productsAdded, productEdits, priceAdjustments, mixDesignsAdded, mixDesignEdits, foundryFormulas, tickets, invoices, salesOrders, foundryDeliveries })
}

/* ───────── Mix designs (สูตรส่วนผสมคอนกรีต · Mix Design) ───────── */
/** Push a brand-new mix design to the head of the user-added list. */
export function addMixDesign(m: MixDesign) {
  commit({ ...state, mixDesignsAdded: [m, ...state.mixDesignsAdded] })
}
/** Update a mix design (by code). Added formulas are replaced in place; seed
    formulas get an overlay merged on top of MIX_DESIGNS at display time. */
export function updateMixDesign(code: string, patch: Partial<MixDesign>) {
  if (state.mixDesignsAdded.some((m) => m.code === code)) {
    commit({ ...state, mixDesignsAdded: state.mixDesignsAdded.map((m) => (m.code === code ? { ...m, ...patch, code } : m)) })
  } else {
    const merged = { ...(state.mixDesignEdits[code] ?? {}), ...patch }
    commit({ ...state, mixDesignEdits: { ...state.mixDesignEdits, [code]: merged } })
  }
}
/** Delete a user-added mix design and drop any edit overlay on that code. */
export function removeMixDesign(code: string) {
  const nextEdits = { ...state.mixDesignEdits }
  delete nextEdits[code]
  commit({ ...state, mixDesignsAdded: state.mixDesignsAdded.filter((m) => m.code !== code), mixDesignEdits: nextEdits })
}
/** True when a mix-design code is user-added (vs a seed formula). */
export function isAddedMixDesign(code: string): boolean {
  return state.mixDesignsAdded.some((m) => m.code === code)
}

/* ───────── Foundry formulas (สูตรผลิตโรงหล่อ) ───────── */
/** Add a foundry production formula (one per product code) to the head of the list. */
export function addFoundryFormula(f: FoundryFormula) {
  commit({ ...state, foundryFormulas: [f, ...state.foundryFormulas.filter((x) => x.code !== f.code)] })
}
/** Update a foundry formula in place (matched by code). */
export function updateFoundryFormula(code: string, patch: Partial<FoundryFormula>) {
  commit({ ...state, foundryFormulas: state.foundryFormulas.map((f) => (f.code === code ? { ...f, ...patch, code } : f)) })
}
/** Delete a foundry formula by product code. */
export function removeFoundryFormula(code: string) {
  commit({ ...state, foundryFormulas: state.foundryFormulas.filter((f) => f.code !== code) })
}

/** Merge an edit onto a customer (by id). Undefined values clear prior edits. */
export function updateCustomer(id: string, edit: CustomerEdit) {
  const merged = { ...(state.customerEdits[id] ?? {}), ...edit }
  /* Drop keys that are explicitly empty strings / undefined so display falls
     back to the master record. */
  for (const k of Object.keys(merged) as (keyof CustomerEdit)[]) {
    const v = merged[k]
    if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete merged[k]
  }
  const next = { ...state.customerEdits }
  if (Object.keys(merged).length === 0) delete next[id]
  else next[id] = merged
  commit({ ...state, customerEdits: next })
}

/** Append a transport-rate adjustment to the head of the log. */
export function addTransportRateAdjustment(adj: TransportRateAdjustment) {
  commit({ ...state, transportAdjustments: [{ ...adj, by: adj.by || currentUserName() }, ...state.transportAdjustments] })
}

/** Append a product-price adjustment to the head of the log. */
export function addPriceAdjustment(adj: PriceAdjustment) {
  commit({ ...state, priceAdjustments: [{ ...adj, by: adj.by || currentUserName() }, ...state.priceAdjustments] })
}

/** Push a brand-new employee to the head of the user-added list. */
export function addEmployee(e: Employee) {
  commit({ ...state, employeesAdded: [stamp(e), ...state.employeesAdded] })
}

/** Delete an employee from the roster: drop any user-added record and hide the
    id (also covers seed employees, which can't be removed from code). */
export function removeEmployee(id: string) {
  commit({
    ...state,
    employeesAdded: state.employeesAdded.filter((e) => e.id !== id),
    hidden: state.hidden.employees.includes(id)
      ? state.hidden
      : { ...state.hidden, employees: [...state.hidden.employees, id] },
  })
}

/** Merge an edit onto an employee (by id). Empty-string / undefined values
    clear prior edits and fall back to the master record. */
export function updateEmployee(id: string, edit: EmployeeEdit) {
  const merged = { ...(state.employeeEdits[id] ?? {}), ...edit }
  for (const k of Object.keys(merged) as (keyof EmployeeEdit)[]) {
    const v = merged[k]
    if (v === undefined || v === '') delete merged[k]
  }
  const next = { ...state.employeeEdits }
  if (Object.keys(merged).length === 0) delete next[id]
  else next[id] = merged
  commit({ ...state, employeeEdits: next })
}

/* ───────── Mixer-truck trip log (บันทึกเที่ยวรถโม่ตามใบจ่าย) ───────── */
/** Patch one ticket's trip record (truck assignment / over-20km / OT flags).
    An empty record (no truck and no flags) is dropped to keep the store lean. */
export function setTruckTrip(dtNo: string, patch: Partial<TruckTripEntry>) {
  const merged: TruckTripEntry = { ...(state.truckTrips[dtNo] ?? {}), ...patch }
  const next = { ...state.truckTrips }
  if (!merged.over20 && !merged.ot18 && !merged.ot22 && !merged.driver) delete next[dtNo]
  else next[dtNo] = merged
  commit({ ...state, truckTrips: next })
}

/* ───────── รายงานทั่วไป (General reports) ───────── */
export function addGeneralReport(r: GeneralReport) {
  commit({ ...state, generalReports: [stamp(r), ...state.generalReports] })
}
export function removeGeneralReport(id: string) {
  commit({ ...state, generalReports: state.generalReports.filter((g) => g.id !== id) })
}
/** Persist the commission rate table (used by the บันทึกค่าคอมมิชชั่น page). */
export function setCommissionRates(rates: CommissionRate[]) {
  commit({ ...state, commissionRates: rates })
}

/** Current effective transport fee schedule (VAT-inclusive). Returns the latest
    adjustment's `fees` snapshot if any, otherwise the supplied seed/default
    table. Safe to call outside React. */
export function getCurrentTransportFees(defaultFees: { m3: number; totalWithVat: number }[]): { m3: number; totalWithVat: number }[] {
  return state.transportAdjustments[0]?.fees ?? defaultFees
}

export function useCreatedDocs(): CreatedDocs {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => state,
    () => state,
  )
}

/** The current merged product list — user-added first, then seed PRODUCTS, with
    per-product edits and the latest price-adjustment override applied, and hidden
    (deleted) products removed. Single source of truth for "what products exist
    now", shared by the ราคาสินค้า page and the product pickers. */
export function useProducts(): Product[] {
  const s = useCreatedDocs()
  return useMemo(() => {
    const hidden = new Set(s.hidden.products)
    const overrides = s.priceAdjustments[0]?.prices ?? {}
    const base = [...s.productsAdded, ...PRODUCTS].filter((p) => !hidden.has(p.code))
    return base.map((p) => {
      const withEdit = s.productEdits[p.code] ? { ...p, ...s.productEdits[p.code] } : p
      return overrides[p.code] !== undefined ? { ...withEdit, price: overrides[p.code] } : withEdit
    })
  }, [s.productsAdded, s.productEdits, s.priceAdjustments, s.hidden.products])
}

/** The current merged supplier list — user-added first, then the creditor master,
    with per-id edits (supplierEdits) applied. Single source of truth for
    "what suppliers exist now", shared by the ทะเบียนซัพพลายเออร์ page and the
    PO / payment supplier pickers. */
export function useSuppliers(): Creditor[] {
  const s = useCreatedDocs()
  return useMemo(() => {
    const base = [...s.suppliersAdded, ...CREDITOR_MASTER]
    return base.map((c) => (s.supplierEdits[c.id] ? { ...c, ...s.supplierEdits[c.id] } : c))
  }, [s.suppliersAdded, s.supplierEdits])
}

/** Merged ประเภทบัญชี cost center list — built-in defaults first, then user-added.
    Single source of truth for the cost-center pickers and the ประเภทบัญชี page. */
export function useCostCenters(): string[] {
  const s = useCreatedDocs()
  return useMemo(() => {
    const seen = new Set(GOODS_PAYMENT_CATEGORIES.map((c) => c.toLowerCase()))
    const extra = s.costCenters.filter((c) => !seen.has(c.toLowerCase()))
    return [...GOODS_PAYMENT_CATEGORIES, ...extra]
  }, [s.costCenters])
}

/* Build-time switch: in production builds, hide the delete UI entirely. */
export const CAN_DELETE: boolean = import.meta.env.DEV
