import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, MonthSelect, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { TaxInvoiceDoc } from '../components/documents/TaxInvoiceDoc'
import { INVOICES, baht, qm, LATEST_MONTH, monthLabel, type Invoice, type InvStatus } from '../data/selectors'

type Filter = 'all' | InvStatus

const STATUS: Record<InvStatus, { th: string; tone: Tone }> = {
  paid: { th: 'ชำระแล้ว', tone: 'success' },
  pending: { th: 'รอชำระ', tone: 'warning' },
  overdue: { th: 'เกินกำหนด', tone: 'danger' },
}

export function Invoices() {
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Invoice | null>(null)

  const monthRows = useMemo(() => (month === 'all' ? INVOICES : INVOICES.filter((i) => i.month === month)), [month])
  const rows = useMemo(
    () =>
      monthRows.filter((inv) => {
        if (filter !== 'all' && inv.status !== filter) return false
        if (query && !`${inv.no} ${inv.customer}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [monthRows, filter, query],
  )
  const cnt = (s: InvStatus) => monthRows.filter((i) => i.status === s).length
  const netSales = monthRows.reduce((s, i) => s + i.subtotal, 0)
  const outstanding = monthRows.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0)

  const columns: Column<Invoice>[] = [
    { key: 'no', header: 'เลขที่ใบกำกับ', cell: (r) => r.no, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'm3', header: 'ปริมาณ', align: 'right', cell: (r) => <span className="mono">{qm(r.lines.reduce((s, l) => s + l.qty, 0))} m³</span> },
    { key: 'total', header: 'ยอดรวม (VAT)', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'due', header: 'ครบกำหนด', cell: (r) => r.dueDate, className: 'date' },
    { key: 'status', header: 'สถานะ', align: 'center', cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].th}</Badge> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
  ]

  return (
    <>
      <PageHeader title="ใบกำกับภาษี" sub={`Tax Invoices · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — รวมจากใบจ่ายสินค้า`} />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบกำกับ · Invoices" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="ยอดขายรวม · Net sales" value={baht(netSales)} note="ก่อน VAT" />
        <KpiCard label="รอชำระ · Pending" value={cnt('pending').toString()} delta="เครดิต" deltaDir="down" note="" />
        <KpiCard label="ค้างชำระ · Outstanding" value={baht(outstanding)} note="ยอดเครดิต" invert />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <MonthSelect value={month} onChange={setMonth} />
          <div className="pills">
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {monthRows.length}</Pill>
            <Pill active={filter === 'pending'} onClick={() => setFilter('pending')}>รอชำระ {cnt('pending')}</Pill>
            <Pill active={filter === 'paid'} onClick={() => setFilter('paid')}>ชำระแล้ว {cnt('paid')}</Pill>
            {cnt('overdue') > 0 && <Pill active={filter === 'overdue'} onClick={() => setFilter('overdue')}>เกินกำหนด {cnt('overdue')}</Pill>}
          </div>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่ใบกำกับ / ลูกค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบกำกับ`} />

      <DocModal open={!!active} title={active ? `ใบกำกับภาษี ${active.no}` : ''} onClose={() => setActive(null)}>
        {active && <TaxInvoiceDoc inv={active} />}
      </DocModal>
    </>
  )
}
