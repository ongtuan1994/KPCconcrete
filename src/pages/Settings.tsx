import { Fragment, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Card, CardHead, Button, Badge, Field, Input, Select } from '../components/ui'
import { Modal } from '../components/Modal'
import { Pill } from '../components/ui'
import { IconCheck, IconPlus } from '../components/icons'
import { downloadCsv } from '../utils/csv'
import { downloadBackup } from '../utils/backup'
import {
  ROLES, ROLE_LABEL, RESOURCES, type Role, type Level, type User, type ActivityEntry,
  useUsers, usePerms, useCan, useActivity, setPerm, updateUser, addUser, removeUser, resetPerms, clearActivity,
} from '../data/auth'

const ROLE_TONE: Record<Role, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  Admin: 'info',
  Board: 'success',
  Auditor: 'neutral',
  Manager: 'warning',
  Accountant: 'danger',
}

export function Settings() {
  const users = useUsers()
  const perms = usePerms()
  const { edit: canEdit } = useCan('settings')
  const [showPw, setShowPw] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState<'users' | 'activity'>('users')
  const [backingUp, setBackingUp] = useState(false)

  const handleBackup = async () => {
    setBackingUp(true)
    try {
      const { filename } = await downloadBackup()
      alert(`สำรองข้อมูลเรียบร้อย\nไฟล์: ${filename}`)
    } catch {
      alert('สำรองข้อมูลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBackingUp(false)
    }
  }

  /* Group resources by section header for the matrix body. */
  const groups = useMemo(() => {
    const out: { section: string; items: typeof RESOURCES }[] = []
    for (const r of RESOURCES) {
      const g = out[out.length - 1]
      if (g && g.section === r.section) g.items.push(r)
      else out.push({ section: r.section, items: [r] })
    }
    return out
  }, [])

  /* Toggle logic: clicking View turns view on/off (off also clears edit);
     clicking Edit turns edit on/off (on also implies view). */
  const toggle = (role: Role, key: string, col: 'view' | 'edit') => {
    if (!canEdit) return
    const cur: Level = perms[role]?.[key] ?? 'none'
    let next: Level
    if (col === 'view') next = cur === 'none' ? 'view' : 'none'
    else next = cur === 'edit' ? 'view' : 'edit'
    setPerm(role, key, next)
  }

  return (
    <>
      <PageHeader
        title="ตั้งค่าระบบ"
        sub="System Settings · ผู้ใช้งานและสิทธิ์การเข้าถึง"
        actions={
          <>
            {tab === 'users' && canEdit && <Button variant="secondary" onClick={() => { if (confirm('คืนค่าสิทธิ์ทั้งหมดเป็นค่าเริ่มต้น?')) resetPerms() }}>คืนค่าสิทธิ์เริ่มต้น</Button>}
            <Button variant="primary" onClick={handleBackup} disabled={backingUp}>{backingUp ? 'กำลังสำรอง…' : 'Backup ข้อมูล (.zip)'}</Button>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={tab === 'users'} onClick={() => setTab('users')}>ผู้ใช้และสิทธิ์ · Users &amp; Permissions</Pill>
        <Pill active={tab === 'activity'} onClick={() => setTab('activity')}>การใช้งานระบบ · Active Monitoring</Pill>
      </div>

      {tab === 'activity' && <ActivityPanel canEdit={canEdit} />}

      {tab === 'users' && (
      <>
      {/* ───── Users ───── */}
      <div style={{ marginBottom: 24 }}>
      <Card flush className="settings-card">
        <CardHead
          title="ผู้ใช้งานระบบ · Users"
          meta={`${users.length} บัญชี`}
          right={
            <div className="row" style={{ gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => setShowPw((s) => !s)}>{showPw ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}</Button>
              {canEdit && <Button variant="primary" size="sm" onClick={() => setAdding(true)}><IconPlus /> เพิ่มผู้ใช้</Button>}
            </div>
          }
        />
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 56 }}>No.</th>
              <th>Role · สิทธิ์</th>
              <th>Username</th>
              <th>Password</th>
              {canEdit && <th style={{ width: 130 }} />}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.no}>
                <td className="mono">{u.no}</td>
                <td>
                  <Badge tone={ROLE_TONE[u.role]} pip={false} square>{u.role}</Badge>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--kpc-text-muted)' }}>{ROLE_LABEL[u.role].th}</span>
                </td>
                <td className="mono" style={{ fontWeight: 600 }}>{u.username}</td>
                <td className="mono">{showPw ? u.password : '••••••'}</td>
                {canEdit && (
                  <td align="center">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>แก้ไข</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { if (confirm(`ลบผู้ใช้ "${u.username}"?`)) removeUser(u.no) }}
                      style={{ color: 'var(--kpc-danger)' }}
                    >
                      ลบ
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      </div>

      {/* ───── Permission matrix ───── */}
      <Card flush className="settings-card">
        <CardHead
          title="สิทธิ์การเข้าถึงตามบทบาท · Role Permissions"
          meta="View / Edit"
          right={!canEdit && <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>อ่านอย่างเดียว (สิทธิ์จำกัด)</span>}
        />
        <div className="matrix-scroll" style={{ overflowX: 'auto' }}>
          <table className="perm-matrix">
            <thead>
              <tr>
                <th className="fn" rowSpan={2}>ฟังก์ชัน · Function</th>
                {ROLES.map((r) => (
                  <th key={r} colSpan={2} className="role-head">{r}</th>
                ))}
              </tr>
              <tr>
                {ROLES.map((r) => (
                  <th key={r} className="sub" colSpan={2}>
                    <span className="vw">View</span>
                    <span className="ed">Edit</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.section}>
                  <tr className="sec-row">
                    <td colSpan={1 + ROLES.length * 2}>{g.section}</td>
                  </tr>
                  {g.items.map((res) => (
                    <tr key={res.key}>
                      <td className="fn">{res.label}</td>
                      {ROLES.map((role) => {
                        const lvl: Level = perms[role]?.[res.key] ?? 'none'
                        const view = lvl === 'view' || lvl === 'edit'
                        const ed = lvl === 'edit'
                        return (
                          <Fragment key={role}>
                            <td className="cell">
                              <PermBox on={view} disabled={!canEdit} onClick={() => toggle(role, res.key, 'view')} />
                            </td>
                            <td className="cell">
                              <PermBox on={ed} tone="edit" disabled={!canEdit} onClick={() => toggle(role, res.key, 'edit')} />
                            </td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--kpc-text-muted)', borderTop: '1px solid var(--kpc-border)' }}>
          คลิกช่อง View หรือ Edit เพื่อปรับสิทธิ์ · การเลือก Edit จะรวมสิทธิ์ View โดยอัตโนมัติ
        </div>
      </Card>
      </>
      )}

      <UserFormModal
        open={!!editing || adding}
        user={editing}
        onClose={() => { setEditing(null); setAdding(false) }}
      />
    </>
  )
}

/* ───────── Active Monitoring ───────── */

const pad = (n: number) => String(n).padStart(2, '0')

/** Format an ISO timestamp as Thai Buddhist date + time (dd/mm/พ.ศ. HH:MM:SS). */
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Milliseconds → human-readable Thai duration. */
function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h} ชม. ${m} นาที`
  if (m > 0) return `${m} นาที ${pad(sec)} วิ`
  return `${sec} วิ`
}

/** Duration of a session in ms, measured to `now` while still open. */
function durationMs(e: ActivityEntry, now: number): number {
  const start = new Date(e.loginAt).getTime()
  const end = e.logoutAt ? new Date(e.logoutAt).getTime() : now
  return end - start
}

function ActivityPanel({ canEdit }: { canEdit: boolean }) {
  const activity = useActivity()
  const [now, setNow] = useState(() => Date.now())

  /* Tick every 15s so open-session durations stay current. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])

  const active = activity.filter((e) => e.logoutAt === null).length
  const totalMs = activity.reduce((s, e) => s + durationMs(e, now), 0)

  const exportExcel = () => {
    const head = ['ลำดับ', 'ผู้ใช้', 'บทบาท', 'เข้าสู่ระบบ', 'ออกจากระบบ', 'ระยะเวลา', 'ระยะเวลา (นาที)', 'สถานะ']
    const body = activity.map((e, i) => {
      const ms = durationMs(e, now)
      return [
        i + 1,
        e.username,
        e.role,
        fmtDateTime(e.loginAt),
        e.logoutAt ? fmtDateTime(e.logoutAt) : '',
        fmtDuration(ms),
        (ms / 60000).toFixed(1),
        e.logoutAt ? 'ออกจากระบบแล้ว' : 'กำลังใช้งาน',
      ]
    })
    downloadCsv('active-monitoring', [head, ...body])
  }

  return (
    <Card flush className="settings-card">
      <CardHead
        title="การใช้งานระบบ · Active Monitoring"
        meta={`${activity.length} ครั้ง · กำลังใช้งาน ${active} · รวม ${fmtDuration(totalMs)}`}
        right={
          <div className="row" style={{ gap: 8 }}>
            {canEdit && activity.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { if (confirm('ล้างประวัติการเข้าใช้งานทั้งหมด?')) clearActivity() }} style={{ color: 'var(--kpc-danger)' }}>
                ล้างประวัติ
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={exportExcel} disabled={activity.length === 0}>ส่งออก Excel</Button>
          </div>
        }
      />
      {activity.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--kpc-text-muted)', fontSize: 14 }}>
          ยังไม่มีประวัติการเข้าใช้งาน — ข้อมูลจะถูกบันทึกเมื่อมีการเข้าสู่ระบบครั้งถัดไป
        </div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 56 }}>ลำดับ</th>
              <th>ผู้ใช้</th>
              <th>บทบาท</th>
              <th>เข้าสู่ระบบ</th>
              <th>ออกจากระบบ</th>
              <th align="right">ระยะเวลา</th>
              <th align="center">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((e, i) => (
              <tr key={e.id}>
                <td className="mono">{i + 1}</td>
                <td className="mono" style={{ fontWeight: 600 }}>{e.username}</td>
                <td><Badge tone={ROLE_TONE[e.role]} pip={false} square>{e.role}</Badge></td>
                <td className="mono" style={{ fontSize: 13 }}>{fmtDateTime(e.loginAt)}</td>
                <td className="mono" style={{ fontSize: 13, color: e.logoutAt ? undefined : 'var(--kpc-text-faint)' }}>
                  {e.logoutAt ? fmtDateTime(e.logoutAt) : '—'}
                </td>
                <td align="right" className="mono">{fmtDuration(durationMs(e, now))}</td>
                <td align="center">
                  {e.logoutAt
                    ? <Badge tone="neutral" pip={false} square>ออกแล้ว</Badge>
                    : <Badge tone="success" square>กำลังใช้งาน</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

/** One matrix checkbox. Green when an allowed View, amber when an allowed Edit. */
function PermBox({ on, tone = 'view', disabled, onClick }: { on: boolean; tone?: 'view' | 'edit'; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={['perm-box', on ? 'on' : '', on ? tone : '', disabled ? 'ro' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
    >
      {on && <IconCheck size={12} />}
    </button>
  )
}

/** Add (user=null) or edit (user set) a user account. */
function UserFormModal({ open, user, onClose }: { open: boolean; user: User | null; onClose: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('Manager')
  const [err, setErr] = useState('')
  const allUsers = useUsers()

  /* Seed fields each time the modal opens — from the user when editing, blank when adding. */
  useEffect(() => {
    if (!open) return
    setUsername(user?.username ?? '')
    setPassword(user?.password ?? '')
    setRole(user?.role ?? 'Manager')
    setErr('')
  }, [open, user])

  if (!open) return null

  const save = () => {
    setErr('')
    const un = username.trim()
    if (!un) return setErr('กรุณาระบุชื่อผู้ใช้')
    if (!password) return setErr('กรุณาระบุรหัสผ่าน')
    if (allUsers.some((u) => u.no !== user?.no && u.username.toLowerCase() === un.toLowerCase())) {
      return setErr(`มีชื่อผู้ใช้ "${un}" อยู่แล้ว`)
    }
    if (user) updateUser(user.no, { username: un, password, role })
    else addUser({ username: un, password, role })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={user ? `แก้ไขผู้ใช้ · No. ${user.no}` : 'เพิ่มผู้ใช้ใหม่'}
      onClose={onClose}
      maxWidth={460}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="บทบาท · Role" style={{ gridColumn: '1 / -1' }}>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{r} · {ROLE_LABEL[r].th}</option>)}
          </Select>
        </Field>
        <Field label="ชื่อผู้ใช้ · Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="รหัสผ่าน · Password">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
