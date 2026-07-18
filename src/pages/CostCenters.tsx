import { useMemo } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { useCan } from '../data/auth'
import { useCreatedDocs, useCostCenters, addCostCenter, removeCostCenter, GOODS_PAYMENT_CATEGORIES } from '../data/createdDocs'

interface CostCenterRow {
  name: string
  builtin: boolean
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

  const rows = useMemo<CostCenterRow[]>(() => {
    const builtinSet = new Set(GOODS_PAYMENT_CATEGORIES)
    /* Any category used in the data but not in the merged list (legacy) is surfaced too. */
    const names = [...merged]
    const known = new Set(merged)
    for (const e of created.expenseRecords) if (e.category && !known.has(e.category)) { names.push(e.category); known.add(e.category) }
    for (const g of created.goodsPayments) if (g.category && !known.has(g.category)) { names.push(g.category); known.add(g.category) }

    return names.map((name) => {
      const exp = created.expenseRecords.filter((e) => e.category === name)
      const gp = created.goodsPayments.filter((g) => g.category === name)
      return {
        name,
        builtin: builtinSet.has(name),
        expCount: exp.length,
        expAmount: exp.reduce((s, e) => s + e.amount, 0),
        gpCount: gp.length,
        gpAmount: gp.reduce((s, g) => s + g.amount, 0),
      }
    })
  }, [merged, created.expenseRecords, created.goodsPayments])

  const usedCount = rows.filter((r) => r.expCount + r.gpCount > 0).length
  const customCount = rows.filter((r) => !r.builtin).length

  const addNew = () => {
    const name = window.prompt('ชื่อประเภทบัญชี cost center ใหม่')
    if (name != null) addCostCenter(name)
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
        if (r.builtin) return <span style={{ color: 'var(--kpc-text-faint)', fontSize: 12 }}>—</span>
        const used = r.expCount + r.gpCount > 0
        return used
          ? <span style={{ color: 'var(--kpc-text-faint)', fontSize: 12 }} title="ลบไม่ได้ เพราะมีการใช้งานอยู่">ใช้งานอยู่</span>
          : <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบประเภทบัญชี "${r.name}" ?`)) removeCostCenter(r.name) }} style={{ color: 'var(--kpc-danger)' }}>ลบ</Button>
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
        <KpiCard label="มีการใช้งาน" value={usedCount.toString()} note="ในบันทึกรายจ่าย / ใบสำคัญจ่าย" />
        <KpiCard label="เพิ่มเอง" value={customCount.toString()} note="ผู้ใช้เพิ่มเข้ามา" />
      </div>

      <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ประเภท`} />
    </>
  )
}
