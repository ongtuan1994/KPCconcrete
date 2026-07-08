/* In-app store for user-created documents (tax invoices, billing notes, receipts,
   delivery tickets). Persists to localStorage so issued documents survive page refreshes.
   Issued docs are merged with the derived real-data lists in each page.

   `hidden` tracks IDs of seed (real-data) records the user removed in dev mode.
   The delete UI is gated on `import.meta.env.DEV`, so this state stays empty in prod. */

import { useSyncExternalStore } from 'react'
import type { Invoice, BillingNote, Receipt } from './selectors'
import { CUSTOMER_MASTER, type DeliveryTicket, type Customer, type Product } from './real'
import type { MixDesign } from './mixDesign'
import type { FoundryFormula } from './foundryFormula'
import type { Employee } from './employees'
import type { Creditor } from './creditors'
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

/** Editable subset of Product fields merged on top of PRODUCTS (and productsAdded).
    Keyed by product code. Covers everything the เพิ่ม/แก้ไขสินค้า form can change
    except the code/site/category, which are fixed by the code itself. */
export type ProductEdit = Partial<Pick<Product, 'name' | 'unit' | 'price' | 'pickup' | 'pickupPrices' | 'strengthKsc' | 'formulaCode' | 'cementBrand'>>

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

/** ประเภทค่าใช้จ่าย recorded on a goods-payment voucher. */
export type GoodsPaymentCategory =
  | 'สินทรัพย์'
  | 'ค่าน้ำมัน'
  | 'ค่าไฟฟ้า'
  | 'ค่าวัสดุสิ้นเปลือง'
  | 'ค่าอะไหล่และเครื่องมือ'
  | 'ค่าใช้จ่ายยานพาหนะ'
  | 'ค่าบริการ'
  | 'ค่าซื้อวัตถุดิบ'
export const GOODS_PAYMENT_CATEGORIES: GoodsPaymentCategory[] = [
  'สินทรัพย์', 'ค่าน้ำมัน', 'ค่าไฟฟ้า', 'ค่าวัสดุสิ้นเปลือง',
  'ค่าอะไหล่และเครื่องมือ', 'ค่าใช้จ่ายยานพาหนะ', 'ค่าบริการ', 'ค่าซื้อวัตถุดิบ',
]
/** For a 'ค่าซื้อวัตถุดิบ' voucher — which SITE the raw materials are for. */
export type GoodsPaymentSite = 'แพล้นปูน' | 'โรงหล่อ'

export interface GoodsPayment {
  id: string         /* = gpNo */
  gpNo: string       /* running no., e.g. GP00001 */
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
  /** Supplier's tax-invoice number (เลขที่ใบกำกับ) — shown as the doc no. in
      the purchase-tax report when this voucher is ลง VAT. */
  taxInvoiceNo?: string
  note?: string
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string
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

export type GeneralReport = TruckTripReport | CommissionReport | AttendanceReport | PriceListReport | TransportPriceReport | PayrollReport | MixDesignReport | FoundryFormulaReport | StockReport | LedgerReport | EmployeeReport | ExpenseReport | PurchaseAccountReport | MidMonthAdvanceReport

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
export interface DeletedPurchaseOrder extends PurchaseOrder { deletedAt: string; deletedBy: string }
export interface DeletedGoodsPayment extends GoodsPayment { deletedAt: string; deletedBy: string }

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
  /** Purchase orders (ใบสั่งซื้อ) — newest first. */
  purchaseOrders: PurchaseOrder[]
  /** Goods/material payment vouchers (ใบทำจ่ายสินค้า/วัสดุ) — newest first. */
  goodsPayments: GoodsPayment[]
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
  /** Foundry finished-goods stock receipts (รับเข้าสต๊อกสินค้าโรงหล่อ) — newest first. */
  foundryReceipts: StockReceipt[]
  /** Stock reconciliations (กระทบยอดคงคลัง) — newest first. */
  stockReconciles: StockReconcile[]
  /** Historical tax rows imported from Excel/CSV (รายงานภาษีซื้อ/ขาย ย้อนหลัง). */
  taxImports: ImportedTaxRow[]
  /** Installment payments recorded against tax invoices (ผ่อนชำระใบกำกับ). */
  invoicePayments: InvoicePayment[]
  /** Audit history of deleted ใบจ่ายคอนกรีต (newest first) — shown below the list. */
  deletedTickets: DeletedTicket[]
  /** Audit history of deleted ใบสั่งขาย (เฉพาะรอผลิต) — newest first. */
  deletedSalesOrders: DeletedSalesOrder[]
  /** Audit history of deleted ใบสั่งซื้อ — newest first. */
  deletedPurchaseOrders: DeletedPurchaseOrder[]
  /** Audit history of deleted ใบสำคัญจ่าย — newest first. */
  deletedGoodsPayments: DeletedGoodsPayment[]
}

const emptyHidden: Hidden = { tickets: [], invoices: [], billingNotes: [], receipts: [], employees: [], products: [] }
const empty: CreatedDocs = { invoices: [], billingNotes: [], receipts: [], tickets: [], hidden: emptyHidden, customerEdits: {}, customersAdded: [], suppliersAdded: [], productsAdded: [], productEdits: {}, mixDesignsAdded: [], mixDesignEdits: {}, foundryFormulas: [], transportAdjustments: [], priceAdjustments: [], employeeEdits: {}, employeesAdded: [], salesOrders: [], purchaseOrders: [], goodsPayments: [], foundryDeliveries: [], payrollPayments: [], salaryStructures: {}, advances: [], leaveRecords: [], salaryStructureAdjustments: [], truckTrips: {}, generalReports: [], commissionRates: DEFAULT_COMMISSION_RATES, terminations: [], appointments: [], todoNotes: [], stockReceipts: [], foundryReceipts: [], stockReconciles: [], taxImports: [], invoicePayments: [], deletedTickets: [], deletedSalesOrders: [], deletedPurchaseOrders: [], deletedGoodsPayments: [] }

function read(): CreatedDocs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty
    const v = JSON.parse(raw) as Partial<CreatedDocs>
    return {
      invoices: v.invoices ?? [],
      billingNotes: v.billingNotes ?? [],
      receipts: v.receipts ?? [],
      tickets: v.tickets ?? [],
      hidden: { ...emptyHidden, ...(v.hidden ?? {}) },
      customerEdits: v.customerEdits ?? {},
      customersAdded: v.customersAdded ?? [],
      suppliersAdded: v.suppliersAdded ?? [],
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
      purchaseOrders: (v.purchaseOrders ?? []).map((p) => ({ ...p, status: p.status ?? 'รอรับของ' })),
      goodsPayments: v.goodsPayments ?? [],
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
      foundryReceipts: v.foundryReceipts ?? [],
      stockReconciles: v.stockReconciles ?? [],
      /* Backfill year on rows imported before the year dimension existed (the
         original seed/imports were พ.ศ. 2569). */
      taxImports: (v.taxImports ?? []).map((r) => ({ ...r, year: r.year ?? 2569 })),
      invoicePayments: v.invoicePayments ?? [],
      deletedTickets: v.deletedTickets ?? [],
      deletedSalesOrders: v.deletedSalesOrders ?? [],
      deletedPurchaseOrders: v.deletedPurchaseOrders ?? [],
      deletedGoodsPayments: v.deletedGoodsPayments ?? [],
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
export function removeInvoice(no: string) {
  const wasCreated = state.invoices.some((i) => i.no === no)
  commit({
    ...state,
    invoices: state.invoices.filter((i) => i.no !== no),
    hidden: wasCreated ? state.hidden : { ...state.hidden, invoices: [...state.hidden.invoices, no] },
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
export function removeReceipt(no: string) {
  const wasCreated = state.receipts.some((r) => r.no === no)
  commit({
    ...state,
    receipts: state.receipts.filter((r) => r.no !== no),
    hidden: wasCreated ? state.hidden : { ...state.hidden, receipts: [...state.hidden.receipts, no] },
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
export function removeGoodsPayment(gpNo: string) {
  const rec = state.goodsPayments.find((g) => g.gpNo === gpNo)
  commit({
    ...state,
    goodsPayments: state.goodsPayments.filter((g) => g.gpNo !== gpNo),
    deletedGoodsPayments: rec ? [stampDeleted(rec), ...state.deletedGoodsPayments.filter((d) => d.gpNo !== gpNo)] : state.deletedGoodsPayments,
  })
}
/** Undo a ใบสำคัญจ่าย deletion — re-add it to the list and drop the history row. */
export function restoreGoodsPayment(gpNo: string) {
  const rec = state.deletedGoodsPayments.find((d) => d.gpNo === gpNo)
  if (!rec) return
  commit({
    ...state,
    deletedGoodsPayments: state.deletedGoodsPayments.filter((d) => d.gpNo !== gpNo),
    goodsPayments: [unstampDeleted(rec) as GoodsPayment, ...state.goodsPayments],
  })
}

/* Foundry goods-delivery notes (ใบส่งสินค้าโรงหล่อ). */
export function addFoundryDelivery(fd: FoundryDelivery) {
  commit({ ...state, foundryDeliveries: [stamp(fd), ...state.foundryDeliveries] })
}
export function removeFoundryDelivery(fdNo: string) {
  commit({ ...state, foundryDeliveries: state.foundryDeliveries.filter((f) => f.fdNo !== fdNo) })
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

/* Build-time switch: in production builds, hide the delete UI entirely. */
export const CAN_DELETE: boolean = import.meta.env.DEV
