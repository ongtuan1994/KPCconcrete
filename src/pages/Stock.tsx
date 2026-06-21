import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { STOCK_MATERIALS, type StockMaterial } from '../data/real'
import { qm } from '../data/selectors'

type Filter = 'all' | 'low' | 'out'

function status(m: StockMaterial): { th: string; en: string; tone: Tone } {
  if (m.balance <= 0) return { th: 'ติดลบ / หมด', en: 'Out', tone: 'danger' }
  if (m.balance < m.reorder) return { th: 'ใกล้หมด', en: 'Low', tone: 'warning' }
  return { th: 'พอเพียง', en: 'In stock', tone: 'success' }
}

export function Stock() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(
    () =>
      STOCK_MATERIALS.filter((m) => {
        const t = status(m).tone
        if (filter === 'low' && t !== 'warning') return false
        if (filter === 'out' && t !== 'danger') return false
        if (query && !`${m.code} ${m.name} ${m.en}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [filter, query],
  )
  const low = STOCK_MATERIALS.filter((m) => status(m).tone === 'warning').length
  const out = STOCK_MATERIALS.filter((m) => status(m).tone === 'danger').length

  const columns: Column<StockMaterial>[] = [
    { key: 'code', header: 'รหัส', cell: (r) => r.code, className: 'docno' },
    {
      key: 'name',
      header: 'วัตถุดิบ',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span className="th" style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{r.en}</span>
        </div>
      ),
    },
    {
      key: 'bal',
      header: 'คงเหลือ',
      align: 'right',
      cell: (r) => (
        <span className="mono" style={{ fontWeight: 600, color: r.balance <= 0 ? 'var(--kpc-danger-ink)' : 'var(--kpc-text-strong)' }}>
          {qm(r.balance)}
        </span>
      ),
    },
    { key: 'unit', header: 'หน่วย', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
    { key: 'reorder', header: 'จุดสั่งซื้อ', align: 'right', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{r.reorder.toLocaleString()}</span> },
    {
      key: 'status',
      header: 'สถานะ',
      align: 'center',
      cell: (r) => {
        const s = status(r)
        return <Badge tone={s.tone} pip={false}>{s.th}</Badge>
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="คลังวัตถุดิบ"
        sub="Raw Material Stock · คงเหลือ ณ มิถุนายน 2569"
        actions={
          <Button variant="primary">
            <IconPlus /> รับเข้าวัตถุดิบ
          </Button>
        }
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รายการวัตถุดิบ · Materials" value={STOCK_MATERIALS.length.toString()} note="รายการ" />
        <KpiCard label="ใกล้หมด · Low stock" value={low.toString()} delta="ต้องสั่งซื้อ" deltaDir="down" note="" />
        <KpiCard label="ติดลบ / หมด · Out" value={out.toString()} note="เร่งจัดหา (หิน 3/4)" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {STOCK_MATERIALS.length}</Pill>
          <Pill active={filter === 'low'} onClick={() => setFilter('low')}>ใกล้หมด {low}</Pill>
          <Pill active={filter === 'out'} onClick={() => setFilter('out')}>หมด {out}</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="รหัส / ชื่อวัตถุดิบ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
    </>
  )
}
