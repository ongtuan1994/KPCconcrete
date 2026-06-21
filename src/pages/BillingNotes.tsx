import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { BillingNoteDoc } from '../components/documents/BillingNoteDoc'
import { NewBillingNoteForm } from '../components/documents/NewBillingNoteForm'
import { BILLING_NOTES, baht, LATEST_MONTH, monthLabel, monthShort, type BillingNote } from '../data/selectors'
import { useCreatedDocs, removeBillingNote, CAN_DELETE } from '../data/createdDocs'

export function BillingNotes() {
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<BillingNote | null>(null)
  const [showForm, setShowForm] = useState(false)
  const created = useCreatedDocs()

  const hiddenSet = useMemo(() => new Set(created.hidden.billingNotes), [created.hidden.billingNotes])
  const allBns = useMemo(
    () => [...created.billingNotes, ...BILLING_NOTES].filter((b) => !hiddenSet.has(b.no)),
    [created.billingNotes, hiddenSet],
  )
  const monthRows = useMemo(() => (month === 'all' ? allBns : allBns.filter((b) => b.month === month)), [month, allBns])
  const rows = useMemo(
    () => monthRows.filter((b) => !query || `${b.no} ${b.customer}`.toLowerCase().includes(query.toLowerCase())),
    [monthRows, query],
  )
  const total = monthRows.reduce((s, b) => s + b.total, 0)

  const columns: Column<BillingNote>[] = [
    { key: 'no', header: 'เลขที่เอกสาร', cell: (r) => r.no, className: 'docno' },
    { key: 'month', header: 'งวด', align: 'center', cell: (r) => <span className="th">{monthShort(r.month)}</span> },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'n', header: 'จำนวนใบกำกับ', align: 'center', cell: (r) => <Badge tone="info" pip={false} square>{r.invoices.length} ใบ</Badge> },
    { key: 'total', header: 'ยอดวางบิล', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(CAN_DELETE ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: BillingNote) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบวางบิล ${r.no} ?\n(เฉพาะโหมดทดสอบ)`)) removeBillingNote(r.no)
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบวางบิล"
        sub={`Billing Notes · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — รวมใบกำกับเครดิตตามลูกค้า`}
        actions={<Button variant="primary" onClick={() => setShowForm(true)}>+ เพิ่มใบวางบิล</Button>}
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบวางบิล · Notes" value={monthRows.length.toString()} note="ลูกค้าเครดิต" />
        <KpiCard label="ยอดวางบิลรวม · Total" value={baht(total)} note="รวม VAT" />
        <KpiCard label="รายใหญ่สุด · Top" value={baht(monthRows[0]?.total ?? 0)} note={monthRows[0]?.customer ?? '—'} invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <MonthSelect value={month} onChange={setMonth} />
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่ / ลูกค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบวางบิล`} />

      <DocModal open={!!active} title={active ? `ใบวางบิล ${active.no}` : ''} onClose={() => setActive(null)}>
        {active && <BillingNoteDoc bn={active} />}
      </DocModal>

      <NewBillingNoteForm
        open={showForm}
        onClose={() => setShowForm(false)}
        createdBns={created.billingNotes}
        extraInvoices={created.invoices}
        onIssued={(bn) => { setShowForm(false); setActive(bn) }}
      />
    </>
  )
}
