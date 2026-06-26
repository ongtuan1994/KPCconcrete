import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTE_META } from '../nav'
import { IconLogout, IconBell } from './icons'
import { ROLE_LABEL, logout, useCurrentUser, useCanAudit } from '../data/auth'
import { useAuditItems } from '../data/audit'
import { GlobalSearch } from './GlobalSearch'

interface Notice { id: string; title: string; sub: string; route?: string }

export function Topbar() {
  const loc = useLocation()
  const navigate = useNavigate()
  const meta = ROUTE_META[loc.pathname] ?? { label: 'ภาพรวม', en: 'Overview', section: 'ภาพรวม' }
  const [userOpen, setUserOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const user = useCurrentUser()
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()

  /* Build the notification feed from live app state. */
  const auditItems = useAuditItems()
  const canAudit = useCanAudit()
  const notices: Notice[] = []
  const pendingAudit = auditItems.filter((i) => !i.verified).length
  if (canAudit && pendingAudit > 0) {
    notices.push({ id: 'audit', title: `มีรายการรอตรวจสอบ ${pendingAudit} รายการ`, sub: 'รายงาน Audit', route: '/audit-report' })
  }
  /* Accountant receives the audit requests forwarded by the auditor. */
  if (user?.role === 'Accountant') {
    const requested = auditItems.filter((i) => i.requested && !i.verified).length
    if (requested > 0) {
      notices.push({ id: 'audit-request', title: `มีคำขอตรวจสอบจากผู้ตรวจสอบ ${requested} รายการ`, sub: 'โปรดจัดเตรียม/ตรวจสอบเอกสาร' })
    }
  }

  const openNotice = (n: Notice) => { if (n.route) navigate(n.route); setBellOpen(false) }

  return (
    <div className="topbar">
      <div className="crumbs">
        <span className="muted">{meta.section}</span>
        <span className="sep">/</span>
        <span className="current">{meta.label}</span>
      </div>

      <GlobalSearch />

      <div style={{ position: 'relative' }}>
        <button className="bell" aria-label="การแจ้งเตือน" onClick={() => setBellOpen((o) => !o)}>
          <IconBell />
          {notices.length > 0 && <span className="dot" />}
        </button>
        {bellOpen && (
          <div className="theme-pop" onMouseLeave={() => setBellOpen(false)} style={{ minWidth: 260 }}>
            <div className="grp" style={{ gap: 2 }}>
              <span className="t">การแจ้งเตือน · Notifications</span>
            </div>
            {notices.length === 0 ? (
              <div style={{ padding: '10px 4px', fontSize: 13, color: 'var(--kpc-text-muted)', textAlign: 'center' }}>
                ไม่มีการแจ้งเตือน
              </div>
            ) : (
              <div className="grp" style={{ gap: 6 }}>
                {notices.map((n) => (
                  <button key={n.id} className="notice-item" onClick={() => openNotice(n)}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{n.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{n.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button className="avatar" onClick={() => setUserOpen((o) => !o)} aria-label="บัญชีผู้ใช้" style={{ border: 'none', cursor: 'pointer' }}>
          {initials}
        </button>
        {userOpen && (
          <div className="theme-pop" onMouseLeave={() => setUserOpen(false)} style={{ minWidth: 200 }}>
            <div className="grp" style={{ gap: 2 }}>
              <span style={{ fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{user?.username}</span>
              <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>
                {user ? `${user.role} · ${ROLE_LABEL[user.role].th}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      <button className="btn btn-secondary btn-sm" onClick={logout}>
        <IconLogout size={15} />
        Logout
      </button>
    </div>
  )
}
