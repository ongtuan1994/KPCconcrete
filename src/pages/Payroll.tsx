import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
import { DELIVERY_TICKETS } from '../data/real'
import { EMPLOYEES, DEPARTMENT_LABEL } from '../data/employees'
import { salaryStructureFor, computeOtRate } from '../data/salaryStructure'
import { truckTripFeeForDriver } from '../data/truckTripFee'
import { useCurrentUser } from '../data/auth'
import { useAttendance, computeAttendance } from '../data/attendance'
import {
  useCreatedDocs, addPayrollPayment, removePayrollPayment, addAdvance, removeAdvance, addGeneralReport,
  type PayrollPayment, type PayMethodOut, type AdvancePayment, type PayrollReport, type PayrollReportScope, type PayrollReportRow, type PayrollReportSection,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const METHOD_TONE: Record<string, Tone> = { เงินสดย่อย: 'success', เงินสด: 'success', โอน: 'info', เช็ค: 'warning' }
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** "YYYY-MM" → "พฤษภาคม 2569" (full Thai month). */
function fmtMonthFull(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`
}

/* The four group tables bundled into every payroll report, in page order:
   หน้า 1 รวม · หน้า 2 แพล้นปูน · หน้า 3 โรงหล่อไทย · หน้า 4 โรงหล่อพม่า. */
const PAYROLL_GROUPS: { scope: PayrollReportScope; label: string }[] = [
  { scope: 'all', label: 'เงินเดือนรวม' },
  { scope: 'plant', label: 'เงินเดือนแพล้นปูน' },
  { scope: 'foundry-thai', label: 'เงินเดือนโรงหล่อ (คนไทย)' },
  { scope: 'foundry-myanmar', label: 'เงินเดือนโรงหล่อ (คนพม่า)' },
]

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
  const loc = useLocation()
  /* /advances opens the เบิกล่วงหน้า view; /payroll the จ่ายเงินเดือน view. */
  const [view, setView] = useState<'payroll' | 'advances'>(loc.pathname === '/advances' ? 'advances' : 'payroll')
  useEffect(() => { setView(loc.pathname === '/advances' ? 'advances' : 'payroll') }, [loc.pathname])
  const [query, setQuery] = useState('')
  /* Pay-period (งวดเดือน) filter — '' = all periods. Reset on view switch. */
  const [monthFilter, setMonthFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showAdvance, setShowAdvance] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const isAdmin = useCurrentUser()?.role === 'Admin'
  const [slip, setSlip] = useState<PayrollPayment | null>(null)
  const [deposit, setDeposit] = useState<PayrollPayment | null>(null)
  /* Selected report group for the "สร้างรายงาน" action. */
  const created = useCreatedDocs()
  const navigate = useNavigate()
  const all = created.payrollPayments
  const advAll = created.advances

  /* Resolve each employee's current SITE + สัญชาติ (master + edits) for grouping. */
  const empInfo = useMemo(() => {
    const m = new Map<string, { site: string; nationality?: string }>()
    for (const e of [...created.employeesAdded, ...EMPLOYEES]) {
      if (m.has(e.id)) continue
      const edit = created.employeeEdits[e.id]
      m.set(e.id, { site: edit?.site ?? e.site ?? 'plant', nationality: edit?.nationality ?? e.nationality })
    }
    return m
  }, [created.employeesAdded, created.employeeEdits])

  const inScope = (empId: string, scope: PayrollReportScope): boolean => {
    const info = empInfo.get(empId)
    const site = info?.site ?? 'plant'
    const nat = info?.nationality
    if (scope === 'plant') return site === 'plant'
    if (scope === 'foundry-thai') return site === 'foundry' && nat === 'ไทย'
    if (scope === 'foundry-myanmar') return site === 'foundry' && nat === 'พม่า'
    return true /* all */
  }

  /** Build one payroll report for the selected งวด (monthFilter) bundling all
      four group tables (รวม / แพล้นปูน / โรงหล่อไทย / โรงหล่อพม่า), one per page,
      then save it to รายงานทั่วไป. */
  const createPayrollReport = () => {
    if (!monthFilter) { alert('กรุณาเลือกงวดเดือนก่อนสร้างรายงาน'); return }
    const inMonth = all.filter((p) => p.payMonth === monthFilter)
    if (inMonth.length === 0) { alert(`ไม่มีใบทำจ่ายในงวด ${fmtMonthFull(monthFilter)}`); return }

    const toRow = (p: PayrollPayment): PayrollReportRow => ({
      ppNo: p.ppNo, employeeName: p.employeeName, department: p.department,
      daysWorked: p.daysWorked, dailyWage: p.dailyWage,
      baseSalary: p.baseSalary, experiencePay: p.experiencePay, specialPay: p.specialPay,
      vehiclePay: p.vehiclePay, otherIncome: p.otherIncome, totalIncome: p.totalIncome,
      socialSecurity: p.socialSecurity, advance: p.advance, otherDeduction: p.otherDeduction,
      totalDeduction: p.totalDeduction, netAmount: p.netAmount,
    })
    const sumTotals = (rows: PayrollReportRow[]) => rows.reduce(
      (a, r) => ({ income: a.income + r.totalIncome, deduction: a.deduction + r.totalDeduction, net: a.net + r.netAmount }),
      { income: 0, deduction: 0, net: 0 },
    )

    const sections: PayrollReportSection[] = PAYROLL_GROUPS.map((g) => {
      const rows = inMonth
        .filter((p) => inScope(p.employeeId, g.scope))
        /* Always order by รหัสพนักงาน ascending (E001 ลงมา). */
        .sort((a, b) => a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }))
        .map(toRow)
      return { label: g.label, rows, totals: sumTotals(rows) }
    })
    const overall = sections[0] /* รวม */
    const payMonthLabel = fmtMonthFull(monthFilter)
    const report: PayrollReport = {
      id: `gr_${Date.now()}`,
      kind: 'payroll',
      scope: 'all',
      scopeLabel: 'รวมทุกกลุ่ม',
      title: `รายงานจ่ายเงินเดือน · ${payMonthLabel}`,
      fromLabel: payMonthLabel,
      toLabel: payMonthLabel,
      payMonthLabel,
      rows: overall.rows,
      totals: overall.totals,
      sections,
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" (รวม ${overall.rows.length} คน · 4 หน้า) เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

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

  /* Default the งวดเดือน filter to the latest period that has data (per view),
     so the page opens focused on the most recent payroll instead of "ทุกงวด". */
  const latestMonth = view === 'payroll' ? payMonths[0] : advMonths[0]
  useEffect(() => {
    setMonthFilter(latestMonth ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, latestMonth])

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
    {
      key: 'del', header: '', align: 'center' as const,
      cell: (r: AdvancePayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบรายการเบิกล่วงหน้า ${r.advNo} ?`)) removeAdvance(r.advNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    },
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
    {
      key: 'del', header: '', align: 'center' as const,
      cell: (r: PayrollPayment) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบทำจ่ายเงินเดือน ${r.ppNo} ?`)) removePayrollPayment(r.ppNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="ใบทำจ่ายเงินเดือน"
        sub={`Payroll Payments · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            {isAdmin && <Button variant="ghost" onClick={() => setShowBulk(true)} title="เฉพาะ Admin · สำหรับทดสอบ">⚙️ จ่ายทุกคน (ทดสอบ)</Button>}
            <Button variant="tonal" onClick={() => setShowAdvance(true)}><IconPlus /> บันทึกเบิกล่วงหน้า</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> บันทึกจ่ายเงินเดือน</Button>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'payroll'} onClick={() => { navigate('/payroll'); setQuery('') }}>บันทึกจ่ายเงินเดือน {all.length}</Pill>
        <Pill active={view === 'advances'} onClick={() => { navigate('/advances'); setQuery('') }}>เบิกล่วงหน้า {advAll.length}</Pill>
      </div>

      {view === 'payroll' ? (
        <>
          <div className="grid g-3" style={{ marginBottom: 24 }}>
            <KpiCard label="ใบทำจ่าย · Vouchers" value={all.length.toString()} note="ใบ" />
            <KpiCard label="จ่ายสุทธิรวม · Net paid" value={baht(totalNet)} note="ทุกงวด" invert />
            <KpiCard
              label="ใบทำจ่าย/พนักงาน · Vouchers/Emp"
              value={`${monthFilter ? all.filter((p) => p.payMonth === monthFilter).length : all.length} / ${empInfo.size}`}
              note={monthFilter ? `งวด ${fmtMonth(monthFilter)} · ใบทำจ่ายที่สร้าง` : 'ทุกงวด · ใบทำจ่ายที่สร้าง'}
            />
          </div>

          <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ width: 200 }}>
                <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="งวดเดือน">
                  <option value="">ทุกงวดเดือน</option>
                  {payMonths.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
                </Select>
              </div>
              <Button variant="secondary" onClick={createPayrollReport} disabled={!monthFilter}>สร้างรายงาน</Button>
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

      {isAdmin && <BulkPayrollForm open={showBulk} onClose={() => setShowBulk(false)} existing={all} />}

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
  /* Delivery tickets (for the auto-pulled ค่าเที่ยววิ่ง = truck-trip fee). */
  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])
  const allTickets = useMemo(
    () => [...created.tickets, ...DELIVERY_TICKETS].filter((t) => !hiddenSet.has(t.dtNo)),
    [created.tickets, hiddenSet],
  )
  /* งวดเดือน dropdown options (Thai) — this month + 17 previous, merged with any
     period that already has a payment (so the default stays selectable). */
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    let [y, m] = thisMonth().split('-').map(Number)
    for (let i = 0; i < 18; i++) {
      set.add(`${y}-${String(m).padStart(2, '0')}`)
      m--; if (m === 0) { m = 12; y-- }
    }
    for (const p of existing) set.add(p.payMonth)
    return [...set].sort().reverse()
  }, [existing])

  const [payMonth, setPayMonth] = useState(thisMonth())
  /* OT date range (วันที่ ตั้งแต่ / ถึง) — pulls OT minutes from the attendance log. */
  const [otFrom, setOtFrom] = useState('')
  const [otTo, setOtTo] = useState('')
  /* Truck-trip (ค่าเที่ยวรถโม่) date range — separate from OT so it can be
     computed over a different period. */
  const [tripFrom, setTripFrom] = useState('')
  const [tripTo, setTripTo] = useState('')
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  /* income */
  const [daysWorked, setDaysWorked] = useState('') /* แรงงานรายวัน */
  const [baseSalary, setBaseSalary] = useState('')
  const [experiencePay, setExperiencePay] = useState('')
  const [vehiclePay, setVehiclePay] = useState('')
  /* OT amount — prefilled from the attendance log (นาที × อัตรา) but editable. */
  const [otPay, setOtPay] = useState('')
  const [otherIncome, setOtherIncome] = useState('')
  /* deductions */
  const [socialSecurity, setSocialSecurity] = useState('')
  const [advance, setAdvance] = useState('')
  const [otherDeduction, setOtherDeduction] = useState('')
  const [payDate, setPayDate] = useState(todayIso())
  const [method, setMethod] = useState<PayMethodOut>('เช็ค')
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

  /* Auto-fill ค่าเที่ยววิ่ง (otherIncome) from บันทึกเที่ยวรถโม่ for this employee
     over the chosen date range. Prefilled but still editable. */
  const tripFeePrefill = (empId: string, from: string, to: string) => {
    const emp = employees.find((e) => e.id === empId)
    const fee = emp ? truckTripFeeForDriver(emp.name, from, to, allTickets, created.truckTrips) : 0
    setOtherIncome(fee ? String(fee) : '')
  }

  /* แรงงานรายวัน: prefill จำนวนวันทำงาน = จำนวนวันที่มีบันทึกลงเวลางานในช่วง
     (นับวันไม่ซ้ำ) — ยังแก้ไขได้. พนักงานรายเดือนไม่ใช้ช่องนี้. */
  const daysWorkedPrefill = (empId: string, from: string, to: string) => {
    const emp = employees.find((e) => e.id === empId)
    const st = salaryStructureFor(empId, created.salaryStructures)
    const labor = emp?.department === 'labor' || st.dailyWage > 0
    if (!labor) { setDaysWorked(''); return }
    const days = new Set(
      attendance.filter((r) => r.empId === empId && (!from || r.date >= from) && (!to || r.date <= to)).map((r) => r.date),
    ).size
    setDaysWorked(days ? String(days) : '')
  }

  /* OT: prefill the amount = net OT นาที ในช่วง × อัตรา OT — still editable. Cleared
     for employees set to ไม่รับ OT (ปรับโครงสร้าง). */
  const otPrefill = (empId: string, from: string, to: string) => {
    const st = salaryStructureFor(empId, created.salaryStructures)
    if (st.otEligible === false) { setOtPay(''); return }
    const rate = computeOtRate(st)
    const mins = attendance
      .filter((r) => r.empId === empId && (!from || r.date >= from) && (!to || r.date <= to))
      .reduce((s, r) => s + computeAttendance(r).otNetMin, 0)
    const amt = Math.round(mins * rate * 100) / 100
    setOtPay(amt ? String(amt) : '')
  }

  useEffect(() => {
    if (!open) return
    const firstId = employees[0]?.id ?? ''
    /* Default งวดเดือน to the latest period that already has a payment (continue
       that payroll run), or this month when nothing has been paid yet. */
    const latestPaid = [...new Set(existing.map((p) => p.payMonth))].sort().reverse()[0]
    const tm = latestPaid ?? thisMonth()
    const [rf, rt] = monthRange(tm)
    setPayMonth(tm); setEmployeeId(firstId)
    setOtFrom(rf); setOtTo(rt)
    setTripFrom(rf); setTripTo(rt)
    setVehiclePay(''); setOtherIncome(''); setOtherDeduction('')
    setPayDate(todayIso()); setMethod('เช็ค'); setNote(''); setErr('')
    applyStructure(firstId)
    advancePrefill(firstId, tm)
    tripFeePrefill(firstId, rf, rt)
    daysWorkedPrefill(firstId, rf, rt)
    otPrefill(firstId, rf, rt)
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

  /* For non-transport the "รักษารถ" income slot carries the OT amount — prefilled
     from the attendance log but editable via `otPay` (0 when ไม่รับ OT). */
  const vehicleOrOt = isTransport ? num(vehiclePay) : (otEligible ? num(otPay) : 0)

  const effectiveBase = isLabor ? num(daysWorked) * dailyWage : num(baseSalary)
  const totalIncome = effectiveBase + num(experiencePay) + vehicleOrOt + num(otherIncome)
  const totalDeduction = num(socialSecurity) + num(advance) + num(otherDeduction)
  const net = totalIncome - totalDeduction

  const submit = () => {
    setErr('')
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp) return setErr('กรุณาเลือกพนักงาน')
    if (!payMonth) return setErr('กรุณาเลือกงวดเดือน')
    /* No duplicate voucher for the same employee + งวดเดือน — must delete the
       existing one before creating a new one. */
    if (existing.some((p) => p.employeeId === emp.id && p.payMonth === payMonth)) {
      return setErr(`มีใบทำจ่ายของ "${emp.name}" ในงวด ${fmtMonthFull(payMonth)} อยู่แล้ว — กรุณาลบใบเดิมก่อนจึงจะสร้างใหม่ได้`)
    }
    if (isLabor) {
      if (num(daysWorked) <= 0) return setErr('กรุณาระบุจำนวนวันทำงาน (มากกว่า 0)')
      if (dailyWage <= 0) return setErr('พนักงานยังไม่ได้ตั้งค่าเงินรายวัน — ตั้งค่าที่หน้า "ปรับโครงสร้าง" ก่อน')
    } else if (effectiveBase <= 0) {
      return setErr('กรุณาระบุเงินเดือน (มากกว่า 0)')
    }
    if (net < 0) return setErr('ยอดจ่ายสุทธิติดลบ — ตรวจสอบรายการหัก')

    const pp: PayrollPayment = {
      id: ppNo, ppNo, payMonth, employeeId: emp.id, employeeName: emp.name,
      position: emp.role, department: DEPARTMENT_LABEL[emp.department].th,
      daysWorked: isLabor ? num(daysWorked) : undefined, dailyWage: isLabor ? dailyWage : undefined,
      baseSalary: effectiveBase, experiencePay: num(experiencePay), specialPay: 0,
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
      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--kpc-warning-50, #fffbeb)', border: '1px solid var(--kpc-warning-200, #fde68a)', borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--kpc-warning-ink, #b45309)', marginBottom: 4 }}>
          ⚠️ ก่อนเริ่มบันทึกจ่ายเงินเดือน โปรดตรวจเช็คว่ามีการทำรายการดังต่อไปนี้เรียบร้อยแล้ว
        </div>
        <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, color: 'var(--kpc-text-strong)', lineHeight: 1.7 }}>
          <li>บันทึกเบิกล่วงหน้า</li>
          <li>บันทึกลงเวลางาน</li>
          <li>บันทึกค่าเที่ยวรถโม่</li>
        </ol>
      </div>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12, marginBottom: 4 }}>
        <Field label="งวดเดือน" required>
          <div className="month-primary">
            <Select value={payMonth} onChange={(e) => {
              const ym = e.target.value
              setPayMonth(ym); advancePrefill(employeeId, ym)
              const [rf, rt] = monthRange(ym); setOtFrom(rf); setOtTo(rt); setTripFrom(rf); setTripTo(rt)
              tripFeePrefill(employeeId, rf, rt)
              daysWorkedPrefill(employeeId, rf, rt)
              otPrefill(employeeId, rf, rt)
            }}>
              {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthFull(m)}</option>)}
            </Select>
          </div>
        </Field>
        <Field label="เลขที่" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{ppNo}</div>
        </Field>
        <Field label="คำนวณ OT ตั้งแต่วันที่" hint="ดึงจากบันทึกลงเวลางาน">
          <Input type="date" value={otFrom} onChange={(e) => { setOtFrom(e.target.value); otPrefill(employeeId, e.target.value, otTo) }} />
        </Field>
        <Field label="จนถึงวันที่">
          <Input type="date" value={otTo} onChange={(e) => { setOtTo(e.target.value); otPrefill(employeeId, otFrom, e.target.value) }} />
        </Field>
        <Field label="คำนวณเที่ยวรถโม่ ตั้งแต่วันที่" hint="ดึงค่าเที่ยววิ่งจากบันทึกเที่ยวรถโม่">
          <Input type="date" value={tripFrom} onChange={(e) => { setTripFrom(e.target.value); tripFeePrefill(employeeId, e.target.value, tripTo) }} />
        </Field>
        <Field label="จนถึงวันที่">
          <Input type="date" value={tripTo} onChange={(e) => { setTripTo(e.target.value); tripFeePrefill(employeeId, tripFrom, e.target.value) }} />
        </Field>
        <Field label="พนักงาน" required style={{ gridColumn: '1 / -1' }} hint={selEmp ? `${selEmp.role} · ${DEPARTMENT_LABEL[selEmp.department].th}` : undefined}>
          <Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); applyStructure(e.target.value); advancePrefill(e.target.value, payMonth); tripFeePrefill(e.target.value, tripFrom, tripTo); daysWorkedPrefill(e.target.value, otFrom, otTo); otPrefill(e.target.value, otFrom, otTo) }}>
            {employees.map((e) => {
              const done = existing.some((p) => p.employeeId === e.id && p.payMonth === payMonth)
              return <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''} — {e.role}{done ? ' · ✓ สร้างแล้ว' : ''}</option>
            })}
          </Select>
        </Field>
      </div>

      <div className="card" style={{ padding: 12, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--kpc-text-strong)' }}>รายได้</div>
        <div className="grid g-3" style={{ gap: 10 }}>
          {isLabor ? (
            <>
              <Field label="จำนวนวันทำงาน" required hint="ดึงจากบันทึกลงเวลางาน · แก้ไขได้ · คูณกับอัตรารายวัน">
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
          {isTransport ? (
            <Field label="รักษารถ"><Input type="number" step="0.01" min={0} placeholder="0" value={vehiclePay} onChange={(e) => setVehiclePay(e.target.value)} /></Field>
          ) : (
            <Field label="OT" hint={otEligible ? `พบ ${otRecords.length} วันในช่วง · ${otMinutes} นาที × ${otRate.toFixed(2)} บาท/นาที · แก้ไขได้` : 'พนักงานนี้ตั้งค่าไม่รับ OT (ปรับโครงสร้าง)'}>
              {otEligible ? (
                <Input type="number" step="0.01" min={0} placeholder="0" value={otPay} onChange={(e) => setOtPay(e.target.value)} />
              ) : (
                <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontWeight: 600, opacity: 0.55, color: 'var(--kpc-text-faint)' }}>
                  ไม่รับ OT
                </div>
              )}
            </Field>
          )}
          <Field label="ค่าเที่ยววิ่ง" hint="ดึงจากบันทึกเที่ยวรถโม่ตามช่วงวันที่ · แก้ไขได้">
            <Input type="number" step="0.01" min={0} placeholder="0" value={otherIncome} onChange={(e) => setOtherIncome(e.target.value)} />
          </Field>
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
            <option value="เงินสดย่อย">เงินสดย่อย</option>
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
  const [method, setMethod] = useState<PayMethodOut>('เงินสดย่อย')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const advNo = useMemo(() => nextAdvNo(created.advances), [created.advances, open])

  /* หักจากงวดเดือน dropdown options (Thai) — this month + 17 previous, merged with
     any period that already has an advance. */
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    let [y, m] = thisMonth().split('-').map(Number)
    for (let i = 0; i < 18; i++) {
      set.add(`${y}-${String(m).padStart(2, '0')}`)
      m--; if (m === 0) { m = 12; y-- }
    }
    for (const a of created.advances) set.add(a.payMonth)
    return [...set].sort().reverse()
  }, [created.advances])

  /* แรงงานรายวัน: prefill จำนวนเงินเบิก = เพดาน 3,000 (แก้ไขได้); อื่นๆ เว้นว่าง. */
  const amountPrefill = (empId: string) => {
    const e = employees.find((x) => x.id === empId)
    const st = salaryStructureFor(empId, created.salaryStructures)
    const labor = e?.department === 'labor' || st.dailyWage > 0
    setAmount(labor ? String(LABOR_ADVANCE_CAP) : '')
  }

  useEffect(() => {
    if (!open) return
    const firstId = employees[0]?.id ?? ''
    /* Default งวดที่หัก to the latest period that already has an advance, else this month. */
    const latestAdv = [...new Set(created.advances.map((a) => a.payMonth))].sort().reverse()[0]
    setDate(todayIso()); setPayMonth(latestAdv ?? thisMonth()); setEmployeeId(firstId)
    amountPrefill(firstId); setMethod('เงินสดย่อย'); setNote(''); setErr('')
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
          <Select value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); amountPrefill(e.target.value) }}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''} — {e.role}</option>)}
          </Select>
        </Field>
        <Field label="หักจากงวดเดือน" required hint="เงินที่เบิกจะถูกหักตอนจ่ายเงินเดือนงวดนี้">
          <div className="month-primary-dark">
            <Select value={payMonth} onChange={(e) => setPayMonth(e.target.value)}>
              {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthFull(m)}</option>)}
            </Select>
          </div>
        </Field>
        <Field label="วิธีจ่าย" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethodOut)}>
            <option value="เงินสดย่อย">เงินสดย่อย</option>
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

/** Admin-only test tool: generate payroll vouchers for every employee (E001 →)
    for one งวดเดือน + OT range in a single click, skipping anyone already done
    that period. Mirrors NewPayrollForm's per-employee computation. */
function BulkPayrollForm({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: PayrollPayment[] }) {
  const created = useCreatedDocs()
  const attendance = useAttendance()
  const employees = useMemo(
    () => [...created.employeesAdded, ...EMPLOYEES].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [created.employeesAdded],
  )
  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])
  const allTickets = useMemo(
    () => [...created.tickets, ...DELIVERY_TICKETS].filter((t) => !hiddenSet.has(t.dtNo)),
    [created.tickets, hiddenSet],
  )
  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    let [y, m] = thisMonth().split('-').map(Number)
    for (let i = 0; i < 18; i++) { set.add(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y-- } }
    for (const p of existing) set.add(p.payMonth)
    return [...set].sort().reverse()
  }, [existing])

  const [payMonth, setPayMonth] = useState(thisMonth())
  const [otFrom, setOtFrom] = useState('')
  const [otTo, setOtTo] = useState('')

  useEffect(() => {
    if (!open) return
    const latestPaid = [...new Set(existing.map((p) => p.payMonth))].sort().reverse()[0]
    const tm = latestPaid ?? thisMonth()
    const [rf, rt] = monthRange(tm)
    setPayMonth(tm); setOtFrom(rf); setOtTo(rt)
  }, [open])

  /* Employees still needing a voucher for the selected period. */
  const pending = employees.filter((e) => !existing.some((p) => p.employeeId === e.id && p.payMonth === payMonth))

  const run = () => {
    const running = [...existing]
    let done = 0
    for (const emp of employees) {
      if (running.some((p) => p.employeeId === emp.id && p.payMonth === payMonth)) continue
      const struct = salaryStructureFor(emp.id, created.salaryStructures)
      const isLabor = emp.department === 'labor' || struct.dailyWage > 0
      const otRate = computeOtRate(struct)
      const otEligible = struct.otEligible !== false
      const otRecords = attendance.filter((r) => r.empId === emp.id && (!otFrom || r.date >= otFrom) && (!otTo || r.date <= otTo))
      const otMinutes = otRecords.reduce((s, r) => s + computeAttendance(r).otNetMin, 0)
      const otAmount = otEligible ? Math.round(otMinutes * otRate * 100) / 100 : 0
      const daysWorked = isLabor ? new Set(otRecords.map((r) => r.date)).size : undefined
      const dailyWage = struct.dailyWage
      const effectiveBase = isLabor ? (daysWorked ?? 0) * dailyWage : struct.baseSalary
      const experiencePay = struct.experiencePay
      const otherIncome = truckTripFeeForDriver(emp.name, otFrom, otTo, allTickets, created.truckTrips)
      const totalIncome = effectiveBase + experiencePay + otAmount + otherIncome
      const socialSecurity = struct.socialSecurity
      const advance = sumAdvances(created.advances, emp.id, payMonth)
      const totalDeduction = socialSecurity + advance
      const ppNo = nextPpNo(running)
      const pp: PayrollPayment = {
        id: ppNo, ppNo, payMonth, employeeId: emp.id, employeeName: emp.name,
        position: emp.role, department: DEPARTMENT_LABEL[emp.department].th,
        daysWorked: isLabor ? daysWorked : undefined, dailyWage: isLabor ? dailyWage : undefined,
        baseSalary: effectiveBase, experiencePay, specialPay: 0,
        vehiclePay: otAmount, otherIncome, totalIncome,
        socialSecurity, advance, otherDeduction: 0, totalDeduction,
        netAmount: totalIncome - totalDeduction,
        payDate: todayIso(), method: 'โอน', createdAt: new Date().toISOString(),
      }
      addPayrollPayment(pp)
      running.push(pp)
      done++
    }
    alert(`สร้างใบทำจ่ายสำเร็จ ${done} คน · ข้าม (มีอยู่แล้ว) ${employees.length - done} คน · งวด ${fmtMonthFull(payMonth)}`)
    onClose()
  }

  return (
    <Modal open={open} title="บันทึกจ่ายเงินเดือนทุกคน (สำหรับทดสอบ)" onClose={onClose} maxWidth={520}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={run} disabled={pending.length === 0}>{pending.length === 0 ? 'ครบทุกคนแล้ว' : `สร้าง ${pending.length} ใบ`}</Button></>}>
      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--kpc-warning-50, #fffbeb)', border: '1px solid var(--kpc-warning-200, #fde68a)', borderRadius: 8, fontSize: 13, color: 'var(--kpc-warning-ink, #b45309)' }}>
        ⚙️ เครื่องมือสำหรับทดสอบ (เฉพาะ Admin) — สร้างใบทำจ่ายให้พนักงานทุกคนเรียงจาก E001 · คนที่มีใบในงวดนี้แล้วจะถูกข้าม
      </div>
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="งวดเดือน" required>
          <div className="month-primary">
            <Select value={payMonth} onChange={(e) => { const ym = e.target.value; setPayMonth(ym); const [rf, rt] = monthRange(ym); setOtFrom(rf); setOtTo(rt) }}>
              {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthFull(m)}</option>)}
            </Select>
          </div>
        </Field>
        <Field label="จำนวนที่จะสร้าง">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontWeight: 700 }}>{pending.length} / {employees.length} คน</div>
        </Field>
        <Field label="คำนวณ OT ตั้งแต่วันที่" hint="ดึงจากบันทึกลงเวลางาน">
          <Input type="date" value={otFrom} onChange={(e) => setOtFrom(e.target.value)} />
        </Field>
        <Field label="จนถึงวันที่">
          <Input type="date" value={otTo} onChange={(e) => setOtTo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
