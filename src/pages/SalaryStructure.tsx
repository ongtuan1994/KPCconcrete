import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, SearchInput, Field, Input, Select } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { COMPANY } from '../data/real'
import { EMPLOYEES, DEPARTMENT_LABEL, yearsOfService, type Employee } from '../data/employees'
import { useCreatedDocs, setSalaryStructure, addSalaryStructureAdjustment, removeEmployee, type SalaryStructure, type StructureChange, type SalaryStructureAdjustment } from '../data/createdDocs'
import { useCurrentUser, currentUserName } from '../data/auth'
import { salaryStructureFor, hasSalaryStructure, computeOtRate } from '../data/salaryStructure'
import { downloadCsv } from '../utils/csv'

/** Standard working days per month used to annualize day-rate labour into a
    monthly base figure for the "ฐานเงินเดือนรวม" KPI. */
const LABOR_DAYS_PER_MONTH = 24

interface Row { emp: Employee; s: SalaryStructure; configured: boolean }

export function SalaryStructure() {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Employee | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const created = useCreatedDocs()
  /* รายงานโครงสร้างเงินเดือน — เฉพาะ Admin / Board เท่านั้นที่เห็นและกดได้. */
  const role = useCurrentUser()?.role
  const canReport = role === 'Admin' || role === 'Board'

  const hiddenEmp = useMemo(() => new Set(created.hidden.employees), [created.hidden.employees])
  const employees = useMemo(
    () => [...created.employeesAdded, ...EMPLOYEES].filter((e) => !hiddenEmp.has(e.id)),
    [created.employeesAdded, hiddenEmp],
  )

  const rows = useMemo<Row[]>(
    () =>
      employees
        .map((emp) => ({ emp, s: salaryStructureFor(emp.id, created.salaryStructures), configured: hasSalaryStructure(emp.id, created.salaryStructures) }))
        .filter(({ emp }) => {
          if (!query) return true
          return `${emp.id} ${emp.name} ${emp.nickname ?? ''} ${emp.role}`.toLowerCase().includes(query.toLowerCase())
        })
        /* Always list by รหัส ascending (E001, E002, …) — new employees added
           via employeesAdded are prepended, so sort explicitly. */
        .sort((a, b) => a.emp.id.localeCompare(b.emp.id, undefined, { numeric: true })),
    [employees, created.salaryStructures, query],
  )

  const configuredCount = employees.filter((e) => hasSalaryStructure(e.id, created.salaryStructures)).length
  /* Base payroll: monthly staff use เงินเดือน; day-rate labour counts เงินรายวัน × 24 วัน. */
  const totalBase = employees.reduce((s, e) => {
    const st = salaryStructureFor(e.id, created.salaryStructures)
    const isLabor = e.department === 'labor' || st.dailyWage > 0
    return s + (isLabor ? st.dailyWage * LABOR_DAYS_PER_MONTH : st.baseSalary)
  }, 0)

  const exportExcel = () => {
    const head = ['รหัส', 'ชื่อ-สกุล', 'ฝ่าย', 'เงินรายวัน', 'เงินเดือน', 'ประสบการณ์', 'ปกส.', 'วันลา (วัน/ปี)', 'อัตรา OT (บาท/นาที)', 'รับเงิน OT', 'รับคอมมิชชั่น', 'ค่าเที่ยวรถโม่']
    const body = rows.map(({ emp, s }) => [
      emp.id, emp.name, DEPARTMENT_LABEL[emp.department].th, s.dailyWage, s.baseSalary, s.experiencePay, s.socialSecurity,
      s.leaveDays ?? 0,
      s.otEligible === false ? '-' : computeOtRate(s),
      s.otEligible !== false ? 'ร่วม' : 'ไม่ร่วม', s.commissionEligible !== false ? 'ร่วม' : 'ไม่ร่วม',
      s.truckTripEligible === true ? 'ร่วม' : 'ไม่ร่วม',
    ])
    downloadCsv('salary-structure', [head, ...body])
  }

  const money = (n: number) => (n ? <span className="mono">{baht(n)}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>)

  const EligPill = ({ on }: { on: boolean }) => (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
      background: on ? 'rgba(34,197,94,0.14)' : 'var(--kpc-surface-alt)',
      color: on ? '#15803d' : 'var(--kpc-text-faint)',
      border: `1px solid ${on ? 'rgba(34,197,94,0.35)' : 'var(--kpc-border)'}`,
    }}>{on ? 'ร่วม' : 'ไม่ร่วม'}</span>
  )

  const columns: Column<Row>[] = [
    { key: 'id', header: 'รหัส', cell: (r) => <span className="mono">{r.emp.id}</span>, className: 'docno' },
    {
      key: 'name',
      header: 'ชื่อ-สกุล',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ color: 'var(--kpc-text-strong)', fontWeight: 600 }}>{r.emp.name}{r.emp.nickname ? ` (${r.emp.nickname})` : ''}</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{r.emp.role} · {DEPARTMENT_LABEL[r.emp.department].th}</span>
        </div>
      ),
    },
    { key: 'daily', header: 'เงินรายวัน', align: 'right', cell: (r) => (r.s.dailyWage ? <span className="mono">{baht(r.s.dailyWage)}<span style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}> /วัน</span></span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'base', header: 'เงินเดือน', align: 'right', cell: (r) => money(r.s.baseSalary) },
    { key: 'exp', header: 'ประสบการณ์', align: 'right', cell: (r) => money(r.s.experiencePay) },
    { key: 'sso', header: 'ปกส.', align: 'right', cell: (r) => money(r.s.socialSecurity) },
    { key: 'leave', header: 'วันลา', align: 'right', cell: (r) => (r.s.leaveDays ? <span className="mono">{r.s.leaveDays} <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>วัน</span></span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'ot', header: 'อัตรา OT', align: 'right', cell: (r) => (r.s.otEligible === false
      ? <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
      : <span className="mono">{computeOtRate(r.s)} <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>บาท/นาที</span></span>) },
    { key: 'otElig', header: 'รับเงิน OT', align: 'center', cell: (r) => <EligPill on={r.s.otEligible !== false} /> },
    { key: 'commElig', header: 'รับคอมมิชชั่น', align: 'center', cell: (r) => <EligPill on={r.s.commissionEligible !== false} /> },
    { key: 'truckElig', header: 'ค่าเที่ยวรถโม่', align: 'center', cell: (r) => <EligPill on={r.s.truckTripEligible === true} /> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setEditing(r.emp)}>แก้ไข</Button> },
  ]

  return (
    <>
      <PageHeader
        title="ปรับโครงสร้างเงินเดือน"
        sub={`Salary Structure · ${employees.length} คน`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel}>ส่งออก Excel</Button>
            {canReport && <Button variant="secondary" onClick={() => setShowReport(true)}>สร้างรายงาน</Button>}
            <Button variant="primary" onClick={() => setShowBulk(true)}><IconPlus /> ปรับโครงสร้างเงินเดือน</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="พนักงานทั้งหมด · Employees" value={employees.length.toString()} note="คน" />
        <KpiCard label="ตั้งค่าโครงสร้างแล้ว" value={`${configuredCount}/${employees.length}`} note="ที่เหลือใช้ค่าเริ่มต้น" invert />
        <KpiCard label="ฐานเงินเดือนรวม · Base" value={baht(totalBase)} note="รวมทุกคน · แรงงาน = รายวัน × 24" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="ชื่อ / รหัส / ตำแหน่ง" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} คน`} />

      <div style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ประวัติการปรับโครงสร้าง</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{created.salaryStructureAdjustments.length} ครั้ง</span>
        </div>
        {created.salaryStructureAdjustments.length === 0 ? (
          <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--kpc-text-faint)', fontSize: 13 }}>
            ยังไม่มีประวัติการปรับ — กด “ปรับโครงสร้างเงินเดือน” หรือ “แก้ไข” เพื่อเริ่ม
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {created.salaryStructureAdjustments.map((a, i) => <StructureHistoryCard key={a.at + a.employeeId + i} adj={a} />)}
          </div>
        )}
      </div>

      <StructureEditForm
        employee={editing}
        current={editing ? salaryStructureFor(editing.id, created.salaryStructures) : null}
        onClose={() => setEditing(null)}
      />

      <AdjustForm open={showBulk} employees={employees} onClose={() => setShowBulk(false)} />

      <DocModal open={showReport && canReport} title="รายงานโครงสร้างเงินเดือน" onClose={() => setShowReport(false)} maxWidth={900}>
        <SalaryStructureReportDoc rows={rows} adjustments={created.salaryStructureAdjustments} />
      </DocModal>
    </>
  )
}

function StructureEditForm({ employee, current, onClose }: { employee: Employee | null; current: SalaryStructure | null; onClose: () => void }) {
  const isAdmin = useCurrentUser()?.role === 'Admin'
  const [dailyWage, setDailyWage] = useState('')
  const [baseSalary, setBaseSalary] = useState('')
  const [experiencePay, setExperiencePay] = useState('')
  const [socialSecurity, setSocialSecurity] = useState('')
  const [otEligible, setOtEligible] = useState(true)
  const [commissionEligible, setCommissionEligible] = useState(true)
  const [truckTripEligible, setTruckTripEligible] = useState(false)
  const [leaveDays, setLeaveDays] = useState('')

  useEffect(() => {
    if (!employee || !current) return
    setDailyWage(current.dailyWage ? String(current.dailyWage) : '')
    setBaseSalary(current.baseSalary ? String(current.baseSalary) : '')
    setExperiencePay(current.experiencePay ? String(current.experiencePay) : '')
    setSocialSecurity(current.socialSecurity ? String(current.socialSecurity) : '')
    setOtEligible(current.otEligible !== false)
    setCommissionEligible(current.commissionEligible !== false)
    setTruckTripEligible(current.truckTripEligible === true)
    setLeaveDays(current.leaveDays ? String(current.leaveDays) : '')
  }, [employee, current])

  if (!employee) return null

  /* OT rate is derived live from the wage inputs (เงินรายวัน → ÷480×1.5,
     or เงินเดือน÷30 when no daily wage). */
  const derivedOt = computeOtRate({ dailyWage: Number(dailyWage) || 0, baseSalary: Number(baseSalary) || 0 })

  const save = () => {
    const next: SalaryStructure = {
      dailyWage: Number(dailyWage) || 0,
      baseSalary: Number(baseSalary) || 0,
      experiencePay: Number(experiencePay) || 0,
      socialSecurity: Number(socialSecurity) || 0,
      otRatePerMinute: derivedOt,
      otEligible,
      commissionEligible,
      truckTripEligible,
      leaveDays: Number(leaveDays) || 0,
      lastAdjustedAt: new Date().toISOString(),
    }
    const isLabor = employee.department === 'labor' || next.dailyWage > 0 || (current?.dailyWage ?? 0) > 0
    const changes = current ? diffStructure(current, next, isLabor) : []
    setSalaryStructure(employee.id, next)
    if (changes.length > 0) {
      addSalaryStructureAdjustment({ at: next.lastAdjustedAt!, employeeId: employee.id, employeeName: employee.name, changes })
    }
    onClose()
  }

  const del = () => {
    if (!confirm(`ลบพนักงาน ${employee.name} (${employee.id}) ออกจากรายชื่อถาวร?\n\nการลบนี้ไม่สามารถกู้คืนได้`)) return
    removeEmployee(employee.id)
    onClose()
  }

  return (
    <Modal
      open={!!employee}
      title={`ปรับโครงสร้าง · ${employee.id}`}
      onClose={onClose}
      maxWidth={520}
      footer={<>{isAdmin && <Button variant="ghost" onClick={del} style={{ marginRight: 'auto', color: 'var(--kpc-danger)' }} title="เฉพาะ Admin">ลบพนักงาน</Button>}<Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      <div className="stack" style={{ gap: 4, marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{employee.name}{employee.nickname ? ` (${employee.nickname})` : ''}</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{employee.role} · {DEPARTMENT_LABEL[employee.department].th}</span>
      </div>

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="ค่าเงินเดือน (บาท/เดือน)" hint="พนักงานรายเดือน">
          <Input type="number" step="0.01" min={0} placeholder="เช่น 15000" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
        </Field>
        <Field label="ค่าแรงรายวัน (บาท/วัน)" hint="กรอกเมื่อจ่ายเป็นรายวัน">
          <Input type="number" step="0.01" min={0} placeholder="เช่น 400" value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} />
        </Field>
        <Field label="ค่าประสบการณ์ (บาท)">
          <Input type="number" step="0.01" min={0} placeholder="เช่น 3000" value={experiencePay} onChange={(e) => setExperiencePay(e.target.value)} />
        </Field>
        <Field label="ค่าประกันสังคม ปกส. (บาท)">
          <Input type="number" step="0.01" min={0} placeholder="เช่น 750" value={socialSecurity} onChange={(e) => setSocialSecurity(e.target.value)} />
        </Field>
        <Field label="สิทธิ์วันลา (วัน/ปี)" hint="จำนวนวันลาที่พนักงานได้รับ">
          <Input type="number" step="0.5" min={0} placeholder="เช่น 6" value={leaveDays} onChange={(e) => setLeaveDays(e.target.value)} />
        </Field>
        <Field label="อัตราค่าแรงโอที (บาท/นาที)" hint="คำนวณอัตโนมัติ: เงินรายวัน ÷ 480 × 1.5 (เงินรายวันใช้ค่าที่กรอก หรือ เงินเดือน ÷ 30) · ทศนิยม 2 ตำแหน่งแบบไม่ปัดขึ้น">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>
            {derivedOt.toFixed(2)} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--kpc-text-muted)', marginLeft: 6 }}>บาท/นาที</span>
          </div>
        </Field>
      </div>

      {/* Eligibility toggles — drive the Payroll OT field + the Commission page. */}
      <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)', borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--kpc-text-strong)' }}>การเข้าร่วม</div>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 10 }}>
          <input type="checkbox" checked={otEligible} onChange={(e) => setOtEligible(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
          <span className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>ร่วมเงิน OT {otEligible ? '(ร่วม)' : '(ไม่ร่วม)'}</span>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>คำนวณ OT จากบันทึกลงเวลางาน — ถ้าไม่ร่วม ช่อง OT ในใบจ่ายเงินเดือนจะถูกปิดและเป็น 0</span>
          </span>
        </label>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={commissionEligible} onChange={(e) => setCommissionEligible(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
          <span className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>ร่วมค่าคอมมิชชั่น {commissionEligible ? '(ร่วม)' : '(ไม่ร่วม)'}</span>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ถ้าไม่ร่วม พนักงานคนนี้จะไม่แสดงในหน้าบันทึกค่าคอมมิชชั่น (จับคู่ด้วยชื่อ-สกุล)</span>
          </span>
        </label>
        <label className="row" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginTop: 10 }}>
          <input type="checkbox" checked={truckTripEligible} onChange={(e) => setTruckTripEligible(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16 }} />
          <span className="stack" style={{ gap: 2 }}>
            <span style={{ fontWeight: 600 }}>ร่วมค่าเที่ยวรถโม่ {truckTripEligible ? '(ร่วม)' : '(ไม่ร่วม)'}</span>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ปกติเฉพาะฝ่ายจัดส่งและผู้จัดการที่ร่วม</span>
          </span>
        </label>
      </div>
    </Modal>
  )
}

type AdjMode = 'none' | 'set' | 'pct'
interface FieldAdj { mode: AdjMode; value: string }
const EMPTY_ADJ: FieldAdj = { mode: 'none', value: '' }

/** Build the list of changed fields between two structures (base pay maps to
    เงินรายวัน for day-rate labour, เงินเดือน otherwise). */
function diffStructure(oldS: SalaryStructure, newS: SalaryStructure, isLabor: boolean): StructureChange[] {
  const out: StructureChange[] = []
  const baseLabel = isLabor ? 'เงินรายวัน' : 'เงินเดือน'
  const oldBase = isLabor ? oldS.dailyWage : oldS.baseSalary
  const newBase = isLabor ? newS.dailyWage : newS.baseSalary
  if (oldBase !== newBase) out.push({ label: baseLabel, from: oldBase, to: newBase })
  if (oldS.experiencePay !== newS.experiencePay) out.push({ label: 'ประสบการณ์', from: oldS.experiencePay, to: newS.experiencePay })
  if (oldS.socialSecurity !== newS.socialSecurity) out.push({ label: 'ปกส.', from: oldS.socialSecurity, to: newS.socialSecurity })
  if (oldS.otRatePerMinute !== newS.otRatePerMinute) out.push({ label: 'อัตรา OT', from: oldS.otRatePerMinute, to: newS.otRatePerMinute })
  return out
}

/** Apply an adjustment to a current value: keep / set absolute / increase %. */
function applyAdj(adj: FieldAdj, current: number): number {
  if (adj.mode === 'none') return current
  const v = Number(adj.value) || 0
  if (adj.mode === 'set') return v
  return Math.round(current * (1 + v / 100) * 100) / 100 /* pct */
}

/** One adjustable field row (mode select + value). Module-level so the input
    keeps focus while typing (a render-local component would remount). */
function AdjRow({ label, adj, set, from, to }: { label: string; adj: FieldAdj; set: (a: FieldAdj) => void; from?: number; to?: number }) {
  const show = adj.mode !== 'none' && from !== undefined && to !== undefined
  const dir = show ? (to! > from! ? '#15803d' : to! < from! ? 'var(--kpc-danger-ink, #b91c1c)' : 'var(--kpc-text-muted)') : undefined
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <Field label={label} style={{ width: 190 }}>
          <Select value={adj.mode} onChange={(e) => set({ ...adj, mode: e.target.value as AdjMode })}>
            <option value="none">ไม่เปลี่ยน</option>
            <option value="set">กำหนดค่า (บาท)</option>
            <option value="pct">เพิ่มขึ้น (%)</option>
          </Select>
        </Field>
        <Field label={adj.mode === 'pct' ? 'เปอร์เซ็นต์ (%)' : 'จำนวน (บาท)'} style={{ flex: 1 }}>
          <Input type="number" step="0.01" disabled={adj.mode === 'none'} placeholder={adj.mode === 'pct' ? 'เช่น 5' : 'เช่น 12000'} value={adj.value} onChange={(e) => set({ ...adj, value: e.target.value })} />
        </Field>
      </div>
      {show && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingLeft: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{baht(from!)} →</span>
          <span className="mono" style={{ fontSize: 22, fontWeight: 800, color: dir }}>{baht(to!)}</span>
          {to! !== from! && <span style={{ fontSize: 12, fontWeight: 600, color: dir }}>({to! > from! ? '+' : ''}{baht(to! - from!)})</span>}
        </div>
      )}
    </div>
  )
}

function fmtThaiDateTime(iso?: string): string {
  if (!iso) return 'ยังไม่เคยปรับ'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Single-employee salary-structure adjustment. Shows the employee's current
    structure, อายุงาน and last-adjusted date, then lets you set each of
    ฐานเงินเดือน / ค่าประสบการณ์ / ปกส. to a fixed value or a % increase. */
function AdjustForm({ open, employees, onClose }: { open: boolean; employees: Employee[]; onClose: () => void }) {
  const created = useCreatedDocs()
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [baseAdj, setBaseAdj] = useState<FieldAdj>(EMPTY_ADJ)
  const [expAdj, setExpAdj] = useState<FieldAdj>(EMPTY_ADJ)
  const [ssoAdj, setSsoAdj] = useState<FieldAdj>(EMPTY_ADJ)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setEmployeeId(employees[0]?.id ?? ''); setBaseAdj(EMPTY_ADJ); setExpAdj(EMPTY_ADJ); setSsoAdj(EMPTY_ADJ); setErr('')
  }, [open])

  const emp = employees.find((e) => e.id === employeeId)
  const cur = salaryStructureFor(employeeId, created.salaryStructures)
  const isLabor = emp?.department === 'labor' || cur.dailyWage > 0
  const startDate = created.employeeEdits[employeeId]?.startDate ?? emp?.startDate
  const tenure = yearsOfService(startDate) ?? 'ยังไม่ระบุวันเริ่มงาน'
  const curBase = isLabor ? cur.dailyWage : cur.baseSalary
  const newBase = applyAdj(baseAdj, curBase)
  const newExp = applyAdj(expAdj, cur.experiencePay)
  const newSso = applyAdj(ssoAdj, cur.socialSecurity)
  const hasAnyAdj = [baseAdj, expAdj, ssoAdj].some((a) => a.mode !== 'none' && a.value.trim() !== '')

  const submit = () => {
    setErr('')
    if (!emp) return setErr('กรุณาเลือกพนักงาน')
    if (!hasAnyAdj) return setErr('กรุณาระบุการปรับอย่างน้อย 1 รายการ (กำหนดค่า หรือ เพิ่ม %)')
    const next: SalaryStructure = {
      ...cur,
      baseSalary: isLabor ? cur.baseSalary : newBase,
      dailyWage: isLabor ? newBase : cur.dailyWage,
      experiencePay: newExp,
      socialSecurity: newSso,
      lastAdjustedAt: new Date().toISOString(),
    }
    /* Recompute OT from the (possibly changed) wage. */
    next.otRatePerMinute = computeOtRate(next)
    const changes = diffStructure(cur, next, isLabor)
    if (changes.length === 0) return setErr('ยังไม่มีรายการที่เปลี่ยนแปลง')
    setSalaryStructure(emp.id, next)
    addSalaryStructureAdjustment({ at: next.lastAdjustedAt!, employeeId: emp.id, employeeName: emp.name, changes })
    onClose()
  }

  const baseLabel = isLabor ? 'เงินรายวัน' : 'เงินเดือน'

  return (
    <Modal open={open} title="ปรับโครงสร้างเงินเดือน" onClose={onClose} maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <Field label="เลือกพนักงาน" required style={{ marginBottom: 14 }}>
        <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''} — {e.role}</option>)}
        </Select>
      </Field>

      {emp && (
        <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{emp.name}{emp.nickname ? ` (${emp.nickname})` : ''}</span>
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{emp.role} · {DEPARTMENT_LABEL[emp.department].th}</span>
          </div>
          <div className="grid g-3" style={{ gap: 10 }}>
            <Stat k="อายุงาน" v={tenure} />
            <Stat k="ปรับเงินเดือนล่าสุด" v={fmtThaiDateTime(cur.lastAdjustedAt)} />
            <Stat k={baseLabel} v={curBase ? baht(curBase) : '—'} />
            <Stat k="ค่าประสบการณ์" v={cur.experiencePay ? baht(cur.experiencePay) : '—'} />
            <Stat k="ปกส." v={cur.socialSecurity ? baht(cur.socialSecurity) : '—'} />
            <Stat k="อัตรา OT" v={`${computeOtRate(cur).toFixed(2)} บาท/นาที`} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 12, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--kpc-text-strong)' }}>รายการที่จะปรับ</div>
        <div className="stack" style={{ gap: 10 }}>
          <AdjRow label={baseLabel} adj={baseAdj} set={setBaseAdj} from={curBase} to={newBase} />
          <AdjRow label="ค่าประสบการณ์" adj={expAdj} set={setExpAdj} from={cur.experiencePay} to={newExp} />
          <AdjRow label="ประกันสังคม (ปกส.)" adj={ssoAdj} set={setSsoAdj} from={cur.socialSecurity} to={newSso} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 8 }}>
          * “กำหนดค่า” = ตั้งเป็นตัวเลขที่กรอก · “เพิ่ม %” = เพิ่มจากค่าเดิม{isLabor ? ' · พนักงานนี้เป็นแรงงานรายวัน — ช่องแรกปรับ “เงินรายวัน”' : ''}
        </div>
      </div>
    </Modal>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>{k}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{v}</span>
    </div>
  )
}

/** Printable report — the per-employee salary-structure summary table followed
    by the full adjustment history (with ผู้แก้ไข). Shown in a DocModal. */
function SalaryStructureReportDoc({ rows, adjustments }: { rows: Row[]; adjustments: SalaryStructureAdjustment[] }) {
  const now = fmtThaiDateTime(new Date().toISOString())
  const by = currentUserName()
  const th = { background: '#e9e9e9', color: '#111', borderColor: '#b8b8b8' }
  return (
    <div className="doc-sheet" style={{ maxWidth: 'none' }}>
      <div className="doc-top">
        <div className="co">
          <img src="/logo.jpg" className="doc-logo" alt="KPC กิจไพศาลคอนกรีต" />
          <div>
            <div className="co-name">{COMPANY.name}</div>
            <div className="co-line">({COMPANY.branch}) {COMPANY.address}</div>
            <div className="co-line">โทร. {COMPANY.tel}</div>
          </div>
        </div>
        <div className="doc-type">
          <div className="tt">รายงานโครงสร้างเงินเดือน</div>
          <div className="copy">พนักงาน {rows.length} คน</div>
          <div className="copy">สร้างเมื่อ {now} · โดย {by}</div>
        </div>
      </div>

      <table className="doc-lines" style={{ fontSize: 11, marginTop: 18 }}>
        <thead>
          <tr>
            <th style={th}>รหัส</th>
            <th style={th}>ชื่อ-สกุล</th>
            <th style={th}>ฝ่าย</th>
            <th className="num" style={th}>เงินรายวัน</th>
            <th className="num" style={th}>เงินเดือน</th>
            <th className="num" style={th}>ประสบการณ์</th>
            <th className="num" style={th}>ปกส.</th>
            <th className="num" style={th}>วันลา</th>
            <th className="num" style={th}>อัตรา OT</th>
            <th className="ctr" style={th}>OT</th>
            <th className="ctr" style={th}>คอม</th>
            <th className="ctr" style={th}>เที่ยว</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ emp, s }) => (
            <tr key={emp.id}>
              <td className="mono">{emp.id}</td>
              <td>{emp.name}{emp.nickname ? ` (${emp.nickname})` : ''}</td>
              <td>{DEPARTMENT_LABEL[emp.department].th}</td>
              <td className="num mono">{s.dailyWage ? baht(s.dailyWage) : '-'}</td>
              <td className="num mono">{s.baseSalary ? baht(s.baseSalary) : '-'}</td>
              <td className="num mono">{s.experiencePay ? baht(s.experiencePay) : '-'}</td>
              <td className="num mono">{s.socialSecurity ? baht(s.socialSecurity) : '-'}</td>
              <td className="num mono">{s.leaveDays ?? 0}</td>
              <td className="num mono">{s.otEligible === false ? '-' : computeOtRate(s).toFixed(2)}</td>
              <td className="ctr">{s.otEligible !== false ? '✓' : '–'}</td>
              <td className="ctr">{s.commissionEligible !== false ? '✓' : '–'}</td>
              <td className="ctr">{s.truckTripEligible === true ? '✓' : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 24, fontSize: 15, fontWeight: 700, color: 'var(--kpc-primary-ink)' }}>
        ประวัติการปรับโครงสร้าง <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>({adjustments.length} ครั้ง)</span>
      </div>
      {adjustments.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>— ยังไม่มีประวัติการปรับ —</div>
      ) : (
        <table className="doc-lines" style={{ fontSize: 11, marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '18%' }}>วันที่/เวลา</th>
              <th style={th}>พนักงาน</th>
              <th style={th}>รายการที่ปรับ</th>
              <th style={{ ...th, width: '14%' }}>ผู้แก้ไข</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a, i) => (
              <tr key={a.at + a.employeeId + i}>
                <td className="mono">{fmtThaiDateTime(a.at)}</td>
                <td>{a.employeeName}</td>
                <td>{a.changes.map((c) => `${c.label}: ${baht(c.from)} → ${baht(c.to)}`).join(' · ')}</td>
                <td>{a.by ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function StructureHistoryCard({ adj }: { adj: SalaryStructureAdjustment }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>{adj.employeeName}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>
          {fmtThaiDateTime(adj.at)}{adj.by ? <> · โดย <strong style={{ color: 'var(--kpc-text-strong)' }}>{adj.by}</strong></> : ''}
        </span>
      </div>
      <div className="row wrap" style={{ gap: 10 }}>
        {adj.changes.map((c, i) => {
          const dir = c.to > c.from ? '#15803d' : c.to < c.from ? 'var(--kpc-danger-ink, #b91c1c)' : 'var(--kpc-text-muted)'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 10px', borderRadius: 8, background: 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)' }}>
              <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{c.label}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{baht(c.from)} →</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: dir }}>{baht(c.to)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
