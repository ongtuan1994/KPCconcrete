import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Field, Input, Select, SearchInput, MonthPeriodSelect } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { IconPlus } from '../components/icons'
import { EMPLOYEES } from '../data/employees'
import { salaryStructureFor } from '../data/salaryStructure'
import { useCreatedDocs, addLeaveRecord, removeLeaveRecord, type LeaveRecord } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const LEAVE_TYPES = ['ลากิจ', 'ลาป่วย', 'ลาพักร้อน', 'ลาอื่นๆ']
const HALF_LABEL: Record<'morning' | 'afternoon', string> = { morning: 'ครึ่งเช้า', afternoon: 'ครึ่งบ่าย' }

const pad = (n: number) => String(n).padStart(2, '0')
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function monthStartIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}
/** Inclusive calendar-day count between two ISO dates. */
function daysInclusive(from: string, to: string): number {
  if (!from || !to) return 0
  const a = new Date(from).getTime(), b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

export function LeaveRecords() {
  const created = useCreatedDocs()
  const employees = useMemo(() => [...created.employeesAdded, ...EMPLOYEES], [created.employeesAdded])
  const records = created.leaveRecords

  const [from, setFrom] = useState(monthStartIso)
  const [to, setTo] = useState(todayIso)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)

  /* Records overlapping the selected range, oldest first. */
  const rows = useMemo(() => {
    return records
      .filter((r) => {
        if (from && r.to < from) return false
        if (to && r.from > to) return false
        if (query) {
          const q = query.toLowerCase()
          if (!`${r.employeeId} ${r.employeeName} ${r.leaveType ?? ''}`.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.employeeId.localeCompare(b.employeeId)))
  }, [records, from, to, query])

  /* Per-employee leave balance (all-time used vs the entitlement from ปรับโครงสร้าง). */
  const summary = useMemo(() => {
    const usedById = new Map<string, number>()
    for (const r of records) usedById.set(r.employeeId, (usedById.get(r.employeeId) ?? 0) + r.days)
    return employees
      .map((e) => {
        const entitled = salaryStructureFor(e.id, created.salaryStructures).leaveDays ?? 0
        const used = usedById.get(e.id) ?? 0
        return { id: e.id, name: e.name, entitled, used, remaining: entitled - used }
      })
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [records, employees, created.salaryStructures])

  const totalDays = rows.reduce((s, r) => s + r.days, 0)

  const exportExcel = () => {
    const head = ['ตั้งแต่', 'ถึง', 'รหัส', 'ชื่อ-สกุล', 'ประเภทลา', 'จำนวนวัน', 'หมายเหตุ']
    const body = rows.map((r) => [fmtDate(r.from), fmtDate(r.to), r.employeeId, r.employeeName, `${r.leaveType ?? ''}${r.half ? ` (${HALF_LABEL[r.half]})` : ''}`, r.days, r.note ?? ''])
    downloadCsv('leave-records', [head, ...body])
  }

  const columns: Column<LeaveRecord>[] = [
    { key: 'from', header: 'ตั้งแต่', cell: (r) => <span className="mono">{fmtDate(r.from)}</span>, className: 'date' },
    { key: 'to', header: 'ถึง', cell: (r) => <span className="mono">{fmtDate(r.to)}</span>, className: 'date' },
    { key: 'id', header: 'รหัส', cell: (r) => <span className="mono">{r.employeeId}</span>, className: 'docno' },
    { key: 'name', header: 'ชื่อ-สกุล', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.employeeName}</span> },
    { key: 'type', header: 'ประเภทลา', cell: (r) => `${r.leaveType || '—'}${r.half ? ` (${HALF_LABEL[r.half]})` : ''}` },
    { key: 'days', header: 'จำนวนวัน', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{r.days}</span> },
    { key: 'note', header: 'หมายเหตุ', cell: (r) => (r.note ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.note}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'del', header: '', align: 'center',
      cell: (r) => <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบบันทึกวันลาของ ${r.employeeName} (${fmtDate(r.from)})?`)) removeLeaveRecord(r.id) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>,
    },
  ]

  return (
    <>
      <PageHeader
        title="บันทึกวันลา"
        sub={`Leave Records · ${records.length} รายการ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> บันทึกวันลา</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รายการลา · Records" value={rows.length.toString()} note="ในช่วงที่เลือก" />
        <KpiCard label="วันลารวม · Days" value={`${totalDays}`} note="วัน (ในช่วงที่เลือก)" invert />
        <KpiCard label="พนักงานที่ลา · Employees" value={new Set(rows.map((r) => r.employeeId)).size.toString()} note="ในช่วงที่เลือก" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <Field label="งวดเดือน" style={{ width: 170 }}>
            <MonthPeriodSelect from={from} onPick={(f, t) => { setFrom(f); setTo(t) }} width={170} />
          </Field>
          <Field label="ตั้งแต่วันที่" style={{ width: 170 }}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึงวันที่" style={{ width: 170 }}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div style={{ width: 260 }}>
          <SearchInput placeholder="ชื่อ / รหัส / ประเภทลา" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีบันทึกวันลา — กด <strong>“บันทึกวันลา”</strong> เพื่อเพิ่มรายการ
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      )}

      {/* ───── สรุปวันลา / ยอดคงเหลือ ต่อพนักงาน ───── */}
      <div style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สรุปวันลา / ยอดคงเหลือ (พนักงานทั้งหมด)</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>สิทธิ์วันลาตั้งค่าที่หน้า “ปรับโครงสร้าง”</span>
        </div>
        <div className="card flush" style={{ overflowX: 'auto' }}>
          <table className="data" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>รหัส</th>
                <th>ชื่อ-สกุล</th>
                <th className="num" style={{ width: 130 }}>สิทธิ์วันลา (วัน)</th>
                <th className="num" style={{ width: 130 }}>ลาไปแล้ว (วัน)</th>
                <th className="num" style={{ width: 130 }}>คงเหลือ (วัน)</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.id}</td>
                  <td className="th">{s.name}</td>
                  <td className="num mono">{s.entitled || '—'}</td>
                  <td className="num mono" style={{ color: s.used > 0 ? 'var(--kpc-primary-ink)' : 'var(--kpc-text-faint)' }}>{s.used || '—'}</td>
                  <td className="num mono" style={{ fontWeight: 600, color: s.remaining < 0 ? 'var(--kpc-danger-ink)' : s.remaining > 0 ? 'var(--kpc-success-ink)' : 'var(--kpc-text-faint)' }}>{s.entitled || s.used ? s.remaining : '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--kpc-neutral-300)', fontWeight: 700 }}>
                <td colSpan={2}>รวมทั้งหมด</td>
                <td className="num mono">{summary.reduce((a, s) => a + s.entitled, 0)}</td>
                <td className="num mono">{summary.reduce((a, s) => a + s.used, 0)}</td>
                <td className="num mono">{summary.reduce((a, s) => a + s.remaining, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <LeaveForm open={showForm} employees={employees} onClose={() => setShowForm(false)} />
    </>
  )
}

/** Add a leave record for one employee. */
function LeaveForm({ open, employees, onClose }: { open: boolean; employees: { id: string; name: string; nickname?: string; role: string }[]; onClose: () => void }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [from, setFrom] = useState(todayIso())
  const [to, setTo] = useState(todayIso())
  const [days, setDays] = useState('1')
  const [half, setHalf] = useState<'morning' | 'afternoon'>('morning')
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setEmployeeId(employees[0]?.id ?? ''); setFrom(todayIso()); setTo(todayIso()); setDays('1'); setHalf('morning'); setLeaveType(LEAVE_TYPES[0]); setNote(''); setErr('')
  }, [open, employees])

  const isHalfDay = Number(days) === 0.5

  /* Auto-fill days from the date range (editable — e.g. ครึ่งวัน). */
  const onDates = (f: string, t: string) => {
    setFrom(f); setTo(t)
    const d = daysInclusive(f, t)
    if (d > 0) setDays(String(d))
  }

  const save = () => {
    setErr('')
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp) return setErr('กรุณาเลือกพนักงาน')
    if (!from || !to) return setErr('กรุณาระบุช่วงวันลา')
    if (to < from) return setErr('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม')
    const d = Number(days) || 0
    if (d <= 0) return setErr('กรุณาระบุจำนวนวันลา (มากกว่า 0)')
    if (d === 0.5 && from !== to) return setErr('ลาครึ่งวัน (0.5) ต้องเป็นวันเดียว — ตั้งวันเริ่มและวันสิ้นสุดให้ตรงกัน')
    addLeaveRecord({
      id: `lv_${Date.now()}`,
      employeeId: emp.id, employeeName: emp.name,
      from, to, days: d, half: d === 0.5 ? half : undefined,
      leaveType, note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <Modal open={open} title="บันทึกวันลา" onClose={onClose} maxWidth={520}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="พนักงาน" required style={{ gridColumn: '1 / -1' }}>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}{e.nickname ? ` (${e.nickname})` : ''}</option>)}
          </Select>
        </Field>
        <Field label="ประเภทลา" required>
          <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="จำนวนวัน" required hint="เติมอัตโนมัติจากช่วงวัน (แก้ได้ เช่น 0.5)">
          <Input type="number" step="0.5" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        {isHalfDay && (
          <Field label="ช่วงครึ่งวัน" required hint="ใช้เช็คต่อในบันทึกลงเวลางาน" style={{ gridColumn: '1 / -1' }}>
            <Select value={half} onChange={(e) => setHalf(e.target.value as 'morning' | 'afternoon')}>
              <option value="morning">ครึ่งเช้า (ลาเช้า · ทำงานบ่าย)</option>
              <option value="afternoon">ครึ่งบ่าย (ลาบ่าย · ทำงานเช้า)</option>
            </Select>
          </Field>
        )}
        <Field label="ตั้งแต่วันที่" required>
          <Input type="date" value={from} onChange={(e) => onDates(e.target.value, to)} />
        </Field>
        <Field label="ถึงวันที่" required>
          <Input type="date" value={to} onChange={(e) => onDates(from, e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เหตุผล / รายละเอียด" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
