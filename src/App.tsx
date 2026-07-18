import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { AuditReport } from './pages/AuditReport'
import { ROUTE_RESOURCE, roleAllowsResource, landingRouteFor, useCurrentUser, usePerms } from './data/auth'
import { DeliveryTickets } from './pages/DeliveryTickets'
import { TruckTrips } from './pages/TruckTrips'
import { Commission } from './pages/Commission'
import { SalesOrders } from './pages/SalesOrders'
import { Quotations } from './pages/Quotations'
import { FoundryDeliveries } from './pages/FoundryDeliveries'
import { PurchaseOrders } from './pages/PurchaseOrders'
import { ExpenseRecords } from './pages/ExpenseRecords'
import { FuelReport } from './pages/FuelReport'
import { GoodsPayments } from './pages/GoodsPayments'
import { Payroll } from './pages/Payroll'
import { MidMonthAdvance } from './pages/MidMonthAdvance'
import { InvoicesHub } from './pages/InvoicesHub'
import { BillingNotes } from './pages/BillingNotes'
import { Receipts } from './pages/Receipts'
import { CustomerMaster } from './pages/CustomerMaster'
import { CustomerSummary } from './pages/CustomerSummary'
import { Creditors } from './pages/Creditors'
import { Ledger } from './pages/Ledger'
import { Suppliers } from './pages/Suppliers'
import { CostCenters } from './pages/CostCenters'
import { MonthlyReport } from './pages/MonthlyReport'
import { TaxReports } from './pages/TaxReports'
import { GeneralReports } from './pages/GeneralReports'
import { MyWork } from './pages/MyWork'
import { Stock } from './pages/Stock'
import { MaterialLedger } from './pages/MaterialLedger'
import { FoundryStock } from './pages/FoundryStock'
import { FoundryBoqEstimate } from './pages/FoundryBoqEstimate'
import { StockReconcileHistory } from './pages/StockReconcileHistory'
import { FoundryFormula } from './pages/FoundryFormula'
import { Pricing } from './pages/Pricing'
import { PlantMonitoring } from './pages/PlantMonitoring'
import { PlantOperation } from './pages/PlantOperation'
import { TruckFleet } from './pages/TruckFleet'
import { Employees } from './pages/Employees'
import { Assets } from './pages/Assets'
import { LeaveRecords } from './pages/LeaveRecords'
import { Attendance } from './pages/Attendance'
import { SalaryStructure } from './pages/SalaryStructure'

/** Gate a route element on the current role's View permission. Falls back to the
    monthly report when the role lacks access to the requested resource. */
function Guard({ children }: { children: ReactElement }) {
  const user = useCurrentUser()
  const perms = usePerms()
  const loc = useLocation()
  const key = ROUTE_RESOURCE[loc.pathname]
  if (key && user) {
    const lvl = perms[user.role]?.[key] ?? 'none'
    /* Perm-matrix level OR a hard role allowlist for sensitive pages. */
    if (lvl === 'none' || !roleAllowsResource(user.role, key)) return <NoAccess />
  }
  return children
}

function NoAccess() {
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
      <h2 style={{ margin: 0, fontSize: 18, color: 'var(--kpc-text-strong)' }}>ไม่มีสิทธิ์เข้าถึง</h2>
      <p style={{ color: 'var(--kpc-text-muted)', fontSize: 14, marginTop: 8 }}>
        บัญชีของคุณไม่ได้รับสิทธิ์ในการเข้าถึงหน้านี้ — กรุณาติดต่อผู้ดูแลระบบ
      </p>
    </div>
  )
}

export default function App() {
  const user = useCurrentUser()
  const perms = usePerms()
  if (!user) return <Login />
  /* Redirect roots/unknowns to the first page this role may actually open. */
  const landing = landingRouteFor(user.role, perms)

  return (
    <Layout>
      <Guard>
      <Routes>
        <Route path="/" element={<Navigate to={landing} replace />} />
        {/* Legacy /overview links now land on the monthly report. */}
        <Route path="/overview" element={<Navigate to={landing} replace />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/sales-orders" element={<SalesOrders />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/expense-records" element={<ExpenseRecords />} />
        <Route path="/fuel-report" element={<FuelReport />} />
        <Route path="/goods-payments" element={<GoodsPayments />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/advances" element={<Payroll />} />
        <Route path="/mid-month-advance" element={<MidMonthAdvance />} />
        <Route path="/delivery-tickets" element={<DeliveryTickets />} />
        <Route path="/foundry-deliveries" element={<FoundryDeliveries />} />
        <Route path="/truck-trips" element={<TruckTrips />} />
        <Route path="/commission" element={<Commission />} />
        <Route path="/invoices" element={<InvoicesHub />} />
        <Route path="/billing" element={<BillingNotes />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/customer-master" element={<CustomerMaster />} />
        <Route path="/ledger" element={<Ledger />} />
        {/* Legacy direct routes still work; the menu now uses the combined /ledger. */}
        <Route path="/customers" element={<CustomerSummary />} />
        <Route path="/creditors" element={<Creditors />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/cost-centers" element={<CostCenters />} />
        <Route path="/monthly-report" element={<MonthlyReport />} />
        <Route path="/tax-reports" element={<TaxReports />} />
        <Route path="/general-reports" element={<GeneralReports />} />
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/audit-report" element={<AuditReport />} />
        {/* Legacy yearly-report path → unified monthly/yearly page. */}
        <Route path="/yearly-report" element={<Navigate to={landing} replace />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/material-ledger" element={<MaterialLedger />} />
        <Route path="/foundry-materials" element={<Stock scope="foundry" />} />
        <Route path="/foundry-stock" element={<FoundryStock />} />
        <Route path="/foundry-boq" element={<FoundryBoqEstimate />} />
        <Route path="/stock-reconcile" element={<StockReconcileHistory />} />
        <Route path="/foundry-stock-reconcile" element={<StockReconcileHistory scope="foundry" />} />
        <Route path="/foundry-materials-reconcile" element={<StockReconcileHistory scope="foundry-material" />} />
        <Route path="/pricing" element={<Pricing />} />
        {/* ราคาค่าขนส่ง now lives inside /pricing; this route is the รถขนส่งปูน fleet page. */}
        {/* Mix Design merged into ราคาสินค้า — keep the path as a redirect for old links. */}
        <Route path="/mix-design" element={<Navigate to="/pricing" replace />} />
        <Route path="/foundry-formula" element={<FoundryFormula />} />
        <Route path="/transport-pricing" element={<TruckFleet />} />
        <Route path="/plant" element={<PlantMonitoring />} />
        <Route path="/plant-operation" element={<PlantOperation />} />
        <Route path="/fleet" element={<TruckFleet />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/leave-records" element={<LeaveRecords />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/salary-structure" element={<SalaryStructure />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to={landing} replace />} />
      </Routes>
      </Guard>
    </Layout>
  )
}
