import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, MonthSelect, Checkbox, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { DELIVERY_TICKETS, type DeliveryTicket } from '../data/real'
import { INVOICES, baht, qm, prodShort, LATEST_MONTH, monthLabel } from '../data/selectors'
import { useCreatedDocs, removeTicket, CAN_DELETE } from '../data/createdDocs'
import { NewDeliveryTicketForm } from '../components/documents/NewDeliveryTicketForm'
import { NewInvoiceForm } from '../components/documents/NewInvoiceForm'
import { DocModal } from '../components/documents/DocModal'
import { DeliveryTicketDoc } from '../components/documents/DeliveryTicketDoc'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | 'ขายลูกค้า' | 'โรงหล่อ' | 'ใช้เอง'

const TYPE_TONE: Record<string, Tone> = { ขายลูกค้า: 'info', โรงหล่อ: 'neutral', ใช้เอง: 'warning' }
const PAY_TONE: Record<string, Tone> = { เครดิต: 'warning', เงินสด: 'success', โอน: 'info' }

export function DeliveryTickets() {
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [active, setActive] = useState<DeliveryTicket | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [invoiceRefs, setInvoiceRefs] = useState<string | null>(null)
  const created = useCreatedDocs()

  const newSet = useMemo(() => new Set(created.tickets.map((t) => t.dtNo)), [created.tickets])
  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])

  /* Reverse lookup: dtNo / ref → IV69 invoice number, built from every invoice's
     refs[] (matches both user-created tickets via dtNo and seed tickets via ref).
     Excludes invoices the user has deleted (hidden) so the link disappears after
     the invoice is removed — and the ticket becomes re-issuable. */
  const hiddenInvoiceSet = useMemo(() => new Set(created.hidden.invoices), [created.hidden.invoices])
  const invoiceByTicket = useMemo(() => {
    const map = new Map<string, string>()
    for (const inv of [...created.invoices, ...INVOICES]) {
      if (hiddenInvoiceSet.has(inv.no)) continue
      for (const r of inv.refs) {
        if (r && !map.has(r)) map.set(r, inv.no)
      }
    }
    return map
  }, [created.invoices, hiddenInvoiceSet])
  const ticketInvoiceNo = (t: DeliveryTicket): string =>
    invoiceByTicket.get(t.dtNo) || invoiceByTicket.get(t.ref) || ''
  const hasInvoice = (t: DeliveryTicket): boolean => ticketInvoiceNo(t) !== ''
  const allTickets = useMemo(
    () => [...created.tickets, ...DELIVERY_TICKETS].filter((t) => !hiddenSet.has(t.dtNo)),
    [created.tickets, hiddenSet],
  )
  const monthRows = useMemo(() => (month === 'all' ? allTickets : allTickets.filter((t) => t.month === month)), [month, allTickets])
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

  const toggleOne = (dtNo: string) => {
    const next = new Set(selected)
    if (next.has(dtNo)) next.delete(dtNo); else next.add(dtNo)
    setSelected(next)
  }

  const allFilteredSelected = rows.length > 0 && rows.every((r) => selected.has(r.dtNo))
  const toggleAllFiltered = () => {
    const next = new Set(selected)
    if (allFilteredSelected) {
      rows.forEach((r) => next.delete(r.dtNo))
    } else {
      rows.forEach((r) => next.add(r.dtNo))
    }
    setSelected(next)
  }

  const openInvoiceForTicket = (t: DeliveryTicket) => {
    if (hasInvoice(t)) {
      alert(`ใบจ่าย ${t.dtNo} มีใบกำกับภาษี ${ticketInvoiceNo(t)} อยู่แล้ว — ต้องลบใบกำกับเดิมก่อนถึงจะออกใหม่ได้`)
      return
    }
    setActive(null)
    setInvoiceRefs(t.dtNo)
  }
  const openInvoiceForSelected = () => {
    if (selected.size === 0) return
    /* Filter out tickets that already have an invoice — reissuing would
       create duplicate invoice entries against the same delivery refs. */
    const ticketByKey = new Map(allTickets.map((t) => [t.dtNo, t]))
    const selectedTickets = [...selected].map((k) => ticketByKey.get(k)).filter((t): t is DeliveryTicket => !!t)
    const issuable = selectedTickets.filter((t) => !hasInvoice(t))
    const blocked = selectedTickets.length - issuable.length
    if (issuable.length === 0) {
      alert(`ใบจ่ายที่เลือกทั้ง ${selectedTickets.length} ใบมีใบกำกับภาษีแล้ว — ต้องลบใบกำกับเดิมก่อนถึงจะออกใหม่ได้`)
      return
    }
    if (blocked > 0) {
      if (!confirm(`${blocked} ใบมีใบกำกับภาษีแล้ว · จะดำเนินการเฉพาะ ${issuable.length} ใบที่เหลือ?`)) return
    }
    setInvoiceRefs(issuable.map((t) => t.dtNo).join(','))
  }

  const exportExcel = () => {
    const head = ['เลขที่ใบจ่าย', 'วันที่', 'ประเภท', 'ลูกค้า', 'สินค้า', 'คิว', 'ราคา/คิว', 'ยอดเงิน', 'หมายเลขรถ', 'ชำระโดย', 'เลขใบกำกับภาษี']
    const body = rows.map((r) => [
      r.dtNo, r.date, r.type, r.customer, prodShort(r.prod), r.m3, r.price, r.amount,
      r.vehicle ?? '', r.pay ?? '', ticketInvoiceNo(r),
    ])
    const slug = `delivery-tickets-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
    downloadCsv(slug, [head, ...body])
  }

  const columns: Column<DeliveryTicket>[] = [
    {
      key: 'sel',
      header: <Checkbox checked={allFilteredSelected} onChange={toggleAllFiltered}>{''}</Checkbox>,
      align: 'center',
      cell: (r) => <Checkbox checked={selected.has(r.dtNo)} onChange={() => toggleOne(r.dtNo)}>{''}</Checkbox>,
    },
    {
      key: 'dt',
      header: 'เลขที่ใบจ่าย',
      cell: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {r.dtNo}
          {newSet.has(r.dtNo) && <Badge tone="success" pip={false} square>ใหม่</Badge>}
        </span>
      ),
      className: 'docno',
    },
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'type', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={TYPE_TONE[r.type] ?? 'neutral'} square pip={false}>{r.type}</Badge> },
    { key: 'cust', header: 'ลูกค้า / หน่วยงาน', cell: (r) => r.customer },
    { key: 'prod', header: 'สินค้า', cell: (r) => <span className="th">{prodShort(r.prod)}</span> },
    { key: 'm3', header: 'คิว', align: 'right', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'veh', header: 'หมายเลขรถ', align: 'center', cell: (r) => (r.vehicle ? <span className="mono">รถ {r.vehicle}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'inv',
      header: 'เลขใบกำกับภาษี',
      cell: (r) => {
        const no = ticketInvoiceNo(r)
        return no
          ? <span className="mono" style={{ fontSize: 13 }}>{no}</span>
          : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
      },
      className: 'docno',
    },
    { key: 'pay', header: 'ชำระโดย', align: 'center', cell: (r) => (r.pay ? <Badge tone={PAY_TONE[r.pay] ?? 'neutral'} pip={false} square>{r.pay}</Badge> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(CAN_DELETE ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: DeliveryTicket) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบจ่าย ${r.dtNo} ?\n(เฉพาะโหมดทดสอบ)`)) {
            removeTicket(r.dtNo)
            const next = new Set(selected); next.delete(r.dtNo); setSelected(next)
          }
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบจ่ายคอนกรีต"
        sub={`Delivery Tickets · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)}`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <IconPlus /> บันทึกใบจ่ายคอนกรีต
            </Button>
          </>
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

      {selected.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', marginBottom: 12, borderRadius: 8, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)' }}>
          <span style={{ fontSize: 14 }}>
            เลือก <strong>{selected.size}</strong> ใบจ่าย
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>ล้างการเลือก</Button>
            <Button variant="primary" size="sm" onClick={openInvoiceForSelected}>ออกใบกำกับภาษีจาก {selected.size} ใบจ่าย</Button>
          </div>
        </div>
      )}

      <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบจ่าย`} />

      <NewDeliveryTicketForm
        open={showForm}
        onClose={() => setShowForm(false)}
        createdTickets={created.tickets}
        onSaved={(t) => {
          setShowForm(false)
          setMonth(t.month)
          setFilter('all')
          setQuery(t.dtNo)
        }}
      />

      <DocModal
        open={!!active}
        title={active ? `ใบจ่ายคอนกรีต ${active.dtNo}` : ''}
        onClose={() => setActive(null)}
        extraActions={
          active ? (
            hasInvoice(active) ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--kpc-text-muted)' }}>
                ออกใบกำกับภาษี <span className="mono" style={{ color: 'var(--kpc-primary-ink, #1d4ed8)', fontWeight: 600 }}>{ticketInvoiceNo(active)}</span> แล้ว
                <Button variant="tonal" disabled>ออกใบกำกับภาษี</Button>
              </span>
            ) : (
              <Button variant="tonal" onClick={() => openInvoiceForTicket(active)}>
                ออกใบกำกับภาษี
              </Button>
            )
          ) : undefined
        }
      >
        {active && <DeliveryTicketDoc ticket={active} />}
      </DocModal>

      <NewInvoiceForm
        open={invoiceRefs !== null}
        onClose={() => setInvoiceRefs(null)}
        createdInvoices={created.invoices}
        initialRefs={invoiceRefs ?? undefined}
        onIssued={() => { setInvoiceRefs(null); setSelected(new Set()) }}
      />
    </>
  )
}
