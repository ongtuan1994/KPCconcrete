import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { AuditReport } from './pages/AuditReport'
import { ROUTE_RESOURCE, useCurrentUser, usePerms } from './data/auth'
import { DeliveryTickets } from './pages/DeliveryTickets'
import { SalesOrders } from './pages/SalesOrders'
import { PurchaseOrders } from './pages/PurchaseOrders'
import { GoodsPayments } from './pages/GoodsPayments'
import { Payroll } from './pages/Payroll'
import { InvoicesHub } from './pages/InvoicesHub'
import { BillingNotes } from './pages/BillingNotes'
import { Receipts } from './pages/Receipts'
import { CustomerMaster } from './pages/CustomerMaster'
import { CustomerSummary } from './pages/CustomerSummary'
import { Creditors } from './pages/Creditors'
import { Ledger } from './pages/Ledger'
import { Suppliers } from './pages/Suppliers'
import { MonthlyReport } from './pages/MonthlyReport'
import { TaxReports } from './pages/TaxReports'
import { Stock } from './pages/Stock'
import { Pricing } from './pages/Pricing'
import { TransportHub } from './pages/TransportHub'
import { PlantMonitoring } from './pages/PlantMonitoring'
import { TruckFleet } from './pages/TruckFleet'
import { Employees } from './pages/Employees'
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
    if (lvl === 'none') return <NoAccess />
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
  if (!user) return <Login />

  return (
    <Layout>
      <Guard>
      <Routes>
        <Route path="/" element={<Navigate to="/monthly-report" replace />} />
        {/* Legacy /overview links now land on the monthly report. */}
        <Route path="/overview" element={<Navigate to="/monthly-report" replace />} />
        <Route path="/sales-orders" element={<SalesOrders />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/goods-payments" element={<GoodsPayments />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/delivery-tickets" element={<DeliveryTickets />} />
        <Route path="/invoices" element={<InvoicesHub />} />
        <Route path="/billing" element={<BillingNotes />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/customer-master" element={<CustomerMaster />} />
        <Route path="/ledger" element={<Ledger />} />
        {/* Legacy direct routes still work; the menu now uses the combined /ledger. */}
        <Route path="/customers" element={<CustomerSummary />} />
        <Route path="/creditors" element={<Creditors />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/monthly-report" element={<MonthlyReport />} />
        <Route path="/tax-reports" element={<TaxReports />} />
        <Route path="/audit-report" element={<AuditReport />} />
        {/* Legacy yearly-report path → unified monthly/yearly page. */}
        <Route path="/yearly-report" element={<Navigate to="/monthly-report" replace />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/transport-pricing" element={<TransportHub />} />
        <Route path="/plant" element={<PlantMonitoring />} />
        <Route path="/fleet" element={<TruckFleet />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/salary-structure" element={<SalaryStructure />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/monthly-report" replace />} />
      </Routes>
      </Guard>
    </Layout>
  )
}
