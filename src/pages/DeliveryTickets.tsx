import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Checkbox, Select, type Tone } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { DELIVERY_TICKETS, type DeliveryTicket } from '../data/real'
import { SEED_IMPORTED_TICKETS } from '../data/ticketSeed'
import { INVOICES, SEED_IMPORTED_INVOICES, baht, qm, prodShort, monthName, ticketYear, type Invoice } from '../data/selectors'
import { currentBuddhistYear, currentMonth, fmtThaiDateTime } from '../utils/datetime'
import { useCreatedDocs, removeTicket, restoreTicket, removeInvoice, markSalesOrderProduced, addSalesOrder, updateTicket, nextSoNo, type DeletedTicket } from '../data/createdDocs'
import { TaxInvoiceDoc } from '../components/documents/TaxInvoiceDoc'
import { useCurrentUser, useCan } from '../data/auth'
import { NewDeliveryTicketForm, type DeliveryTicketInitial } from '../components/documents/NewDeliveryTicketForm'
import { ImportDeliveryTicketsModal } from '../components/documents/ImportDeliveryTicketsModal'
import { NewInvoiceForm } from '../components/documents/NewInvoiceForm'
import { DocModal } from '../components/documents/DocModal'
import { DeliveryTicketDoc } from '../components/documents/DeliveryTicketDoc'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | 'ขายลูกค้า' | 'โรงหล่อ' | 'ใช้เอง'

const TYPE_TONE: Record<string, Tone> = { ขายลูกค้า: 'info', โรงหล่อ: 'neutral', ใช้เอง: 'warning' }

export function DeliveryTickets() {
  /* Year (พ.ศ.) + month filter — defaults to the current month/year so the
     newest tickets show first; historical years (2564–2568) stay selectable. */
  const [year, setYear] = useState(currentBuddhistYear())
  const [month, setMonth] = useState<number | 'all'>(currentMonth())
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [prefill, setPrefill] = useState<DeliveryTicketInitial | null>(null)
  /* soNo of the sales order this ticket is being issued from, if any — used to
     flip that order's status to 'ผลิต' once the ticket is saved. */
  const [prefillSalesOrderNo, setPrefillSalesOrderNo] = useState<string | null>(null)
  const [active, setActive] = useState<DeliveryTicket | null>(null)
  /* The user-created ticket currently being edited (opens the form in edit mode). */
  const [editing, setEditing] = useState<DeliveryTicket | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [invoiceRefs, setInvoiceRefs] = useState<string | null>(null)
  /* Issued invoice currently being viewed (opened from a ticket's detail modal). */
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const created = useCreatedDocs()
  const isAdmin = useCurrentUser()?.role === 'Admin'
  /* Deletion is allowed for anyone with edit rights on this page (now in
     production too) — every removal is kept in the history table below. */
  const canDelete = useCan('delivery-tickets').edit
  const location = useLocation()
  const navigate = useNavigate()

  /* When navigated here from a sales order ("ออกใบจ่ายคอนกรีต"), open the
     create form pre-filled with the ordered item. Clear the router state so a
     refresh / back-nav doesn't re-trigger it. */
  useEffect(() => {
    const st = location.state as { issueFromSalesOrder?: DeliveryTicketInitial; salesOrderNo?: string; focusDtNo?: string } | null
    if (st?.issueFromSalesOrder) {
      setPrefill(st.issueFromSalesOrder)
      setPrefillSalesOrderNo(st.salesOrderNo ?? null)
      setShowForm(true)
      navigate(location.pathname, { replace: true, state: null })
    } else if (st?.focusDtNo) {
      /* Navigated here from a sales order's ใบจ่ายคอนกรีต link — focus that ticket. */
      const dt = [...created.tickets, ...DELIVERY_TICKETS].find((t) => t.dtNo === st.focusDtNo)
      if (dt) { setYear(ticketYear(dt)); setMonth(dt.month); setFilter('all'); setQuery(dt.dtNo) }
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate, created.tickets])

  const newSet = useMemo(() => new Set(created.tickets.map((t) => t.dtNo)), [created.tickets])
  const hiddenSet = useMemo(() => new Set(created.hidden.tickets), [created.hidden.tickets])

  /* Reverse lookup: dtNo / ref → IV69 invoice number, built from every invoice's
     refs[] (matches both user-created tickets via dtNo and seed tickets via ref).
     Excludes invoices the user has deleted (hidden) so the link disappears after
     the invoice is removed — and the ticket becomes re-issuable. */
  const hiddenInvoiceSet = useMemo(() => new Set(created.hidden.invoices), [created.hidden.invoices])
  const invoiceByTicket = useMemo(() => {
    const map = new Map<string, string>()
    for (const inv of [...created.invoices, ...INVOICES, ...SEED_IMPORTED_INVOICES]) {
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
  const invoiceByNo = (no: string): Invoice | undefined =>
    [...created.invoices, ...INVOICES, ...SEED_IMPORTED_INVOICES].find((i) => i.no === no)
  /* Cancel an issued invoice (e.g. one raised by mistake) — the linked ใบจ่าย
     becomes re-issuable. removeInvoice removes a user-created one or hides a seed one. */
  const cancelInvoice = (no: string) => {
    if (!no) return
    if (confirm(`ยกเลิกใบกำกับภาษี ${no} ?\nใบจ่ายที่เกี่ยวข้องจะกลับมาออกใบกำกับใหม่ได้`)) {
      removeInvoice(no)
      setViewInvoice(null)
    }
  }
  /* Runtime tickets + baked import seed + built-in seed, deduped by dtNo
     (runtime wins) and minus hidden ones. */
  const allTickets = useMemo(() => {
    const seen = new Set<string>()
    const out: DeliveryTicket[] = []
    for (const t of [...created.tickets, ...SEED_IMPORTED_TICKETS, ...DELIVERY_TICKETS]) {
      if (hiddenSet.has(t.dtNo) || seen.has(t.dtNo)) continue
      seen.add(t.dtNo); out.push(t)
    }
    return out
  }, [created.tickets, hiddenSet])
  /* Selectable periods (เดือน + ปี พ.ศ.) built from the tickets that actually
     exist — so importing historical data adds its periods to the dropdown. */
  /* Distinct ticket years (พ.ศ.), newest first — for the year picker. */
  const years = useMemo(
    () => [...new Set([currentBuddhistYear(), ...allTickets.map((t) => ticketYear(t))])].sort((a, b) => b - a),
    [allTickets],
  )
  /* Snap the year to a valid one if the current selection no longer exists. */
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0])
  }, [years, year])
  const monthRows = useMemo(
    () => allTickets.filter((t) => ticketYear(t) === year && (month === 'all' || t.month === month)),
    [year, month, allTickets],
  )
  const rows = useMemo(
    () =>
      monthRows.filter((t) => {
        if (filter !== 'all' && t.type !== filter) return false
        if (query && !`${t.dtNo} ${t.customer} ${t.prod}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [monthRows, filter, query],
  )

  /* Deleted-ticket history for the current period — appended below the list. */
  const deletedRows = useMemo(
    () => created.deletedTickets.filter((t) => ticketYear(t) === year && (month === 'all' || t.month === month)),
    [created.deletedTickets, year, month],
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
    const slug = `delivery-tickets-${year}-${month === 'all' ? 'all' : month}`
    downloadCsv(slug, [head, ...body])
  }

  /* Dev-only: dump the runtime tickets (audit fields stripped) so they can be
     baked into ticketSeed.json for production. */
  const exportSeed = () => {
    const clean = created.tickets.map((t) => { const c: DeliveryTicket = { ...t }; delete c.createdBy; delete c.createdAt; return c })
    const blob = new Blob([JSON.stringify(clean)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'delivery-tickets-seed.json'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
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
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'sales', group: 'ใบจ่ายคอนกรีต', ref: r.dtNo, label: r.dtNo, sub: `${r.customer} · ${qm(r.m3)} คิว · ${baht(r.amount)}`, route: '/delivery-tickets' }} /> },
    {
      key: 'act', header: '', align: 'center',
      cell: (r) => (
        <div className="row" style={{ gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
          {/* Edit only user-created tickets — seed tickets have no store record to patch. */}
          {newSet.has(r.dtNo) && <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setShowForm(true) }}>แก้ไข</Button>}
          <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button>
        </div>
      ),
    },
    ...(canDelete ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: DeliveryTicket) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบจ่าย ${r.dtNo} ?\nระบบจะเก็บไว้ในประวัติการลบด้านล่าง (กู้คืนได้)`)) {
            removeTicket(r)
            const next = new Set(selected); next.delete(r.dtNo); setSelected(next)
          }
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* Columns for the deletion-history table below the list (read-only + restore). */
  const deletedColumns: Column<DeletedTicket>[] = [
    { key: 'dt', header: 'เลขที่ใบจ่าย', cell: (r) => r.dtNo, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => r.date, className: 'date' },
    { key: 'type', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={TYPE_TONE[r.type] ?? 'neutral'} square pip={false}>{r.type}</Badge> },
    { key: 'cust', header: 'ลูกค้า / หน่วยงาน', cell: (r) => r.customer },
    { key: 'prod', header: 'สินค้า', cell: (r) => <span className="th">{prodShort(r.prod)}</span> },
    { key: 'm3', header: 'คิว', align: 'right', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canDelete ? [{
      key: 'restore',
      header: '',
      align: 'center' as const,
      cell: (r: DeletedTicket) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`กู้คืนใบจ่าย ${r.dtNo} ?`)) restoreTicket(r.dtNo) }}>กู้คืน</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบจ่ายคอนกรีต"
        sub={`Delivery Tickets · ${month === 'all' ? 'ทุกเดือน' : monthName(month)} ${year}`}
        actions={
          <>
            {import.meta.env.DEV && (
              <Button variant="secondary" onClick={exportSeed} disabled={created.tickets.length === 0}>ส่งออก seed (dev)</Button>
            )}
            {isAdmin && <Button variant="secondary" onClick={() => setShowImport(true)}>นำเข้า Excel</Button>}
            <Button variant="secondary" onClick={exportExcel}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => { setEditing(null); setPrefill(null); setShowForm(true) }}>
              <IconPlus /> บันทึกใบจ่ายคอนกรีต
            </Button>
          </>
        }
      />
      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบจ่าย · Tickets" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="ปริมาณรวม · Volume" value={totM3.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} unit="m³" note="ผลิต+ส่ง" />
        <KpiCard label="ยอดขาย · Sales" value={baht(totSales)} note="เฉพาะขายลูกค้า" />
        <KpiCard label="ใช้ภายใน · Internal" value={cnt('โรงหล่อ').toString()} note="โรงหล่อ" invert />
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

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบใบจ่ายคอนกรีต</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <NewDeliveryTicketForm
        open={showForm}
        onClose={() => { setShowForm(false); setPrefill(null); setPrefillSalesOrderNo(null); setEditing(null) }}
        createdTickets={created.tickets}
        initial={prefill}
        editTicket={editing}
        onSaved={(t) => {
          const wasEdit = !!editing
          if (wasEdit) {
            /* Editing an existing ticket — don't spin up a new sales order. */
          } else if (prefillSalesOrderNo) {
            /* Issued from a sales order → flip it to 'ผลิต' and link the ticket. */
            markSalesOrderProduced(prefillSalesOrderNo)
            updateTicket(t.dtNo, { soNo: prefillSalesOrderNo })
          } else if (t.type === 'ขายลูกค้า') {
            /* Standalone customer ticket → auto-create a matching sales order
               (already produced) and link it both ways. */
            const soNo = nextSoNo(created.salesOrders)
            const now = new Date()
            const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            addSalesOrder({
              id: soNo, soNo, orderDate: iso, useDate: iso, customer: t.customer,
              items: [{ code: t.prod, name: prodShort(t.prod), qty: t.m3, unit: 'คิว' }],
              status: 'ผลิต', note: `สร้างอัตโนมัติจากใบจ่ายคอนกรีต ${t.dtNo}`,
              createdAt: now.toISOString(),
            })
            updateTicket(t.dtNo, { soNo })
          }
          setShowForm(false)
          setPrefill(null)
          setPrefillSalesOrderNo(null)
          setEditing(null)
          setYear(ticketYear(t)); setMonth(t.month)
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--kpc-text-muted)', flexWrap: 'wrap' }}>
                ออกใบกำกับภาษี <span className="mono" style={{ color: 'var(--kpc-primary-ink, #1d4ed8)', fontWeight: 600 }}>{ticketInvoiceNo(active)}</span> แล้ว
                <Button variant="secondary" size="sm" onClick={() => { const inv = invoiceByNo(ticketInvoiceNo(active)); if (inv) { setActive(null); setViewInvoice(inv) } }}>เปิดดูใบกำกับ</Button>
                <Button variant="secondary" size="sm" onClick={() => cancelInvoice(ticketInvoiceNo(active))} style={{ color: 'var(--kpc-danger)' }}>ยกเลิกใบกำกับ</Button>
              </span>
            ) : (
              <>
                {/* Edit is allowed only before an invoice is issued, and only for
                    user-created tickets (seed tickets have no store record to patch). */}
                {newSet.has(active.dtNo) && (
                  <Button variant="secondary" onClick={() => { const t = active; setActive(null); setEditing(t); setShowForm(true) }}>แก้ไข</Button>
                )}
                <Button variant="tonal" onClick={() => openInvoiceForTicket(active)}>
                  ออกใบกำกับภาษี
                </Button>
              </>
            )
          ) : undefined
        }
      >
        {active && <DeliveryTicketDoc ticket={active} />}
      </DocModal>

      {/* View an issued invoice (from a ticket's detail) with a cancel action. */}
      <DocModal
        open={!!viewInvoice}
        title={viewInvoice ? `ใบกำกับภาษี ${viewInvoice.no}` : ''}
        onClose={() => setViewInvoice(null)}
        extraActions={viewInvoice ? (
          <Button variant="secondary" onClick={() => cancelInvoice(viewInvoice.no)} style={{ color: 'var(--kpc-danger)' }}>ยกเลิกใบกำกับ</Button>
        ) : undefined}
      >
        {viewInvoice && <TaxInvoiceDoc inv={viewInvoice} />}
      </DocModal>

      <NewInvoiceForm
        open={invoiceRefs !== null}
        onClose={() => setInvoiceRefs(null)}
        createdInvoices={created.invoices}
        initialRefs={invoiceRefs ?? undefined}
        onIssued={() => { setInvoiceRefs(null); setSelected(new Set()) }}
      />

      <ImportDeliveryTicketsModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={(t) => { setShowImport(false); setYear(ticketYear(t)); setMonth(t.month); setFilter('all'); setQuery('') }}
      />
    </>
  )
}
