/* In-app store for user-created documents (tax invoices, billing notes, receipts,
   delivery tickets). Persists to localStorage so issued documents survive page refreshes.
   Issued docs are merged with the derived real-data lists in each page.

   `hidden` tracks IDs of seed (real-data) records the user removed in dev mode.
   The delete UI is gated on `import.meta.env.DEV`, so this state stays empty in prod. */

import { useSyncExternalStore } from 'react'
import type { Invoice, BillingNote, Receipt } from './selectors'
import type { DeliveryTicket, Customer } from './real'
import type { Employee } from './employees'
import { currentUserName } from './auth'

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
  items: SalesOrderItem[]
  status: SalesOrderStatus
  note?: string
  /** Optional uploaded customer PO as evidence (stored as a data URL). */
  attachment?: { name: string; type: string; dataUrl: string }
  createdBy?: string  /* username of the saver (audit) */
  createdAt: string  /* ISO timestamp of when the order was saved */
}

/* ───────── การซื้อ / การจ่าย (Purchasing / Payments) ───────── */

/** Payment method for outgoing payments (purchases / payroll). */
export type PayMethodOut = 'เงินสด' | 'โอน' | 'เช็ค'

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

export interface GoodsPayment {
  id: string         /* = gpNo */
  gpNo: string       /* running no., e.g. GP00001 */
  payDate: string    /* ISO */
  supplier: string
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
/** Sales-commission report snapshot — commission = rate (บาท/คิว) × ยอดขายให้
    ลูกค้า (คิว), paid only when the volume qualifies (≥ 490 คิว). */
export interface CommissionReport extends GeneralReportBase {
  kind: 'commission'
  volumeM3: number   /* concrete sold to customers in the range (คิว) */
  qualifies: boolean /* volume ≥ 490 — pays only when true */
  status: string     /* human-readable threshold status */
  lines: CommissionLine[]
  total: number
}
/** One employee's row in a saved time-attendance report. */
export interface AttendanceReportEmployee {
  empId: string
  empName: string
  days: number       /* จำนวนวันที่มา (records in range) */
  lateMin: number    /* สายรวม (นาที) */
  otMin: number      /* OT รวม (นาที) — 0 when not OT-eligible (shown as "-") */
  otEligible: boolean /* false → OT column shows "-" */
}
/** Time-attendance report snapshot (บันทึกลงเวลางาน) — per-employee วัน/สาย/OT. */
export interface AttendanceReport extends GeneralReportBase {
  kind: 'attendance'
  employees: AttendanceReportEmployee[]
  totals: { employees: number; days: number; lateMin: number; otMin: number }
}
/** One product row in a saved price-list report. */
export interface PriceListReportRow {
  code: string
  name: string
  brand?: string     /* ปูนซีเมนต์ — ดอกบัว / SCG (concrete items only) */
  zone?: string      /* ระยะส่ง — e.g. "On Site (≤20 km)" (concrete items only) */
  unit: string
  pickup?: string    /* การรับของ — รับเอง / จัดส่ง (foundry items only) */
  price: number
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
/** Payroll payout report (รายงานการจ่ายเงินเดือน) for one pay period + group. */
export interface PayrollReport extends GeneralReportBase {
  kind: 'payroll'
  scope: PayrollReportScope
  scopeLabel: string
  payMonthLabel: string   /* e.g. "พฤษภาคม 2569" */
  rows: PayrollReportRow[]
  totals: { income: number; deduction: number; net: number }
}
export type GeneralReport = TruckTripReport | CommissionReport | AttendanceReport | PriceListReport | TransportPriceReport | PayrollReport

const KEY = 'kpc.createdDocs.v1'

interface Hidden {
  tickets: string[]
  invoices: string[]
  billingNotes: string[]
  receipts: string[]
}

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
}

const emptyHidden: Hidden = { tickets: [], invoices: [], billingNotes: [], receipts: [] }
const empty: CreatedDocs = { invoices: [], billingNotes: [], receipts: [], tickets: [], hidden: emptyHidden, customerEdits: {}, customersAdded: [], transportAdjustments: [], priceAdjustments: [], employeeEdits: {}, employeesAdded: [], salesOrders: [], purchaseOrders: [], goodsPayments: [], foundryDeliveries: [], payrollPayments: [], salaryStructures: {}, advances: [], salaryStructureAdjustments: [], truckTrips: {}, generalReports: [], commissionRates: DEFAULT_COMMISSION_RATES, terminations: [], appointments: [], todoNotes: [] }

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
      salaryStructureAdjustments: v.salaryStructureAdjustments ?? [],
      truckTrips: v.truckTrips ?? {},
      generalReports: v.generalReports ?? [],
      commissionRates: v.commissionRates ?? DEFAULT_COMMISSION_RATES,
      terminations: v.terminations ?? [],
      appointments: v.appointments ?? [],
      todoNotes: v.todoNotes ?? [],
    }
  } catch {
    return empty
  }
}

let state: CreatedDocs = read()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function commit(next: CreatedDocs) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  notify()
}

export function addInvoice(inv: Invoice) {
  commit({ ...state, invoices: [stamp(inv), ...state.invoices] })
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
export function removeTicket(dtNo: string) {
  const wasCreated = state.tickets.some((t) => t.dtNo === dtNo)
  commit({
    ...state,
    tickets: state.tickets.filter((t) => t.dtNo !== dtNo),
    hidden: wasCreated ? state.hidden : { ...state.hidden, tickets: [...state.hidden.tickets, dtNo] },
  })
}

/* Sales orders (ใบสั่งขาย) — created docs only, no seed data to hide. */
export function addSalesOrder(so: SalesOrder) {
  commit({ ...state, salesOrders: [stamp(so), ...state.salesOrders] })
}
export function removeSalesOrder(soNo: string) {
  commit({ ...state, salesOrders: state.salesOrders.filter((s) => s.soNo !== soNo) })
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
  commit({ ...state, purchaseOrders: state.purchaseOrders.filter((p) => p.poNo !== poNo) })
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
  commit({ ...state, goodsPayments: state.goodsPayments.filter((g) => g.gpNo !== gpNo) })
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
export function removeAdvance(advNo: string) {
  commit({ ...state, advances: state.advances.filter((a) => a.advNo !== advNo) })
}

export function restoreAllHidden() {
  commit({ ...state, hidden: emptyHidden })
}

export function addCustomer(c: Customer) {
  commit({ ...state, customersAdded: [stamp(c), ...state.customersAdded] })
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
