import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Select, Checkbox, SavedBy, type Tone } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { ReceiptDoc } from '../components/documents/ReceiptDoc'
import { NewReceiptForm } from '../components/documents/NewReceiptForm'
import { ReceiptPdfDownload } from '../components/documents/ReceiptPdfDownload'
import { ReceiptZipDownload } from '../components/documents/ReceiptZipDownload'
import { IconDownload } from '../components/icons'
import { RECEIPTS, baht, LATEST_MONTH, monthName, ticketYear, type Receipt } from '../data/selectors'
import { useCan } from '../data/auth'
import { fmtThaiDateTime } from '../utils/datetime'
import { useCreatedDocs, removeReceipt, restoreReceipt, type DeletedReceipt } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const PAY_TONE: Record<string, Tone> = { เงินสด: 'success', โอน: 'info', เครดิต: 'warning', เช็ค: 'warning' }

export function Receipts() {
  const [year, setYear] = useState(2569)
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Receipt | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [prefillCustomer, setPrefillCustomer] = useState<string | undefined>(undefined)
  const [downloading, setDownloading] = useState<Receipt | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipQueue, setZipQueue] = useState<Receipt[] | null>(null)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const created = useCreatedDocs()
  const canDelete = useCan('receipts').edit
  const location = useLocation()
  const navigate = useNavigate()

  /* When navigated here from the debtors ledger ("ชำระหนี้"), open the new-receipt
     form pre-filled with that customer. Clear router state so a refresh won't re-trigger. */
  useEffect(() => {
    const st = location.state as { collectFromCustomer?: string } | null
    if (st?.collectFromCustomer) {
      setPrefillCustomer(st.collectFromCustomer)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  const hiddenSet = useMemo(() => new Set(created.hidden.receipts), [created.hidden.receipts])
  const allReceipts = useMemo(
    () => [...created.receipts, ...RECEIPTS].filter((r) => !hiddenSet.has(r.no)),
    [created.receipts, hiddenSet],
  )
  const years = useMemo(() => [...new Set(allReceipts.map((r) => ticketYear(r)))].sort((a, b) => b - a), [allReceipts])
  useEffect(() => { if (years.length && !years.includes(year)) setYear(years[0]) }, [years, year])
  const yearRows = useMemo(() => allReceipts.filter((r) => ticketYear(r) === year), [allReceipts, year])
  const monthRows = useMemo(() => (month === 'all' ? yearRows : yearRows.filter((r) => r.month === month)), [month, yearRows])
  const rows = useMemo(
    () => monthRows.filter((r) => !query || `${r.no} ${r.customer}`.toLowerCase().includes(query.toLowerCase())),
    [monthRows, query],
  )
  const total = monthRows.reduce((s, r) => s + r.amount, 0)

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
    const queue = rows.filter((r) => selected.has(r.no))
    if (queue.length === 0) return
    setZipProgress({ done: 0, total: queue.length })
    setZipQueue(queue)
  }

  const columns: Column<Receipt>[] = [
    {
      key: 'sel',
      header: <Checkbox checked={allFilteredSelected} onChange={toggleAllFiltered}>{''}</Checkbox>,
      align: 'center',
      cell: (r) => <Checkbox checked={selected.has(r.no)} onChange={() => toggleOne(r.no)}>{''}</Checkbox>,
    },
    { key: 'no', header: 'เลขที่ใบเสร็จ', cell: (r) => r.no, className: 'docno' },
    { key: 'date', header: 'วันที่รับเงิน', cell: (r) => r.date, className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'inv', header: 'อ้างอิงใบกำกับ', cell: (r) => <span className="mono" style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.invoiceNos.join(', ')}</span> },
    { key: 'method', header: 'วิธีชำระ', align: 'center', cell: (r) => <Badge tone={PAY_TONE[r.method] ?? 'neutral'} pip={false} square>{r.method || '—'}</Badge> },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => baht(r.amount), className: 'amt' },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'sales', group: 'ใบเสร็จรับเงิน', ref: r.no, label: r.no, sub: `${r.customer} · ${baht(r.amount)}`, route: '/receipts' }} /> },
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
    ...(canDelete ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: Receipt) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบเสร็จ ${r.no} ?\nระบบจะเก็บประวัติการลบไว้ตรวจสอบย้อนหลัง`)) removeReceipt(r)
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* Deleted-receipt history for the current period — appended below the list. */
  const deletedRows = useMemo(
    () => created.deletedReceipts.filter((d) => ticketYear(d) === year && (month === 'all' || d.month === month)),
    [created.deletedReceipts, year, month],
  )
  const deletedColumns: Column<DeletedReceipt>[] = [
    { key: 'no', header: 'เลขที่ใบเสร็จ', cell: (r) => r.no, className: 'docno' },
    { key: 'date', header: 'วันที่รับเงิน', cell: (r) => r.date, className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'inv', header: 'อ้างอิงใบกำกับ', cell: (r) => <span className="mono" style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.invoiceNos.join(', ')}</span> },
    { key: 'amt', header: 'จำนวนเงิน', align: 'right', cell: (r) => baht(r.amount), className: 'amt' },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canDelete ? [{
      key: 'restore',
      header: '',
      align: 'center' as const,
      cell: (r: DeletedReceipt) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`กู้คืนใบเสร็จ ${r.no} ?`)) restoreReceipt(r.no) }}>กู้คืน</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบเสร็จรับเงิน"
        sub={`Receipts · ${month === 'all' ? 'ทุกเดือน' : monthName(month)} ${year} — เงินสด/โอน`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['เลขที่ใบเสร็จ', 'วันที่', 'ลูกค้า', 'อ้างอิงใบกำกับ', 'วิธีชำระ', 'ยอดเงิน']
              const body = rows.map((r) => [r.no, r.date, r.customer, r.invoiceNos.join('; '), r.method, r.amount])
              const slug = `receipts-${year}-${month === 'all' ? 'all' : monthName(month)}`
              downloadCsv(slug, [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => { setPrefillCustomer(undefined); setShowForm(true) }}>+ เพิ่มใบเสร็จรับเงิน</Button>
          </>
        }
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รับเงินรวม · Collected" value={baht(total)} delta={`${monthRows.length} ใบ`} note="ใบเสร็จ" />
        <KpiCard label="จำนวนใบเสร็จ · Receipts" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="เฉลี่ยต่อใบ · Avg" value={baht(monthRows.length ? Math.round(total / monthRows.length) : 0)} note="ค่าเฉลี่ย" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <div className="select-wrap" style={{ width: 130 }}>
            <Select value={String(year)} onChange={(e) => { setYear(Number(e.target.value)); setMonth('all') }}>
              {years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
            </Select>
          </div>
          <div className="select-wrap" style={{ width: 150 }}>
            <Select value={String(month)} onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">ทุกเดือน</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </Select>
          </div>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่ใบเสร็จ / ลูกค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {selected.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', marginBottom: 12, borderRadius: 8, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)' }}>
          <span style={{ fontSize: 14 }}>
            เลือก <strong>{selected.size}</strong> ใบเสร็จ
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

      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบเสร็จ`} />

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบใบเสร็จรับเงิน</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <DocModal open={!!active} title={active ? `ใบเสร็จรับเงิน ${active.no}` : ''} onClose={() => setActive(null)}>
        {active && <ReceiptDoc rc={active} />}
      </DocModal>

      <NewReceiptForm
        open={showForm}
        onClose={() => { setShowForm(false); setPrefillCustomer(undefined) }}
        createdReceipts={created.receipts}
        extraInvoices={created.invoices}
        initialCustomer={prefillCustomer}
        onIssued={(rc) => { setShowForm(false); setPrefillCustomer(undefined); setActive(rc) }}
      />

      {downloading && <ReceiptPdfDownload rc={downloading} onDone={() => setDownloading(null)} />}

      {zipQueue && (
        <ReceiptZipDownload
          receipts={zipQueue}
          onProgress={(done, total) => setZipProgress({ done, total })}
          onDone={() => { setZipQueue(null); setZipProgress(null); setSelected(new Set()) }}
        />
      )}
    </>
  )
}
