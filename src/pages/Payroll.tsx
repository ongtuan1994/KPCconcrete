import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { EMPLOYEES } from '../data/employees'
import {
  useCreatedDocs, addPayrollPayment, removePayrollPayment, CAN_DELETE,
  type PayrollPayment, type PayMethodOut,
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

export function Payroll() {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const created = useCreatedDocs()
  const all = created.payrollPayments

  const rows = useMemo(
    () =>
      all.filter((p) => {
        if (!query) return true
        return `${p.ppNo} ${p.employeeName} ${fmtMonth(p.payMonth)} ${p.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
      }),
    [all, query],
  )

  const totalNet = all.reduce((s, p) => s + p.netAmount, 0)

  const exportExcel = () => {
    const head = ['เลขที่', 'งวดเดือน', 'พนักงาน', 'เงินเดือน', 'เพิ่ม', 'หัก', 'จ่ายสุทธิ', 'วันที่จ่าย', 'วิธีจ่าย', 'หมายเหตุ']
    const body = rows.map((p) => [
      p.ppNo, fmtMonth(p.payMonth), p.employeeName, p.baseSalary, p.additions, p.deductions, p.netAmount,
      fmtDate(p.payDate), p.method, p.note ?? '',
    ])
    downloadCsv('payroll', [head, ...body])
  }

  const columns: Column<PayrollPayment>[] = [
    { key: 'no', header: 'เลขที่', cell: (r) => <span className="mono">{r.ppNo}</span>, className: 'docno' },
    { key: 'month', header: 'งวดเดือน', cell: (r) => fmtMonth(r.payMonth) },
    { key: 'emp', header: 'พนักงาน', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.employeeName}</span> },
    { key: 'base', header: 'เงินเดือน', align: 'right', cell: (r) => <span className="mono">{baht(r.baseSalary)}</span> },
    { key: 'add', header: 'เพิ่ม', align: 'right', cell: (r) => (r.additions ? <span className="mono" style={{ color: 'var(--kpc-success-ink, #15803d)' }}>+{baht(r.additions)}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'ded', header: 'หัก', align: 'right', cell: (r) => (r.deductions ? <span className="mono" style={{ color: 'var(--kpc-danger-ink)' }}>-{baht(r.deductions)}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'net', header: 'จ่ายสุทธิ', align: 'right', cell: (r) => <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.netAmount)}</span> },
    { key: 'date', header: 'วันที่จ่าย', cell: (r) => fmtDate(r.payDate), className: 'date' },
    { key: 'method', header: 'วิธีจ่าย', align: 'center', cell: (r) => <Badge tone={METHOD_TONE[r.method]} pip={false} square>{r.method}</Badge> },
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
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> บันทึกจ่ายเงินเดือน</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบทำจ่าย · Vouchers" value={all.length.toString()} note="ใบ" />
        <KpiCard label="จ่ายสุทธิรวม · Net paid" value={baht(totalNet)} note="ทุกงวด" invert />
        <KpiCard label="พนักงาน · Employees" value={new Set(all.map((p) => p.employeeId)).size.toString()} note="รายที่จ่ายแล้ว" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
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

      <NewPayrollForm open={showForm} onClose={() => setShowForm(false)} existing={all} onSaved={(p) => { setShowForm(false); setQuery(p.employeeName) }} />
    </>
  )
}

function NewPayrollForm({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing: PayrollPayment[]; onSaved: (p: PayrollPayment) => void }) {
  const created = useCreatedDocs()
  const employees = useMemo(() => [...created.employeesAdded, ...EMPLOYEES], [created.employeesAdded])

  const [payMonth, setPayMonth] = useState(thisMonth())
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '')
  const [baseSalary, setBaseSalary] = useState('')
  const [additions, setAdditions] = useState('')
  const [deductions, setDeductions] = useState('')
  const [payDate, setPayDate] = useState(todayIso())
  const [method, setMethod] = useState<PayMethodOut>('โอน')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const ppNo = useMemo(() => nextPpNo(existing), [existing, open])

  useEffect(() => {
    if (!open) return
    setPayMonth(thisMonth()); setEmployeeId(employees[0]?.id ?? '')
    setBaseSalary(''); setAdditions(''); setDeductions(''); setPayDate(todayIso()); setMethod('โอน'); setNote(''); setErr('')
  }, [open])

  const net = (Number(baseSalary) || 0) + (Number(additions) || 0) - (Number(deductions) || 0)

  const submit = () => {
    setErr('')
    const emp = employees.find((e) => e.id === employeeId)
    if (!emp) return setErr('กรุณาเลือกพนักงาน')
    if (!payMonth) return setErr('กรุณาเลือกงวดเดือน')
    const base = Number(baseSalary)
    if (!base || base <= 0) return setErr('กรุณาระบุเงินเดือน (มากกว่า 0)')
    if (net < 0) return setErr('ยอดจ่ายสุทธิติดลบ — ตรวจสอบรายการหัก')

    const pp: PayrollPayment = {
      id: ppNo, ppNo, payMonth, employeeId: emp.id, employeeName: emp.name,
      baseSalary: base, additions: Number(additions) || 0, deductions: Number(deductions) || 0, netAmount: net,
      payDate, method, note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addPayrollPayment(pp)
    onSaved(pp)
  }

  return (
    <Modal open={open} title="บันทึกใบทำจ่ายเงินเดือน" onClose={onClose} maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่" hint="ระบบออกเลขให้อัตโนมัติ">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>{ppNo}</div>
        </Field>
        <Field label="งวดเดือน" required>
          <Input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} />
        </Field>
        <Field label="พนักงาน" required style={{ gridColumn: '1 / -1' }}>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.nickname ? ` (${e.nickname})` : ''} — {e.role}</option>)}
          </Select>
        </Field>
        <Field label="เงินเดือน (บาท)" required>
          <Input type="number" step="0.01" min={0} placeholder="เช่น 15000" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
        </Field>
        <Field label="รายการเพิ่ม (OT/โบนัส)" hint="ไม่บังคับ">
          <Input type="number" step="0.01" min={0} placeholder="0" value={additions} onChange={(e) => setAdditions(e.target.value)} />
        </Field>
        <Field label="รายการหัก (ปกส./เบิกล่วงหน้า)" hint="ไม่บังคับ">
          <Input type="number" step="0.01" min={0} placeholder="0" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
        </Field>
        <Field label="จ่ายสุทธิ" hint="คำนวณอัตโนมัติ = เงินเดือน + เพิ่ม − หัก">
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontWeight: 700, color: net < 0 ? 'var(--kpc-danger)' : 'var(--kpc-text-strong)' }}>{baht(net)}</div>
        </Field>
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
