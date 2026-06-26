import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Layout({ children }: { children: ReactNode }) {
  /* Mobile slide-in drawer state (ignored on desktop where the sidebar is static). */
  const [navOpen, setNavOpen] = useState(false)
  return (
    <div className="app-shell">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="main-col">
        <Topbar onMenu={() => setNavOpen((o) => !o)} />
        <div className="page">{children}</div>
      </div>
    </div>
  )
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="row wrap" style={{ gap: 10 }}>{actions}</div>}
    </div>
  )
}
