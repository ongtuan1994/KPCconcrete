import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Field, Input, Select, SavedBy, type Tone } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { PaySlipDoc } from '../components/documents/PaySlipDoc'
import { DepositSlipDoc } from '../components/documents/DepositSlipDoc'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { EMPLOYEES, DEPARTMENT_LABEL } from '../data/employees'
import { salaryStructureFor, computeOtRate } from '../data/salaryStructure'
import { useAttendance, computeAttendance } from '../data/attendance'
import {
  useCreatedDocs, addPayrollPayment, removePayrollPayment, addAdvance, removeAdvance, CAN_DELETE,
  type PayrollPayment, type PayMethodOut, type AdvancePayment,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const METHOD_TONE: Record<PayMethodOut, Tone> = { เงินสด: 'success', โอน: 'info', เช็ค: 'warning' }
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}
/** First and last day (ISO) of a "YYYY-MM" period. */
function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ['', '']
  const p = (n: number) => String(n).padStart(2, '0')
  const last = new Date(y, m, 0).getDate()
  return [`${y}-${p(m)}-01`, `${y}-${p(m)}-${p(last)}`]
}
/** "YYYY-MM" → "มิ.ย. 2569". */
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}
function nextPpNo(existing: PayrollPayment[]): string {
  let max = 0
  for (const p of existing) {
    const n = parseInt(p.ppNo.replace(/^PR/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `PR${String(max + 1).padStart(5, '0')}`
}
function nextAdvNo(existing: AdvancePayment[]): string {
  let max = 0
  for (const a of existing) {
    const n = parseInt(a.advNo.replace(/^ADV/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `ADV${String(max + 1).padStart(5, '0')}`
}

/** Max advance for day-rate labour. Others are capped at their monthly salary. */
const LABOR_ADVANCE_CAP = 3000
/** Total advances already taken by an employee for a given period (YYYY-MM). */
function sumAdvances(advances: AdvancePayment[], empId: string, payMonth: string): number {
  return advances.filter((a) => a.employeeId === empId && a.payMonth === payMonth).reduce((s, a) => s + a.amount, 0)
}

export function Payroll() {
  const [view, setView] = useState<'payroll' | 'advances'>('payroll')
  const [query, setQuery] = useState('')
  /* Pay-period (งวดเดือน) filter — '' = all periods. Reset on view switch. */
  const [monthFilter, setMonthFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showAdvance, setShowAdvance] = useState(false)
  const [slip, setSlip] = useState<PayrollPayment | null>(null)
  const [deposit, setDeposit] = useState<PayrollPayment | null>(null)
  const created = useCreatedDocs()
  const all = created.payrollPayments
  const advAll = created.advances

  /* Resolve the employee's bank account for the deposit slip — prefer the one
     stamped on the payment, then the (possibly edited) employee master record. */
  const resolveAccount = (pp: PayrollPayment): string => {
    if (pp.bankAccount) return pp.bankAccount
    const emp = [...created.employeesAdded, ...EMPLOYEES].find((e) => e.id === pp.employeeId)
    return created.employeeEdits[pp.employeeId]?.bankAccount || emp?.bankAccount || ''
  }

  /* Distinct pay periods present in each dataset, newest first — feeds the
     งวดเดือน dropdowns so only periods that actually have rows are listed. */
  const payMonths = useMemo(
    () => [...new Set(all.map((p) => p.payMonth))].sort().reverse(),
    [all],
  )
  const advMonths = useMemo(
    () => [...new Set(advAll.map((a) => a.payMonth))].sort().reverse(),
    [advAll],
  )

  const rows = useMemo(
    () =>
      all.filter((p) => {
        if (monthFilter && p.payMonth !== monthFilter) return false
        if (!query) return true
        return `${p.ppNo} ${p.employeeName} ${fmtMonth(p.payMonth)} ${p.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
      }),
    [all, query, monthFilter],
  )
  const advRows = useMemo(
    () =>
      advAll.filter((a) => {
        if (monthFilter && a.payMonth !== monthFilter) return false
        if (!query) return true
        return `${a.advNo} ${a.employeeName} ${fmtMonth(a.payMonth)} ${a.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
      }),
    [advAll, query, monthFilter],
  )

  const totalNet = all.reduce((s, p) => s + p.netAmount, 0)
  const totalAdvance = advAll.reduce((s, a) => s + a.amount, 0)

  const exportExcel = () => {
    if (view === 'advances') {
      const head = ['เลขที่', 'วันที่เบิก', 'พนักงาน', 'หักจากงวด', 'จำนวนเงิน', 'วิธีจ่าย', 'หมายเหตุ']
      const body = advRows.map((a) => [a.advNo, fmtDate(a.date), a.employeeName, fmtMonth(a.payMonth), a.amount, a.method, a.note ?? ''])
      downloadCsv('advances', [head, ...body])
      return
    }
    const head = ['เลขที่', 'งวดเดือน', 'พนักงาน', 'ตำแหน่ง', 'รวมรับ', 'รวมหัก', 'จ่ายสุทธิ', 'วันที่จ่าย', 'วิธีจ่าย', 'หมายเหตุ']
    const body = rows.map((p) => [
      p.ppNo, fmtMonth(p.payMonth), p.employeeName, p.position ?? '', p.totalIncome, p.totalDeduction, p.netAmount,
      fmtDate(p.payDate), p.method, p.note ?? '',
    ])
    downloadCsv('payroll', [head, ...body])
  }

  const advColumns: Column<AdvancePayment>[] = [
    { key: 'no', header: 'เลขที่', cell: (r) => <span className="mono">{r.advNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่เบิก', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'emp', header: 'พนักงาน', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.employeeName}</span> },
    { key: 'month', header: 'หักจากงวด', cell: (r) => fmtMonth(r.payMonth) },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.amount)}</span> },
    { key: 'method', header: 'วิธีจ่าย', align: 'center', cell: (r) => <Badge tone={METHOD_TONE[r.method]} pip={false} square>{r.method}</Badge> },
    { key: 'note', header: 'หมายเหตุ', cell: (r) => (r.note ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.note}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: AdvancePayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบรายการเบิกล่วงหน้า ${r.advNo} ?`)) removeAdvance(r.advNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  const columns: Column<PayrollPayment>[] = [
    { key: 'no', header: 'เลขที่', cell: (r) => <span className="mono">{r.ppNo}</span>, className: 'docno' },
    { key: 'month', header: 'งวดเดือน', cell: (r) => fmtMonth(r.payMonth) },
    { key: 'emp', header: 'พนักงาน', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.employeeName}</span> },
    { key: 'inc', header: 'รวมรับ', align: 'right', cell: (r) => <span className="mono">{baht(r.totalIncome)}</span> },
    { key: 'ded', header: 'รวมหัก', align: 'right', cell: (r) => (r.totalDeduction ? <span className="mono" style={{ color: 'var(--kpc-danger-ink)' }}>-{baht(r.totalDeduction)}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'net', header: 'จ่ายสุทธิ', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.netAmount)}</span> },
    { key: 'date', header: 'วันที่จ่าย', cell: (r) => fmtDate(r.payDate), className: 'date' },
    { key: 'method', header: 'วิธีจ่าย', align: 'center', cell: (r) => <Badge tone={METHOD_TONE[r.method]} pip={false} square>{r.method}</Badge> },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'purchasing', group: 'ทำจ่ายเงินเดือน', ref: r.ppNo, label: r.ppNo, sub: `${r.employeeName} · ${baht(r.netAmount)}`, route: '/payroll' }} /> },
    { key: 'slip', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setSlip(r)}>สลิป / พิมพ์</Button> },
    { key: 'deposit', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setDeposit(r)}>Deposit Slip</Button> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: PayrollPayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบทำจ่ายเงินเดือน ${r.ppNo} ?`)) removePayrollPayment(r.ppNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบทำจ่ายเงินเดือน"
        sub={`Payroll Payments · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="tonal" onClick={() => setShowAdvance(true)}><IconPlus /> บันทึกเบิกล่วงหน้า</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> บันทึกจ่ายเงินเดือน</Button>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'payroll'} onClick={() => { setView('payroll'); setQuery(''); setMonthFilter('') }}>บันทึกจ่ายเงินเดือน {all.length}</Pill>
        <Pill active={view === 'advances'} onClick={() => { setView('advances'); setQuery(''); setMonthFilter('') }}>เบิกล่วงหน้า {advAll.length}</Pill>
      </div>

      {view === 'payroll' ? (
        <>
          <div className="grid g-3" style={{ marginBottom: 24 }}>
            <KpiCard label="ใบทำจ่าย · Vouchers" value={all.length.toString()} note="ใบ" />
            <KpiCard label="จ่ายสุทธิรวม · Net paid" value={baht(totalNet)} note="ทุกงวด" invert />
            <KpiCard label="พนักงาน · Employees" value={new Set(all.map((p) => p.employeeId)).size.toString()} note="รายที่จ่ายแล้ว" />
          </div>

          <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
            <div style={{ width: 200 }}>
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="งวดเดือน">
                <option value="">ทุกงวดเดือน</option>
                {payMonths.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </Select>
            </div>
            <div style={{ width: 320 }}>
              <SearchInput placeholder="เลขที่ / พนักงาน / งวดเดือน" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {all.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
              ยังไม่มีใบทำจ่ายเงินเดือน — กด <strong>“บันทึกจ่ายเงินเดือน”</strong> เพื่อเริ่ม
            </div>
          ) : (
            <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
          )}
        </>
      ) : (
        <>
          <div className="grid g-3" style={{ marginBottom: 24 }}>
            <KpiCard label="รายการเบิก · Advances" value={advAll.length.toString()} note="รายการ" />
            <KpiCard label="ยอดเบิกรวม · Total" value={baht(totalAdvance)} note="ทุกงวด" invert />
            <KpiCard label="พนักงาน · Employees" value={new Set(advAll.map((a) => a.employeeId)).size.toString()} note="รายที่เบิก" />
          </div>

          <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
            <div style={{ width: 200 }}>
              <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="หักจากงวด">
                <option value="">ทุกงวดเดือน</option>
                {advMonths.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </Select>
            </div>
            <div style={{ width: 320 }}>
              <SearchInput placeholder="เลขที่ / พนักงาน / งวดเดือน" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {advAll.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
              ยังไม่มีรายการเบิกล่วงหน้า — กด <strong>“บันทึกเบิกล่วงหน้า”</strong> เพื่อเริ่ม
            </div>
          ) : (
            <DataTable columns={advColumns} rows={advRows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
          )}
        </>
      )}

      <NewPayrollForm
        open={showForm}
        onClose={() => setShowForm(false)}
        existing={all}
        onSaved={(p) => { setShowForm(false); setQuery(p.employeeName); setSlip(p) }}
      />

      <NewAdvanceForm open={showAdvance} onClose={() => setShowAdvance(false)} />

      <DocModal open={!!slip} title={slip ? `สลิปเงินเดือน ${slip.ppNo} · ${slip.employeeName}` : ''} onClose={() => setSlip(null)}>
        {slip && <PaySlipDoc pp={slip} />}
      </DocModal>

      <DocModal open={!!deposit} title={deposit ? `ใบนำฝาก (ttb) · ${deposit.employeeName}` : ''} onClose={() => setDeposit(null)}>
        {deposit && <DepositSlipDoc pp={deposit} account={resolveAccount(deposit)} />}
      </DocModal>
    </>
  )
}

function NewPayrollForm({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing: PayrollPayment[]; onSaved: (p: PayrollPayment) => void }) {
  const created = useCreatedDocs()
  const attendance = useAttendance()
  const employees = useMemo(() => [...created.employeesAdded, ...EMPLOYEES], [created.employeesAdded])

  const [payMonth, setPayMonth] = useState(thisMonth())
  /* OT date range (วันที่ ตั้งแต่ / ถึง) — pulls OT minutes from the attendance log. */
  const [otFrom, setOtFrom] = useState('')
  const [otTo, setOtTo] = useState('')
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [bankAccount, setBankAccount] = useState('')
  /* income */
  const [daysWorked, setDaysWorked] = useState('') /* แรงงานรายวัน */
  const [baseSalary, setBaseSalary] = useState('')
  const [experiencePay, setExperiencePay] = useState('')
  const [specialPay, setSpecialPay] = useState('')
  const [vehiclePay, setVehiclePay] = useState('')
  const [otherIncome, setOtherIncome] = useState('')
  /* deductions */
  const [socialSecurity, setSocialSecurity] = useState('')
  const [advance, setAdvance] = useState('')
  const [otherDeduction, setOtherDeduction] = useState('')
  const [payDate, setPayDate] = useState(todayIso())
  const [method, setMethod] = useState<PayMethodOut>('โอน')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const ppNo = useMemo(() => nextPpNo(existing), [existing, open])

  /* Pull standing values (เงินเดือน/ประสบการณ์/ปกส.) from the salary structure. */
  const applyStructure = (empId: string) => {
    const s = salaryStructureFor(empId, created.salaryStructures)
    setBaseSalary(s.baseSalary ? String(s.baseSalary) : '')
    setExperiencePay(s.experiencePay ? String(s.experiencePay) : '')
    setSocialSecurity(s.socialSecurity ? String(s.socialSecurity) : '')
    setDaysWorked('')
  }

  /* Deduct any advances (เบิกล่วงหน้า) recorded for this employee + period. */
  const advancePrefill = (empId: string, month: string) => {
    const sum = sumAdvances(created.advances, empId, month)
    setAdvance(sum ? String(sum) : '')
  }

  useEffect(() => {
    if (!open) return
    const firstId = employees[0]?.id ?? ''
    const tm = thisMonth()
    const [rf, rt] = monthRange(tm)
    setPayMonth(tm); setEmployeeId(firstId); setBankAccount('')
    setOtFrom(rf); setOtTo(rt)
    setSpecialPay(''); setVehiclePay(''); setOtherIncome(''); setOtherDeduction('')
    setPayDate(todayIso()); setMethod('โอน'); setNote(''); setErr('')
    applyStructure(firstId)
    advancePrefill(firstId, tm)
  }, [open])

  const num = (s: string) => Number(s) || 0
  /* Day-rate workers earn daysWorked × dailyWage; everyone else a monthly salary. */
  const struct = salaryStructureFor(employeeId, created.salaryStructures)
  const selEmp = employees.find((e) => e.id === employeeId)
  const isLabor = selEmp?.department === 'labor' || struct.dailyWage > 0
  /* Mixer-truck drivers use ค่าเที่ยววิ่ง / ค่ารักษารถ instead of เงินพิเศษ / อื่นๆ. */
  const isTransport = selEmp?.department === 'transport'
  const advanceTaken = sumAdvances(created.advances, employeeId, payMonth)
  const dailyWage = struct.dailyWage

  /* OT (non-transport): sum net OT minutes from the attendance log within the
     chosen date range × the employee's OT rate (บาท/นาที). */
  const otRate = computeOtRate(struct)
  /* Per-employee OT eligibility from the salary structure (ปรับโครงสร้าง).
     When off, the OT field is disabled and contributes 0 to income. */
  const otEligible = struct.otEligible !== false
  const otRecords = useMemo(
    () => attendance.filter((r) => r.empId === employeeId && (!otFrom || r.date >= otFrom) && (!otTo || r.date <= otTo)),
    [attendance, employeeId, otFrom, otTo],
  )
  const otMinutes = otRecords.reduce((s, r) => s + computeAttendance(r).otNetMin, 0)
  const otAmount = otEligible ? Math.round(otMinutes * otRate * 100) / 100 : 0

  /* For non-transport the "รักษารถ" income slot becomes the computed OT amount. */
  const vehicleOrOt = isTransport ? num(vehiclePay) : otAmount

  const effectiveBase = isLabor ? num(daysWorked) * dailyWage : num(baseSalary)
  const totalIncome = effectiveBase + num(experiencePay) + num(specialPay) + vehicleOrOt + num(otherIncome)
  const totalDeduction = num(socialSecurity) + num(advance) + num(otherDeduction)
  const net = totalIncome - totalDeduction

  const submit = () => {
    setErr('')
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp) return setErr('กรุณาเลือกพนักงาน')
    if (!payMonth) return setErr('กรุณาเลือกงวดเดือน')
    if (isLabor) {
      if (num(daysWorked) <= 0) return setErr('กรุณาระบุจำนวนวันทำงาน (มากกว่า 0)')
      if (dailyWage <= 0) return setErr('พนักงานยังไม่ได้ตั้งค่าเงินรายวัน — ตั้งค่าที่หน้า "ปรับโครงสร้าง" ก่อน')
    } else if (effectiveBase <= 0) {
      return setErr('กรุณาระบุเงินเดือน (มากกว่า 0)')
    }
    if (net < 0) return setErr('ยอดจ่ายสุทธิติดลบ — ตรวจสอบรายการหัก')

    const pp: PayrollPayment = {
      id: ppNo, ppNo, payMonth, employeeId: emp.id, employeeName: emp.name,
      position: emp.role, department: DEPARTMENT_LABEL[emp.department].th, bankAccount: bankAccount.trim() || undefined,
      daysWorked: isLabor ? num(daysWorked) : undefined, dailyWage: isLabor ? dailyWage : undefined,
      baseSalary: effectiveBase, experiencePay: num(experiencePay), specialPay: num(specialPay),
      vehiclePay: vehicleOrOt, otherIncome: num(otherIncome), totalIncome,
      socialSecurity: num(socialSecurity), advance: num(advance), otherDeduction: num(otherDeduction), totalDeduction,
      netAmount: net, payDate, method, note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addPayrollPayment(pp)
    onSaved(pp)
  }

  return (
    <Modal open={open} title="บันทึกใบทำจ่ายเงินเดือน" onClose={onClose} maxWidth={680}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12, marginBottom: 4 }}>
        <Field label="เลขที่" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{ppNo}</div>
        </Field>
        <Field label="งวดเดือน" required>
          <Input type="month" value={payMonth} onChange={(e) => {
            const ym = e.target.value
            setPayMonth(ym); advancePrefill(employeeId, ym)
            const [rf, rt] = monthRange(ym); setOtFrom(rf); setOtTo(rt)
          }} />
        </Field>
        <Field label="คำนวณ OT ตั้งแต่วันที่" hint="ดึงจากบันทึกลงเวลางาน">
          <Input type="date" value={otFrom} onChange={(e) => setOtFrom(e.target.value)} />
        </Field>
        <Field label="จนถึงวันที่">
          <Input type="date" value={otTo} onChange={(e) => setOtTo(e.target.value)} />
        </Field>
        <Field label="พนักงาน" required style={{ gridColumn: '1 / -1' }} hint={selEmp ? `${selEmp.role} · ${DEPARTMENT_LABEL[selEmp.department].th}` : undefined}>
          <Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); applyStructure(e.target.value); advancePrefill(e.target.value, payMonth) }}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''} — {e.role}</option>)}
          </Select>
        </Field>
        <Field label="เลขที่บัญชี" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เลขบัญชีธนาคาร (ถ้ามี)" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
        </Field>
      </div>

      <div className="card" style={{ padding: 12, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--kpc-text-strong)' }}>รายได้</div>
        <div className="grid g-3" style={{ gap: 10 }}>
          {isLabor ? (
            <>
              <Field label="จำนวนวันทำงาน" required hint="คูณกับอัตรารายวัน">
                <Input type="number" step="0.5" min={0} placeholder="เช่น 24" value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} />
              </Field>
              <Field label="เงินรายวัน" hint="จากปรับโครงสร้าง">
                <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center' }}>{dailyWage ? baht(dailyWage) : '— ยังไม่ตั้งค่า'}</div>
              </Field>
              <Field label="เงินเดือน (รวม)" hint="วัน × รายวัน">
                <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontWeight: 700 }}>{baht(effectiveBase)}</div>
              </Field>
            </>
          ) : (
            <Field label="เงินเดือน" required><Input type="number" step="0.01" min={0} placeholder="0" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} /></Field>
          )}
          <Field label="ประสบการณ์"><Input type="number" step="0.01" min={0} placeholder="0" value={experiencePay} onChange={(e) => setExperiencePay(e.target.value)} /></Field>
          <Field label={isTransport ? 'ค่าเที่ยววิ่ง' : 'เงินพิเศษ'}><Input type="number" step="0.01" min={0} placeholder="0" value={specialPay} onChange={(e) => setSpecialPay(e.target.value)} /></Field>
          {isTransport ? (
            <Field label="รักษารถ"><Input type="number" step="0.01" min={0} placeholder="0" value={vehiclePay} onChange={(e) => setVehiclePay(e.target.value)} /></Field>
          ) : (
            <Field label="OT" hint={otEligible ? `พบ ${otRecords.length} วันในช่วง · ${otMinutes} นาที × ${otRate.toFixed(2)} บาท/นาที` : 'พนักงานนี้ตั้งค่าไม่รับ OT (ปรับโครงสร้าง)'}>
              <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontWeight: 600, opacity: otEligible ? 1 : 0.55, color: otEligible ? undefined : 'var(--kpc-text-faint)' }}>
                {otEligible ? baht(otAmount) : 'ไม่รับ OT'}
              </div>
            </Field>
          )}
          <Field label={isTransport ? 'ค่ารักษารถ' : 'อื่นๆ'}><Input type="number" step="0.01" min={0} placeholder="0" value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} /></Field>
          <Field label="รวมรับ"><div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontWeight: 700 }}>{baht(totalIncome)}</div></Field>
        </div>
      </div>

      <div className="card" style={{ padding: 12, background: 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)', borderRadius: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--kpc-text-strong)' }}>เงินหัก</div>
        <div className="grid g-3" style={{ gap: 10 }}>
          <Field label="ประกันสังคม"><Input type="number" step="0.01" min={0} placeholder="0" value={socialSecurity} onChange={(e) => setSocialSecurity(e.target.value)} /></Field>
          <Field label="เบิกล่วงหน้า" hint={advanceTaken > 0 ? `เบิกงวดนี้ ${baht(advanceTaken)}` : 'ดึงจากที่เบิกล่วงหน้า'}><Input type="number" step="0.01" min={0} placeholder="0" value={advance} onChange={(e) => setAdvance(e.target.value)} /></Field>
          <Field label="อื่นๆ"><Input type="number" step="0.01" min={0} placeholder="0" value={otherDeduction} onChange={(e) => setOtherDeduction(e.target.value)} /></Field>
          <Field label="รวมหัก"><div className="input" style={{ background: '#fff', display: 'flex', alignItems: 'center', fontWeight: 700 }}>{baht(totalDeduction)}</div></Field>
          <Field label="จ่ายสุทธิ" hint="รวมรับ − รวมหัก" style={{ gridColumn: 'span 2' }}>
            <div className="input" style={{ background: '#fff', display: 'flex', alignItems: 'center', fontWeight: 800, color: net < 0 ? 'var(--kpc-danger)' : 'var(--kpc-text-strong)' }}>{baht(net)}</div>
          </Field>
        </div>
      </div>

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="วันที่จ่าย" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </Field>
        <Field label="วิธีจ่าย" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethodOut)}>
            <option value="โอน">โอน</option>
            <option value="เงินสด">เงินสด</option>
            <option value="เช็ค">เช็ค</option>
          </Select>
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function NewAdvanceForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const created = useCreatedDocs()
  const employees = useMemo(() => [...created.employeesAdded, ...EMPLOYEES], [created.employeesAdded])

  const [date, setDate] = useState(todayIso())
  const [payMonth, setPayMonth] = useState(thisMonth())
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethodOut>('เงินสด')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const advNo = useMemo(() => nextAdvNo(created.advances), [created.advances, open])

  useEffect(() => {
    if (!open) return
    setDate(todayIso()); setPayMonth(thisMonth()); setEmployeeId(employees[0]?.id ?? '')
    setAmount(''); setMethod('เงินสด'); setNote(''); setErr('')
  }, [open])

  const emp = employees.find((e) => e.id === employeeId)
  const struct = salaryStructureFor(employeeId, created.salaryStructures)
  const isLabor = emp?.department === 'labor' || struct.dailyWage > 0
  /* แรงงาน: เพดาน 3,000 บาท · อื่นๆ: ไม่เกินเงินเดือนของตัวเอง */
  const limit = isLabor ? LABOR_ADVANCE_CAP : struct.baseSalary
  const already = sumAdvances(created.advances, employeeId, payMonth)
  const remaining = Math.max(0, limit - already)

  const submit = () => {
    setErr('')
    if (!emp) return setErr('กรุณาเลือกพนักงาน')
    if (!payMonth) return setErr('กรุณาเลือกงวดเดือนที่จะหัก')
    const amt = Number(amount) || 0
    if (amt <= 0) return setErr('กรุณาระบุจำนวนเงิน (มากกว่า 0)')
    if (limit <= 0) return setErr('พนักงานนี้ยังไม่ได้ตั้งเงินเดือน — ตั้งค่าที่หน้า "ปรับโครงสร้าง" ก่อน')
    if (amt > remaining) return setErr(`เบิกได้ไม่เกิน ${baht(remaining)} (เพดาน ${baht(limit)} · เบิกแล้ว ${baht(already)})`)

    const a: AdvancePayment = {
      id: advNo, advNo, date, payMonth, employeeId: emp.id, employeeName: emp.name,
      amount: amt, method, note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addAdvance(a)
    onClose()
  }

  return (
    <Modal open={open} title="บันทึกเบิกล่วงหน้า" onClose={onClose} maxWidth={560}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{advNo}</div>
        </Field>
        <Field label="วันที่เบิก" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="พนักงาน" required style={{ gridColumn: '1 / -1' }} hint={emp ? `${emp.role} · ${DEPARTMENT_LABEL[emp.department].th}` : undefined}>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''} — {e.role}</option>)}
          </Select>
        </Field>
        <Field label="หักจากงวดเดือน" required hint="เงินที่เบิกจะถูกหักตอนจ่ายเงินเดือนงวดนี้">
          <Input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} />
        </Field>
        <Field label="วิธีจ่าย" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethodOut)}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
            <option value="เช็ค">เช็ค</option>
          </Select>
        </Field>
        <Field
          label="จำนวนเงิน (บาท)"
          required
          style={{ gridColumn: '1 / -1' }}
          hint={`เพดาน ${isLabor ? 'แรงงาน 3,000' : 'เท่าเงินเดือน'} = ${baht(limit)} · เบิกแล้ว ${baht(already)} · เบิกได้อีก ${baht(remaining)}`}
        >
          <Input type="number" step="0.01" min={0} max={remaining} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เหตุผล / รายละเอียด" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
