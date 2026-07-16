import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Checkbox, Field, Input, Select, SortDateToggle, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { TaxInvoiceDoc } from '../components/documents/TaxInvoiceDoc'
import { NewInvoiceForm } from '../components/documents/NewInvoiceForm'
import { NewReceiptForm } from '../components/documents/NewReceiptForm'
import { InvoicePdfDownload } from '../components/documents/InvoicePdfDownload'
import { InvoiceZipDownload } from '../components/documents/InvoiceZipDownload'
import { IconDownload } from '../components/icons'
import { INVOICES, SEED_IMPORTED_INVOICES, RECEIPTS, baht, monthLabel, monthName, ticketYear, type Invoice, type InvStatus } from '../data/selectors'
import { currentBuddhistYear, currentMonth, fmtThaiDateTime } from '../utils/datetime'
import { PRODUCT_MAP } from '../data/real'
import { useCan } from '../data/auth'
import { useCreatedDocs, removeInvoice, restoreInvoice, updateInvoiceNo, addInvoicePayment, removeInvoicePayment, type InvoicePayment, type DeletedInvoice } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | InvStatus

const r2 = (n: number) => Math.round(n * 100) / 100
function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtThaiDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** SITE of an invoice — โรงหล่อ if any line is a foundry product, else แพล้นปูน. */
function invoiceSite(inv: Invoice): 'foundry' | 'plant' {
  return inv.lines.some((l) => PRODUCT_MAP[l.code]?.site === 'foundry') ? 'foundry' : 'plant'
}

const STATUS: Record<InvStatus, { th: string; tone: Tone }> = {
  paid: { th: 'ชำระแล้ว', tone: 'success' },
  pending: { th: 'รอชำระ', tone: 'warning' },
  overdue: { th: 'เกินกำหนด', tone: 'danger' },
}

export function Invoices() {
  const [month, setMonth] = useState<number | 'all'>(currentMonth())
  /* Year + month filter (พ.ศ.) — defaults to the current period; imported
     historical invoices (2564–2568) stay selectable via the year picker. */
  const [year, setYear] = useState<number>(currentBuddhistYear())
  const [filter, setFilter] = useState<Filter>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Invoice | null>(null)
  /* Editing the number of a created invoice (fixing a wrong เลขที่ใบกำกับ). */
  const [editNoInv, setEditNoInv] = useState<Invoice | null>(null)
  const [newNo, setNewNo] = useState('')
  const [noErr, setNoErr] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [fdRefs, setFdRefs] = useState<string | undefined>(undefined)
  const [downloading, setDownloading] = useState<Invoice | null>(null)
  const [receiptForInvoice, setReceiptForInvoice] = useState<Invoice | null>(null)
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipQueue, setZipQueue] = useState<Invoice[] | null>(null)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const created = useCreatedDocs()
  const canDelete = useCan('invoices').edit
  const location = useLocation()
  const navigate = useNavigate()

  /* When navigated here from a foundry delivery note ("ออกใบกำกับภาษี"), open the
     invoice form pre-filled + auto-pulled. Clear router state so a refresh won't re-trigger. */
  useEffect(() => {
    const st = location.state as { invoiceFromFoundry?: string } | null
    if (st?.invoiceFromFoundry) {
      setFdRefs(st.invoiceFromFoundry)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  const hiddenSet = useMemo(() => new Set(created.hidden.invoices), [created.hidden.invoices])
  const allInvoices = useMemo(
    () => [...created.invoices, ...INVOICES, ...SEED_IMPORTED_INVOICES].filter((i) => !hiddenSet.has(i.no)),
    [created.invoices, hiddenSet],
  )
  /* Distinct invoice years (พ.ศ.), newest first — for the year picker. */
  const years = useMemo(
    () => [...new Set([currentBuddhistYear(), ...allInvoices.map((i) => ticketYear(i))])].sort((a, b) => b - a),
    [allInvoices],
  )
  /* Deep-link: open a specific invoice by no (e.g. clicked from the foundry-delivery
     table's เลขใบกำกับภาษี column). Clear the router state so a refresh won't re-open. */
  useEffect(() => {
    const st = location.state as { openInvoiceNo?: string } | null
    if (!st?.openInvoiceNo) return
    const inv = allInvoices.find((i) => i.no === st.openInvoiceNo)
    if (inv) setActive(inv)
    navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate, allInvoices])
  /* Filter by year first (keeps the historical import separate), then month. */
  const yearRows = useMemo(() => allInvoices.filter((i) => ticketYear(i) === year), [allInvoices, year])
  const monthRows = useMemo(() => (month === 'all' ? yearRows : yearRows.filter((i) => i.month === month)), [month, yearRows])

  /* Effective payment state — the stored `status` goes stale because issuing a
     receipt (or recording a payment) never rewrites it, and seed invoices are
     read-only. So an invoice counts as ชำระแล้ว when it was cash/โอน at issue, when
     a ใบเสร็จรับเงิน references it, or when its recorded payments cover the total. */
  const allReceipts = useMemo(() => [...created.receipts, ...RECEIPTS], [created.receipts])
  const receiptNoByInvoice = useMemo(() => {
    const m = new Map<string, string>()
    for (const rc of allReceipts) for (const no of rc.invoiceNos) if (!m.has(no)) m.set(no, rc.no)
    return m
  }, [allReceipts])
  const paidByPayments = useMemo(() => {
    const sum = new Map<string, number>()
    for (const p of created.invoicePayments) sum.set(p.invoiceNo, (sum.get(p.invoiceNo) ?? 0) + p.amount)
    return sum
  }, [created.invoicePayments])
  const effStatus = (inv: Invoice): InvStatus => {
    if (inv.status === 'paid') return 'paid'
    if (receiptNoByInvoice.has(inv.no)) return 'paid'
    if ((paidByPayments.get(inv.no) ?? 0) >= inv.total - 0.005) return 'paid'
    return inv.status
  }

  const rows = useMemo(
    () => {
      const filtered = monthRows.filter((inv) => {
        if (filter !== 'all' && effStatus(inv) !== filter) return false
        if (query && !`${inv.no} ${inv.customer}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      })
      /* Sort by full date (ปี→เดือน→วันที่) so it holds across the ทุกเดือน view too. */
      const dnum = (d: string) => parseInt(d.slice(0, 2), 10) || 0
      const key = (i: Invoice) => ticketYear(i) * 10000 + i.month * 100 + dnum(i.date)
      return [...filtered].sort((a, b) => (sortDir === 'asc' ? key(a) - key(b) : key(b) - key(a)))
    },
    [monthRows, filter, query, sortDir, receiptNoByInvoice, paidByPayments],
  )
  const cnt = (s: InvStatus) => monthRows.filter((i) => effStatus(i) === s).length
  const netSales = monthRows.reduce((s, i) => s + i.subtotal, 0)
  const outstanding = monthRows.filter((i) => effStatus(i) !== 'paid').reduce((s, i) => s + i.total, 0)

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
    { key: 'site', header: 'SITE', align: 'center', cell: (r) => { const s = invoiceSite(r); return <Badge tone={s === 'foundry' ? 'warning' : 'info'} pip={false} square>{s === 'foundry' ? 'โรงหล่อ' : 'แพล้นปูน'}</Badge> } },
    { key: 'total', header: 'ยอดรวม (VAT)', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'status', header: 'สถานะ', align: 'center', cell: (r) => { const s = effStatus(r); return <Badge tone={STATUS[s].tone}>{STATUS[s].th}</Badge> } },
    { key: 'receipt', header: 'เลขที่ใบเสร็จ', cell: (r) => {
      const no = receiptNoByInvoice.get(r.no)
      if (!no) return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
      const open = () => navigate('/receipts', { state: { openReceiptNo: no } })
      return <a className="mono" role="button" tabIndex={0} style={{ fontSize: 13, color: 'var(--kpc-primary)', textDecoration: 'underline', cursor: 'pointer' }}
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open() }}>{no}</a>
    }, className: 'docno' },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'sales', group: 'ใบกำกับภาษี / วางบิล', ref: r.no, label: r.no, sub: `${r.customer} · ${baht(r.total)}`, route: '/invoices' }} /> },
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
      cell: (r: Invoice) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบกำกับ ${r.no} ?\nระบบจะเก็บประวัติการลบไว้ตรวจสอบย้อนหลัง`)) removeInvoice(r)
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* Deleted-invoice history for the current period — appended below the list. */
  const deletedRows = useMemo(
    () => created.deletedInvoices.filter((d) => ticketYear(d) === year && (month === 'all' || d.month === month)),
    [created.deletedInvoices, year, month],
  )
  const deletedColumns: Column<DeletedInvoice>[] = [
    { key: 'no', header: 'เลขที่ใบกำกับ', cell: (r) => r.no, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'total', header: 'ยอดรวม (VAT)', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canDelete ? [{
      key: 'restore',
      header: '',
      align: 'center' as const,
      cell: (r: DeletedInvoice) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`กู้คืนใบกำกับ ${r.no} ?`)) restoreInvoice(r.no) }}>กู้คืน</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบกำกับภาษี"
        sub={`Tax Invoices · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — รวมจากใบจ่ายคอนกรีต`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['เลขที่ใบกำกับ', 'วันที่', 'ครบกำหนด', 'ลูกค้า', 'การชำระ', 'จำนวนรายการ', 'ปริมาณรวม (m³)', 'ยอดก่อน VAT', 'VAT', 'ยอดรวม', 'สถานะ']
              const body = rows.map((r) => {
                const m3 = r.lines.reduce((s, l) => s + (l.unit === 'คิว' ? l.qty : 0), 0)
                return [r.no, r.date, r.dueDate, r.customer, r.pay, r.lines.length, Math.round(m3 * 100) / 100, r.subtotal, r.vat, r.total, STATUS[r.status].th]
              })
              const slug = `invoices-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
              downloadCsv(slug, [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}>+ เพิ่มใบกำกับภาษี</Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบกำกับ · Invoices" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="ยอดขายรวม · Net sales" value={baht(netSales)} note="ก่อน VAT" />
        <KpiCard label="รอชำระ · Pending" value={cnt('pending').toString()} delta="เครดิต" deltaDir="down" note="" />
        <KpiCard label="ค้างชำระ · Outstanding" value={baht(outstanding)} note="ยอดเครดิต" invert />
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
          <div className="pills">
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {monthRows.length}</Pill>
            <Pill active={filter === 'pending'} onClick={() => setFilter('pending')}>รอชำระ {cnt('pending')}</Pill>
            <Pill active={filter === 'paid'} onClick={() => setFilter('paid')}>ชำระแล้ว {cnt('paid')}</Pill>
            {cnt('overdue') > 0 && <Pill active={filter === 'overdue'} onClick={() => setFilter('overdue')}>เกินกำหนด {cnt('overdue')}</Pill>}
          </div>
          <SortDateToggle dir={sortDir} onToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} />
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

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบใบกำกับภาษี</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <DocModal
        open={!!active}
        title={active ? `ใบกำกับภาษี ${active.no}` : ''}
        onClose={() => setActive(null)}
        extraActions={
          active ? (
            <>
              {/* Credit / unpaid invoices become a ลูกหนี้ balance automatically —
                 offer a quick jump to verify the debtor on the ลูกหนี้ page. */}
              {effStatus(active) !== 'paid' && (
                <Button variant="secondary" onClick={() => { setActive(null); navigate('/ledger') }}>
                  ดูในลูกหนี้
                </Button>
              )}
              {/* เลขที่ใบกำกับ can be fixed on created invoices (seed/imported are read-only). */}
              {created.invoices.some((i) => i.no === active.no) && (
                <Button variant="secondary" onClick={() => { const inv = active; setActive(null); setNewNo(inv.no); setNoErr(''); setEditNoInv(inv) }}>
                  แก้ไขเลขที่
                </Button>
              )}
              <Button variant="secondary" onClick={() => { const inv = active; setActive(null); setPayingInvoice(inv) }}>
                ผ่อนชำระ
              </Button>
              <Button variant="tonal" onClick={() => { const inv = active; setActive(null); setReceiptForInvoice(inv) }}>
                ออกใบเสร็จรับเงิน
              </Button>
            </>
          ) : undefined
        }
      >
        {active && <TaxInvoiceDoc inv={active} />}
      </DocModal>

      {/* Fix a wrong invoice number on a created invoice. */}
      <Modal
        open={!!editNoInv}
        title="แก้ไขเลขที่ใบกำกับ"
        onClose={() => setEditNoInv(null)}
        maxWidth={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditNoInv(null)}>ยกเลิก</Button>
            <Button variant="primary" onClick={() => {
              if (!editNoInv) return
              const n = newNo.trim()
              if (!n) { setNoErr('กรุณากรอกเลขที่ใบกำกับ'); return }
              if (n !== editNoInv.no && allInvoices.some((i) => i.no === n)) { setNoErr(`เลขที่ ${n} ถูกใช้แล้ว`); return }
              updateInvoiceNo(editNoInv.no, n)
              setEditNoInv(null)
            }}>บันทึก</Button>
          </>
        }
      >
        {noErr && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{noErr}</div>}
        <Field label="เลขที่ใบกำกับ" required hint={editNoInv ? `เดิม: ${editNoInv.no}` : undefined}>
          <Input className="input mono" value={newNo} onChange={(e) => { setNewNo(e.target.value); setNoErr('') }} placeholder="เช่น 690621-0001" />
        </Field>
      </Modal>

      <InstallmentModal invoice={payingInvoice} payments={created.invoicePayments} onClose={() => setPayingInvoice(null)} />

      <NewInvoiceForm
        open={showForm}
        onClose={() => { setShowForm(false); setFdRefs(undefined) }}
        createdInvoices={created.invoices}
        initialFdRefs={fdRefs}
        onIssued={(inv) => { setShowForm(false); setFdRefs(undefined); setActive(inv) }}
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

function SummaryStat({ label, value, tone, strong }: { label: string; value: string; tone?: 'ok' | 'warn'; strong?: boolean }) {
  const color = tone === 'warn' ? 'var(--kpc-danger)' : tone === 'ok' ? '#15803d' : 'var(--kpc-text-strong)'
  return (
    <div className="card" style={{ padding: '10px 12px', background: 'var(--kpc-surface-alt)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>{label}</div>
      <div className="mono" style={{ fontSize: strong ? 18 : 15, fontWeight: strong ? 800 : 700, color }}>{value}</div>
    </div>
  )
}

/** ผ่อนชำระ — record installment payments against an invoice; the system tracks
    ชำระแล้ว and computes the live ยอดคงค้าง (invoice.total − Σ payments). */
function InstallmentModal({ invoice, payments, onClose }: { invoice: Invoice | null; payments: InvoicePayment[]; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [method, setMethod] = useState('เงินสด')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!invoice) return
    setAmount(''); setDate(todayIso()); setMethod('เงินสด'); setNote(''); setErr('')
  }, [invoice])

  const invPayments = useMemo(
    () => (invoice ? payments.filter((p) => p.invoiceNo === invoice.no).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [payments, invoice],
  )
  if (!invoice) return null

  const isPaid = invoice.status === 'paid'
  const paid = invPayments.reduce((s, p) => s + p.amount, 0)
  const paidDisplay = isPaid ? invoice.total : paid
  const outstanding = isPaid ? 0 : Math.max(0, r2(invoice.total - paid))
  const amt = Number(amount) || 0
  const afterOutstanding = Math.max(0, r2(outstanding - amt))

  const save = () => {
    setErr('')
    if (!amt || amt <= 0) return setErr('กรุณาระบุจำนวนเงินที่ชำระ (มากกว่า 0)')
    if (amt > outstanding + 0.001) return setErr(`จำนวนเกินยอดคงค้าง (${baht(outstanding)})`)
    if (!date) return setErr('กรุณาระบุวันที่ชำระ')
    addInvoicePayment({ id: `ip_${Date.now()}`, invoiceNo: invoice.no, amount: r2(amt), date, method, note: note.trim() || undefined })
    setAmount(''); setNote(''); setErr('')
  }

  return (
    <Modal
      open={!!invoice}
      title={`ผ่อนชำระ · ใบกำกับ ${invoice.no}`}
      onClose={onClose}
      maxWidth={560}
      footer={<><Button variant="secondary" onClick={onClose}>ปิด</Button><Button variant="primary" onClick={save} disabled={outstanding <= 0}>บันทึกการชำระ</Button></>}
    >
      <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginBottom: 12 }}>ลูกค้า: <strong style={{ color: 'var(--kpc-text-strong)' }}>{invoice.customer}</strong></div>

      <div className="grid g-3" style={{ gap: 10, marginBottom: 16 }}>
        <SummaryStat label="ยอดรวมทั้งสิ้น" value={baht(invoice.total)} />
        <SummaryStat label="ชำระแล้ว" value={baht(paidDisplay)} tone="ok" />
        <SummaryStat label="ยอดคงค้าง" value={baht(outstanding)} tone={outstanding > 0 ? 'warn' : 'ok'} strong />
      </div>

      {outstanding <= 0 ? (
        <div style={{ padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: 13, fontWeight: 600 }}>✓ ชำระครบแล้ว ไม่มียอดคงค้าง</div>
      ) : (
        <>
          {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div className="grid g-2" style={{ gap: 12 }}>
            <Field label="จำนวนเงินที่ชำระ" required hint={`ยอดคงค้าง ${baht(outstanding)}`}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input type="number" step="0.01" min={0} placeholder="เช่น 5000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 1 }} />
                <Button variant="tonal" size="sm" onClick={() => setAmount(String(outstanding))}>ทั้งหมด</Button>
              </div>
            </Field>
            <Field label="วันที่ชำระ" required hint="ค่าเริ่มต้น = วันนี้">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="วิธีชำระ">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="เงินสด">เงินสด</option>
                <option value="โอน">โอน</option>
                <option value="เช็ค">เช็ค</option>
              </Select>
            </Field>
            <Field label="หมายเหตุ">
              <Input placeholder="เช่น งวดที่ 1" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: 12, fontSize: 13, textAlign: 'right', color: 'var(--kpc-text-muted)' }}>
            ยอดคงค้างหลังชำระ: <strong className="mono" style={{ color: afterOutstanding > 0 ? 'var(--kpc-danger)' : '#15803d', fontSize: 15 }}>{baht(afterOutstanding)}</strong>
          </div>
        </>
      )}

      {invPayments.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 8 }}>ประวัติการชำระ ({invPayments.length} ครั้ง)</div>
          <table className="table" style={{ width: '100%', fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>วันที่</th><th style={{ textAlign: 'left' }}>วิธี</th><th style={{ textAlign: 'right' }}>จำนวนเงิน</th><th style={{ textAlign: 'left' }}>ผู้บันทึก</th><th /></tr></thead>
            <tbody>
              {invPayments.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{fmtThaiDate(p.date)}</td>
                  <td>{p.method ?? '—'}{p.note ? ` · ${p.note}` : ''}</td>
                  <td style={{ textAlign: 'right' }} className="mono">{baht(p.amount)}</td>
                  <td style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{p.createdBy ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm('ลบรายการชำระนี้?')) removeInvoicePayment(p.id) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={2} style={{ fontWeight: 600 }}>รวมชำระแล้ว</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{baht(paid)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      )}
    </Modal>
  )
}
