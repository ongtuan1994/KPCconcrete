import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Field, Input, Select, SavedBy } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import {
  EMPLOYEES,
  DEPARTMENT_LABEL,
  THAI_BANKS,
  yearsOfService,
  type Employee,
  type Department,
} from '../data/employees'
import { useCreatedDocs, addEmployee, updateEmployee, type EmployeeEdit } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const DEPARTMENT_TONE: Record<Department, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  manager: 'info',
  accounting: 'success',
  production: 'warning',
  labor: 'danger',
  transport: 'neutral',
}

/* Order departments deterministically for both the filter pills and the table
   sort (managers first, then back-office, then ops/labor). */
const DEPARTMENT_ORDER: Department[] = ['manager', 'accounting', 'production', 'labor', 'transport']

function mergeEmployee(e: Employee, edits: Record<string, EmployeeEdit>): Employee {
  const edit = edits[e.id]
  if (!edit) return e
  return { ...e, ...edit }
}

/** Allocate the next E-prefixed sequential id, scanning both seed + added rows
    so re-runs don't clash. Defaults to E001 when the roster is empty. */
function nextEmployeeId(existing: Employee[]): string {
  let max = 0
  for (const e of existing) {
    const n = parseInt(e.id.replace(/^E/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `E${String(max + 1).padStart(3, '0')}`
}

export function Employees() {
  const [filter, setFilter] = useState<'all' | Department>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Employee | null>(null)
  const [showForm, setShowForm] = useState(false)
  const created = useCreatedDocs()

  const list = useMemo(
    () => [...created.employeesAdded, ...EMPLOYEES].map((e) => mergeEmployee(e, created.employeeEdits)),
    [created.employeeEdits, created.employeesAdded],
  )

  const rows = useMemo(() => {
    const base = list.filter((e) => {
      if (filter !== 'all' && e.department !== filter) return false
      if (query) {
        const q = query.toLowerCase()
        const hay = `${e.id} ${e.name} ${e.nickname ?? ''} ${e.role} ${e.phone ?? ''} ${e.bankName ?? ''} ${e.bankAccount ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return [...base].sort((a, b) => {
      const da = DEPARTMENT_ORDER.indexOf(a.department)
      const db = DEPARTMENT_ORDER.indexOf(b.department)
      return da - db || a.id.localeCompare(b.id)
    })
  }, [list, filter, query])

  const cnt = (d: Department) => list.filter((e) => e.department === d).length
  const total = list.length
  const hasStart = list.filter((e) => !!e.startDate).length
  const hasPhone = list.filter((e) => !!e.phone).length

  const exportExcel = () => {
    const head = ['รหัส', 'ชื่อ-สกุล', 'ชื่อเล่น', 'ตำแหน่ง', 'ฝ่าย', 'เบอร์ติดต่อ', 'ธนาคาร', 'เลขที่บัญชี', 'วันเริ่มงาน', 'อายุงาน']
    const body = rows.map((e) => [
      e.id, e.name, e.nickname ?? '', e.role, DEPARTMENT_LABEL[e.department].th,
      e.phone ?? '', e.bankName ?? '', e.bankAccount ?? '', e.startDate ?? '', yearsOfService(e.startDate) ?? '',
    ])
    downloadCsv('employees', [head, ...body])
  }

  const columns: Column<Employee>[] = [
    { key: 'id', header: 'รหัส', cell: (r) => <span className="mono">{r.id}</span>, className: 'docno' },
    {
      key: 'name',
      header: 'ชื่อ-สกุล',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="th" style={{ color: 'var(--kpc-text-strong)', fontWeight: 600 }}>{r.name}</span>
          {r.nickname && <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>({r.nickname})</span>}
        </div>
      ),
    },
    { key: 'role', header: 'ตำแหน่ง', cell: (r) => r.role },
    {
      key: 'dept',
      header: 'ฝ่าย',
      align: 'center',
      cell: (r) => <Badge tone={DEPARTMENT_TONE[r.department]} pip={false} square>{DEPARTMENT_LABEL[r.department].th}</Badge>,
    },
    {
      key: 'phone',
      header: 'เบอร์ติดต่อ',
      cell: (r) => r.phone
        ? <span className="mono">{r.phone}</span>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
    },
    {
      key: 'bank',
      header: 'บัญชีธนาคาร',
      cell: (r) => (r.bankName || r.bankAccount)
        ? (
          <div className="stack" style={{ gap: 2 }}>
            {r.bankName && <span style={{ fontSize: 13 }}>{r.bankName}</span>}
            {r.bankAccount && <span className="mono" style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{r.bankAccount}</span>}
          </div>
        )
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
    },
    {
      key: 'start',
      header: 'วันเริ่มงาน',
      cell: (r) => r.startDate
        ? <span className="mono">{r.startDate}</span>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
      className: 'date',
    },
    {
      key: 'years',
      header: 'อายุงาน',
      align: 'right',
      cell: (r) => {
        const y = yearsOfService(r.startDate)
        return y
          ? <span className="mono" style={{ fontWeight: 600 }}>{y}</span>
          : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
      },
    },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    {
      key: 'act',
      header: '',
      align: 'center',
      cell: (r) => <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>แก้ไข</Button>,
    },
  ]

  return (
    <>
      <PageHeader
        title="รายชื่อพนักงาน"
        sub={`Employee List · ${total} คน`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <IconPlus /> เพิ่มพนักงาน
            </Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="พนักงานทั้งหมด · Total" value={total.toString()} note="คน" />
        <KpiCard label="ฝ่ายผลิต + แรงงาน" value={(cnt('production') + cnt('labor')).toString()} note={`ผลิต ${cnt('production')} · แรงงาน ${cnt('labor')}`} />
        <KpiCard label="ฝ่ายขนส่ง · Transport" value={cnt('transport').toString()} note="คนขับรถโม่" />
        <KpiCard label="ข้อมูลพร้อม · Data" value={`${hasPhone}/${total}`} note={`มีเบอร์ติดต่อ · มีวันเริ่มงาน ${hasStart}/${total}`} invert />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {total}</Pill>
          <Pill active={filter === 'manager'} onClick={() => setFilter('manager')}>ผู้จัดการ {cnt('manager')}</Pill>
          <Pill active={filter === 'accounting'} onClick={() => setFilter('accounting')}>บัญชี {cnt('accounting')}</Pill>
          <Pill active={filter === 'production'} onClick={() => setFilter('production')}>ฝ่ายผลิต {cnt('production')}</Pill>
          <Pill active={filter === 'labor'} onClick={() => setFilter('labor')}>แรงงาน {cnt('labor')}</Pill>
          <Pill active={filter === 'transport'} onClick={() => setFilter('transport')}>ฝ่ายขนส่งรถโม่ {cnt('transport')}</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อ / ชื่อเล่น / ตำแหน่ง / เบอร์" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        pageSize={20}
        totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} คน`}
      />

      <EmployeeEditForm employee={editing} onClose={() => setEditing(null)} />

      <NewEmployeeForm
        open={showForm}
        onClose={() => setShowForm(false)}
        existing={list}
        onSaved={(e) => {
          setShowForm(false)
          setFilter(e.department)
          setQuery(e.name)
        }}
      />
    </>
  )
}

function NewEmployeeForm({
  open,
  onClose,
  existing,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  existing: Employee[]
  onSaved: (e: Employee) => void
}) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState<Department>('production')
  const [phone, setPhone] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [startDate, setStartDate] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setName(''); setNickname(''); setRole(''); setDepartment('production')
    setPhone(''); setBankName(''); setBankAccount(''); setStartDate(''); setErr('')
  }, [open])

  const submit = () => {
    setErr('')
    const trimmedName = name.trim()
    const trimmedRole = role.trim()
    if (!trimmedName) return setErr('กรุณาระบุชื่อ-สกุล')
    if (!trimmedRole) return setErr('กรุณาระบุตำแหน่ง')
    if (existing.some((e) => e.name === trimmedName)) {
      return setErr(`มีพนักงานชื่อ "${trimmedName}" อยู่แล้ว`)
    }
    const employee: Employee = {
      id: nextEmployeeId(existing),
      name: trimmedName,
      nickname: nickname.trim() || undefined,
      role: trimmedRole,
      department,
      phone: phone.trim() || undefined,
      bankName: bankName.trim() || undefined,
      bankAccount: bankAccount.trim() || undefined,
      startDate: startDate.trim() || undefined,
    }
    addEmployee(employee)
    onSaved(employee)
  }

  return (
    <Modal
      open={open}
      title="เพิ่มพนักงานใหม่"
      onClose={onClose}
      maxWidth={560}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="ชื่อ-สกุล" required style={{ gridColumn: '1 / -1' }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น นายสมชาย ใจดี" />
        </Field>
        <Field label="ชื่อเล่น">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="เช่น ชาย" />
        </Field>
        <Field label="ตำแหน่ง" required>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="เช่น พนักงานผลิต" />
        </Field>
        <Field label="ฝ่าย" required>
          <Select value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
            {(Object.keys(DEPARTMENT_LABEL) as Department[]).map((d) => (
              <option key={d} value={d}>{DEPARTMENT_LABEL[d].th}</option>
            ))}
          </Select>
        </Field>
        <Field label="เบอร์ติดต่อ" hint="เช่น 081-234-5678">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
        </Field>
        <Field label="ธนาคาร">
          <Select value={bankName} onChange={(e) => setBankName(e.target.value)}>
            <option value="">— เลือกธนาคาร —</option>
            {THAI_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="เลขที่บัญชี" hint="เช่น 123-4-56789-0">
          <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="—" />
        </Field>
        <Field label="วันเริ่มงาน" style={{ gridColumn: '1 / -1' }}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function EmployeeEditForm({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const [nickname, setNickname] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState<Department>('production')
  const [phone, setPhone] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [startDate, setStartDate] = useState('')

  useEffect(() => {
    if (!employee) return
    setNickname(employee.nickname ?? '')
    setRole(employee.role)
    setDepartment(employee.department)
    setPhone(employee.phone ?? '')
    setBankName(employee.bankName ?? '')
    setBankAccount(employee.bankAccount ?? '')
    setStartDate(employee.startDate ?? '')
  }, [employee])

  if (!employee) return null

  const save = () => {
    updateEmployee(employee.id, {
      nickname: nickname.trim() || undefined,
      role: role.trim() || employee.role,
      department,
      phone: phone.trim() || undefined,
      bankName: bankName.trim() || undefined,
      bankAccount: bankAccount.trim() || undefined,
      startDate: startDate.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal
      open={!!employee}
      title={`แก้ไขข้อมูลพนักงาน · ${employee.id}`}
      onClose={onClose}
      maxWidth={560}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{employee.name}</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>
          ชื่อ-สกุลและรหัสไม่สามารถแก้ไขได้ — ฟิลด์อื่นแก้ไขแล้วบันทึกลง localStorage
        </span>
      </div>

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="ชื่อเล่น">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="เช่น พีช" />
        </Field>
        <Field label="ตำแหน่ง" required>
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="เช่น พนักงานผลิต" />
        </Field>
        <Field label="ฝ่าย" required>
          <Select value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
            {(Object.keys(DEPARTMENT_LABEL) as Department[]).map((d) => (
              <option key={d} value={d}>{DEPARTMENT_LABEL[d].th}</option>
            ))}
          </Select>
        </Field>
        <Field label="เบอร์ติดต่อ" hint="เช่น 081-234-5678">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
        </Field>
        <Field label="ธนาคาร">
          <Select value={bankName} onChange={(e) => setBankName(e.target.value)}>
            <option value="">— เลือกธนาคาร —</option>
            {THAI_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="เลขที่บัญชี" hint="เช่น 123-4-56789-0">
          <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="—" />
        </Field>
        <Field label="วันเริ่มงาน" hint="รูปแบบ YYYY-MM-DD" style={{ gridColumn: '1 / -1' }}>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
