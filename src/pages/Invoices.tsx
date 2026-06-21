import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, MonthSelect, Checkbox, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { TaxInvoiceDoc } from '../components/documents/TaxInvoiceDoc'
import { NewInvoiceForm } from '../components/documents/NewInvoiceForm'
import { NewReceiptForm } from '../components/documents/NewReceiptForm'
import { InvoicePdfDownload } from '../components/documents/InvoicePdfDownload'
import { InvoiceZipDownload } from '../components/documents/InvoiceZipDownload'
import { IconDownload } from '../components/icons'
import { INVOICES, baht, qm, LATEST_MONTH, monthLabel, type Invoice, type InvStatus } from '../data/selectors'
import { useCreatedDocs, removeInvoice, CAN_DELETE } from '../data/createdDocs'

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
  const [showForm, setShowForm] = useState(false)
  const [downloading, setDownloading] = useState<Invoice | null>(null)
  const [receiptForInvoice, setReceiptForInvoice] = useState<Invoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipQueue, setZipQueue] = useState<Invoice[] | null>(null)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const created = useCreatedDocs()

  const hiddenSet = useMemo(() => new Set(created.hidden.invoices), [created.hidden.invoices])
  const allInvoices = useMemo(
    () => [...created.invoices, ...INVOICES].filter((i) => !hiddenSet.has(i.no)),
    [created.invoices, hiddenSet],
  )
  const monthRows = useMemo(() => (month === 'all' ? allInvoices : allInvoices.filter((i) => i.month === month)), [month, allInvoices])
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

  const toggleOne = (no: string) => {
    const next = new Set(selected)
    if (next.has(no)) next.delete(no); else next.add(no)
    setSelected(next)
  }
  const allFilteredSelected = rows.length > 0 && rows.every((r) => selected.has(r.no))
  const toggleAllFiltered = () => {
    const next = new Set(selected)
    if (allFilteredSelected) rows.forEach((r) => next.delete(r.no))
    else rows.forEach((r) => next.add(r.no))
    setSelected(next)
  }
  const startZipDownload = () => {
    if (selected.size === 0) return
    /* Build the list in the order they appear in the current filtered view. */
    const queue = rows.filter((r) => selected.has(r.no))
    if (queue.length === 0) return
    setZipProgress({ done: 0, total: queue.length })
    setZipQueue(queue)
  }

  const columns: Column<Invoice>[] = [
    {
      key: 'sel',
      header: <Checkbox checked={allFilteredSelected} onChange={toggleAllFiltered}>{''}</Checkbox>,
      align: 'center',
      cell: (r) => <Checkbox checked={selected.has(r.no)} onChange={() => toggleOne(r.no)}>{''}</Checkbox>,
    },
    { key: 'no', header: 'เลขที่ใบกำกับ', cell: (r) => r.no, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'm3', header: 'ปริมาณ', align: 'right', cell: (r) => <span className="mono">{qm(r.lines.reduce((s, l) => s + l.qty, 0))} m³</span> },
    { key: 'total', header: 'ยอดรวม (VAT)', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'due', header: 'ครบกำหนด', cell: (r) => r.dueDate, className: 'date' },
    { key: 'status', header: 'สถานะ', align: 'center', cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].th}</Badge> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    {
      key: 'dl',
      header: '',
      align: 'center',
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDownloading(r)}
          disabled={downloading?.no === r.no}
          aria-label={`ดาวน์โหลด PDF ${r.no}`}
          title="ดาวน์โหลด PDF"
        >
          <IconDownload />
        </Button>
      ),
    },
    ...(CAN_DELETE ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: Invoice) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบกำกับ ${r.no} ?\n(เฉพาะโหมดทดสอบ)`)) removeInvoice(r.no)
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบกำกับภาษี"
        sub={`Tax Invoices · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — รวมจากใบจ่ายคอนกรีต`}
        actions={<Button variant="primary" onClick={() => setShowForm(true)}>+ เพิ่มใบกำกับภาษี</Button>}
      />

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

      {selected.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', marginBottom: 12, borderRadius: 8, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)' }}>
          <span style={{ fontSize: 14 }}>
            เลือก <strong>{selected.size}</strong> ใบกำกับ
            {zipProgress && <span style={{ marginLeft: 12, color: 'var(--kpc-text-muted)', fontSize: 13 }}>
              · กำลังสร้าง PDF {zipProgress.done}/{zipProgress.total}
            </span>}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={!!zipQueue}>ล้างการเลือก</Button>
            <Button variant="primary" size="sm" onClick={startZipDownload} disabled={!!zipQueue}>
              {zipQueue ? 'กำลังสร้าง ZIP...' : `ดาวน์โหลด ZIP (${selected.size} ใบ)`}
            </Button>
          </div>
        </div>
      )}

      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบกำกับ`} />

      <DocModal
        open={!!active}
        title={active ? `ใบกำกับภาษี ${active.no}` : ''}
        onClose={() => setActive(null)}
        extraActions={
          active ? (
            <Button variant="tonal" onClick={() => { const inv = active; setActive(null); setReceiptForInvoice(inv) }}>
              ออกใบเสร็จรับเงิน
            </Button>
          ) : undefined
        }
      >
        {active && <TaxInvoiceDoc inv={active} />}
      </DocModal>

      <NewInvoiceForm
        open={showForm}
        onClose={() => setShowForm(false)}
        createdInvoices={created.invoices}
        onIssued={(inv) => { setShowForm(false); setActive(inv) }}
      />

      <NewReceiptForm
        open={!!receiptForInvoice}
        onClose={() => setReceiptForInvoice(null)}
        createdReceipts={created.receipts}
        extraInvoices={created.invoices}
        initialInvoiceNo={receiptForInvoice?.no}
        onIssued={() => setReceiptForInvoice(null)}
      />

      {downloading && <InvoicePdfDownload inv={downloading} onDone={() => setDownloading(null)} />}

      {zipQueue && (
        <InvoiceZipDownload
          invoices={zipQueue}
          onProgress={(done, total) => setZipProgress({ done, total })}
          onDone={() => { setZipQueue(null); setZipProgress(null); setSelected(new Set()) }}
        />
      )}
    </>
  )
}
