import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, MonthSelect, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { DELIVERY_TICKETS, type DeliveryTicket } from '../data/real'
import { baht, qm, prodShort, LATEST_MONTH, monthLabel } from '../data/selectors'

type Filter = 'all' | 'ขายลูกค้า' | 'โรงหล่อ' | 'ใช้เอง'

const TYPE_TONE: Record<string, Tone> = { ขายลูกค้า: 'info', โรงหล่อ: 'neutral', ใช้เอง: 'warning' }
const PAY_TONE: Record<string, Tone> = { เครดิต: 'warning', เงินสด: 'success', โอน: 'info' }

export function DeliveryTickets() {
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const monthRows = useMemo(() => (month === 'all' ? DELIVERY_TICKETS : DELIVERY_TICKETS.filter((t) => t.month === month)), [month])
  const rows = useMemo(
    () =>
      monthRows.filter((t) => {
        if (filter !== 'all' && t.type !== filter) return false
        if (query && !`${t.dtNo} ${t.customer} ${t.prod}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [monthRows, filter, query],
  )

  const cnt = (t: string) => monthRows.filter((x) => x.type === t).length
  const sales = monthRows.filter((t) => t.amount > 0)
  const totSales = sales.reduce((s, t) => s + t.amount, 0)
  const totM3 = monthRows.reduce((s, t) => s + t.m3, 0)

  const columns: Column<DeliveryTicket>[] = [
    { key: 'dt', header: 'เลขที่ใบจ่าย', cell: (r) => r.dtNo, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'type', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={TYPE_TONE[r.type] ?? 'neutral'} square pip={false}>{r.type}</Badge> },
    { key: 'cust', header: 'ลูกค้า / หน่วยงาน', cell: (r) => r.customer },
    { key: 'prod', header: 'สินค้า', cell: (r) => <span className="th">{prodShort(r.prod)}</span> },
    { key: 'm3', header: 'คิว', align: 'right', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'price', header: 'ราคา', align: 'right', cell: (r) => <span className="mono" style={{ color: 'var(--kpc-text-muted)' }}>{r.price ? r.price.toLocaleString() : '—'}</span> },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => (r.amount ? baht(r.amount) : <span className="mono" style={{ color: 'var(--kpc-text-faint)' }}>—</span>), className: 'amt' },
    { key: 'pay', header: 'ชำระโดย', align: 'center', cell: (r) => (r.pay ? <Badge tone={PAY_TONE[r.pay] ?? 'neutral'} pip={false} square>{r.pay}</Badge> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
  ]

  return (
    <>
      <PageHeader
        title="ใบจ่ายสินค้า"
        sub={`Delivery Tickets · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)}`}
        actions={
          <Button variant="primary">
            <IconPlus /> บันทึกใบจ่าย
          </Button>
        }
      />
      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบจ่าย · Tickets" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="ปริมาณรวม · Volume" value={qm(Math.round(totM3))} unit="m³" note="ผลิต+ส่ง" />
        <KpiCard label="ยอดขาย · Sales" value={baht(totSales)} note="เฉพาะขายลูกค้า" />
        <KpiCard label="ใช้ภายใน · Internal" value={cnt('โรงหล่อ').toString()} note="โรงหล่อ" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <MonthSelect value={month} onChange={setMonth} />
          <div className="pills">
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {monthRows.length}</Pill>
            <Pill active={filter === 'ขายลูกค้า'} onClick={() => setFilter('ขายลูกค้า')}>ขายลูกค้า {cnt('ขายลูกค้า')}</Pill>
            <Pill active={filter === 'โรงหล่อ'} onClick={() => setFilter('โรงหล่อ')}>โรงหล่อ {cnt('โรงหล่อ')}</Pill>
            <Pill active={filter === 'ใช้เอง'} onClick={() => setFilter('ใช้เอง')}>ใช้เอง {cnt('ใช้เอง')}</Pill>
          </div>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่ใบจ่าย / ลูกค้า / รหัสสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบจ่าย`} />
    </>
  )
}
