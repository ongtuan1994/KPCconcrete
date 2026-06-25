import type { ReactNode } from 'react'
import { IconOrder, IconCart, IconInvoice, IconReceipt, IconBars, IconPie, IconStock, IconTag, IconUsers, IconTruck, IconWallet } from './components/icons'

export interface NavItem {
  to: string
  label: string // Thai
  en: string
  icon: ReactNode
}
export interface NavGroup {
  section?: string // section header (Thai · English)
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    items: [
      { to: '/monthly-report', label: 'รายงานประจำเดือน / ปี', en: 'Monthly / Yearly Report', icon: <IconBars /> },
    ],
  },
  {
    section: 'การขาย · Sales',
    items: [
      { to: '/sales-orders', label: 'ใบสั่งขาย', en: 'Sales Orders', icon: <IconCart /> },
      { to: '/delivery-tickets', label: 'ใบจ่ายคอนกรีต', en: 'Delivery Tickets', icon: <IconOrder /> },
      { to: '/invoices', label: 'ใบกำกับภาษี / วางบิล', en: 'Tax Invoices / Billing', icon: <IconInvoice /> },
      { to: '/receipts', label: 'ใบเสร็จรับเงิน', en: 'Receipts', icon: <IconReceipt /> },
    ],
  },
  {
    section: 'การซื้อ / การจ่าย · Purchasing',
    items: [
      { to: '/purchase-orders', label: 'ใบสั่งซื้อ', en: 'Purchase Orders', icon: <IconCart /> },
      { to: '/goods-payments', label: 'ใบทำจ่ายสินค้า/วัสดุ', en: 'Goods / Material Payments', icon: <IconWallet /> },
      { to: '/payroll', label: 'ใบเบิก / ทำจ่ายเงินเดือน', en: 'Advance / Payroll', icon: <IconUsers /> },
    ],
  },
  {
    section: 'ลูกค้า · Customers',
    items: [
      { to: '/customer-master', label: 'ทะเบียนลูกค้า', en: 'Customer Master', icon: <IconUsers /> },
      { to: '/suppliers', label: 'ทะเบียนซัพพลายเออร์', en: 'Supplier', icon: <IconTruck /> },
      { to: '/ledger', label: 'ลูกหนี้ / เจ้าหนี้', en: 'Debtors / Creditors', icon: <IconPie /> },
    ],
  },
  {
    section: 'คลัง & ราคา · Inventory',
    items: [
      { to: '/stock', label: 'คลังวัตถุดิบ', en: 'Raw Material Stock', icon: <IconStock /> },
      { to: '/pricing', label: 'ราคาสินค้า', en: 'Price List', icon: <IconTag /> },
      { to: '/transport-pricing', label: 'ราคาค่าขนส่ง', en: 'Transport Surcharge', icon: <IconTruck /> },
    ],
  },
  {
    section: 'องค์กร · Organization',
    items: [
      { to: '/employees', label: 'รายชื่อพนักงาน', en: 'Employee List', icon: <IconUsers /> },
      { to: '/salary-structure', label: 'ปรับโครงสร้าง', en: 'Salary Structure', icon: <IconTag /> },
    ],
  },
]

/** Flat lookup of route -> {label, en, section} for breadcrumbs. */
export const ROUTE_META: Record<string, { label: string; en: string; section: string }> = {}
for (const g of NAV) {
  for (const it of g.items) {
    ROUTE_META[it.to] = { label: it.label, en: it.en, section: g.section?.split(' · ')[0] ?? 'รายงาน' }
  }
}
