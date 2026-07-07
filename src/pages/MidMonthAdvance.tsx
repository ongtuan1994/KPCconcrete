import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Card, Field, Input, Select } from '../components/ui'
import { DocModal } from '../components/documents/DocModal'
import { MidMonthAdvanceReportDoc } from '../components/documents/MidMonthAdvanceReportDoc'
import { EMPLOYEES, type Employee } from '../data/employees'
import { salaryStructureFor } from '../data/salaryStructure'
import { monthLabel } from '../data/selectors'
import { bahtText } from '../data/bahtText'
import {
  addGeneralReport,
  addAdvance,
  useCreatedDocs,
  type AdvancePayment,
  type MidMonthAdvanceReport,
  type MidMonthAdvanceRow,
  type MidMonthAdvanceSection,
} from '../data/createdDocs'

function pad2(n: number) { return String(n).padStart(2, '0') }
const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => i + 1)
const CURRENT_MONTH = new Date().getMonth() + 1
/** เบิกกลางเดือน — ปกติจ่ายกลางเดือน (วันที่ 15). */
const DEFAULT_DAY = 15
/** ค่าเริ่มต้นเบิกของคนงานพม่าโรงหล่อ (prefill, แก้ไขได้). */
const FOUNDRY_DEFAULT_AMOUNT = 3000
/** เพดานเบิกล่วงหน้าของแรงงานรายวัน — คนอื่นเพดาน = เงินเดือนของตัวเอง
    (ตรงกับกติกาในหน้าจ่ายเงินเดือน). */
const LABOR_ADVANCE_CAP = 3000
/** งวดในระบบใช้ปี ค.ศ. (Gregorian); ข้อมูลบริษัทเป็น พ.ศ. 2569 = ค.ศ. 2026.
    payMonth ("YYYY-MM") ต้องตรงกับที่หน้าจ่ายเงินเดือนใช้หักเบิกล่วงหน้า. */
const CE_YEAR = 2569 - 543
/** ป้ายกำกับใน note ของเบิกล่วงหน้าที่หน้านี้สร้างให้ — ใช้แยกออกจากเบิกล่วงหน้า
    ที่กรอกมือ และใช้ลบ/สร้างใหม่แบบ idempotent เมื่อออกรายงานงวดเดิมซ้ำ. */
const MID_MONTH_ADV_TAG = 'เบิกกลางเดือน'

/** Order plant staff like the printed sheet: หัวหน้าจัดส่ง → พนักงานจัดส่ง →
    ฝ่ายผลิต → บัญชี, then by id within each. */
const DEPT_RANK: Record<string, number> = { transport: 0, production: 1, accounting: 2, manager: 3, labor: 4, intern: 5 }

/** Short label for the "พนักงาน" column — a sensible default the user can edit. */
function shortRole(e: Employee): string {
  switch (e.department) {
    case 'transport': return e.role.includes('หัวหน้า') ? 'หัวหน้า พจส.' : 'พจส.'
    case 'production': return 'ผลิต'
    case 'accounting': return 'บัญชี/การเงิน'
    case 'manager': return 'ผู้จัดการ'
    case 'labor': return 'คนงาน'
    default: return e.role
  }
}

function sortPlant(a: Employee, b: Employee): number {
  const ra = DEPT_RANK[a.department] ?? 9
  const rb = DEPT_RANK[b.department] ?? 9
  if (ra !== rb) return ra - rb
  /* Head of transport comes before the rest of the drivers. */
  const ha = a.role.includes('หัวหน้า') ? 0 : 1
  const hb = b.role.includes('หัวหน้า') ? 0 : 1
  if (ha !== hb) return ha - hb
  return a.id.localeCompare(b.id)
}

/** Members of each sheet, derived from the roster:
    - แพล้นปูน: Thai plant staff (interns excluded)
    - โรงหล่อ (คนไทย): Thai foundry staff
    - โรงหล่อ (คนงานพม่า): Burmese foundry workers */
const PLANT_EMPS = EMPLOYEES.filter((e) => e.site === 'plant' && e.nationality === 'ไทย' && e.department !== 'intern').sort(sortPlant)
const FOUNDRY_TH_EMPS = EMPLOYEES.filter((e) => e.site === 'foundry' && e.nationality === 'ไทย').sort(sortPlant)
const FOUNDRY_MM_EMPS = EMPLOYEES.filter((e) => e.site === 'foundry' && e.nationality === 'พม่า').sort((a, b) => a.id.localeCompare(b.id))

interface Draft { employeeId: string; name: string; nickname?: string; role: string; amount: string }

const buildDrafts = (emps: Employee[], defaultAmount: string): Draft[] =>
  emps.map((e) => ({ employeeId: e.id, name: e.name, nickname: e.nickname, role: shortRole(e), amount: defaultAmount }))

const sumAmount = (rows: Draft[]) => rows.reduce((s, r) => s + (Math.max(0, Number(r.amount) || 0)), 0)

const money2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Editable group table (one work group). `already` returns how much each
    employee has ALREADY been advanced this งวด — shown red + read-only to warn
    about a duplicate withdrawal. */
function GroupTable({
  heading,
  rows,
  onChange,
  amountHint,
  already,
  remaining,
}: {
  heading: string
  rows: Draft[]
  onChange: (rows: Draft[]) => void
  amountHint?: string
  already: (employeeId: string) => number
  remaining: (employeeId: string) => number
}) {
  const total = sumAmount(rows)
  const totalAlready = rows.reduce((s, r) => s + already(r.employeeId), 0)
  const set = (i: number, patch: Partial<Draft>) => {
    const next = [...rows]; next[i] = { ...rows[i], ...patch }; onChange(next)
  }
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <strong style={{ fontSize: 15 }}>{heading}</strong>
        {amountHint && <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{amountHint}</span>}
      </div>
      <table className="data" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--kpc-text-muted)', fontSize: 12.5 }}>
            <th style={{ padding: '6px 8px', width: 32 }}>#</th>
            <th style={{ padding: '6px 8px' }}>ชื่อ-สกุล</th>
            <th style={{ padding: '6px 8px', width: 80 }}>ชื่อเล่น</th>
            <th style={{ padding: '6px 8px', width: 140 }}>พนักงาน</th>
            <th style={{ padding: '6px 8px', width: 130, textAlign: 'right' }}>เบิกไปแล้ว (งวดนี้)</th>
            <th style={{ padding: '6px 8px', width: 130, textAlign: 'right' }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = already(r.employeeId)
            const rem = remaining(r.employeeId)
            const entered = Math.max(0, Number(r.amount) || 0)
            const over = entered > rem
            return (
              <tr key={r.employeeId} style={{ borderTop: '1px solid var(--kpc-border)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--kpc-text-muted)' }}>{i + 1}</td>
                <td style={{ padding: '6px 8px' }}>{r.name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--kpc-text-muted)' }}>{r.nickname || '—'}</td>
                <td style={{ padding: '6px 8px' }}>
                  <Input value={r.role} onChange={(e) => set(i, { role: e.target.value })} />
                </td>
                <td
                  className="mono"
                  style={{ padding: '6px 8px', textAlign: 'right', color: prev > 0 ? 'var(--kpc-danger)' : 'var(--kpc-text-faint)', fontWeight: prev > 0 ? 700 : 400 }}
                  title={prev > 0 ? 'มีการเบิกในงวดนี้ไปแล้ว — ระวังเบิกซ้ำ' : undefined}
                >
                  {prev > 0 ? money2(prev) : '—'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Input
                    type="number" step="100" min={0} placeholder="0"
                    style={{ textAlign: 'right', ...(over ? { borderColor: 'var(--kpc-danger)' } : {}) }}
                    value={r.amount}
                    onChange={(e) => set(i, { amount: e.target.value })}
                  />
                  <div style={{ fontSize: 11, marginTop: 3, textAlign: 'right', color: over ? 'var(--kpc-danger)' : 'var(--kpc-text-faint)' }}>
                    {over ? `⚠ เกินเพดาน — เบิกได้อีก ${money2(rem)}` : `เบิกได้อีก ${money2(rem)}`}
                  </div>
                </td>
              </tr>
            )
          })}
          <tr style={{ borderTop: '2px solid var(--kpc-border)', fontWeight: 700 }}>
            <td colSpan={4} style={{ padding: '8px', textAlign: 'right' }}>รวมเงินที่เบิก</td>
            <td className="mono" style={{ padding: '8px', textAlign: 'right', color: totalAlready > 0 ? 'var(--kpc-danger)' : 'var(--kpc-text-faint)' }}>
              {totalAlready > 0 ? money2(totalAlready) : '—'}
            </td>
            <td className="mono" style={{ padding: '8px', textAlign: 'right' }}>{money2(total)}</td>
          </tr>
        </tbody>
      </table>
      {total > 0 && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--kpc-text-muted)' }}>({bahtText(total)})</div>
      )}
    </Card>
  )
}

export function MidMonthAdvance() {
  const navigate = useNavigate()
  const created = useCreatedDocs()
  const [month, setMonth] = useState<number>(CURRENT_MONTH)
  const [day, setDay] = useState<string>(String(DEFAULT_DAY))
  const [plant, setPlant] = useState<Draft[]>(() => buildDrafts(PLANT_EMPS, ''))
  const [foundryTh, setFoundryTh] = useState<Draft[]>(() => buildDrafts(FOUNDRY_TH_EMPS, ''))
  const [foundry, setFoundry] = useState<Draft[]>(() => buildDrafts(FOUNDRY_MM_EMPS, String(FOUNDRY_DEFAULT_AMOUNT)))
  const [err, setErr] = useState<string>('')
  const [preview, setPreview] = useState<MidMonthAdvanceReport | null>(null)
  const [savedId, setSavedId] = useState<string>('')

  const grandTotal = useMemo(() => sumAmount(plant) + sumAmount(foundryTh) + sumAmount(foundry), [plant, foundryTh, foundry])

  /* How much each employee has ALREADY been advanced for the selected งวด — from
     any source (manual เบิกล่วงหน้า + every เบิกกลางเดือน batch saved so far).
     Shown red + read-only per row, and drives the remaining-limit guard so an
     employee who already hit their ceiling cannot withdraw again. */
  const payMonth = `${CE_YEAR}-${pad2(month)}`
  const alreadyByEmp = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of created.advances) {
      if (a.payMonth !== payMonth) continue
      m[a.employeeId] = (m[a.employeeId] ?? 0) + a.amount
    }
    return m
  }, [created.advances, payMonth])
  const already = (employeeId: string) => alreadyByEmp[employeeId] ?? 0

  /* Advance ceiling per employee (same rule as payroll): แรงงานรายวัน = 3,000,
     คนอื่น = เงินเดือนของตัวเอง. What can still be withdrawn this งวด =
     เพดาน − เบิกไปแล้ว. */
  const limitFor = (employeeId: string) => {
    const emp = EMPLOYEES.find((e) => e.id === employeeId)
    const st = salaryStructureFor(employeeId, created.salaryStructures)
    const isLabor = emp?.department === 'labor' || st.dailyWage > 0
    return isLabor ? LABOR_ADVANCE_CAP : st.baseSalary
  }
  const remaining = (employeeId: string) => Math.max(0, limitFor(employeeId) - already(employeeId))

  const buildSection = (key: MidMonthAdvanceSection['key'], heading: string, drafts: Draft[], date: string): MidMonthAdvanceSection => {
    const rows: MidMonthAdvanceRow[] = drafts.map((d) => ({
      employeeId: d.employeeId,
      date,
      name: d.name,
      nickname: d.nickname,
      role: d.role.trim(),
      amount: Math.max(0, Number(d.amount) || 0),
    }))
    return { key, heading, rows, total: rows.reduce((s, r) => s + r.amount, 0) }
  }

  const save = () => {
    setErr('')
    const dnum = parseInt(day, 10)
    if (!dnum || dnum < 1 || dnum > 31) return setErr('กรุณาระบุวันที่เบิก (1–31)')
    if (grandTotal <= 0) return setErr('กรุณากรอกจำนวนเงินที่เบิกอย่างน้อย 1 รายการ')

    /* Block any withdrawal that pushes an employee over their advance ceiling
       for this งวด (เพดาน − เบิกไปแล้ว). */
    const over = [...plant, ...foundryTh, ...foundry]
      .map((r) => ({ r, entered: Math.max(0, Number(r.amount) || 0), rem: remaining(r.employeeId) }))
      .filter((x) => x.entered > x.rem)
    if (over.length > 0) {
      const names = over.map((x) => `${x.r.name} (เบิกได้อีก ${money2(x.rem)})`).join(', ')
      return setErr(`มีรายการเกินเพดานการเบิก: ${names} — กรุณาแก้ไขก่อนบันทึก`)
    }

    const date = `${pad2(dnum)}/${pad2(month)}/69`
    const dateLabel = `${pad2(dnum)}/${pad2(month)}/2569`
    /* Skip a work group that nobody withdrew from — no blank sheet of paper. */
    const sections = [
      buildSection('plant', 'เงินเบิกกลางเดือนแพล้นปูน', plant, date),
      buildSection('foundry-thai', 'เบิกเงินกลางเดือนโรงหล่อ(คนไทย)', foundryTh, date),
      buildSection('foundry', 'เบิกเงินกลางเดือนโรงหล่อ(คนงานพม่า)', foundry, date),
    ].filter((sec) => sec.total > 0)
    const report: MidMonthAdvanceReport = {
      id: `MMA-${pad2(month)}-${Date.now()}`,
      kind: 'mid-month-advance',
      title: `เบิกเงินกลางเดือน ${monthLabel(month)}`,
      fromLabel: dateLabel,
      toLabel: dateLabel,
      monthLabel: monthLabel(month),
      sections,
      totals: { amount: sections.reduce((s, sec) => s + sec.total, 0) },
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)

    /* Link to payroll: record each withdrawal as an เบิกล่วงหน้า (AdvancePayment)
       for this งวด so it is auto-deducted from that month's salary — no re-keying.
       These ADD to any existing advances (they are not replaced), so the amount
       counts toward the employee's ceiling and blocks a further over-limit เบิก. */
    const isoDate = `${CE_YEAR}-${pad2(month)}-${pad2(dnum)}`
    let maxNo = created.advances.reduce((m, a) => {
      const g = /^ADV(\d+)$/.exec(a.advNo)
      return g ? Math.max(m, parseInt(g[1], 10)) : m
    }, 0)
    for (const sec of sections) {
      for (const r of sec.rows) {
        if (r.amount <= 0) continue
        maxNo += 1
        const advNo = `ADV${String(maxNo).padStart(5, '0')}`
        const adv: AdvancePayment = {
          id: advNo,
          advNo,
          date: isoDate,
          payMonth,
          employeeId: r.employeeId,
          employeeName: r.name,
          amount: r.amount,
          method: 'เงินสดย่อย',
          note: `${MID_MONTH_ADV_TAG} ${monthLabel(month)}`,
          createdAt: new Date().toISOString(),
        }
        addAdvance(adv)
      }
    }

    /* Clear the amount inputs so the recorded withdrawal isn't accidentally
       submitted again — the "เบิกไปแล้ว" column now reflects it. */
    setPlant((rs) => rs.map((r) => ({ ...r, amount: '' })))
    setFoundryTh((rs) => rs.map((r) => ({ ...r, amount: '' })))
    setFoundry((rs) => rs.map((r) => ({ ...r, amount: '' })))

    setSavedId(report.id)
    setPreview(report)
  }

  return (
    <>
      <PageHeader
        title="เบิกเงินกลางเดือน"
        sub="Mid-Month Salary Advance · สร้างใบเบิกเงินกลางเดือน + บันทึกเป็นเบิกล่วงหน้าให้อัตโนมัติ"
        actions={
          <Button variant="secondary" onClick={() => navigate('/advances')}>
            ประวัติเบิกล่วงหน้า
          </Button>
        }
      />

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: 'var(--kpc-text-muted)', borderLeft: '3px solid var(--kpc-primary)' }}>
        เงินที่เบิกในหน้านี้จะถูกบันทึกเป็น <strong>“เบิกล่วงหน้า”</strong> ของงวดที่เลือกให้อัตโนมัติ
        และจะถูก <strong>หักคืนตอนทำจ่ายเงินเดือนปลายเดือน</strong> — จึงไม่ต้องไปกรอกซ้ำที่เมนูเบิกล่วงหน้า
        · ยอดที่เบิกแล้วจะขึ้นในช่อง <strong style={{ color: 'var(--kpc-danger)' }}>“เบิกไปแล้ว (งวดนี้)”</strong> สีแดง
        และเบิกเพิ่มได้ไม่เกินเพดานของแต่ละคน
      </div>

      {savedId && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13.5, color: 'var(--kpc-primary-ink)' }}>
            ✓ บันทึกรายงาน + เบิกล่วงหน้าแล้ว — เปิดดู/พิมพ์จาก “รายงานทั่วไป” และตรวจการหักได้ที่ “เบิกล่วงหน้า”
          </span>
          <Button variant="tonal" size="sm" onClick={() => navigate('/general-reports')}>ไปหน้ารายงานทั่วไป</Button>
        </div>
      )}

      <Card>
        <div className="grid g-2">
          <Field label="งวด (เดือน)" required>
            <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_OPTS.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </Select>
          </Field>
          <Field label="วันที่เบิก" required hint="ค่าเริ่มต้น = วันที่ 15 (กลางเดือน)">
            <Input type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <GroupTable
          heading="เงินเบิกกลางเดือนแพล้นปูน (คนไทย)"
          rows={plant}
          onChange={setPlant}
          already={already}
          remaining={remaining}
          amountHint="กรอกจำนวนเงินของแต่ละคน (เว้นว่าง = ไม่เบิก)"
        />
        <GroupTable
          heading="เบิกเงินกลางเดือนโรงหล่อ (คนไทย)"
          rows={foundryTh}
          onChange={setFoundryTh}
          already={already}
          remaining={remaining}
          amountHint="กรอกจำนวนเงินของแต่ละคน (เว้นว่าง = ไม่เบิก)"
        />
        <GroupTable
          heading="เบิกเงินกลางเดือนโรงหล่อ (คนงานพม่า)"
          rows={foundry}
          onChange={setFoundry}
          already={already}
          remaining={remaining}
          amountHint={`ตั้งค่าเริ่มต้น ${FOUNDRY_DEFAULT_AMOUNT.toLocaleString()} บาท/คน — แก้ไขได้`}
        />
      </div>

      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginTop: 14 }}>{err}</div>}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 14 }}>
          รวมทั้งสิ้น <strong className="mono" style={{ fontSize: 16, color: 'var(--kpc-primary-ink)' }}>
            {grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong> บาท
        </span>
        <Button variant="primary" onClick={save}>บันทึก &amp; ดูรายงาน</Button>
      </div>

      <DocModal
        open={!!preview}
        title={preview?.title ?? ''}
        onClose={() => setPreview(null)}
        maxWidth={820}
      >
        {preview && <MidMonthAdvanceReportDoc report={preview} />}
      </DocModal>
    </>
  )
}
