/* In-app store for user-created documents (tax invoices, billing notes, receipts,
   delivery tickets). Persists to localStorage so issued documents survive page refreshes.
   Issued docs are merged with the derived real-data lists in each page.

   `hidden` tracks IDs of seed (real-data) records the user removed in dev mode.
   The delete UI is gated on `import.meta.env.DEV`, so this state stays empty in prod. */

import { useSyncExternalStore } from 'react'
import type { Invoice, BillingNote, Receipt } from './selectors'
import type { DeliveryTicket, Customer } from './real'
import type { Employee } from './employees'

/** Editable subset of Customer fields — phone/credit kept on top of the master. */
export type CustomerEdit = Partial<Pick<Customer, 'phone' | 'creditLimit' | 'creditDays' | 'address' | 'taxId' | 'legalName'>>

/** Editable subset of Employee fields kept on top of the EMPLOYEES roster. */
export type EmployeeEdit = Partial<Pick<Employee, 'nickname' | 'role' | 'department' | 'startDate' | 'phone'>>

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
  createdAt: string
}

/** Goods / material payment voucher (ใบทำจ่ายสินค้า/วัสดุ) — recording a payment
    made to a supplier for purchased goods. */
export interface GoodsPayment {
  id: string         /* = gpNo */
  gpNo: string       /* running no., e.g. GP00001 */
  payDate: string    /* ISO */
  supplier: string
  amount: number     /* baht paid */
  method: PayMethodOut
  ref?: string       /* optional reference — PO no. / invoice no. */
  note?: string
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
  lastAdjustedAt?: string /* ISO timestamp ของการปรับเงินเดือนครั้งล่าสุด */
}

/** One changed field within a salary-structure adjustment. */
export interface StructureChange { label: string; from: number; to: number }
/** History entry for a salary-structure adjustment (ประวัติการปรับโครงสร้าง). */
export interface SalaryStructureAdjustment {
  at: string          /* ISO timestamp */
  employeeId: string
  employeeName: string
  changes: StructureChange[]
}

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
  /** Payroll payment vouchers (ใบทำจ่ายเงินเดือน) — newest first. */
  payrollPayments: PayrollPayment[]
  /** Standing salary structure per employee (keyed by Employee.id). */
  salaryStructures: Record<string, SalaryStructure>
  /** Advance withdrawals (เบิกล่วงหน้า) — newest first. */
  advances: AdvancePayment[]
  /** History of salary-structure adjustments — newest first. */
  salaryStructureAdjustments: SalaryStructureAdjustment[]
}

const emptyHidden: Hidden = { tickets: [], invoices: [], billingNotes: [], receipts: [] }
const empty: CreatedDocs = { invoices: [], billingNotes: [], receipts: [], tickets: [], hidden: emptyHidden, customerEdits: {}, customersAdded: [], transportAdjustments: [], priceAdjustments: [], employeeEdits: {}, employeesAdded: [], salesOrders: [], purchaseOrders: [], goodsPayments: [], payrollPayments: [], salaryStructures: {}, advances: [], salaryStructureAdjustments: [] }

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
  commit({ ...state, invoices: [inv, ...state.invoices] })
}
export function addBillingNote(bn: BillingNote) {
  commit({ ...state, billingNotes: [bn, ...state.billingNotes] })
}
export function addReceipt(rc: Receipt) {
  commit({ ...state, receipts: [rc, ...state.receipts] })
}
export function addTicket(t: DeliveryTicket) {
  commit({ ...state, tickets: [t, ...state.tickets] })
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
  commit({ ...state, salesOrders: [so, ...state.salesOrders] })
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
  commit({ ...state, purchaseOrders: [po, ...state.purchaseOrders] })
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
  commit({ ...state, goodsPayments: [gp, ...state.goodsPayments] })
}
export function removeGoodsPayment(gpNo: string) {
  commit({ ...state, goodsPayments: state.goodsPayments.filter((g) => g.gpNo !== gpNo) })
}

/* Payroll payment vouchers (ใบทำจ่ายเงินเดือน). */
export function addPayrollPayment(pp: PayrollPayment) {
  commit({ ...state, payrollPayments: [pp, ...state.payrollPayments] })
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
  commit({ ...state, salaryStructureAdjustments: [adj, ...state.salaryStructureAdjustments] })
}

/* Advance withdrawals (เบิกล่วงหน้า). */
export function addAdvance(a: AdvancePayment) {
  commit({ ...state, advances: [a, ...state.advances] })
}
export function removeAdvance(advNo: string) {
  commit({ ...state, advances: state.advances.filter((a) => a.advNo !== advNo) })
}

export function restoreAllHidden() {
  commit({ ...state, hidden: emptyHidden })
}

export function addCustomer(c: Customer) {
  commit({ ...state, customersAdded: [c, ...state.customersAdded] })
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
  commit({ ...state, transportAdjustments: [adj, ...state.transportAdjustments] })
}

/** Append a product-price adjustment to the head of the log. */
export function addPriceAdjustment(adj: PriceAdjustment) {
  commit({ ...state, priceAdjustments: [adj, ...state.priceAdjustments] })
}

/** Push a brand-new employee to the head of the user-added list. */
export function addEmployee(e: Employee) {
  commit({ ...state, employeesAdded: [e, ...state.employeesAdded] })
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
