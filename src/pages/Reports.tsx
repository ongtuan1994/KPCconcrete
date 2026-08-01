import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Pill } from '../components/ui'
import { REPORT_TABS } from '../nav'
import { canViewRoute, useCurrentUser, usePerms } from '../data/auth'
import { MonthlyReport } from './MonthlyReport'
import { GeneralReports } from './GeneralReports'
import { TaxReports } from './TaxReports'
import { AuditReport } from './AuditReport'
import { Ledger } from './Ledger'

/** The page behind each tab. Keyed by tab id so the tab order lives in one
    place (nav.tsx) and the routing in another. */
const TAB_PAGE: Record<string, () => JSX.Element> = {
  monthly: MonthlyReport,
  general: GeneralReports,
  tax: TaxReports,
  audit: AuditReport,
  ledger: Ledger,
}

/** Tabs the signed-in role may actually open — the same rule the sidebar uses,
    so a role never sees a tab that would bounce it to ไม่มีสิทธิ์เข้าถึง. */
function useVisibleTabs() {
  const user = useCurrentUser()
  const perms = usePerms()
  return REPORT_TABS.filter((t) => canViewRoute(user, perms, t.to))
}

/** รายงาน hub — one sidebar entry, one tab per report. Each tab keeps its own
    route, so deep links (e.g. navigate('/general-reports') after saving a report)
    and per-report permissions work exactly as before. */
export function Reports() {
  const loc = useLocation()
  const navigate = useNavigate()
  const tabs = useVisibleTabs()
  const active = REPORT_TABS.find((t) => t.to === loc.pathname) ?? REPORT_TABS[0]
  const Page = TAB_PAGE[active.id]

  return (
    <>
      <div className="pills" style={{ marginBottom: 20 }}>
        {tabs.map((t) => (
          <Pill key={t.id} active={t.id === active.id} onClick={() => navigate(t.to)}>{t.label}</Pill>
        ))}
      </div>
      <Page />
    </>
  )
}

/** /reports → the first tab this role may open (รายงานประจำเดือน / ปี for most).
    Falls back to that tab's route when nothing is allowed, so the router guard
    shows the usual ไม่มีสิทธิ์เข้าถึง card instead of a blank hub. */
export function ReportsIndex() {
  const tabs = useVisibleTabs()
  return <Navigate to={(tabs[0] ?? REPORT_TABS[0]).to} replace />
}
