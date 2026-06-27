import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { EMPLOYEES, type Employee } from '../data/employees'
import { useCreatedDocs, addGeneralReport, type AttendanceReport } from '../data/createdDocs'
import { salaryStructureFor } from '../data/salaryStructure'
import { useCan } from '../data/auth'
import {
  useAttendance, importScanFiles, upsertManual, removeAttendance, clearAttendance,
  computeAttendance, SHIFT_START_MIN, SHIFT_END_MIN, type AttendanceRecord,
} from '../data/attendance'
import { downloadCsv } from '../utils/csv'

const pad = (n: number) => String(n).padStart(2, '0')
const minToHHMM = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const SHIFT_LABEL = `${minToHHMM(SHIFT_START_MIN)}–${minToHHMM(SHIFT_END_MIN)}`

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** First day of the current month (the month "today" falls in). */
function monthStartIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

export function Attendance() {
  const records = useAttendance()
  const created = useCreatedDocs()
  const canEdit = useCan('attendance').edit
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  /* Default range: ตั้งแต่ = วันที่ 1 ของเดือนนี้, จนถึง = วันนี้. */
  const [from, setFrom] = useState(monthStartIso)
  const [to, setTo] = useState(todayIso)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AttendanceRecord | null>(null)
  const [adding, setAdding] = useState(false)

  const employees = useMemo(() => [...created.employeesAdded, ...EMPLOYEES], [created.employeesAdded])

  const rows = useMemo(() => {
    return records
      .filter((r) => {
        if (from && r.date < from) return false
        if (to && r.date > to) return false
        if (query) {
          const q = query.toLowerCase()
          if (!`${r.empId} ${r.empName}`.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.empId.localeCompare(b.empId)))
  }, [records, from, to, query])

  const totals = useMemo(() => {
    let ot = 0, late = 0
    const emps = new Set<string>()
    for (const r of rows) {
      const c = computeAttendance(r)
      ot += c.otNetMin; late += c.lateMin; emps.add(r.empId)
    }
    return { ot, late, emps: emps.size, days: rows.length }
  }, [rows])

  /* Per-employee rollup for the summary table + report: มา (วัน) / สายรวม /
     OT (นาที). OT shows "-" / 0 for employees ไม่ร่วม OT (ปรับโครงสร้าง). */
  const perEmployee = useMemo(() => {
    const map = new Map<string, { empId: string; empName: string; days: number; lateMin: number; otMin: number; otEligible: boolean }>()
    for (const r of rows) {
      const c = computeAttendance(r)
      let s = map.get(r.empId)
      if (!s) {
        const otEligible = salaryStructureFor(r.empId, created.salaryStructures).otEligible !== false
        s = { empId: r.empId, empName: r.empName, days: 0, lateMin: 0, otMin: 0, otEligible }
        map.set(r.empId, s)
      }
      s.days += 1
      s.lateMin += c.lateMin
      if (s.otEligible) s.otMin += c.otNetMin
    }
    return Array.from(map.values()).sort((a, b) => a.empId.localeCompare(b.empId))
  }, [rows, created.salaryStructures])

  const createReport = () => {
    if (perEmployee.length === 0) { alert('ไม่มีข้อมูลลงเวลาในช่วงที่เลือก — กรุณาเลือกช่วงวันอื่น'); return }
    const fromLabel = fmtDate(from)
    const toLabel = fmtDate(to)
    const employees = perEmployee.map((e) => ({
      empId: e.empId, empName: e.empName, days: e.days, lateMin: e.lateMin,
      otMin: e.otEligible ? e.otMin : 0, otEligible: e.otEligible,
    }))
    const report: AttendanceReport = {
      id: `gr_${Date.now()}`,
      kind: 'attendance',
      title: `บันทึกลงเวลางาน ${fromLabel} ถึง ${toLabel}`,
      fromLabel,
      toLabel,
      employees,
      totals: {
        employees: employees.length,
        days: employees.reduce((s, e) => s + e.days, 0),
        lateMin: employees.reduce((s, e) => s + e.lateMin, 0),
        otMin: employees.reduce((s, e) => s + e.otMin, 0),
      },
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const files = await Promise.all(Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() })))
    const s = importScanFiles(files)
    if (fileRef.current) fileRef.current.value = ''
    alert(
      `นำเข้า ${s.files} ไฟล์ · อ่านรายการสแกน ${s.punches} ครั้ง · บันทึก ${s.records} วันทำงาน` +
      (s.unmatched ? `\nจับคู่พนักงานไม่ได้ ${s.unmatched} รหัส (ใช้รหัสจากเครื่องสแกนแทน)` : '') +
      (s.errors.length ? `\n\nปัญหา:\n${s.errors.join('\n')}` : ''),
    )
  }

  const exportExcel = () => {
    const head = ['วันที่', 'รหัส', 'ชื่อ', 'เวลาเข้า', 'เวลาออก', 'สาย (นาที)', 'OT ก่อนหักสาย (นาที)', 'OT สุทธิ (นาที)', 'แหล่งข้อมูล']
    const body = rows.map((r) => {
      const c = computeAttendance(r)
      return [fmtDate(r.date), r.empId, r.empName, r.clockIn ?? '', r.clockOut ?? '', c.lateMin, c.otRawMin, c.otNetMin, r.source === 'scan' ? 'สแกนนิ้ว' : 'บันทึกเอง']
    })
    downloadCsv('attendance', [head, ...body])
  }

  const columns: Column<AttendanceRecord>[] = [
    { key: 'date', header: 'วันที่', cell: (r) => <span className="mono">{fmtDate(r.date)}</span>, className: 'date' },
    { key: 'id', header: 'รหัส', cell: (r) => <span className="mono">{r.empId}</span>, className: 'docno' },
    { key: 'name', header: 'ชื่อ', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.empName}</span> },
    { key: 'in', header: 'เข้า', align: 'center', cell: (r) => (r.clockIn ? <span className="mono">{r.clockIn}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'out', header: 'ออก', align: 'center', cell: (r) => (r.clockOut ? <span className="mono">{r.clockOut}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'late', header: 'สาย (นาที)', align: 'right',
      cell: (r) => { const c = computeAttendance(r); return c.lateMin > 0 ? <span className="mono" style={{ color: 'var(--kpc-danger-ink)', fontWeight: 600 }}>{c.lateMin}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span> },
    },
    {
      key: 'ot', header: 'OT (นาที)', align: 'right',
      cell: (r) => {
        const c = computeAttendance(r)
        if (c.otNetMin <= 0 && c.otRawMin <= 0) return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
        return (
          <div className="stack" style={{ gap: 1, alignItems: 'flex-end' }}>
            <span className="mono" style={{ fontWeight: 600, color: 'var(--kpc-success-ink)' }}>{c.otNetMin}</span>
            {c.lateMin > 0 && c.otRawMin > 0 && (
              <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>({c.otRawMin}−{c.lateMin} สาย)</span>
            )}
          </div>
        )
      },
    },
    { key: 'src', header: 'แหล่ง', align: 'center', cell: (r) => <Badge tone={r.source === 'scan' ? 'info' : 'neutral'} pip={false} square>{r.source === 'scan' ? 'สแกน' : 'บันทึกเอง'}</Badge> },
    ...(canEdit ? [{
      key: 'act', header: '', align: 'center' as const,
      cell: (r: AttendanceRecord) => (
        <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>แก้ไข</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบรายการ ${r.empName} วันที่ ${fmtDate(r.date)} ?`)) removeAttendance(r.id) }} style={{ color: 'var(--kpc-danger)' }}>✕</Button>
        </div>
      ),
    }] : []),
  ]

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" multiple style={{ display: 'none' }} onChange={(e) => onFiles(e.target.files)} />

      <PageHeader
        title="บันทึกลงเวลางาน"
        sub={`Time Attendance · กะ ${SHIFT_LABEL} · ${records.length} รายการ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
            {canEdit && <Button variant="secondary" onClick={() => setAdding(true)}><IconPlus /> บันทึกเข้า/ออก</Button>}
            {canEdit && <Button variant="primary" onClick={() => fileRef.current?.click()}>นำเข้าไฟล์สแกนนิ้ว (.csv)</Button>}
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="วันทำงาน · Records" value={totals.days.toString()} note="ในช่วงที่เลือก" />
        <KpiCard label="พนักงาน · Employees" value={totals.emps.toString()} note="ที่มีข้อมูล" />
        <KpiCard label="OT รวม · Overtime" value={`${totals.ot}`} note="นาที (สุทธิ)" invert />
        <KpiCard label="มาสายรวม · Late" value={`${totals.late}`} note="นาที" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <Field label="ตั้งแต่วันที่" style={{ width: 170 }}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึงวันที่" style={{ width: 170 }}>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {canEdit && records.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { if (confirm('ล้างข้อมูลลงเวลาทั้งหมด?')) clearAttendance() }} style={{ color: 'var(--kpc-danger)' }}>ล้างข้อมูล</Button>
          )}
        </div>
        <div style={{ width: 260 }}>
          <SearchInput placeholder="ชื่อ / รหัสพนักงาน" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ยังไม่มีข้อมูลลงเวลา</p>
          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
            กด <strong>“นำเข้าไฟล์สแกนนิ้ว (.csv)”</strong> เพื่ออัปโหลดไฟล์จากเครื่องสแกน (เลือกหลายไฟล์พร้อมกันได้)<br />
            ระบบจะจับเวลาแรก = เวลาเข้า, เวลาสุดท้าย = เวลาออก ของแต่ละคนต่อวัน แล้วคำนวณสาย/OT ตามกะ {SHIFT_LABEL}
          </p>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={25} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      )}

      {/* Per-employee summary — มา (วัน) / สายรวม / OT (นาที). OT = "-" สำหรับ
          พนักงานที่ไม่ร่วม OT (ตั้งค่าในปรับโครงสร้าง). */}
      {perEmployee.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สรุปต่อพนักงาน (ในช่วงที่เลือก)</span>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{perEmployee.length} คน · OT แสดง “-” เมื่อไม่ร่วม OT</span>
          </div>
          <div className="card flush" style={{ overflowX: 'auto' }}>
            <table className="data" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>รหัส</th>
                  <th>ชื่อ-สกุล</th>
                  <th className="num" style={{ width: 110 }}>มา (วัน)</th>
                  <th className="num" style={{ width: 130 }}>สายรวม (นาที)</th>
                  <th className="num" style={{ width: 120 }}>OT (นาที)</th>
                </tr>
              </thead>
              <tbody>
                {perEmployee.map((e) => (
                  <tr key={e.empId}>
                    <td className="mono">{e.empId}</td>
                    <td className="th">{e.empName}</td>
                    <td className="num mono" style={{ fontWeight: 600 }}>{e.days}</td>
                    <td className="num mono" style={{ color: e.lateMin > 0 ? 'var(--kpc-danger-ink)' : 'var(--kpc-text-faint)' }}>{e.lateMin || '—'}</td>
                    <td className="num mono" style={{ color: !e.otEligible ? 'var(--kpc-text-faint)' : e.otMin > 0 ? 'var(--kpc-success-ink)' : 'var(--kpc-text-faint)', fontWeight: e.otEligible && e.otMin > 0 ? 600 : 400 }}>
                      {e.otEligible ? (e.otMin || '—') : '-'}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--kpc-neutral-300)', fontWeight: 700 }}>
                  <td colSpan={2}>รวมทั้งหมด</td>
                  <td className="num mono">{perEmployee.reduce((s, e) => s + e.days, 0)}</td>
                  <td className="num mono">{perEmployee.reduce((s, e) => s + e.lateMin, 0)}</td>
                  <td className="num mono">{perEmployee.reduce((s, e) => s + (e.otEligible ? e.otMin : 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ManualForm
        open={!!editing || adding}
        record={editing}
        employees={employees}
        onClose={() => { setEditing(null); setAdding(false) }}
      />
    </>
  )
}

/** Add / edit a single day's clock-in/out for one employee. */
function ManualForm({ open, record, employees, onClose }: { open: boolean; record: AttendanceRecord | null; employees: Employee[]; onClose: () => void }) {
  const [date, setDate] = useState(todayIso())
  const [empId, setEmpId] = useState(employees[0]?.id ?? '')
  const [clockIn, setClockIn] = useState('08:00')
  const [clockOut, setClockOut] = useState('17:00')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    if (record) {
      setDate(record.date); setEmpId(record.empId)
      setClockIn(record.clockIn ?? ''); setClockOut(record.clockOut ?? '')
    } else {
      setDate(todayIso()); setEmpId(employees[0]?.id ?? ''); setClockIn('08:00'); setClockOut('17:00')
    }
    setErr('')
  }, [open, record, employees])

  const save = () => {
    setErr('')
    if (!date) return setErr('กรุณาเลือกวันที่')
    if (!empId) return setErr('กรุณาเลือกพนักงาน')
    if (!clockIn && !clockOut) return setErr('กรุณาระบุเวลาเข้า หรือเวลาออก')
    const emp = employees.find((e) => e.id === empId)
    upsertManual({ date, empId, empName: emp?.name ?? empId, clockIn: clockIn || undefined, clockOut: clockOut || undefined })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={record ? 'แก้ไขเวลาทำงาน' : 'บันทึกเวลาเข้า/ออก'}
      onClose={onClose}
      maxWidth={460}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="วันที่" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!record} />
        </Field>
        <Field label="พนักงาน" required>
          <Select value={empId} onChange={(e) => setEmpId(e.target.value)} disabled={!!record}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
          </Select>
        </Field>
        <Field label="เวลาเข้า">
          <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
        </Field>
        <Field label="เวลาออก">
          <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
        </Field>
      </div>
      <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 10 }}>
        กะมาตรฐาน 08:00–17:00 · อยู่เกิน 17:00 คิดเป็น OT (นาที) · หากเข้าหลัง 08:00 จะนำเวลาสายมาหักออกจาก OT
      </div>
    </Modal>
  )
}
