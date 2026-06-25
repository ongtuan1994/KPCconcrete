import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { customerAgg, baht, bahtShort, qm, monthLabel, type CustomerAgg } from '../data/selectors'
import { AR_OUTSTANDING } from '../data/receivables'
import { downloadCsv } from '../utils/csv'

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
  ]

  return (
    <>
      <PageHeader
        title="ลูกหนี้"
        sub={`Debtors · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)}`}
        actions={
          <Button variant="primary" onClick={() => {
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
    </>
  )
}
