import type { ReactNode } from 'react'
import { IconOrder, IconInvoice, IconReceipt, IconBill, IconBars, IconPie, IconStock, IconTag, IconPlant, IconUsers, IconTruck } from './components/icons'

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
    items: [{ to: '/monthly-report', label: 'รายงานประจำเดือน', en: 'Monthly Report', icon: <IconBars /> }],
  },
  {
    section: 'การขาย · Sales',
    items: [
      { to: '/delivery-tickets', label: 'ใบจ่ายคอนกรีต', en: 'Delivery Tickets', icon: <IconOrder /> },
      { to: '/invoices', label: 'ใบกำกับภาษี', en: 'Tax Invoices', icon: <IconInvoice /> },
      { to: '/billing', label: 'ใบวางบิล', en: 'Billing Notes', icon: <IconBill /> },
      { to: '/receipts', label: 'ใบเสร็จรับเงิน', en: 'Receipts', icon: <IconReceipt /> },
    ],
  },
  {
    section: 'ลูกค้า · Customers',
    items: [
      { to: '/customer-master', label: 'ทะเบียนลูกค้า', en: 'Customer Master', icon: <IconUsers /> },
      { to: '/customers', label: 'สรุปตามลูกค้า', en: 'Customer Summary', icon: <IconPie /> },
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
    section: 'โรงงาน · Operations',
    items: [
      { to: '/plant', label: 'ติดตามโรงงาน', en: 'Plant Monitoring', icon: <IconPlant /> },
      { to: '/fleet', label: 'รถขนส่งปูน', en: 'Truck Fleet', icon: <IconTruck /> },
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
