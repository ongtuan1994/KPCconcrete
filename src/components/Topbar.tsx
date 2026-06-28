import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTE_META } from '../nav'
import { IconLogout, IconBell, IconMenu } from './icons'
import { ROLE_LABEL, logout, useCurrentUser, useCanAudit } from '../data/auth'
import { useAuditItems } from '../data/audit'
import { useCreatedDocs } from '../data/createdDocs'
import { useNotiSeen, markNotiSeen } from '../data/notiSeen'
import { GlobalSearch } from './GlobalSearch'

interface Notice { id: string; title: string; sub: string; route?: string; signature: string }

export function Topbar({ onMenu }: { onMenu?: () => void }) {
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
  const created = useCreatedDocs()
  const seen = useNotiSeen()
  const allNotices: Notice[] = []
  const pendingAudit = auditItems.filter((i) => !i.verified).length
  if (canAudit && pendingAudit > 0) {
    allNotices.push({ id: 'audit', title: `มีรายการรอตรวจสอบ ${pendingAudit} รายการ`, sub: 'รายงาน Audit', route: '/audit-report', signature: `p:${pendingAudit}` })
  }
  /* Board users are alerted when employees are marked สิ้นสภาพ. */
  if (user?.role === 'Board' && created.terminations.length > 0) {
    const latest = created.terminations[0]
    const more = created.terminations.length - 1
    allNotices.push({
      id: 'terminations',
      title: `พนักงานสิ้นสภาพ ${created.terminations.length} ราย`,
      sub: `ล่าสุด: ${latest.empName}${more > 0 ? ` และอีก ${more} ราย` : ''}`,
      route: '/employees',
      signature: `term:${created.terminations.length}:${latest.empId}`,
    })
  }
  /* Accountant receives the audit requests forwarded by the auditor. */
  if (user?.role === 'Accountant') {
    const requested = auditItems.filter((i) => i.requested && !i.verified).length
    if (requested > 0) {
      allNotices.push({ id: 'audit-request', title: `มีคำขอตรวจสอบจากผู้ตรวจสอบ ${requested} รายการ`, sub: 'โปรดจัดเตรียม/ตรวจสอบเอกสาร', route: '/audit-report', signature: `r:${requested}` })
    }
  }
  /* Hide notices the user already dismissed at this same signature. */
  const notices = allNotices.filter((n) => seen[n.id] !== n.signature)

  /* Click → go to the related page (if any) and clear that notification. */
  const openNotice = (n: Notice) => {
    markNotiSeen(n.id, n.signature)
    setBellOpen(false)
    if (n.route) navigate(n.route)
  }

  return (
    <div className="topbar">
      <button className="menu-btn" aria-label="เมนู" onClick={onMenu}>
        <IconMenu />
      </button>

      <div className="crumbs">
        <span className="muted">{meta.section}</span>
        <span className="sep">/</span>
        <span className="current">{meta.label}</span>
      </div>

      <GlobalSearch />

      <div style={{ position: 'relative' }}>
        <button className={['bell', notices.length > 0 ? 'has-noti' : ''].filter(Boolean).join(' ')} aria-label="การแจ้งเตือน" onClick={() => setBellOpen((o) => !o)}>
          <IconBell />
          {notices.length > 0 && <span className="bell-count">{notices.length}</span>}
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
