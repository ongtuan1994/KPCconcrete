import type { ReactNode } from 'react'
import { IconOrder, IconCart, IconInvoice, IconReceipt, IconBars, IconPie, IconStock, IconTag, IconUsers, IconTruck, IconWallet, IconSliders, IconSearch, IconClock, IconCalendar, IconPlant } from './components/icons'

export interface NavItem {
  to: string
  label: string // Thai
  en: string
  icon: ReactNode
  /** Optional submenu rendered (indented, collapsible) under this item. */
  children?: NavItem[]
}
export interface NavGroup {
  section?: string // section header (Thai · English)
  /** When true (and `section` is set), the section header toggles its items. */
  collapsible?: boolean
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    items: [
      { to: '/my-work', label: 'งานของฉัน', en: 'My Work', icon: <IconCalendar /> },
      { to: '/plant-operation', label: 'Today Operation', en: 'การดำเนินงานวันนี้', icon: <IconPlant /> },
    ],
  },
  {
    section: 'รายงาน · Reports',
    collapsible: true,
    items: [
      { to: '/monthly-report', label: 'รายงานประจำเดือน / ปี', en: 'Monthly / Yearly Report', icon: <IconBars /> },
      { to: '/tax-reports', label: 'รายงานภาษีซื้อ / ขาย', en: 'Tax Reports (Buy / Sell)', icon: <IconInvoice /> },
      { to: '/general-reports', label: 'รายงานทั่วไป', en: 'General Reports', icon: <IconBars /> },
      { to: '/ledger', label: 'ลูกหนี้ / เจ้าหนี้', en: 'Debtors / Creditors', icon: <IconPie /> },
      { to: '/audit-report', label: 'รายงาน Audit', en: 'Audit Report', icon: <IconSearch /> },
    ],
  },
  {
    section: 'การขาย · Sales',
    items: [
      { to: '/quotations', label: 'ใบเสนอราคา', en: 'Quotations', icon: <IconInvoice /> },
      { to: '/sales-orders', label: 'ใบสั่งขาย', en: 'Sales Orders', icon: <IconCart /> },
      { to: '/delivery-tickets', label: 'ใบจ่ายคอนกรีต', en: 'Delivery Tickets', icon: <IconOrder /> },
      { to: '/foundry-deliveries', label: 'ใบส่งสินค้าโรงหล่อ', en: 'Foundry Delivery Notes', icon: <IconOrder /> },
      {
        to: '/invoices', label: 'ใบกำกับภาษี / วางบิล', en: 'Tax Invoices / Billing', icon: <IconInvoice />,
        children: [
          { to: '/receipts', label: 'ใบเสร็จรับเงิน', en: 'Receipts', icon: <IconReceipt /> },
        ],
      },
    ],
  },
  {
    section: 'การซื้อ / การจ่าย · Purchasing',
    items: [
      { to: '/purchase-orders', label: 'ใบสั่งซื้อ', en: 'Purchase Orders', icon: <IconCart /> },
      { to: '/goods-payments', label: 'ใบสำคัญจ่าย', en: 'Goods / Material Payments', icon: <IconWallet /> },
      {
        to: '/payroll', label: 'เบิกและจ่ายเงินเดือน', en: 'Advance / Payroll', icon: <IconUsers />,
        children: [
          { to: '/leave-records', label: 'บันทึกวันลา', en: 'Leave Records', icon: <IconCalendar /> },
          { to: '/mid-month-advance', label: 'เบิกเงินกลางเดือน', en: 'Mid-Month Advance', icon: <IconWallet /> },
          { to: '/attendance', label: 'บันทึกลงเวลางาน', en: 'Time Attendance', icon: <IconClock /> },
          { to: '/truck-trips', label: 'บันทึกเที่ยวรถโม่', en: 'Mixer Truck Trips', icon: <IconTruck /> },
          { to: '/commission', label: 'บันทึกค่าคอมมิชชั่น', en: 'Sales Commission', icon: <IconWallet /> },
        ],
      },
    ],
  },
  {
    section: 'จัดการคลัง · Inventory',
    items: [
      { to: '/stock', label: 'คลังวัตถุดิบแพล้นปูน', en: 'Plant Raw Material Stock', icon: <IconStock /> },
      { to: '/foundry-materials', label: 'คลังวัตถุดิบโรงหล่อ', en: 'Foundry Raw Material Stock', icon: <IconStock /> },
      { to: '/foundry-stock', label: 'สต๊อกสินค้าโรงหล่อ', en: 'Foundry Product Stock', icon: <IconStock /> },
    ],
  },
  {
    section: 'ฐานข้อมูล · Database',
    collapsible: true,
    items: [
      { to: '/customer-master', label: 'ทะเบียนลูกค้า', en: 'Customer Master', icon: <IconUsers /> },
      { to: '/suppliers', label: 'ทะเบียนซัพพลายเออร์', en: 'Supplier', icon: <IconTruck /> },
      {
        to: '/pricing', label: 'ราคาสินค้า / ค่าขนส่ง', en: 'Price List / Transport', icon: <IconTag />,
        children: [
          { to: '/foundry-formula', label: 'สูตรผลิตโรงหล่อ', en: 'Foundry Formula', icon: <IconTag /> },
          { to: '/transport-pricing', label: 'รถขนส่งปูน', en: 'Truck Fleet', icon: <IconTruck /> },
        ],
      },
      { to: '/employees', label: 'รายชื่อพนักงาน', en: 'Employee List', icon: <IconUsers /> },
    ],
  },
  {
    section: 'ระบบ · System',
    items: [
      { to: '/salary-structure', label: 'ปรับโครงสร้าง', en: 'Salary Structure', icon: <IconTag /> },
      { to: '/settings', label: 'ตั้งค่าระบบ', en: 'Settings', icon: <IconSliders /> },
    ],
  },
]

/** Flat lookup of route -> {label, en, section} for breadcrumbs. */
export const ROUTE_META: Record<string, { label: string; en: string; section: string }> = {}
for (const g of NAV) {
  const section = g.section?.split(' · ')[0] ?? 'รายงาน'
  for (const it of g.items) {
    ROUTE_META[it.to] = { label: it.label, en: it.en, section }
    for (const child of it.children ?? []) {
      ROUTE_META[child.to] = { label: child.label, en: child.en, section }
    }
  }
}
