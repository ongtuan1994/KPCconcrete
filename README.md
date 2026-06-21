# KPC Web App · กิจไพศาลคอนกรีต

ระบบบริหารโรงงานคอนกรีต (Concrete Batching Plant Management) — built to the **KPC Design System**.

A React + TypeScript + Vite single-page app implementing the full KPC design system:
brand, color tokens, typography (IBM Plex Sans / Sarabun / IBM Plex Mono), spacing/radius/elevation,
and every component (buttons, forms, badges, KPI cards, charts, gauges, data tables, nav shell).

## Run it

```bash
npm install
npm run dev      # starts Vite at http://localhost:5173 (opens automatically)
```

Production build:

```bash
npm run build
npm run preview
```

## Pages

| Route | หน้า | Description |
|-------|------|-------------|
| `/overview` | ภาพรวม | Dashboard — KPI cards, utilization gauge, production bars, revenue trend, plant monitoring |
| `/sales-orders` | ใบสั่งขาย | Sales orders table with status filters |
| `/invoices` | ใบกำกับภาษีขาย | Sale invoices table + **create-invoice form** (modal) |
| `/receipts` | ใบเสร็จรับเงิน | Receipts with collection KPIs |
| `/monthly-report` | รายงานประจำเดือน | Monthly P&L summary + charts |
| `/customer-summary` | สรุปตามลูกค้า | Per-customer revenue & outstanding |
| `/stock` | คลังสินค้า | Raw-material stock with reorder status |
| `/plant` | ติดตามโรงงาน | Live plant & mixer monitoring |

## Design tokens

All tokens live as CSS variables in [`src/index.css`](src/index.css). The topbar **⚙ settings**
popover lets you change three live theme props that mirror the original design's editor controls:

- **Primary color** (`--kpc-primary`) — KPC Blue `#0E0EE6` by default
- **Corner style** — Soft (8px radius) / Sharp (2px)
- **Density** — Comfortable / Compact (table cell padding)

## Structure

```
src/
  index.css            design tokens + base
  app.css              component styles
  theme/               ThemeContext (primary / corner / density)
  components/          Layout, Sidebar, Topbar, ui, charts, DataTable, Modal, icons
  data/mock.ts         deterministic sample data (Thai, พ.ศ. 2569)
  pages/               the 8 sections
  nav.tsx              navigation + breadcrumb config
```

Generated from the Claude Design handoff `KPC Design System.dc.html`.
