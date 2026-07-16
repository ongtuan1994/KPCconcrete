import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, MonthSelect, pickerMonths } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { BILLING_NOTES, baht, qm, prodName, customerLegal, LATEST_MONTH, monthLabel, type BillingNote, type Invoice } from '../data/selectors'
import { DELIVERY_TICKETS, type DeliveryTicket } from '../data/real'
import { bahtText } from '../data/bahtText'
import { useCreatedDocs } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

const money2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface DetailRow { dtNo: string; prodCode: string; prodName: string; m3: number }
interface InvGroup { inv: Invoice; rows: DetailRow[] }
interface ProdTotal { code: string; name: string; m3: number }
interface BnSummary { invoices: InvGroup[]; products: ProdTotal[]; totalM3: number; totalBaht: number }

function summarize(bn: BillingNote, ticketByRef: Map<string, DeliveryTicket>): BnSummary {
  const prodMap = new Map<string, ProdTotal>()
  let totalM3 = 0
  const invoices: InvGroup[] = bn.invoices.map((inv) => {
    const tks = inv.refs.map((r) => ticketByRef.get(r)).filter((t): t is DeliveryTicket => !!t)
    const rows: DetailRow[] = tks.length
      ? tks.map((t) => ({ dtNo: t.dtNo, prodCode: t.prod, prodName: prodName(t.prod), m3: t.m3 }))
      : inv.lines.map((l) => ({ dtNo: '', prodCode: l.code, prodName: prodName(l.code), m3: l.qty }))
    for (const r of rows) {
      totalM3 += r.m3
      const e = prodMap.get(r.prodCode) ?? { code: r.prodCode, name: r.prodName, m3: 0 }
      e.m3 += r.m3
      prodMap.set(r.prodCode, e)
    }
    return { inv, rows }
  })
  const products = [...prodMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  return { invoices, products, totalM3, totalBaht: bn.total }
}

export function BillingSummary() {
  /* Default the filter to the latest selectable month (current month while it's
     2569) so the newest billing notes/summaries show up without switching งวด. */
  const defaultMonth = pickerMonths().slice(-1)[0]?.num ?? LATEST_MONTH
  const [month, setMonth] = useState<number | 'all'>(defaultMonth)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<BillingNote | null>(null)
  const created = useCreatedDocs()

  /* ref / dtNo → delivery ticket, from seed + user-created tickets. */
  const ticketByRef = useMemo(() => {
    const m = new Map<string, DeliveryTicket>()
    for (const t of [...created.tickets, ...DELIVERY_TICKETS]) {
      if (t.ref) m.set(t.ref, t)
      m.set(t.dtNo, t)
    }
    return m
  }, [created.tickets])

  const hiddenSet = useMemo(() => new Set(created.hidden.billingNotes), [created.hidden.billingNotes])
  const allBns = useMemo(
    () => [...created.billingNotes, ...BILLING_NOTES].filter((b) => !hiddenSet.has(b.no)),
    [created.billingNotes, hiddenSet],
  )
  const monthRows = useMemo(() => (month === 'all' ? allBns : allBns.filter((b) => b.month === month)), [month, allBns])
  const rows = useMemo(
    () => monthRows.filter((b) => !query || `${b.no} ${b.customer}`.toLowerCase().includes(query.toLowerCase())),
    [monthRows, query],
  )

  const summaries = useMemo(() => {
    const m = new Map<string, BnSummary>()
    for (const bn of monthRows) m.set(bn.no, summarize(bn, ticketByRef))
    return m
  }, [monthRows, ticketByRef])

  const totM3 = monthRows.reduce((s, b) => s + (summaries.get(b.no)?.totalM3 ?? 0), 0)
  const totValue = monthRows.reduce((s, b) => s + b.total, 0)

  const exportExcel = () => {
    const head = ['เลขที่ใบวางบิล', 'ลูกค้า', 'จำนวนใบกำกับ', 'ปริมาณรวม (คิว)', 'ยอดรวม']
    const body = rows.map((b) => [b.no, b.customer, b.invoices.length, summaries.get(b.no)?.totalM3 ?? 0, b.total])
    const slug = `billing-summary-${month === 'all' ? '2569' : monthLabel(month).replace(/\s+/g, '-')}`
    downloadCsv(slug, [head, ...body])
  }

  const columns: Column<BillingNote>[] = [
    { key: 'no', header: 'เลขที่ใบวางบิล', cell: (r) => r.no, className: 'docno' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => r.customer },
    { key: 'n', header: 'ใบกำกับ', align: 'center', cell: (r) => <Badge tone="info" pip={false} square>{r.invoices.length} ใบ</Badge> },
    { key: 'm3', header: 'ปริมาณ (คิว)', align: 'right', cell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{qm(summaries.get(r.no)?.totalM3 ?? 0)}</span> },
    { key: 'total', header: 'ยอดรวม', align: 'right', cell: (r) => <span className="amt mono">{baht(r.total)}</span> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>ดูสรุป</Button> },
  ]

  return (
    <>
      <PageHeader
        title="สรุปการวางบิล"
        sub={`Billing Summary · ${month === 'all' ? 'ทั้งปี 2569' : monthLabel(month)} — แจกแจงใบจ่าย/คิว/ราคา ต่อใบกำกับ`}
        actions={<Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>}
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบวางบิล · Notes" value={monthRows.length.toString()} note="ใบ" />
        <KpiCard label="ปริมาณรวม · Volume" value={qm(Math.round(totM3))} unit="คิว" note="ทุกใบวางบิล" />
        <KpiCard label="ยอดวางบิลรวม · Value" value={baht(totValue)} note="รวม VAT" invert />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <MonthSelect value={month} onChange={setMonth} />
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่ / ลูกค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบวางบิล`} />

      <DocModal open={!!active} title={active ? `สรุปการวางบิล ${active.no}` : ''} onClose={() => setActive(null)}>
        {active && <BillingSummaryDoc bn={active} summary={summaries.get(active.no) ?? summarize(active, ticketByRef)} />}
      </DocModal>
    </>
  )
}

function BillingSummaryDoc({ bn, summary }: { bn: BillingNote; summary: BnSummary }) {
  const cust = customerLegal(bn.customer)
  return (
    <div className="billing-summary-sheet">
      <div className="bs-top">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <img src="/logo.jpg" alt="KPC" />
          <div className="bs-cust">
            <div>ชื่อลูกค้า : {cust.display}</div>
            <div>หน่วยงาน : {cust.unit || '—'}</div>
          </div>
        </div>
      </div>

      <div className="bs-doc-title">สรุปรายละเอียดการวางบิล</div>

      <table className="bs-grid">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: '10%' }}>วันที่</th>
            <th rowSpan={2} style={{ width: '14%' }}>เลขที่<br />ใบกำกับ</th>
            <th rowSpan={2} style={{ width: '18%' }}>เลขที่<br />ใบจ่ายสินค้า</th>
            <th rowSpan={2}>รายละเอียด</th>
            <th colSpan={2}>จำนวน</th>
          </tr>
          <tr>
            <th style={{ width: '9%' }}>คิว</th>
            <th style={{ width: '13%' }}>บาท</th>
          </tr>
        </thead>
        <tbody>
          {summary.invoices.map((g, gi) =>
            g.rows.map((r, j) => (
              <tr key={`${gi}-${j}`}>
                {j === 0 && <td rowSpan={g.rows.length} className="ctr">{g.inv.date}</td>}
                {j === 0 && <td rowSpan={g.rows.length} className="ctr mono">{g.inv.no}</td>}
                <td className="mono">{r.dtNo || '—'}</td>
                <td>{r.prodName}</td>
                <td className="num">{qm(r.m3)}</td>
                {j === 0 && <td rowSpan={g.rows.length} className="num">{money2(g.inv.total)}</td>}
              </tr>
            )),
          )}

          <tr className="bs-total">
            <td colSpan={4} className="ctr">รวมทั้งหมด</td>
            <td className="num">{qm(summary.totalM3)}</td>
            <td className="num">{money2(summary.totalBaht)}</td>
          </tr>

          {summary.products.map((p, i) => (
            <tr key={`p-${i}`}>
              {i === 0 && <td rowSpan={summary.products.length} className="bs-sumhead">สรุปวางบิล</td>}
              <td colSpan={3}>{p.name}</td>
              <td className="num">{qm(p.m3)}</td>
              {i === 0 && <td rowSpan={summary.products.length} className="num">{money2(summary.totalBaht)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bs-words">
        {bahtText(summary.totalBaht)}
        <div className="lab">จำนวนเงินเป็นตัวอักษร</div>
      </div>
    </div>
  )
}
