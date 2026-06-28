import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NAV, type NavItem, type NavGroup } from '../nav'
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

      {NAV.map((group, gi) => (
        <SidebarGroup key={gi} group={group} onClose={onClose} canSee={canSee} />
      ))}
    </aside>
    </>
  )
}

/** Renders one nav group. When `group.collapsible` is set, its section header
    becomes a toggle that shows/hides the group's items. */
function SidebarGroup({
  group,
  onClose,
  canSee,
}: {
  group: NavGroup
  onClose?: () => void
  canSee: (to: string) => boolean
}) {
  const loc = useLocation()
  const items = group.items.filter((it) => canSee(it.to))
  /* Keep the section open when a route inside it is active. */
  const hasActive = items.some((it) => it.to === loc.pathname || (it.children ?? []).some((c) => c.to === loc.pathname))
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null

  const collapsible = !!group.collapsible && !!group.section
  const showItems = collapsible ? open || hasActive : true

  const renderItem = (it: NavItem) =>
    it.children?.length ? (
      <NavBranch key={it.to} item={it} onClose={onClose} canSee={canSee} />
    ) : (
      <NavLink key={it.to} to={it.to} onClick={onClose} className={({ isActive }) => ['nav-item', isActive ? 'active' : ''].filter(Boolean).join(' ')}>
        {it.icon}
        {it.label}
      </NavLink>
    )

  return (
    <div style={{ display: 'contents' }}>
      {group.section && (collapsible ? (
        <button
          type="button"
          className="nav-section nav-section-toggle"
          aria-expanded={open || hasActive}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{group.section}</span>
          <span style={{ display: 'inline-block', fontSize: 10, transform: (open || hasActive) ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        </button>
      ) : (
        <div className="nav-section">{group.section}</div>
      ))}
      {showItems && items.map(renderItem)}
    </div>
  )
}

/** A parent nav item with a collapsible submenu. The label still navigates to
    the parent page; the chevron toggles the submenu. Auto-opens when the parent
    or any child route is active. */
function NavBranch({
  item,
  onClose,
  canSee,
}: {
  item: NavItem
  onClose?: () => void
  canSee: (to: string) => boolean
}) {
  const loc = useLocation()
  const children = (item.children ?? []).filter((c) => canSee(c.to))
  const childActive = children.some((c) => loc.pathname === c.to)
  const [open, setOpen] = useState(childActive || loc.pathname === item.to)

  return (
    <div style={{ display: 'contents' }}>
      <div className="nav-item-row" style={{ display: 'flex', alignItems: 'stretch' }}>
        <NavLink
          to={item.to}
          onClick={onClose}
          className={({ isActive }) => ['nav-item', isActive ? 'active' : ''].filter(Boolean).join(' ')}
          style={{ flex: 1 }}
        >
          {item.icon}
          {item.label}
        </NavLink>
        <button
          type="button"
          aria-label={open ? 'ยุบเมนูย่อย' : 'ขยายเมนูย่อย'}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            padding: '0 10px',
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
          }}
        >
          <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        </button>
      </div>
      {open &&
        children.map((c) => (
          <NavLink
            key={c.to}
            to={c.to}
            onClick={onClose}
            className={({ isActive }) => ['nav-item', 'nav-subitem', isActive ? 'active' : ''].filter(Boolean).join(' ')}
            style={{ paddingLeft: 38, fontSize: '0.92em' }}
          >
            {c.icon}
            {c.label}
          </NavLink>
        ))}
    </div>
  )
}
