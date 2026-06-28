import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Field, Input, Checkbox } from '../components/ui'
import { IconPlus } from '../components/icons'
import { Modal } from '../components/Modal'
import {
  useCreatedDocs, addAppointment, removeAppointment, updateAppointment,
  addTodoNote, toggleTodoNote, removeTodoNote, type Appointment,
} from '../data/createdDocs'
import { useCurrentUser, useUsers, ROLE_LABEL } from '../data/auth'
import { holidayName } from '../data/holidays'

const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`
function todayIso(): string {
  const d = new Date()
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate())
}

export function MyWork() {
  const created = useCreatedDocs()
  const user = useCurrentUser()
  const users = useUsers()
  const me = user?.username ?? ''

  const loc = useLocation()
  const focusDate = (loc.state as { focusDate?: string } | null)?.focusDate
  const now = new Date()
  const [cursor, setCursor] = useState(
    focusDate && /^\d{4}-\d{2}-\d{2}$/.test(focusDate)
      ? { y: Number(focusDate.slice(0, 4)), m: Number(focusDate.slice(5, 7)) - 1 }
      : { y: now.getFullYear(), m: now.getMonth() },
  )
  const today = todayIso()

  /* Appointment add/detail modal state. */
  const [addDate, setAddDate] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [invitees, setInvitees] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<Appointment | null>(null)
  /* Owner-edit fields for the detail modal. */
  const [eTitle, setETitle] = useState('')
  const [eDate, setEDate] = useState('')
  const [eTime, setETime] = useState('')
  const [eNote, setENote] = useState('')
  const [todo, setTodo] = useState('')

  const openDetail = (a: Appointment) => {
    setDetail(a); setETitle(a.title); setEDate(a.date); setETime(a.time ?? ''); setENote(a.note ?? '')
  }
  const saveEdit = () => {
    if (!detail || !eTitle.trim() || !eDate) return
    updateAppointment(detail.id, { title: eTitle.trim(), date: eDate, time: eTime || undefined, note: eNote.trim() || undefined })
    setDetail(null)
  }

  /* Appointments visible to me = I own it OR I'm invited. */
  const myAppts = useMemo(
    () => created.appointments.filter((a) => a.owner === me || a.invitees.includes(me)),
    [created.appointments, me],
  )
  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of myAppts) {
      const arr = map.get(a.date) ?? []
      arr.push(a)
      map.set(a.date, arr)
    }
    for (const arr of map.values()) arr.sort((x, y) => (x.time ?? '').localeCompare(y.time ?? ''))
    return map
  }, [myAppts])

  const myTodos = useMemo(
    () => created.todoNotes.filter((t) => t.owner === me),
    [created.todoNotes, me],
  )

  /* Next 5 appointments from today onward (nearest first). */
  const upcoming = useMemo(
    () => myAppts
      .filter((a) => a.date >= today)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
      .slice(0, 5),
    [myAppts, today],
  )

  /* Build the month grid (leading/trailing blanks padded to whole weeks). */
  const cells = useMemo(() => {
    const startWeekday = new Date(cursor.y, cursor.m, 1).getDay()
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const out: (number | null)[] = []
    for (let i = 0; i < startWeekday; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(d)
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [cursor])

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }
  const goToday = () => setCursor({ y: now.getFullYear(), m: now.getMonth() })

  const openAdd = (iso: string) => {
    setAddDate(iso); setTitle(''); setTime(''); setNote(''); setInvitees(new Set())
  }
  const toggleInvitee = (uname: string) => {
    setInvitees((prev) => {
      const next = new Set(prev)
      if (next.has(uname)) next.delete(uname); else next.add(uname)
      return next
    })
  }
  const saveAppt = () => {
    if (!addDate || !title.trim()) return
    addAppointment({
      id: `ap_${Date.now()}`,
      date: addDate,
      time: time || undefined,
      title: title.trim(),
      note: note.trim() || undefined,
      owner: me,
      invitees: [...invitees],
    })
    setAddDate(null)
  }

  const addTodo = () => {
    if (!todo.trim()) return
    addTodoNote(me, todo.trim())
    setTodo('')
  }

  const monthLabel = `${THAI_MONTHS_FULL[cursor.m]} ${cursor.y + 543}`

  return (
    <>
      <PageHeader
        title="งานของฉัน"
        sub="My Work · ปฏิทินนัดหมาย และสิ่งที่ต้องทำ"
        actions={<Button variant="primary" onClick={() => openAdd(todayIso())}><IconPlus /> สร้างนัดหมาย</Button>}
      />

      <div className="mywork-layout">
        {/* ===== Calendar ===== */}
        <div className="card" style={{ padding: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า">◀</Button>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--kpc-text-strong)', minWidth: 150, textAlign: 'center' }}>{monthLabel}</span>
              <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">▶</Button>
              <Button variant="secondary" size="sm" onClick={goToday}>วันนี้</Button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>คลิกช่องวันเพื่อเพิ่มนัดหมาย</span>
          </div>

          <div className="cal-grid cal-head">
            {WEEKDAYS.map((w, i) => <div key={w} className={['cal-wd', i === 0 ? 'sunday' : ''].filter(Boolean).join(' ')}>{w}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (d == null) return <div key={i} className="cal-cell cal-empty" />
              const iso = isoOf(cursor.y, cursor.m, d)
              const appts = byDate.get(iso) ?? []
              const isSunday = i % 7 === 0
              const holiday = holidayName(iso)
              return (
                <div key={i} className={['cal-cell', (isSunday || holiday) ? 'sunday' : '', iso === today ? 'today' : ''].filter(Boolean).join(' ')} onClick={() => openAdd(iso)}>
                  <div className="cal-daynum">{d}</div>
                  {holiday && <div className="cal-holiday" title={holiday}>{holiday}</div>}
                  <div className="cal-appts">
                    {appts.map((a) => (
                      <button
                        key={a.id}
                        className={['cal-appt', a.owner !== me ? 'shared' : ''].filter(Boolean).join(' ')}
                        onClick={(e) => { e.stopPropagation(); openDetail(a) }}
                        title={a.title}
                      >
                        {a.time && <span className="t">{a.time}</span>} {a.title}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ===== Right column: upcoming appointments + to-do notes ===== */}
        <div className="stack" style={{ gap: 16, alignSelf: 'start' }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 4 }}>รายการนัดหมายเร็วๆ นี้</div>
          <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 12 }}>5 นัดที่ใกล้ที่สุด</div>
          {upcoming.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--kpc-text-faint)', textAlign: 'center', padding: '12px 0' }}>ไม่มีนัดหมายที่จะถึง</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {upcoming.map((a) => (
                <button key={a.id} className={['upcoming-item', a.owner !== me ? 'shared' : ''].filter(Boolean).join(' ')} onClick={() => openDetail(a)}>
                  <span className="u-title" style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</span>
                  <span className="u-date" style={{ fontSize: 12 }}>
                    <span>{fmtThaiDate(a.date)}{a.time ? ` · ${a.time} น.` : ''}</span>
                    {a.owner !== me && <span className="u-from">จาก {a.owner}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 4 }}>สิ่งที่ต้องทำ</div>
          <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 12 }}>โน๊ตส่วนตัว — เห็นเฉพาะคุณ</div>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <Input placeholder="เพิ่มสิ่งที่ต้องทำ…" value={todo} onChange={(e) => setTodo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }} />
            </div>
            <Button variant="primary" onClick={addTodo}>เพิ่ม</Button>
          </div>
          {myTodos.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--kpc-text-faint)', textAlign: 'center', padding: '16px 0' }}>ยังไม่มีรายการ</div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {myTodos.map((t) => (
                <div key={t.id} className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <Checkbox checked={t.done} onChange={() => toggleTodoNote(t.id)}>{''}</Checkbox>
                    <span style={{ fontSize: 14, color: t.done ? 'var(--kpc-text-faint)' : 'var(--kpc-text-strong)', textDecoration: t.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{t.text}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeTodoNote(t.id)} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ===== Add appointment modal ===== */}
      <Modal
        open={addDate !== null}
        title="สร้างนัดหมาย"
        onClose={() => setAddDate(null)}
        maxWidth={520}
        footer={<><Button variant="secondary" onClick={() => setAddDate(null)}>ยกเลิก</Button><Button variant="primary" onClick={saveAppt} disabled={!title.trim() || !addDate}>บันทึกนัดหมาย</Button></>}
      >
        <div className="grid g-2" style={{ gap: 12 }}>
          <Field label="เรื่องนัดหมาย" required style={{ gridColumn: '1 / -1' }}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ประชุมทีมผลิต" />
          </Field>
          <Field label="วันที่" required>
            <Input type="date" value={addDate ?? ''} onChange={(e) => setAddDate(e.target.value)} />
          </Field>
          <Field label="เวลา (ถ้ามี)">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="รายละเอียด" style={{ gridColumn: '1 / -1' }}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="โน๊ตเพิ่มเติม" />
          </Field>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>แชร์ให้ผู้ใช้อื่น (นัดจะไปโผล่ปฏิทินของเขาด้วย)</div>
          <div className="stack" style={{ gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {users.filter((u) => u.username !== me).map((u) => (
              <Checkbox key={u.no} checked={invitees.has(u.username)} onChange={() => toggleInvitee(u.username)}>
                <span style={{ fontSize: 14 }}>{u.username} <span style={{ color: 'var(--kpc-text-muted)', fontSize: 12 }}>· {ROLE_LABEL[u.role].th}</span></span>
              </Checkbox>
            ))}
          </div>
        </div>
      </Modal>

      {/* ===== Appointment detail modal ===== */}
      <Modal
        open={detail !== null}
        title={detail && detail.owner === me ? 'แก้ไขนัดหมาย' : (detail?.title ?? '')}
        onClose={() => setDetail(null)}
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetail(null)}>ปิด</Button>
            {detail && detail.owner === me && (
              <>
                <Button variant="secondary" onClick={() => { removeAppointment(detail.id); setDetail(null) }} style={{ background: 'var(--kpc-danger)', borderColor: 'var(--kpc-danger)', color: '#fff' }}>ลบนัดหมาย</Button>
                <Button variant="primary" onClick={saveEdit} disabled={!eTitle.trim() || !eDate}>บันทึก</Button>
              </>
            )}
          </>
        }
      >
        {detail && (detail.owner === me ? (
          <>
            <div className="grid g-2" style={{ gap: 12 }}>
              <Field label="เรื่องนัดหมาย" required style={{ gridColumn: '1 / -1' }}>
                <Input value={eTitle} onChange={(e) => setETitle(e.target.value)} />
              </Field>
              <Field label="วันที่" required>
                <Input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
              </Field>
              <Field label="เวลา (ถ้ามี)">
                <Input type="time" value={eTime} onChange={(e) => setETime(e.target.value)} />
              </Field>
              <Field label="รายละเอียด" style={{ gridColumn: '1 / -1' }}>
                <Input value={eNote} onChange={(e) => setENote(e.target.value)} />
              </Field>
            </div>
            {detail.invitees.length > 0 && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--kpc-text-muted)' }}>แชร์ให้: {detail.invitees.join(', ')}</div>}
          </>
        ) : (
          <div className="stack" style={{ gap: 8, fontSize: 14 }}>
            <div><strong>วันที่:</strong> {fmtThaiDate(detail.date)}{detail.time ? ` · ${detail.time} น.` : ''}</div>
            {detail.note && <div><strong>รายละเอียด:</strong> {detail.note}</div>}
            <div><strong>ผู้สร้าง:</strong> {detail.owner} (แชร์ให้คุณ)</div>
            {detail.invitees.length > 0 && <div><strong>แชร์ให้:</strong> {detail.invitees.join(', ')}</div>}
          </div>
        ))}
      </Modal>
    </>
  )
}

/** "yyyy-mm-dd" → "D MMM 25xx" (Thai). */
function fmtThaiDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${THAI_MONTHS_FULL[m - 1]} ${y + 543}`
}
