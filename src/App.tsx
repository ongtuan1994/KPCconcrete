import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DeliveryTickets } from './pages/DeliveryTickets'
import { Invoices } from './pages/Invoices'
import { BillingNotes } from './pages/BillingNotes'
import { Receipts } from './pages/Receipts'
import { CustomerMaster } from './pages/CustomerMaster'
import { CustomerSummary } from './pages/CustomerSummary'
import { MonthlyReport } from './pages/MonthlyReport'
import { Stock } from './pages/Stock'
import { Pricing } from './pages/Pricing'
import { TransportPricing } from './pages/TransportPricing'
import { PlantMonitoring } from './pages/PlantMonitoring'
import { TruckFleet } from './pages/TruckFleet'
import { Employees } from './pages/Employees'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/monthly-report" replace />} />
        {/* Legacy /overview links now land on the monthly report. */}
        <Route path="/overview" element={<Navigate to="/monthly-report" replace />} />
        <Route path="/delivery-tickets" element={<DeliveryTickets />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/billing" element={<BillingNotes />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/customer-master" element={<CustomerMaster />} />
        <Route path="/customers" element={<CustomerSummary />} />
        <Route path="/monthly-report" element={<MonthlyReport />} />
        {/* Legacy yearly-report path → unified monthly/yearly page. */}
        <Route path="/yearly-report" element={<Navigate to="/monthly-report" replace />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/transport-pricing" element={<TransportPricing />} />
        <Route path="/plant" element={<PlantMonitoring />} />
        <Route path="/fleet" element={<TruckFleet />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="*" element={<Navigate to="/monthly-report" replace />} />
      </Routes>
    </Layout>
  )
}
