import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Field, Input, Select } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { baht } from '../data/selectors'
import { useCan } from '../data/auth'
import { useCreatedDocs, useCostCenters, addCostCenter, removeCostCenter, renameCostCenter, setCostCenterParent, costCenterLabel, GOODS_PAYMENT_CATEGORIES } from '../data/createdDocs'

const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const _now = new Date()
const CUR_MONTH = _now.getMonth() + 1
const CUR_YEAR_BE = _now.getFullYear() + 543

interface CostCenterRow {
  name: string          /* underlying value (records store this) */
  label: string         /* display name — alias if renamed, else = name */
  builtin: boolean
  /** Used in any period (all-time) — drives the delete guard so period filtering
      can't allow deleting a center still referenced in another month. */
  usedTotal: boolean
  expCount: number
  expAmount: number
  gpCount: number
  gpAmount: number
}
/** A row placed in the group tree — `depth` = nesting level, `parent` = its group value. */
type TreeRow = CostCenterRow & { depth: number; parent?: string }

/** ประเภทบัญชี cost center — the master list of expense account types, how each is used
    across บันทึกรายจ่าย / ใบสำคัญจ่าย, and their group (subgroup) hierarchy. */
export function CostCenters() {
  const created = useCreatedDocs()
  const merged = useCostCenters()
  const canEdit = useCan('expense-records').edit
  const parents = created.costCenterParents
  const labels = created.costCenterLabels
  /* ช่วงเวลา — ยอดในตารางนับเฉพาะช่วงที่เลือก (ค่าเริ่มต้น = เดือนปัจจุบัน). */
  const [pYear, setPYear] = useState<number>(CUR_YEAR_BE)
  const [pMonth, setPMonth] = useState<number | 'all'>(CUR_MONTH)
  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow] = useState<CostCenterRow | null>(null)

  /* ปี (พ.ศ.) ที่เลือกได้ — จากวันที่ในข้อมูล + ปีปัจจุบัน + ปีที่เลือกอยู่. */
  const years = useMemo(() => {
    const s = new Set<number>([CUR_YEAR_BE, pYear])
    for (const e of created.expenseRecords) { const y = Number(e.date.slice(0, 4)); if (y) s.add(y + 543) }
    for (const g of created.goodsPayments) { const y = Number(g.payDate.slice(0, 4)); if (y) s.add(y + 543) }
    return [...s].sort((a, b) => b - a)
  }, [created.expenseRecords, created.goodsPayments, pYear])

  const rows = useMemo<CostCenterRow[]>(() => {
    const builtinSet = new Set(GOODS_PAYMENT_CATEGORIES)
    const hidden = new Set(created.costCentersHidden)
    /* Any category used in the data but not in the merged list (legacy) is surfaced too,
       except ones the user has hidden (deleted built-ins). */
    const names = [...merged]
    const known = new Set(merged)
    for (const e of created.expenseRecords) if (e.category && !known.has(e.category) && !hidden.has(e.category)) { names.push(e.category); known.add(e.category) }
    for (const g of created.goodsPayments) if (g.category && !known.has(g.category) && !hidden.has(g.category)) { names.push(g.category); known.add(g.category) }

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
        label: costCenterLabel(name, labels),
        builtin: builtinSet.has(name),
        usedTotal: expAll.length + gpAll.length > 0,
        expCount: exp.length,
        expAmount: exp.reduce((s, e) => s + e.amount, 0),
        gpCount: gp.length,
        gpAmount: gp.reduce((s, g) => s + g.amount, 0),
      }
    })
  }, [merged, labels, created.expenseRecords, created.goodsPayments, created.costCentersHidden, pYear, pMonth])

  /* Order rows as a tree: each center followed by its children (indented). A parent
     that isn't a known row is treated as top-level (so links never hide a row). */
  const treeRows = useMemo<TreeRow[]>(() => {
    const byName = new Map(rows.map((r) => [r.name, r]))
    const parentOf = (name: string) => { const p = parents[name]; return p && byName.has(p) ? p : undefined }
    const childrenOf = (name?: string) => rows.filter((r) => parentOf(r.name) === name).map((r) => r.name)
    const ordered: TreeRow[] = []
    const seen = new Set<string>()
    const visit = (name: string, depth: number) => {
      if (seen.has(name)) return
      seen.add(name)
      const r = byName.get(name); if (!r) return
      ordered.push({ ...r, depth, parent: parentOf(name) })
      for (const c of childrenOf(name)) visit(c, depth + 1)
    }
    for (const r of rows) if (!parentOf(r.name)) visit(r.name, 0)
    for (const r of rows) if (!seen.has(r.name)) { ordered.push({ ...r, depth: 0, parent: parentOf(r.name) }); seen.add(r.name) }
    return ordered
  }, [rows, parents])

  const usedCount = rows.filter((r) => r.expCount + r.gpCount > 0).length
  const groupedCount = treeRows.filter((r) => r.parent).length

  const openAdd = () => { setEditRow(null); setFormOpen(true) }
  const openEdit = (r: CostCenterRow) => { setEditRow(r); setFormOpen(true) }
  const del = (r: CostCenterRow) => {
    const msg = r.builtin
      ? `ลบประเภทบัญชีเริ่มต้น "${r.label}" ?\n(รายการเดิมยังอยู่ · เพิ่มกลับได้ภายหลังด้วยชื่อเดิม)`
      : `ลบประเภทบัญชี "${r.label}" ?`
    if (confirm(msg)) removeCostCenter(r.name)
  }

  const columns: Column<TreeRow>[] = [
    {
      key: 'name', header: 'ประเภทบัญชี cost center',
      cell: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: r.depth * 18, fontWeight: r.depth === 0 ? 600 : 500, color: 'var(--kpc-text-strong)' }}>
          {r.depth > 0 && <span style={{ color: 'var(--kpc-text-faint)', marginRight: 6 }}>└</span>}
          {r.label}
        </span>
      ),
    },
    {
      key: 'group', header: 'กลุ่ม (ภายใต้)',
      cell: (r) => r.parent
        ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{costCenterLabel(r.parent, labels)}</span>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
    },
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
      cell: (r: TreeRow) => {
        /* Built-ins hide (value stays for records/logic) so they can be deleted even when
           used; user-added centers can only be deleted when unused (else must rename). */
        const canDelete = r.builtin || !r.usedTotal
        return (
          <div className="row" style={{ gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>แก้ไข</Button>
            {canDelete
              ? <Button variant="ghost" size="sm" onClick={() => del(r)} style={{ color: 'var(--kpc-danger)' }}>ลบ</Button>
              : <span style={{ color: 'var(--kpc-text-faint)' }} title="ลบไม่ได้เพราะมีการใช้งานอยู่ — กด “แก้ไข” เพื่อเปลี่ยนชื่อแทน">ใช้งานอยู่</span>}
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
        actions={canEdit ? <Button variant="primary" onClick={openAdd}><IconPlus /> เพิ่มประเภทบัญชี</Button> : undefined}
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ประเภทบัญชีทั้งหมด" value={rows.length.toString()} note="ค่าเริ่มต้น + เพิ่มเอง" />
        <KpiCard label="มีการใช้งาน" value={usedCount.toString()} note="ในช่วงที่เลือก" />
        <KpiCard label="เป็นกลุ่มย่อย" value={groupedCount.toString()} note="อยู่ภายใต้กลุ่มอื่น" />
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

      <DataTable columns={columns} rows={treeRows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ประเภท`} />

      <CostCenterForm
        open={formOpen}
        editRow={editRow}
        rows={rows}
        parents={parents}
        labels={labels}
        onClose={() => { setFormOpen(false); setEditRow(null) }}
      />
    </>
  )
}

/* ───────── Add / edit cost center (name + optional group) ───────── */
function CostCenterForm({ open, editRow, rows, parents, labels, onClose }: {
  open: boolean
  editRow: CostCenterRow | null
  rows: CostCenterRow[]
  parents: Record<string, string>
  labels: Record<string, string>
  onClose: () => void
}) {
  const isEdit = !!editRow
  const curLabel = editRow ? costCenterLabel(editRow.name, labels) : ''
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setName(curLabel)
    setParent(editRow ? (parents[editRow.name] ?? '') : '')
  }, [open, editRow]) // eslint-disable-line react-hooks/exhaustive-deps

  /* A center can't sit under itself or any of its own descendants (would cycle). */
  const invalidParents = useMemo(() => {
    const bad = new Set<string>()
    if (!editRow) return bad
    bad.add(editRow.name)
    const stack = [editRow.name]
    while (stack.length) {
      const n = stack.pop()!
      for (const r of rows) if (parents[r.name] === n && !bad.has(r.name)) { bad.add(r.name); stack.push(r.name) }
    }
    return bad
  }, [editRow, rows, parents])
  const parentOptions = rows.map((r) => r.name).filter((n) => !invalidParents.has(n))

  const save = () => {
    setErr('')
    const trimmed = name.trim()
    if (!trimmed) return setErr('กรุณาระบุชื่อประเภทบัญชี')
    if (isEdit) {
      if (trimmed !== curLabel) {
        const ok = renameCostCenter(editRow!.name, trimmed)
        if (!ok) return setErr('เปลี่ยนชื่อไม่สำเร็จ — ชื่ออาจซ้ำกับที่มีอยู่แล้ว')
      }
      /* Built-in value is unchanged (rename = alias); user-added value becomes the new name. */
      const finalValue = editRow!.builtin ? editRow!.name : trimmed
      setCostCenterParent(finalValue, parent || undefined)
    } else {
      if (rows.some((r) => r.label.toLowerCase() === trimmed.toLowerCase())) return setErr('มีประเภทบัญชีนี้อยู่แล้ว')
      addCostCenter(trimmed, parent || undefined)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'แก้ไขประเภทบัญชี cost center' : 'เพิ่มประเภทบัญชี cost center'}
      onClose={onClose}
      maxWidth={460}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>{isEdit ? 'บันทึก' : 'เพิ่ม'}</Button></>}
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="ชื่อประเภทบัญชี" required style={{ gridColumn: '1 / -1' }} hint={isEdit && editRow!.builtin ? 'ประเภทค่าเริ่มต้น — เปลี่ยนชื่อที่แสดงได้ (ไม่กระทบรายการเดิม)' : undefined}>
          <Input placeholder="เช่น ค่าน้ำมันรถโม่" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="อยู่ภายใต้กลุ่ม (ไม่บังคับ)" style={{ gridColumn: '1 / -1' }} hint="เลือกเพื่อทำให้เป็นกลุ่มย่อยของประเภทบัญชีอื่น">
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— ไม่อยู่ในกลุ่ม (ระดับบนสุด)</option>
            {parentOptions.map((n) => <option key={n} value={n}>{costCenterLabel(n, labels)}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}
