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
}

const emptyHidden: Hidden = { tickets: [], invoices: [], billingNotes: [], receipts: [] }
const empty: CreatedDocs = { invoices: [], billingNotes: [], receipts: [], tickets: [], hidden: emptyHidden, customerEdits: {}, customersAdded: [], transportAdjustments: [], priceAdjustments: [], employeeEdits: {}, employeesAdded: [] }

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
