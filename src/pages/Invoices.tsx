import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, MonthSelect, Checkbox, SavedBy, Field, Input, Select, type Tone } from '../components/ui'
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
import { INVOICES, baht, qm, LATEST_MONTH, monthLabel, type Invoice, type InvStatus } from '../data/selectors'
import { PRODUCT_MAP } from '../data/real'
import { useCreatedDocs, removeInvoice, addInvoicePayment, removeInvoicePayment, CAN_DELETE, type InvoicePayment } from '../data/createdDocs'
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
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Invoice | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [fdRefs, setFdRefs] = useState<string | undefined>(undefined)
  const [downloading, setDownloading] = useState<Invoice | null>(null)
  const [receiptForInvoice, setReceiptForInvoice] = useState<Invoice | null>(null)
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipQueue, setZipQueue] = useState<Invoice[] | null>(null)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const created = useCreatedDocs()
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
    { key: 'site', header: 'SITE', align: 'center', cell: (r) => { const s = invoiceSite(r); return <Badge tone={s === 'foundry' ? 'warning' : 'info'} pip={false} square>{s === 'foundry' ? 'โรงหล่อ' : 'แพล้นปูน'}</Badge> } },
    { key: 'm3', header: 'ปริมาณ', align: 'right', cell: (r) => <span className="mono">{qm(r.lines.reduce((s, l) => s + l.qty, 0))} m³</span> },
    { key: 'total', header: 'ยอดรวม (VAT)', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'due', header: 'ครบกำหนด', cell: (r) => r.dueDate, className: 'date' },
    { key: 'status', header: 'สถานะ', align: 'center', cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].th}</Badge> },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
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
            <>
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
