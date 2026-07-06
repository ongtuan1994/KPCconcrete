import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { customerAgg, baht, bahtShort, qm, monthLabel, INVOICES, SEED_IMPORTED_INVOICES, type CustomerAgg, type Invoice } from '../data/selectors'
import { AR_OUTSTANDING, AR_INVOICES } from '../data/receivables'
import { useCan } from '../data/auth'
import { AuditButton } from '../components/AuditButton'
import { Modal } from '../components/Modal'
import { DocModal } from '../components/documents/DocModal'
import { TaxInvoiceDoc } from '../components/documents/TaxInvoiceDoc'
import { addGeneralReport, useCreatedDocs, type LedgerReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/** Normalise an invoice number for matching (the ยอดค้าง sheet keeps an "IV"
    prefix the imported documents may omit). */
const invKey = (no: string) => no.replace(/^IV/i, '').trim()

/** Render an ISO yyyy-mm-dd as Thai-style dd/mm/yyyy (Buddhist year). */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** Whole-day difference between a due date (ISO) and today (due − today). */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

interface PayStatus { text: string; tone: Tone; overdue: boolean }

/** Debtor payment status from outstanding balance + due date, mirroring the
    creditors page (เหลือ X วัน / ครบกำหนดวันนี้ / เลยกำหนด X วัน). */
function arStatus(outstanding: number, dueDate?: string): PayStatus {
  if (outstanding <= 0) return { text: 'ชำระครบแล้ว', tone: 'success', overdue: false }
  if (!dueDate) return { text: 'ค้างชำระ', tone: 'danger', overdue: false }
  const d = daysUntil(dueDate)
  if (d < 0) return { text: `เลยกำหนด ${-d} วัน`, tone: 'danger', overdue: true }
  if (d === 0) return { text: 'ครบกำหนดวันนี้', tone: 'warning', overdue: false }
  if (d <= 7) return { text: `เหลือ ${d} วัน`, tone: 'warning', overdue: false }
  return { text: `เหลือ ${d} วัน`, tone: 'info', overdue: false }
}

export function CustomerSummary() {
  const [month, setMonth] = useState<number | 'all'>('all')
  const [query, setQuery] = useState('')
  /* Debtor whose outstanding-invoice breakdown is open, + an invoice being viewed. */
  const [detail, setDetail] = useState<string | null>(null)
  const [viewInv, setViewInv] = useState<Invoice | null>(null)
  const navigate = useNavigate()
  const canCollect = useCan('receipts').edit
  const created = useCreatedDocs()

  /* Every invoice in the system, keyed by normalised number — so a debtor's
     outstanding invoice can link to the actual ใบกำกับ document when it exists. */
  const invByKey = useMemo(() => {
    const m = new Map<string, Invoice>()
    for (const inv of [...created.invoices, ...INVOICES, ...SEED_IMPORTED_INVOICES]) {
      const k = invKey(inv.no)
      if (!m.has(k)) m.set(k, inv)
    }
    return m
  }, [created.invoices])

  /* Outstanding is the real current AR snapshot (everyone not listed = cleared),
     overlaid on the month-aware sales aggregation. Debtors with a balance but no
     sales in the period are appended so they still appear on the list. */
  const all = useMemo(() => {
    const base = customerAgg(month)
    const byName = new Map<string, CustomerAgg>(base.map((c) => [c.name, { ...c, outstanding: AR_OUTSTANDING[c.name]?.amount ?? 0 }]))
    for (const [name, rec] of Object.entries(AR_OUTSTANDING)) {
      if (!byName.has(name)) byName.set(name, { name, type: 'ขายลูกค้า', tickets: 0, m3: 0, sales: 0, outstanding: rec.amount, lastDate: '—', months: 0 })
    }
    return [...byName.values()].sort((a, b) => b.outstanding - a.outstanding || b.sales - a.sales)
  }, [month])
  const rows = useMemo(() => all.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase())), [all, query])
  const totalSales = all.reduce((s, c) => s + c.sales, 0)
  const totalOut = all.reduce((s, c) => s + c.outstanding, 0)
  const debtorCount = all.filter((c) => c.outstanding > 0).length
  const overdueCount = all.filter((c) => arStatus(c.outstanding, AR_OUTSTANDING[c.name]?.dueDate).overdue).length

  const columns: Column<CustomerAgg>[] = [
    {
      key: 'name',
      header: 'ลูกค้า / หน่วยงาน',
      cell: (r) => (
        <div className="row" style={{ gap: 10 }}>
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 11, background: 'var(--kpc-neutral-200)', color: 'var(--kpc-neutral-700)' }}>
            {r.name.replace(/^(บจก\.|หจก\.|บ\.|คุณ|โก|เจ๊|พี่|ป้า|ช่าง)\s*/, '').slice(0, 2) || r.name.slice(0, 2)}
          </span>
          <span style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
        </div>
      ),
    },
    { key: 'tk', header: 'ใบจ่าย', align: 'right', cell: (r) => <span className="mono">{r.tickets}</span> },
    { key: 'm3', header: 'ปริมาณ (m³)', align: 'right', cell: (r) => <span className="mono">{qm(r.m3)}</span> },
    { key: 'sales', header: 'ยอดซื้อ', align: 'right', cell: (r) => baht(r.sales), className: 'amt' },
    {
      key: 'out',
      header: 'ค้างชำระ',
      align: 'right',
      cell: (r) =>
        r.outstanding > 0 ? (
          <span className="mono" style={{ color: 'var(--kpc-danger-ink)', fontWeight: 600 }}>{baht(r.outstanding)}</span>
        ) : (
          <span className="mono" style={{ color: 'var(--kpc-text-faint)' }}>—</span>
        ),
    },
    { key: 'last', header: 'สั่งล่าสุด', cell: (r) => r.lastDate, className: 'date' },
    {
      key: 'status',
      header: 'สถานะการชำระ',
      align: 'center',
      cell: (r) => {
        const due = AR_OUTSTANDING[r.name]?.dueDate
        const s = arStatus(r.outstanding, due)
        return (
          <div className="stack" style={{ gap: 2, alignItems: 'center' }}>
            <Badge tone={s.tone} pip={false} square>{s.text}</Badge>
            {r.outstanding > 0 && due && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>ครบกำหนด {fmtDate(due)}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'pay',
      header: '',
      align: 'center',
      cell: (r) =>
        r.outstanding > 0 && canCollect ? (
          <Button
            variant="tonal"
            size="sm"
            onClick={() => navigate('/receipts', { state: { collectFromCustomer: r.name } })}
            title="ออกใบเสร็จรับเงินจากลูกค้ารายนี้"
          >
            ชำระหนี้
          </Button>
        ) : null,
    },
    {
      key: 'view', header: '', align: 'center',
      cell: (r) => (r.outstanding > 0 && (AR_INVOICES[r.name]?.length ?? 0) > 0
        ? <Button variant="ghost" size="sm" onClick={() => setDetail(r.name)} title="ดูใบกำกับที่ยังค้างชำระ">เปิดดู</Button>
        : null),
    },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'customers', group: 'ลูกหนี้', ref: r.name, label: r.name, sub: r.outstanding > 0 ? `ค้างชำระ ${baht(r.outstanding)}` : `ยอดซื้อ ${baht(r.sales)}`, route: '/ledger' }} /> },
  ]

  const scopeLabel = month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)

  /* Snapshot the current debtors view → รายงานทั่วไป (kept as a PDF). */
  const createReport = () => {
    const reportRows = rows.map((r) => {
      const due = AR_OUTSTANDING[r.name]?.dueDate
      const s = arStatus(r.outstanding, due)
      return {
        name: r.name,
        tickets: r.tickets,
        m3: Math.round(r.m3 * 100) / 100,
        sales: r.sales,
        outstanding: r.outstanding,
        dueLabel: r.outstanding > 0 && due ? fmtDate(due) : '',
        status: s.text,
        overdue: s.overdue,
      }
    })
    const report: LedgerReport = {
      id: `gr_${Date.now()}`,
      kind: 'ledger',
      side: 'debtors',
      title: `ลูกหนี้ · ${scopeLabel}`,
      fromLabel: scopeLabel,
      toLabel: 'ณ ปัจจุบัน',
      scopeLabel,
      rows: reportRows,
      totals: {
        count: reportRows.length,
        outstanding: reportRows.reduce((s, r) => s + r.outstanding, 0),
        overdue: reportRows.filter((r) => r.overdue).length,
        sales: reportRows.reduce((s, r) => s + (r.sales ?? 0), 0),
      },
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  return (
    <>
      <PageHeader
        title="ลูกหนี้"
        sub={`Debtors · ${scopeLabel}`}
        actions={
          <>
          <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
          <Button variant="secondary" onClick={() => {
            const head = ['ลูกค้า / หน่วยงาน', 'ใบจ่าย', 'ปริมาณ (m³)', 'ยอดซื้อ', 'ค้างชำระ', 'วันครบกำหนด', 'สถานะการชำระ']
            const body = rows.map((r) => {
              const due = AR_OUTSTANDING[r.name]?.dueDate
              return [
                r.name, r.tickets, Math.round(r.m3 * 100) / 100, r.sales, r.outstanding,
                r.outstanding > 0 && due ? fmtDate(due) : '', arStatus(r.outstanding, due).text,
              ]
            })
            const slug = `customer-summary-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
            downloadCsv(slug, [head, ...body])
          }}>ส่งออก Excel</Button>
          </>
        }
      />
      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ลูกหนี้ค้างชำระ · Debtors" value={debtorCount.toString()} note="รายที่ยังไม่เคลียร์" invert />
        <KpiCard label="เลยกำหนด · Overdue" value={overdueCount.toString()} note="ราย ต้องติดตามด่วน" />
        <KpiCard label="ค้างชำระรวม · Outstanding" value={baht(totalOut)} note="ยอดคงค้างปัจจุบัน" />
        <KpiCard label="ยอดซื้อรวม · Total sales" value={bahtShort(totalSales)} note={month === 'all' ? 'ทั้งปี' : 'เดือนนี้'} />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <MonthSelect value={month} onChange={setMonth} />
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อลูกค้า / หน่วยงาน" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ลูกค้า`} />

      {/* Outstanding-invoice breakdown for a debtor. */}
      <Modal
        open={!!detail}
        title={detail ? `ใบกำกับที่ยังค้างชำระ · ${detail}` : ''}
        onClose={() => setDetail(null)}
        maxWidth={640}
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>ปิด</Button>}
      >
        {detail && (() => {
          const list = AR_INVOICES[detail] ?? []
          const sum = list.reduce((s, x) => s + x.amount, 0)
          const balance = AR_OUTSTANDING[detail]?.amount ?? sum
          return (
            <>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
                <span style={{ color: 'var(--kpc-text-muted)' }}>{list.length} ใบกำกับ · รวมมูลค่า {baht(sum)}</span>
                <span>ยอดค้างปัจจุบัน: <strong className="mono" style={{ color: 'var(--kpc-danger-ink)' }}>{baht(balance)}</strong></span>
              </div>
              <div className="card flush" style={{ overflowX: 'auto' }}>
                <table className="data" style={{ minWidth: 480 }}>
                  <thead>
                    <tr><th>#</th><th>เลขที่ใบกำกับ</th><th className="num">มูลค่า (รวม VAT)</th><th className="ctr">เอกสาร</th></tr>
                  </thead>
                  <tbody>
                    {list.map((x, i) => {
                      const inv = invByKey.get(invKey(x.no))
                      return (
                        <tr key={x.no + i}>
                          <td style={{ color: 'var(--kpc-text-faint)' }}>{i + 1}</td>
                          <td className="mono">{x.no}</td>
                          <td className="num mono">{baht(x.amount)}</td>
                          <td className="ctr">
                            {inv
                              ? <Button variant="ghost" size="sm" onClick={() => setViewInv(inv)}>ดูใบกำกับ</Button>
                              : <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>อ้างอิง</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="page-sub" style={{ marginTop: 10, fontSize: 12 }}>
                * รายการจากยอดค้างจริง · ยอดค้างปัจจุบันเป็นยอดสุทธิหลังหักชำระบางส่วนแล้ว — ใบที่ลิงก์เอกสารได้จะเปิดใบกำกับในระบบ
              </p>
            </>
          )
        })()}
      </Modal>

      {/* View a linked tax invoice. */}
      <DocModal open={!!viewInv} title={viewInv ? `ใบกำกับภาษี ${viewInv.no}` : ''} onClose={() => setViewInv(null)}>
        {viewInv && <TaxInvoiceDoc inv={viewInv} />}
      </DocModal>
    </>
  )
}
