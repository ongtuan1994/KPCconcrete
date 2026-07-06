import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { CREDITOR_MASTER, type Creditor } from '../data/creditors'
import { baht } from '../data/selectors'
import { useCan } from '../data/auth'
import { AuditButton } from '../components/AuditButton'
import { addGeneralReport, type LedgerReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | 'credit' | 'cash' | 'overdue'

const FILTER_LABEL: Record<Filter, string> = { all: 'ทั้งหมด', credit: 'เครดิต', cash: 'เงินสด', overdue: 'เลยกำหนด' }

/** Credit-limit display: numeric → baht; credit w/o cap → ไม่จำกัด; cash → —. */
function creditLimitText(c: Creditor): string {
  if (c.terms !== 'เครดิต') return '—'
  return c.creditLimit != null ? baht(c.creditLimit) : 'ไม่จำกัด'
}

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

/** Payment status from outstanding balance + due date relative to today. */
function payStatus(c: Creditor): PayStatus {
  if (!c.outstanding || c.outstanding <= 0) return { text: 'ไม่มียอดค้าง', tone: 'neutral', overdue: false }
  if (!c.dueDate) return { text: 'รอกำหนดวันชำระ', tone: 'neutral', overdue: false }
  const d = daysUntil(c.dueDate)
  if (d < 0) return { text: `เลยกำหนด ${-d} วัน`, tone: 'danger', overdue: true }
  if (d === 0) return { text: 'ครบกำหนดวันนี้', tone: 'warning', overdue: false }
  if (d <= 7) return { text: `เหลือ ${d} วัน`, tone: 'warning', overdue: false }
  return { text: `เหลือ ${d} วัน`, tone: 'info', overdue: false }
}

export function Creditors() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const canPay = useCan('goods-payments').edit

  const list = CREDITOR_MASTER

  const rows = useMemo(
    () =>
      list.filter((c) => {
        if (filter === 'credit' && c.terms !== 'เครดิต') return false
        if (filter === 'cash' && c.terms !== 'เงินสด') return false
        if (filter === 'overdue' && !payStatus(c).overdue) return false
        if (query && !`${c.id} ${c.name} ${c.note ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [list, filter, query],
  )

  const creditCount = list.filter((c) => c.terms === 'เครดิต').length
  const cashCount = list.filter((c) => c.terms === 'เงินสด').length
  const overdueCount = list.filter((c) => payStatus(c).overdue).length
  const totalOutstanding = list.reduce((s, c) => s + (c.outstanding ?? 0), 0)

  const scopeLabel = FILTER_LABEL[filter]

  /* Snapshot the current creditors view → รายงานทั่วไป (kept as a PDF). */
  const createReport = () => {
    const reportRows = rows.map((c) => {
      const s = payStatus(c)
      return {
        name: c.name,
        detail: `${c.id}${c.note ? ' · ' + c.note : ''}`,
        terms: c.terms === 'เครดิต' ? `เครดิต ${c.creditDays ?? 30} วัน` : 'เงินสด',
        outstanding: c.outstanding ?? 0,
        dueLabel: c.outstanding && c.outstanding > 0 && c.dueDate ? fmtDate(c.dueDate) : '',
        status: s.text,
        overdue: s.overdue,
      }
    })
    const report: LedgerReport = {
      id: `gr_${Date.now()}`,
      kind: 'ledger',
      side: 'creditors',
      title: `เจ้าหนี้ · ${scopeLabel}`,
      fromLabel: scopeLabel,
      toLabel: 'ณ ปัจจุบัน',
      scopeLabel,
      rows: reportRows,
      totals: {
        count: reportRows.length,
        outstanding: reportRows.reduce((s, r) => s + r.outstanding, 0),
        overdue: reportRows.filter((r) => r.overdue).length,
      },
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  const exportExcel = () => {
    const head = ['รหัส', 'ชื่อเจ้าหนี้', 'เงื่อนไขชำระ', 'ระยะเวลา (วัน)', 'วงเงินเครดิต', 'ยอดค้างชำระ', 'วันครบกำหนด', 'สถานะการชำระ', 'หมวด']
    const body = rows.map((c) => [
      c.id, c.name, c.terms, c.terms === 'เครดิต' ? (c.creditDays ?? '') : '',
      creditLimitText(c), c.outstanding ?? 0, c.dueDate ?? '', payStatus(c).text, c.note ?? '',
    ])
    downloadCsv('creditors', [head, ...body])
  }

  const columns: Column<Creditor>[] = [
    { key: 'id', header: 'รหัส', cell: (r) => <span className="mono">{r.id}</span>, className: 'docno' },
    {
      key: 'name',
      header: 'ชื่อเจ้าหนี้',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
          {r.note && <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{r.note}</span>}
        </div>
      ),
    },
    {
      key: 'terms',
      header: 'เงื่อนไขชำระ',
      align: 'center',
      cell: (r) =>
        r.terms === 'เครดิต'
          ? <Badge tone="warning" pip={false} square>เครดิต {r.creditDays ?? 30} วัน</Badge>
          : <Badge tone="success" pip={false} square>เงินสด</Badge>,
    },
    {
      key: 'limit',
      header: 'วงเงินเครดิต',
      align: 'right',
      cell: (r) => {
        if (r.terms !== 'เครดิต') return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
        return r.creditLimit != null
          ? <span className="amt mono">{baht(r.creditLimit)}</span>
          : <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>ไม่จำกัด</span>
      },
    },
    {
      key: 'outstanding',
      header: 'ยอดค้างชำระ',
      align: 'right',
      cell: (r) => (r.outstanding && r.outstanding > 0
        ? <span className="amt mono" style={{ fontWeight: 600 }}>{baht(r.outstanding)}</span>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    {
      key: 'status',
      header: 'สถานะการชำระ',
      align: 'center',
      cell: (r) => {
        const s = payStatus(r)
        return (
          <div className="stack" style={{ gap: 2, alignItems: 'center' }}>
            <Badge tone={s.tone} pip={false} square>{s.text}</Badge>
            {r.outstanding && r.outstanding > 0 && r.dueDate && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--kpc-text-faint)' }}>ครบกำหนด {fmtDate(r.dueDate)}</span>
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
        r.outstanding && r.outstanding > 0 && canPay ? (
          <Button
            variant="tonal"
            size="sm"
            onClick={() => navigate('/goods-payments', {
              state: { payFromPurchaseOrder: { supplier: r.name, amount: String(r.outstanding ?? '') } },
            })}
            title="ออกใบสำคัญจ่ายให้ซัพพลายเออร์รายนี้"
          >
            ชำระหนี้
          </Button>
        ) : null,
    },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'customers', group: 'เจ้าหนี้', ref: r.id, label: r.name, sub: `${r.id}${r.outstanding ? ' · ค้าง ' + baht(r.outstanding) : ''}`, route: '/ledger' }} /> },
  ]

  return (
    <>
      <PageHeader
        title="เจ้าหนี้"
        sub={`Creditors / Accounts Payable · ${list.length} ราย`}
        actions={
          <>
            <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
            <Button variant="secondary" onClick={exportExcel}>ส่งออก Excel</Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="เจ้าหนี้ทั้งหมด · Creditors" value={list.length.toString()} note="ราย" />
        <KpiCard label="ยอดค้างชำระรวม · Payable" value={baht(totalOutstanding)} note="รวมทุกเจ้าหนี้" invert />
        <KpiCard label="เลยกำหนด · Overdue" value={overdueCount.toString()} note="ราย ต้องชำระด่วน" />
        <KpiCard label="เจ้าหนี้เครดิต · Credit" value={creditCount.toString()} note={`เงินสด ${cashCount} ราย`} />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {list.length}</Pill>
          <Pill active={filter === 'overdue'} onClick={() => setFilter('overdue')}>เลยกำหนด {overdueCount}</Pill>
          <Pill active={filter === 'credit'} onClick={() => setFilter('credit')}>เครดิต {creditCount}</Pill>
          <Pill active={filter === 'cash'} onClick={() => setFilter('cash')}>เงินสด {cashCount}</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อเจ้าหนี้ / รหัส / หมวด" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ราย`} />
    </>
  )
}
