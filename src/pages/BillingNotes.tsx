import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect, SavedBy, pickerMonths } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { BillingNoteDoc } from '../components/documents/BillingNoteDoc'
import { NewBillingNoteForm } from '../components/documents/NewBillingNoteForm'
import { BILLING_NOTES, baht, LATEST_MONTH, monthLabel, monthShort, type BillingNote } from '../data/selectors'
import { useCreatedDocs, removeBillingNote, restoreBillingNote, type DeletedBillingNote } from '../data/createdDocs'
import { useCan } from '../data/auth'
import { fmtThaiDateTime } from '../utils/datetime'
import { downloadCsv } from '../utils/csv'

export function BillingNotes() {
  /* Default the filter to the latest selectable month (current month while it's
     2569) so freshly issued billing notes show up without switching งวด. */
  const defaultMonth = pickerMonths().slice(-1)[0]?.num ?? LATEST_MONTH
  const [month, setMonth] = useState<number | 'all'>(defaultMonth)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<BillingNote | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BillingNote | null>(null)
  const created = useCreatedDocs()
  /* ใบวางบิลอยู่ใต้สิทธิ์เดียวกับใบกำกับภาษี (ROUTE_RESOURCE['/billing'] = 'invoices'). */
  const canEdit = useCan('invoices').edit

  const hiddenSet = useMemo(() => new Set(created.hidden.billingNotes), [created.hidden.billingNotes])
  /* แก้ไขได้เฉพาะใบที่ผู้ใช้ออกเอง — ใบวางบิลชุดตั้งต้นสร้างจากใบกำกับ ไม่มีระเบียนให้แก้. */
  const createdSet = useMemo(() => new Set(created.billingNotes.map((b) => b.no)), [created.billingNotes])
  const openEdit = (bn: BillingNote) => { setActive(null); setEditing(bn); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }
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
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'sales', group: 'ใบวางบิล', ref: r.no, label: r.no, sub: `${r.customer} · ${baht(r.total)}`, route: '/billing' }} /> },
    {
      key: 'act', header: '', align: 'center',
      cell: (r) => (
        <div className="row" style={{ gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
          {canEdit && createdSet.has(r.no) && <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>แก้ไข</Button>}
          <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button>
        </div>
      ),
    },
    ...(canEdit ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: BillingNote) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบวางบิล ${r.no} ?\nระบบจะเก็บไว้ในประวัติการลบด้านล่าง (กู้คืนได้)`)) removeBillingNote(r)
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  /* ประวัติการลบของงวดที่เลือก — แสดงต่อท้ายตารางหลัก. */
  const deletedRows = useMemo(
    () => created.deletedBillingNotes.filter((d) => month === 'all' || d.month === month),
    [created.deletedBillingNotes, month],
  )
  const deletedColumns: Column<DeletedBillingNote>[] = [
    { key: 'no', header: 'เลขที่เอกสาร', cell: (r) => r.no, className: 'docno' },
    { key: 'month', header: 'งวด', align: 'center', cell: (r) => <span className="th">{monthShort(r.month)}</span> },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'n', header: 'จำนวนใบกำกับ', align: 'center', cell: (r) => <Badge tone="info" pip={false} square>{r.invoices.length} ใบ</Badge> },
    { key: 'total', header: 'ยอดวางบิล', align: 'right', cell: (r) => baht(r.total), className: 'amt' },
    { key: 'delby', header: 'ผู้ลบ', cell: (r) => r.deletedBy || '—' },
    { key: 'delat', header: 'เวลาที่ลบ', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{fmtThaiDateTime(r.deletedAt)}</span> },
    ...(canEdit ? [{
      key: 'restore',
      header: '',
      align: 'center' as const,
      cell: (r: DeletedBillingNote) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`กู้คืนใบวางบิล ${r.no} ?`)) restoreBillingNote(r.no) }}>กู้คืน</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบวางบิล"
        sub={`Billing Notes · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — รวมใบกำกับเครดิตตามลูกค้า`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['เลขที่ใบวางบิล', 'เดือน', 'ลูกค้า', 'จำนวนใบกำกับ', 'ยอดรวม']
              const body = rows.map((r) => [r.no, monthShort(r.month), r.customer, r.invoices.length, r.total])
              const slug = `billing-notes-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
              downloadCsv(slug, [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true) }}>+ เพิ่มใบวางบิล</Button>
          </>
        }
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

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>ประวัติการลบใบวางบิล</h3>
            <Badge tone="danger" square pip={false}>{deletedRows.length}</Badge>
            <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>· เก็บไว้ตรวจสอบย้อนหลัง</span>
          </div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการที่ถูกลบ`} />
        </div>
      )}

      <DocModal
        open={!!active}
        title={active ? `ใบวางบิล ${active.no}` : ''}
        onClose={() => setActive(null)}
        extraActions={active && canEdit && createdSet.has(active.no)
          ? <Button variant="secondary" onClick={() => openEdit(active)}>แก้ไข</Button>
          : undefined}
      >
        {active && <BillingNoteDoc bn={active} />}
      </DocModal>

      <NewBillingNoteForm
        open={showForm}
        onClose={closeForm}
        editBn={editing}
        createdBns={created.billingNotes}
        extraInvoices={created.invoices}
        onIssued={(bn) => { closeForm(); setActive(bn) }}
      />
    </>
  )
}
