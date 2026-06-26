import { NavLink } from 'react-router-dom'
import { NAV } from '../nav'
import { Logo } from './icons'
import { ROUTE_RESOURCE, useCurrentUser, usePerms } from '../data/auth'

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const user = useCurrentUser()
  const perms = usePerms()

  /** A nav item is visible when it maps to no gated resource, or the current
      role has at least View on that resource. */
  const canSee = (to: string) => {
    const key = ROUTE_RESOURCE[to]
    if (!key || !user) return !key ? true : false
    const lvl = perms[user.role]?.[key] ?? 'none'
    return lvl === 'view' || lvl === 'edit'
  }

  return (
    <>
    <div className={['sidebar-backdrop', open ? 'show' : ''].filter(Boolean).join(' ')} onClick={onClose} />
    <aside className={['sidebar', open ? 'open' : ''].filter(Boolean).join(' ')}>
      <div className="sidebar-brand">
        <Logo size={30} mono />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span className="name">KPC</span>
          <span className="sub">กิจไพศาลคอนกรีต</span>
        </div>
      </div>

      {NAV.map((group, gi) => {
        const items = group.items.filter((it) => canSee(it.to))
        if (items.length === 0) return null
        return (
          <div key={gi} style={{ display: 'contents' }}>
            {group.section && <div className="nav-section">{group.section}</div>}
            {items.map((it) => (
              <NavLink key={it.to} to={it.to} onClick={onClose} className={({ isActive }) => ['nav-item', isActive ? 'active' : ''].filter(Boolean).join(' ')}>
                {it.icon}
                {it.label}
              </NavLink>
            ))}
          </div>
        )
      })}
    </aside>
    </>
  )
}
