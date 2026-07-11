import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Select } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { NewSupplierForm } from '../components/documents/NewSupplierForm'
import { type Creditor } from '../data/creditors'
import { useSuppliers } from '../data/createdDocs'
import { baht } from '../data/selectors'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | 'credit' | 'cash'

/** Credit-limit display: numeric → baht; credit w/o cap → ไม่จำกัด; cash → —. */
function creditLimitText(c: Creditor): string {
  if (c.terms !== 'เครดิต') return '—'
  return c.creditLimit != null ? baht(c.creditLimit) : 'ไม่จำกัด'
}

/** Supplier registry (ทะเบียนซัพพลายเออร์). Seeded from the creditor master for
    now — suppliers KPC buys materials/services from. */
export function Suppliers() {
  const [filter, setFilter] = useState<Filter>('all')
  const [cat, setCat] = useState('all')
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editRow, setEditRow] = useState<Creditor | null>(null)

  /* User-added suppliers (quick-added from the PO / payment forms) shown on top,
     with per-id edits (supplierEdits) merged on top of every record. */
  const list = useSuppliers()

  /* Distinct หมวดสินค้า/บริการ (note) values for the category filter dropdown. */
  const cats = useMemo(
    () => [...new Set(list.map((c) => c.note).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'th')),
    [list],
  )

  const rows = useMemo(
    () =>
      list.filter((c) => {
        if (filter === 'credit' && c.terms !== 'เครดิต') return false
        if (filter === 'cash' && c.terms !== 'เงินสด') return false
        if (cat === '__none__' && c.note) return false
        if (cat !== 'all' && cat !== '__none__' && c.note !== cat) return false
        if (query && !`${c.id} ${c.name} ${c.note ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [list, filter, cat, query],
  )

  const creditCount = list.filter((c) => c.terms === 'เครดิต').length
  const cashCount = list.filter((c) => c.terms === 'เงินสด').length
  const cappedCount = list.filter((c) => c.creditLimit != null).length

  const exportExcel = () => {
    const head = ['รหัส', 'ชื่อซัพพลายเออร์', 'หมวดสินค้า/บริการ', 'เงื่อนไขชำระ', 'ระยะเวลา (วัน)', 'วงเงินเครดิต']
    const body = rows.map((c) => [
      c.id, c.name, c.note ?? '', c.terms, c.terms === 'เครดิต' ? (c.creditDays ?? '') : '', creditLimitText(c),
    ])
    downloadCsv('suppliers', [head, ...body])
  }

  const columns: Column<Creditor>[] = [
    { key: 'id', header: 'รหัส', cell: (r) => <span className="mono">{r.id}</span>, className: 'docno' },
    {
      key: 'name',
      header: 'ชื่อซัพพลายเออร์',
      cell: (r) => (
        <div className="row" style={{ gap: 10 }}>
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 11, background: 'var(--kpc-neutral-200)', color: 'var(--kpc-neutral-700)' }}>
            {r.name.replace(/^(บจก\.|หจก\.|บ\.|ร้าน|นาย|คุณ|โก|พ\.)\s*/, '').slice(0, 2) || r.name.slice(0, 2)}
          </span>
          <span style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
        </div>
      ),
    },
    {
      key: 'cat',
      header: 'หมวดสินค้า/บริการ',
      cell: (r) => (r.note
        ? <Badge tone="neutral" pip={false} square>{r.note}</Badge>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    {
      key: 'terms',
      header: 'เงื่อนไขชำระ',
      align: 'center',
      cell: (r) =>
        r.terms === 'เครดิต'
          ? <Badge tone="warning" pip={false} square>เครดิต {r.creditDays ?? 30} วัน</Badge>
          : <Badge tone="success" pip={false} square>เงินสด</Badge>,
    },
    {
      key: 'limit',
      header: 'วงเงินเครดิต',
      align: 'right',
      cell: (r) => {
        if (r.terms !== 'เครดิต') return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
        return r.creditLimit != null
          ? <span className="amt mono">{baht(r.creditLimit)}</span>
          : <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>ไม่จำกัด</span>
      },
    },
    {
      key: 'act',
      header: '',
      align: 'center',
      cell: (r) => (
        <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setEditRow(r)}>แก้ไข</Button>
          <AuditButton item={{ category: 'customers', group: 'ทะเบียนซัพพลายเออร์', ref: r.id, label: r.name, sub: `${r.id}${r.note ? ' · ' + r.note : ''}`, route: '/suppliers' }} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="ทะเบียนซัพพลายเออร์"
        sub={`Supplier · ${list.length} ราย`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowAdd(true)}><IconPlus /> เพิ่มซัพพลายเออร์</Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ซัพพลายเออร์ทั้งหมด · Suppliers" value={list.length.toString()} note="ราย" />
        <KpiCard label="แบบเครดิต · Credit" value={creditCount.toString()} note="ราย" invert />
        <KpiCard label="เงินสด · Cash" value={cashCount.toString()} note="ราย" />
        <KpiCard label="กำหนดวงเงิน · Capped" value={`${cappedCount}/${creditCount}`} note="ที่เหลือไม่จำกัด" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
          <div className="pills">
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {list.length}</Pill>
            <Pill active={filter === 'credit'} onClick={() => setFilter('credit')}>เครดิต {creditCount}</Pill>
            <Pill active={filter === 'cash'} onClick={() => setFilter('cash')}>เงินสด {cashCount}</Pill>
          </div>
          <div className="select-wrap" style={{ width: 200 }}>
            <Select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">ทุกหมวดสินค้า/บริการ</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__none__">ไม่ระบุหมวด</option>
            </Select>
          </div>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อซัพพลายเออร์ / รหัส / หมวด" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ราย`} />

      <NewSupplierForm
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={(c) => { setShowAdd(false); setFilter('all'); setQuery(c.name) }}
      />

      <NewSupplierForm
        open={!!editRow}
        edit={editRow ?? undefined}
        onClose={() => setEditRow(null)}
        onCreated={() => setEditRow(null)}
      />
    </>
  )
}
