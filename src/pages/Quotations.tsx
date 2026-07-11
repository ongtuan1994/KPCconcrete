import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, SavedBy } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { DocModal } from '../components/documents/DocModal'
import { QuotationDoc } from '../components/documents/QuotationDoc'
import { NewQuotationForm } from '../components/documents/NewQuotationForm'
import { baht } from '../data/selectors'
import { useCreatedDocs, removeQuotation, restoreQuotation, type Quotation, type DeletedQuotation } from '../data/createdDocs'
import { useCan } from '../data/auth'
import { fmtThaiDateTime } from '../utils/datetime'
import { downloadCsv } from '../utils/csv'

const r2 = (n: number) => Math.round(n * 100) / 100
const quoTotal = (q: Quotation) => r2(q.items.reduce((s, l) => s + l.amount, 0))

/** ISO yyyy-mm-dd → d/m/พ.ศ. */
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

const itemsSummary = (q: Quotation) => {
  const first = q.items[0]
  if (!first) return '—'
  const extra = q.items.length - 1
  return extra > 0 ? `${first.name} +${extra} รายการ` : first.name
}

export function Quotations() {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Quotation | null>(null)
  const [active, setActive] = useState<Quotation | null>(null)
  const created = useCreatedDocs()
  const canDelete = useCan('quotations').edit

  const all = created.quotations

  const rows = useMemo(
    () =>
      all.filter((q) => {
        if (!query) return true
        const hay = `${q.qtNo} ${q.customer} ${q.note ?? ''} ${q.items.map((i) => i.name).join(' ')}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      }),
    [all, query],
  )

  const totalValue = all.reduce((s, q) => s + quoTotal(q), 0)

  const exportExcel = () => {
    const head = ['เลขที่', 'วันที่', 'ลูกค้า', 'เงื่อนไขชำระ', 'รูปแบบ VAT', 'จำนวนรายการ', 'ยอดรวม', 'หมายเหตุ']
    const body = rows.map((q) => [
      q.qtNo, fmtDate(q.date), q.customer,
      q.terms === 'เครดิต' ? `เครดิต ${q.creditDays ?? 30} วัน` : 'เงินสด',
      q.showVat ? 'โชว์ VAT' : 'ไม่โชว์ VAT',
      q.items.length, quoTotal(q), q.note ?? '',
    ])
    downloadCsv('quotations', [head, ...body])
  }

  const openEdit = (q: Quotation) => { setEditing(q); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null) }

  const columns: Column<Quotation>[] = [
    { key: 'qtNo', header: 'เลขที่', cell: (q) => <span className="mono">{q.qtNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (q) => <span className="mono" style={{ fontSize: 13 }}>{fmtDate(q.date)}</span> },
    { key: 'customer', header: 'ลูกค้า', cell: (q) => <span style={{ color: 'var(--kpc-text-strong)' }}>{q.customer}</span> },
    { key: 'items', header: 'รายการ', cell: (q) => <span style={{ fontSize: 13 }}>{itemsSummary(q)}</span> },
    {
      key: 'vat', header: 'VAT', align: 'center',
      cell: (q) => q.showVat
        ? <Badge tone="info" pip={false} square>โชว์ VAT</Badge>
        : <Badge tone="neutral" pip={false} square>ไม่โชว์</Badge>,
    },
    { key: 'total', header: 'ยอดรวม (บาท)', align: 'right', cell: (q) => <span className="amt mono">{baht(quoTotal(q))}</span> },
    { key: 'savedby', header: 'ผู้สร้าง', cell: (q) => <SavedBy by={q.createdBy} at={q.createdAt} /> },
    {
      key: 'act', header: '', align: 'center',
      cell: (q) => (
        <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setActive(q)}>เปิดดู</Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(q)}>แก้ไข</Button>
          <AuditButton item={{ category: 'sales', group: 'ใบเสนอราคา', ref: q.qtNo, label: q.customer, sub: `${q.qtNo} · ${fmtDate(q.date)}`, route: '/quotations' }} />
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              style={{ color: 'var(--kpc-danger)' }}
              onClick={() => { if (confirm(`ลบใบเสนอราคา ${q.qtNo} ?`)) removeQuotation(q.qtNo) }}
            >
              ลบ
            </Button>
          )}
        </div>
      ),
    },
  ]

  const deletedRows = created.deletedQuotations
  const deletedColumns: Column<DeletedQuotation>[] = [
    { key: 'qtNo', header: 'เลขที่', cell: (q) => <span className="mono">{q.qtNo}</span>, className: 'docno' },
    { key: 'customer', header: 'ลูกค้า', cell: (q) => q.customer },
    { key: 'total', header: 'ยอดรวม', align: 'right', cell: (q) => <span className="amt mono">{baht(quoTotal(q))}</span> },
    { key: 'deletedBy', header: 'ลบโดย', cell: (q) => <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{q.deletedBy} · {fmtThaiDateTime(q.deletedAt)}</span> },
    {
      key: 'restore', header: '', align: 'center',
      cell: (q) => <Button variant="ghost" size="sm" onClick={() => restoreQuotation(q.qtNo)}>กู้คืน</Button>,
    },
  ]

  return (
    <>
      <PageHeader
        title="ใบเสนอราคา"
        sub={`Quotations · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => { setEditing(null); setShowForm(true) }}><IconPlus /> ออกใบเสนอราคา</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบเสนอราคา · Quotations" value={all.length.toString()} note="ใบ" />
        <KpiCard label="มูลค่ารวม · Total" value={baht(totalValue)} note="ทุกใบเสนอราคา" invert />
        <KpiCard label="ลูกค้า · Customers" value={new Set(all.map((q) => q.customer)).size.toString()} note="ราย" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ / ลูกค้า / สินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ยังไม่มีใบเสนอราคา</div>
          <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginTop: 6 }}>
            กดปุ่ม <strong>ออกใบเสนอราคา</strong> เพื่อสร้างใบแรก
          </div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
      )}

      {deletedRows.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-muted)', marginBottom: 8 }}>ประวัติการลบ · Deleted</div>
          <DataTable columns={deletedColumns} rows={deletedRows} pageSize={5} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
        </div>
      )}

      <NewQuotationForm
        open={showForm}
        editing={editing}
        onClose={closeForm}
        onSaved={() => closeForm()}
      />

      <DocModal open={!!active} title={active ? `ใบเสนอราคา ${active.qtNo}` : ''} onClose={() => setActive(null)}>
        {active && <QuotationDoc quo={active} />}
      </DocModal>
    </>
  )
}
