import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { ReceiptDoc } from '../components/documents/ReceiptDoc'
import { RECEIPTS, baht, LATEST_MONTH, monthLabel, type Receipt } from '../data/selectors'

const PAY_TONE: Record<string, Tone> = { เงินสด: 'success', โอน: 'info', เครดิต: 'warning' }

export function Receipts() {
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Receipt | null>(null)

  const monthRows = useMemo(() => (month === 'all' ? RECEIPTS : RECEIPTS.filter((r) => r.month === month)), [month])
  const rows = useMemo(
    () => monthRows.filter((r) => !query || `${r.no} ${r.customer}`.toLowerCase().includes(query.toLowerCase())),
    [monthRows, query],
  )
  const total = monthRows.reduce((s, r) => s + r.amount, 0)

  const columns: Column<Receipt>[] = [
    { key: 'no', header: 'เลขที่ใบเสร็จ', cell: (r) => r.no, className: 'docno' },
    { key: 'date', header: 'วันที่รับเงิน', cell: (r) => r.date, className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'inv', header: 'อ้างอิงใบกำกับ', cell: (r) => <span className="mono" style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.invoiceNos.join(', ')}</span> },
    { key: 'method', header: 'วิธีชำระ', align: 'center', cell: (r) => <Badge tone={PAY_TONE[r.method] ?? 'neutral'} pip={false} square>{r.method || '—'}</Badge> },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => baht(r.amount), className: 'amt' },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
  ]

  return (
    <>
      <PageHeader title="ใบเสร็จรับเงิน" sub={`Receipts · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — เงินสด/โอน`} />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รับเงินรวม · Collected" value={baht(total)} delta={`${monthRows.length} ใบ`} note="ใบเสร็จ" />
        <KpiCard label="จำนวนใบเสร็จ · Receipts" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="เฉลี่ยต่อใบ · Avg" value={baht(monthRows.length ? Math.round(total / monthRows.length) : 0)} note="ค่าเฉลี่ย" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <MonthSelect value={month} onChange={setMonth} />
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่ใบเสร็จ / ลูกค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบเสร็จ`} />

      <DocModal open={!!active} title={active ? `ใบเสร็จรับเงิน ${active.no}` : ''} onClose={() => setActive(null)}>
        {active && <ReceiptDoc rc={active} />}
      </DocModal>
    </>
  )
}
