import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, SavedBy } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { DocModal } from '../components/documents/DocModal'
import { FoundryBoqDoc } from '../components/documents/FoundryBoqDoc'
import { NewFoundryBoqForm } from '../components/documents/NewFoundryBoqForm'
import { boqOutput, boqMaterialDefs, foundryCostResolver } from '../data/foundryBoq'
import { useCreatedDocs, useProducts, removeFoundryBoq, restoreFoundryBoq, type FoundryBoq, type DeletedFoundryBoq } from '../data/createdDocs'
import { useCan } from '../data/auth'
import { fmtThaiDateTime } from '../utils/datetime'
import { downloadCsv } from '../utils/csv'

/** ISO yyyy-mm-dd → d/m/พ.ศ. */
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** Total concrete volume (คิว) across a whole BOQ — a quick size indicator. */
function concreteM3(b: FoundryBoq): number {
  let s = 0
  for (const p of b.products) for (const m of p.materials) if (m.key === 'concrete') s += boqOutput(m) * p.qty
  return Math.round(s * 100) / 100
}

export function FoundryBoqEstimate() {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FoundryBoq | null>(null)
  const [active, setActive] = useState<FoundryBoq | null>(null)
  const created = useCreatedDocs()
  const products = useProducts()
  const canEdit = useCan('foundry-boq').edit

  const all = created.foundryBoqs

  /* Full itemised export — one row per material takeoff line (per product, per
     BOQ), with per-unit + total quantities and material cost. */
  const exportExcel = () => {
    const defs = boqMaterialDefs(created.foundryMaterialsAdded)
    const defMap = Object.fromEntries(defs.map((d) => [d.key, d]))
    const labelOf = (key: string) => defMap[key]?.label ?? key
    const unitOf = (key: string) => defMap[key]?.unit ?? ''
    const costOf = foundryCostResolver(created.stockCosts, created.foundryMaterialsAdded, products)
    const r3 = (n: number) => Math.round(n * 1000) / 1000
    const r2 = (n: number) => Math.round(n * 100) / 100
    const head = [
      'เลขที่', 'วันที่', 'โครงการ/ลูกค้า', 'ลำดับสินค้า', 'ประเภทสินค้า', 'รายละเอียด', 'รหัสสินค้า',
      'จำนวน (ตัว)', 'วัตถุดิบ', 'หน่วย', 'ปริมาณ/ตัว', 'ปริมาณรวม', 'ต้นทุน/หน่วย (บาท)', 'ต้นทุนรวม (บาท)', 'หมายเหตุ',
    ]
    const body: (string | number)[][] = []
    for (const b of all) {
      b.products.forEach((p, pi) => {
        const used = p.materials.filter((m) => boqOutput(m) > 0)
        if (used.length === 0) {
          body.push([b.no, fmtDate(b.date), b.project, pi + 1, p.type, p.detail ?? '', p.code, p.qty, '—', '', '', '', '', '', b.note ?? ''])
          return
        }
        for (const m of used) {
          const per = boqOutput(m)
          const totalQty = per * p.qty
          const uc = costOf(m.key)
          body.push([
            b.no, fmtDate(b.date), b.project, pi + 1, p.type, p.detail ?? '', p.code, p.qty,
            labelOf(m.key), unitOf(m.key), r3(per), r3(totalQty),
            uc > 0 ? r2(uc) : '', uc > 0 ? r2(totalQty * uc) : '', b.note ?? '',
          ])
        }
      })
    }
    downloadCsv('foundry-boq', [head, ...body])
  }

  const rows = useMemo(
    () =>
      all.filter((b) => {
        if (!query) return true
        const hay = `${b.no} ${b.project} ${b.note ?? ''} ${b.products.map((p) => `${p.type} ${p.code}`).join(' ')}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      }),
    [all, query],
  )

  const totalProducts = all.reduce((s, b) => s + b.products.length, 0)

  const openEdit = (b: FoundryBoq) => { setEditing(b); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }

  const columns: Column<FoundryBoq>[] = [
    { key: 'no', header: 'เลขที่', cell: (b) => <span className="mono">{b.no}</span>, className: 'docno' },
    { key: 'project', header: 'โครงการ / ลูกค้า', cell: (b) => <span style={{ color: 'var(--kpc-text-strong)' }}>{b.project}</span> },
    { key: 'date', header: 'วันที่', cell: (b) => <span className="mono" style={{ fontSize: 13 }}>{fmtDate(b.date)}</span> },
    { key: 'products', header: 'สินค้า', align: 'center', cell: (b) => <Badge tone="info" pip={false} square>{b.products.length} รายการ</Badge> },
    { key: 'm3', header: 'คอนกรีตรวม (คิว)', align: 'right', cell: (b) => { const v = concreteM3(b); return v > 0 ? <span className="amt mono">{v.toLocaleString()}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span> } },
    { key: 'savedby', header: 'ผู้สร้าง', cell: (b) => <SavedBy by={b.createdBy} at={b.createdAt} /> },
    {
      key: 'act', header: '', align: 'center',
      cell: (b) => (
        <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setActive(b)}>เปิดดู</Button>
          {canEdit && <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>แก้ไข</Button>}
          {canEdit && (
            <Button variant="ghost" size="sm" style={{ color: 'var(--kpc-danger)' }}
              onClick={() => { if (confirm(`ลบประเมินราคา ${b.no} ?`)) removeFoundryBoq(b.no) }}>
              ลบ
            </Button>
          )}
        </div>
      ),
    },
  ]

  const deletedRows = created.deletedFoundryBoqs
  const deletedColumns: Column<DeletedFoundryBoq>[] = [
    { key: 'no', header: 'เลขที่', cell: (b) => <span className="mono">{b.no}</span>, className: 'docno' },
    { key: 'project', header: 'โครงการ / ลูกค้า', cell: (b) => b.project },
    { key: 'deletedBy', header: 'ลบโดย', cell: (b) => <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{b.deletedBy} · {fmtThaiDateTime(b.deletedAt)}</span> },
    { key: 'restore', header: '', align: 'center', cell: (b) => <Button variant="ghost" size="sm" onClick={() => restoreFoundryBoq(b.no)}>กู้คืน</Button> },
  ]

  return (
    <div className="foundry-theme">
      <PageHeader
        title="ประเมินราคาสินค้าโรงหล่อ"
        sub={`Foundry BOQ · ${all.length} โครงการ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={all.length === 0}>ส่งออก Excel</Button>
            {canEdit && <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true) }}><IconPlus /> สร้างใหม่</Button>}
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="โครงการ · Projects" value={all.length.toString()} note="รายการ" />
        <KpiCard label="สินค้าที่ถอด · Products" value={totalProducts.toString()} note="รายการ" invert />
        <KpiCard label="ลูกค้า/โครงการ" value={new Set(all.map((b) => b.project)).size.toString()} note="ราย" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ / โครงการ / รหัสสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ยังไม่มีการประเมินราคา</div>
          <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginTop: 6 }}>
            กดปุ่ม <strong>สร้างใหม่</strong> เพื่อถอด BOQ วัตถุดิบของโครงการแรก
          </div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} โครงการ`} />
      )}

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-muted)', marginBottom: 8 }}>ประวัติการลบ · Deleted</div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={5} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
        </div>
      )}

      <NewFoundryBoqForm open={showForm} editing={editing} onClose={closeForm} onSaved={() => closeForm()} />

      <DocModal open={!!active} title={active ? `ประเมินราคา ${active.no}` : ''} onClose={() => setActive(null)} maxWidth={880}>
        {active && <FoundryBoqDoc boq={active} />}
      </DocModal>
    </div>
  )
}
