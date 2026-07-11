/* Global transaction search index.

   Aggregates every transaction record across the Sales, Purchasing and Customers
   categories into a flat, searchable list of hits. The Topbar search box filters
   this index live and navigates to the owning page on click.

   Seed (real-data) hits are built once at module load; user-created docs are
   merged in per call so newly issued documents are searchable immediately. */

import { DELIVERY_TICKETS, CUSTOMER_MASTER } from './real'
import { CREDITOR_MASTER } from './creditors'
import { INVOICES, BILLING_NOTES, RECEIPTS, baht } from './selectors'
import type { CreatedDocs } from './createdDocs'

/** Top-level grouping shown as a section header in the dropdown. */
export type SearchCategory = 'sales' | 'purchasing' | 'customers' | 'inventory'

export const CATEGORY_LABEL: Record<SearchCategory, string> = {
  sales: 'การขาย · Sales',
  purchasing: 'การซื้อ / การจ่าย · Purchasing',
  customers: 'ลูกค้า · Customers',
  inventory: 'จัดการคลัง · Inventory',
}

export interface SearchHit {
  key: string            /* unique React key */
  category: SearchCategory
  group: string          /* specific record type, e.g. 'ใบกำกับภาษี' */
  label: string          /* document no. or entity name */
  sub: string            /* customer · amount · date context line */
  route: string          /* navigation target */
  resource: string       /* permission key gating visibility */
  hay: string            /* pre-lowercased searchable text */
}

const lc = (...parts: (string | number | undefined)[]) =>
  parts.filter((p) => p !== undefined && p !== '').join(' ').toLowerCase()

/* ───────── Seed index (built once) ───────── */

function buildSeedIndex(): SearchHit[] {
  const hits: SearchHit[] = []

  /* Sales — delivery tickets (real data) */
  for (const t of DELIVERY_TICKETS) {
    hits.push({
      key: `dt:${t.dtNo}`,
      category: 'sales',
      group: 'ใบจ่ายคอนกรีต',
      label: t.dtNo,
      sub: `${t.customer} · ${t.m3} คิว · ${baht(t.amount)}`,
      route: '/delivery-tickets',
      resource: 'delivery-tickets',
      hay: lc(t.dtNo, t.ref, t.customer, t.prod, t.note),
    })
  }

  /* Sales — tax invoices */
  for (const inv of INVOICES) {
    hits.push({
      key: `iv:${inv.no}`,
      category: 'sales',
      group: 'ใบกำกับภาษี / วางบิล',
      label: inv.no,
      sub: `${inv.customer} · ${baht(inv.total)} · ${inv.date}`,
      route: '/invoices',
      resource: 'invoices',
      hay: lc(inv.no, inv.customer, inv.date),
    })
  }

  /* Sales — billing notes */
  for (const bn of BILLING_NOTES) {
    hits.push({
      key: `bn:${bn.no}`,
      category: 'sales',
      group: 'ใบวางบิล',
      label: bn.no,
      sub: `${bn.customer} · ${baht(bn.total)}`,
      route: '/billing',
      resource: 'invoices',
      hay: lc(bn.no, bn.customer),
    })
  }

  /* Sales — receipts */
  for (const rc of RECEIPTS) {
    hits.push({
      key: `rc:${rc.no}`,
      category: 'sales',
      group: 'ใบเสร็จรับเงิน',
      label: rc.no,
      sub: `${rc.customer} · ${baht(rc.amount)} · ${rc.date}`,
      route: '/receipts',
      resource: 'receipts',
      hay: lc(rc.no, rc.customer),
    })
  }

  /* Customers — master */
  for (const c of CUSTOMER_MASTER) {
    hits.push({
      key: `cm:${c.id}`,
      category: 'customers',
      group: 'ทะเบียนลูกค้า',
      label: c.name,
      sub: `${c.id} · ${c.legalName !== c.name ? c.legalName : c.type}`,
      route: '/customer-master',
      resource: 'customer-master',
      hay: lc(c.id, c.name, c.legalName, c.taxId, c.phone),
    })
  }

  /* Customers — suppliers / creditors */
  for (const s of CREDITOR_MASTER) {
    hits.push({
      key: `sup:${s.id}`,
      category: 'customers',
      group: 'ทะเบียนซัพพลายเออร์',
      label: s.name,
      sub: `${s.id}${s.note ? ' · ' + s.note : ''}${s.outstanding ? ' · ค้าง ' + baht(s.outstanding) : ''}`,
      route: '/suppliers',
      resource: 'suppliers',
      hay: lc(s.id, s.name, s.note),
    })
  }

  return hits
}

const SEED_INDEX: SearchHit[] = buildSeedIndex()

/* ───────── Created-doc index (per call) ───────── */

function buildCreatedIndex(c: CreatedDocs): SearchHit[] {
  const hits: SearchHit[] = []

  /* Sales — sales orders */
  for (const so of c.salesOrders) {
    hits.push({
      key: `so:${so.soNo}`,
      category: 'sales',
      group: 'ใบสั่งขาย',
      label: so.soNo,
      sub: `${so.customer} · ${so.status} · ${so.orderDate}`,
      route: '/sales-orders',
      resource: 'sales-orders',
      hay: lc(so.soNo, so.customer, so.note, ...so.items.map((i) => i.name)),
    })
  }

  /* Sales — quotations */
  for (const q of c.quotations) {
    hits.push({
      key: `qt:${q.qtNo}`,
      category: 'sales',
      group: 'ใบเสนอราคา',
      label: q.qtNo,
      sub: `${q.customer} · ${q.date}`,
      route: '/quotations',
      resource: 'quotations',
      hay: lc(q.qtNo, q.customer, q.note, ...q.items.map((i) => i.name)),
    })
  }

  /* Inventory — foundry BOQ estimates */
  for (const b of c.foundryBoqs) {
    hits.push({
      key: `boq:${b.no}`,
      category: 'inventory',
      group: 'ประเมินราคาสินค้าโรงหล่อ',
      label: b.no,
      sub: `${b.project} · ${b.date}`,
      route: '/foundry-boq',
      resource: 'foundry-boq',
      hay: lc(b.no, b.project, b.note, ...b.products.map((p) => `${p.type} ${p.code}`)),
    })
  }

  /* Sales — user-created delivery tickets */
  for (const t of c.tickets) {
    hits.push({
      key: `dt:${t.dtNo}`,
      category: 'sales',
      group: 'ใบจ่ายคอนกรีต',
      label: t.dtNo,
      sub: `${t.customer} · ${t.m3} คิว · ${baht(t.amount)}`,
      route: '/delivery-tickets',
      resource: 'delivery-tickets',
      hay: lc(t.dtNo, t.ref, t.customer, t.prod, t.note),
    })
  }

  /* Sales — user-created invoices */
  for (const inv of c.invoices) {
    hits.push({
      key: `iv:${inv.no}`,
      category: 'sales',
      group: 'ใบกำกับภาษี / วางบิล',
      label: inv.no,
      sub: `${inv.customer} · ${baht(inv.total)} · ${inv.date}`,
      route: '/invoices',
      resource: 'invoices',
      hay: lc(inv.no, inv.customer, inv.date),
    })
  }

  /* Sales — user-created receipts */
  for (const rc of c.receipts) {
    hits.push({
      key: `rc:${rc.no}`,
      category: 'sales',
      group: 'ใบเสร็จรับเงิน',
      label: rc.no,
      sub: `${rc.customer} · ${baht(rc.amount)} · ${rc.date}`,
      route: '/receipts',
      resource: 'receipts',
      hay: lc(rc.no, rc.customer),
    })
  }

  /* Purchasing — purchase orders */
  for (const po of c.purchaseOrders) {
    hits.push({
      key: `po:${po.poNo}`,
      category: 'purchasing',
      group: 'ใบสั่งซื้อ',
      label: po.poNo,
      sub: `${po.supplier} · ${po.status} · ${po.orderDate}`,
      route: '/purchase-orders',
      resource: 'purchase-orders',
      hay: lc(po.poNo, po.supplier, po.note, ...po.items.map((i) => i.desc)),
    })
  }

  /* Purchasing — goods / material payments */
  for (const gp of c.goodsPayments) {
    hits.push({
      key: `gp:${gp.gpNo}`,
      category: 'purchasing',
      group: 'ใบสำคัญจ่าย',
      label: gp.gpNo,
      sub: `${gp.supplier} · ${baht(gp.amount)} · ${gp.payDate}`,
      route: '/goods-payments',
      resource: 'goods-payments',
      hay: lc(gp.gpNo, gp.supplier, gp.ref, gp.chequeNo, gp.note),
    })
  }

  /* Purchasing — payroll vouchers */
  for (const pp of c.payrollPayments) {
    hits.push({
      key: `pr:${pp.ppNo}`,
      category: 'purchasing',
      group: 'ทำจ่ายเงินเดือน',
      label: pp.ppNo,
      sub: `${pp.employeeName} · ${baht(pp.netAmount)} · ${pp.payMonth}`,
      route: '/payroll',
      resource: 'payroll',
      hay: lc(pp.ppNo, pp.employeeName, pp.employeeId, pp.payMonth),
    })
  }

  /* Purchasing — advance withdrawals */
  for (const a of c.advances) {
    hits.push({
      key: `adv:${a.advNo}`,
      category: 'purchasing',
      group: 'ใบเบิกล่วงหน้า',
      label: a.advNo,
      sub: `${a.employeeName} · ${baht(a.amount)} · ${a.date}`,
      route: '/payroll',
      resource: 'payroll',
      hay: lc(a.advNo, a.employeeName, a.employeeId),
    })
  }

  /* Customers — user-added customers */
  for (const cu of c.customersAdded) {
    hits.push({
      key: `cm:${cu.id}`,
      category: 'customers',
      group: 'ทะเบียนลูกค้า',
      label: cu.name,
      sub: `${cu.id} · ${cu.legalName !== cu.name ? cu.legalName : cu.type}`,
      route: '/customer-master',
      resource: 'customer-master',
      hay: lc(cu.id, cu.name, cu.legalName, cu.taxId, cu.phone),
    })
  }

  return hits
}

export interface SearchGroup {
  category: SearchCategory
  hits: SearchHit[]
}

/** Run a query against the full index. Returns hits grouped by category, gated
    by `canView`, capped per category and overall.
    @param canView decides whether a resource key is visible to the current role. */
export function searchTransactions(
  query: string,
  created: CreatedDocs,
  canView: (resource: string) => boolean,
  opts: { perCategory?: number } = {},
): SearchGroup[] {
  const q = query.trim().toLowerCase()
  if (q.length < 1) return []
  const perCategory = opts.perCategory ?? 6
  /* Multi-term AND match so "พีช 4000" narrows progressively. */
  const terms = q.split(/\s+/).filter(Boolean)

  const all = [...buildCreatedIndex(created), ...SEED_INDEX]
  const order: SearchCategory[] = ['sales', 'purchasing', 'inventory', 'customers']
  const groups: SearchGroup[] = []

  for (const category of order) {
    const seen = new Set<string>()
    const matched: SearchHit[] = []
    for (const hit of all) {
      if (hit.category !== category) continue
      if (!canView(hit.resource)) continue
      if (seen.has(hit.key)) continue
      if (!terms.every((t) => hit.hay.includes(t))) continue
      seen.add(hit.key)
      matched.push(hit)
      if (matched.length >= perCategory) break
    }
    if (matched.length) groups.push({ category, hits: matched })
  }

  return groups
}
