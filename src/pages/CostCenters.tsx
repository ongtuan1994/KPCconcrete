import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Field, Select } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { useCan } from '../data/auth'
import { useCreatedDocs, useCostCenters, addCostCenter, removeCostCenter, renameCostCenter, GOODS_PAYMENT_CATEGORIES } from '../data/createdDocs'

const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const _now = new Date()
const CUR_MONTH = _now.getMonth() + 1
const CUR_YEAR_BE = _now.getFullYear() + 543

interface CostCenterRow {
  name: string
  builtin: boolean
  /** Used in any period (all-time) — drives the delete guard so period filtering
      can't allow deleting a center still referenced in another month. */
  usedTotal: boolean
  expCount: number
  expAmount: number
  gpCount: number
  gpAmount: number
}

/** ประเภทบัญชี cost center — the master list of expense account types, with how each
    is used across บันทึกรายจ่าย and ใบสำคัญจ่าย. New ones can be added here or inline
    from either form. */
export function CostCenters() {
  const created = useCreatedDocs()
  const merged = useCostCenters()
  const canEdit = useCan('expense-records').edit
  /* ช่วงเวลา — ยอดในตารางนับเฉพาะช่วงที่เลือก (ค่าเริ่มต้น = เดือนปัจจุบัน). */
  const [pYear, setPYear] = useState<number>(CUR_YEAR_BE)
  const [pMonth, setPMonth] = useState<number | 'all'>(CUR_MONTH)

  /* ปี (พ.ศ.) ที่เลือกได้ — จากวันที่ในข้อมูล + ปีปัจจุบัน + ปีที่เลือกอยู่. */
  const years = useMemo(() => {
    const s = new Set<number>([CUR_YEAR_BE, pYear])
    for (const e of created.expenseRecords) { const y = Number(e.date.slice(0, 4)); if (y) s.add(y + 543) }
    for (const g of created.goodsPayments) { const y = Number(g.payDate.slice(0, 4)); if (y) s.add(y + 543) }
    return [...s].sort((a, b) => b - a)
  }, [created.expenseRecords, created.goodsPayments, pYear])

  const rows = useMemo<CostCenterRow[]>(() => {
    const builtinSet = new Set(GOODS_PAYMENT_CATEGORIES)
    /* Any category used in the data but not in the merged list (legacy) is surfaced too. */
    const names = [...merged]
    const known = new Set(merged)
    for (const e of created.expenseRecords) if (e.category && !known.has(e.category)) { names.push(e.category); known.add(e.category) }
    for (const g of created.goodsPayments) if (g.category && !known.has(g.category)) { names.push(g.category); known.add(g.category) }

    /* iso = yyyy-mm-dd; match the selected พ.ศ. year (+ month unless ทั้งปี). */
    const inPeriod = (iso: string) => {
      if (!iso) return false
      if (Number(iso.slice(0, 4)) + 543 !== pYear) return false
      return pMonth === 'all' || Number(iso.slice(5, 7)) === pMonth
    }

    return names.map((name) => {
      const expAll = created.expenseRecords.filter((e) => e.category === name)
      const gpAll = created.goodsPayments.filter((g) => g.category === name)
      const exp = expAll.filter((e) => inPeriod(e.date))
      const gp = gpAll.filter((g) => inPeriod(g.payDate))
      return {
        name,
        builtin: builtinSet.has(name),
        usedTotal: expAll.length + gpAll.length > 0,
        expCount: exp.length,
        expAmount: exp.reduce((s, e) => s + e.amount, 0),
        gpCount: gp.length,
        gpAmount: gp.reduce((s, g) => s + g.amount, 0),
      }
    })
  }, [merged, created.expenseRecords, created.goodsPayments, pYear, pMonth])

  const usedCount = rows.filter((r) => r.expCount + r.gpCount > 0).length
  const customCount = rows.filter((r) => !r.builtin).length

  const addNew = () => {
    const name = window.prompt('ชื่อประเภทบัญชี cost center ใหม่')
    if (name != null) addCostCenter(name)
  }

  /* Rename a (non-built-in) cost center — cascades onto records that use it. */
  const editName = (r: CostCenterRow) => {
    const next = window.prompt(`เปลี่ยนชื่อประเภทบัญชี "${r.name}"`, r.name)
    if (next == null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === r.name) return
    const ok = renameCostCenter(r.name, trimmed)
    if (!ok) alert('เปลี่ยนชื่อไม่สำเร็จ — ชื่ออาจซ้ำกับที่มีอยู่แล้ว หรือเป็นประเภทค่าเริ่มต้นที่แก้ไขไม่ได้')
  }

  const columns: Column<CostCenterRow>[] = [
    { key: 'name', header: 'ประเภทบัญชี cost center', cell: (r) => <span style={{ fontWeight: 500, color: 'var(--kpc-text-strong)' }}>{r.name}</span> },
    {
      key: 'kind', header: 'ประเภท', align: 'center',
      cell: (r) => r.builtin
        ? <Badge tone="info" pip={false} square>ค่าเริ่มต้น</Badge>
        : <Badge tone="success" pip={false} square>เพิ่มเอง</Badge>,
    },
    {
      key: 'exp', header: 'บันทึกรายจ่าย', align: 'right',
      cell: (r) => r.expCount
        ? <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}><span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.expAmount)}</span><span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{r.expCount} รายการ</span></div>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
    },
    {
      key: 'gp', header: 'ใบสำคัญจ่าย', align: 'right',
      cell: (r) => r.gpCount
        ? <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}><span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.gpAmount)}</span><span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{r.gpCount} ใบ</span></div>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
    },
    ...(canEdit ? [{
      key: 'act', header: '', align: 'center' as const,
      cell: (r: CostCenterRow) => {
        /* Built-ins (ค่าเริ่มต้น) are code defaults tied to app logic — not editable. */
        if (r.builtin) return <span style={{ color: 'var(--kpc-text-faint)', fontSize: 12 }}>ค่าเริ่มต้น</span>
        /* Delete guard uses all-time usage, not the selected period. */
        const used = r.usedTotal
        return (
          <div className="row" style={{ gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
            <Button variant="ghost" size="sm" onClick={() => editName(r)}>แก้ไข</Button>
            {used
              ? <span style={{ color: 'var(--kpc-text-faint)', fontSize: 12 }} title="ลบไม่ได้เพราะมีการใช้งานอยู่ — กด “แก้ไข” เพื่อเปลี่ยนชื่อแทน (จะเปลี่ยนทุกรายการที่ใช้ให้)">ใช้งานอยู่</span>
              : <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบประเภทบัญชี "${r.name}" ?`)) removeCostCenter(r.name) }} style={{ color: 'var(--kpc-danger)' }}>ลบ</Button>}
          </div>
        )
      },
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ประเภทบัญชี cost center"
        sub={`Cost Centers · ${rows.length} ประเภท`}
        actions={canEdit ? <Button variant="primary" onClick={addNew}><IconPlus /> เพิ่มประเภทบัญชี</Button> : undefined}
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ประเภทบัญชีทั้งหมด" value={rows.length.toString()} note="ค่าเริ่มต้น + เพิ่มเอง" />
        <KpiCard label="มีการใช้งาน" value={usedCount.toString()} note="ในช่วงที่เลือก" />
        <KpiCard label="เพิ่มเอง" value={customCount.toString()} note="ผู้ใช้เพิ่มเข้ามา" />
      </div>

      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
        <Field label="ปี (พ.ศ.)" style={{ width: 120 }}>
          <Select value={String(pYear)} onChange={(e) => setPYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="เดือน" style={{ width: 150 }}>
          <Select value={String(pMonth)} onChange={(e) => setPMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">ทั้งปี</option>
            {MONTH_TH.map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
          </Select>
        </Field>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ยอดบันทึกรายจ่าย / ใบสำคัญจ่าย นับเฉพาะช่วงที่เลือก</span>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ประเภท`} />
    </>
  )
}
