import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { customerAgg, baht, bahtShort, qm, monthLabel, type CustomerAgg } from '../data/selectors'
import { downloadCsv } from '../utils/csv'

export function CustomerSummary() {
  const [month, setMonth] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')

  const all = useMemo(() => customerAgg(month), [month])
  const rows = useMemo(() => all.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase())), [all, query])
  const totalSales = all.reduce((s, c) => s + c.sales, 0)
  const totalOut = all.reduce((s, c) => s + c.outstanding, 0)

  const columns: Column<CustomerAgg>[] = [
    {
      key: 'name',
      header: 'ลูกค้า / หน่วยงาน',
      cell: (r) => (
        <div className="row" style={{ gap: 10 }}>
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 11, background: 'var(--kpc-neutral-200)', color: 'var(--kpc-neutral-700)' }}>
            {r.name.replace(/^(บจก\.|หจก\.|บ\.|คุณ|โก|เจ๊|พี่|ป้า|ช่าง)\s*/, '').slice(0, 2) || r.name.slice(0, 2)}
          </span>
          <span style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
        </div>
      ),
    },
    { key: 'tk', header: 'ใบจ่าย', align: 'right', cell: (r) => <span className="mono">{r.tickets}</span> },
    { key: 'm3', header: 'ปริมาณ (m³)', align: 'right', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'sales', header: 'ยอดซื้อ', align: 'right', cell: (r) => baht(r.sales), className: 'amt' },
    {
      key: 'out',
      header: 'ค้างชำระ',
      align: 'right',
      cell: (r) =>
        r.outstanding > 0 ? (
          <span className="mono" style={{ color: 'var(--kpc-danger-ink)', fontWeight: 600 }}>{baht(r.outstanding)}</span>
        ) : (
          <span className="mono" style={{ color: 'var(--kpc-text-faint)' }}>—</span>
        ),
    },
    { key: 'last', header: 'สั่งล่าสุด', cell: (r) => r.lastDate, className: 'date' },
    {
      key: 'status',
      header: 'สถานะ',
      align: 'center',
      cell: (r) => (r.outstanding > 0 ? <Badge tone="warning">มียอดค้าง</Badge> : <Badge tone="success">ปกติ</Badge>),
    },
  ]

  return (
    <>
      <PageHeader
        title="สรุปตามลูกค้า"
        sub={`Customer Summary · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)}`}
        actions={
          <Button variant="primary" onClick={() => {
            const head = ['ลูกค้า / หน่วยงาน', 'ใบจ่าย', 'ปริมาณ (m³)', 'ยอดซื้อ', 'ค้างชำระ', 'สั่งล่าสุด', 'สถานะ']
            const body = rows.map((r) => [
              r.name, r.tickets, Math.round(r.m3 * 100) / 100, r.sales, r.outstanding, r.lastDate,
              r.outstanding > 0 ? 'มียอดค้าง' : 'ปกติ',
            ])
            const slug = `customer-summary-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
            downloadCsv(slug, [head, ...body])
          }}>ส่งออก Excel</Button>
        }
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ลูกค้าที่มีการซื้อ · Customers" value={all.length.toString()} note="ราย" />
        <KpiCard label="ยอดซื้อรวม · Total sales" value={bahtShort(totalSales)} note={month === 'all' ? 'ทั้งปี' : 'เดือนนี้'} />
        <KpiCard label="ค้างชำระรวม · Outstanding" value={bahtShort(totalOut)} note="ติดตามเก็บเงิน" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <MonthSelect value={month} onChange={setMonth} />
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อลูกค้า / หน่วยงาน" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ลูกค้า`} />
    </>
  )
}
