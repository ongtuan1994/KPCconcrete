import { NavLink } from 'react-router-dom'
import { NAV } from '../nav'
import { Logo } from './icons'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Logo size={30} mono />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span className="name">KPC</span>
          <span className="sub">กิจไพศาลคอนกรีต</span>
        </div>
      </div>

      {NAV.map((group, gi) => (
        <div key={gi} style={{ display: 'contents' }}>
          {group.section && <div className="nav-section">{group.section}</div>}
          {group.items.map((it) => (
            <NavLink key={it.to} to={it.to} className={({ isActive }) => ['nav-item', isActive ? 'active' : ''].filter(Boolean).join(' ')}>
              {it.icon}
              {it.label}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  )
}
