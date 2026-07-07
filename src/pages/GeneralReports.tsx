import { useEffect, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SavedBy } from '../components/ui'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { TruckTripReportDoc } from '../components/documents/TruckTripReportDoc'
import { CommissionReportDoc } from '../components/documents/CommissionReportDoc'
import { AttendanceReportDoc } from '../components/documents/AttendanceReportDoc'
import { PriceListReportDoc } from '../components/documents/PriceListReportDoc'
import { TransportPriceReportDoc } from '../components/documents/TransportPriceReportDoc'
import { PayrollReportDoc } from '../components/documents/PayrollReportDoc'
import { MixDesignReportDoc } from '../components/documents/MixDesignReportDoc'
import { FoundryFormulaReportDoc } from '../components/documents/FoundryFormulaReportDoc'
import { StockReportDoc } from '../components/documents/StockReportDoc'
import { LedgerReportDoc } from '../components/documents/LedgerReportDoc'
import { EmployeeReportDoc } from '../components/documents/EmployeeReportDoc'
import { ExpenseReportDoc } from '../components/documents/ExpenseReportDoc'
import { PurchaseAccountReportDoc } from '../components/documents/PurchaseAccountReportDoc'
import { MidMonthAdvanceReportDoc } from '../components/documents/MidMonthAdvanceReportDoc'
import { qm } from '../data/selectors'
import { useCreatedDocs, removeGeneralReport, type GeneralReport } from '../data/createdDocs'

const money = (n: number) => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100

const KIND_LABEL: Record<GeneralReport['kind'], string> = {
  'truck-trips': 'บันทึกเที่ยวรถโม่',
  'commission': 'ค่าคอมมิชชั่น',
  'attendance': 'บันทึกลงเวลางาน',
  'price-list': 'ราคาสินค้า',
  'transport-pricing': 'ราคาค่าขนส่ง',
  'payroll': 'จ่ายเงินเดือน',
  'mix-design': 'Mix Design',
  'foundry-formula': 'สูตรผลิตโรงหล่อ',
  'stock': 'คลังวัตถุดิบ',
  'ledger': 'ลูกหนี้ / เจ้าหนี้',
  'employees': 'รายชื่อพนักงาน',
  'expense': 'ค่าใช้จ่ายรายเดือน',
  'purchase-account': 'บัญชีซื้อวัตถุดิบ',
  'mid-month-advance': 'เบิกเงินกลางเดือน',
}

/* Union-safe accessors — each report kind carries a different payload. */
const reportAmount = (r: GeneralReport): number | null =>
  r.kind === 'commission' ? r.total
    : r.kind === 'truck-trips' ? r.totals.feeTotal
      : r.kind === 'payroll' ? r.totals.net
        : r.kind === 'ledger' ? r.totals.outstanding
          : r.kind === 'expense' ? r.grandTotal
            : r.kind === 'purchase-account' ? r2(r.totals.plant.total + r.totals.foundry.total)
              : r.kind === 'mid-month-advance' ? r.totals.amount
                : null
const reportSummary = (r: GeneralReport) =>
  r.kind === 'commission'
    ? `${r.lines.length} คน · ${qm(r.volumeM3)} คิว`
    : r.kind === 'attendance'
      ? `${r.totals.employees} คน · ${r.totals.days} วัน · OT ${r.totals.otMin} นาที`
      : r.kind === 'price-list'
        ? `${r.totalItems} รายการ · ${r.groups.length} หมวด`
        : r.kind === 'transport-pricing'
          ? `${r.fees.length} ระดับการขนส่งไม่เต็มเที่ยว`
          : r.kind === 'payroll'
            ? `${r.rows.length} คน · ${r.payMonthLabel}`
            : r.kind === 'mix-design' || r.kind === 'foundry-formula'
              ? `${r.rows.length} สูตร`
              : r.kind === 'stock'
                ? `${r.rows.length} รายการ · ${r.scopeLabel}`
                : r.kind === 'ledger'
                  ? `${r.totals.count} ราย · เลยกำหนด ${r.totals.overdue} ราย · ${r.scopeLabel}`
                  : r.kind === 'employees'
                    ? `${r.totals.count} คน · ${r.scopeLabel}`
                    : r.kind === 'expense'
                      ? `${r.rows.length} เดือน · ${r.categories.length} ประเภทค่าใช้จ่าย`
                      : r.kind === 'purchase-account'
                        ? `${r.rows.length} เดือน · แยกแพล้นปูน/โรงหล่อ`
                        : r.kind === 'mid-month-advance'
                          ? `${r.monthLabel} · ${r.sections.reduce((s, sec) => s + sec.rows.filter((x) => x.amount > 0).length, 0)} คน`
                          : `${r.rows.length} รายการ · ${r.totals.tripTotal} เที่ยว`

export function GeneralReports() {
  const created = useCreatedDocs()
  const [active, setActive] = useState<GeneralReport | null>(null)

  /* While a report is open, name the browser tab after it so a print → "Save as
     PDF" suggests the report title as the filename. */
  useEffect(() => {
    if (!active) return
    const prev = document.title
    document.title = active.title
    return () => { document.title = prev }
  }, [active])

  const rows = created.generalReports

  const columns: Column<GeneralReport>[] = [
    {
      key: 'title',
      header: 'ชื่อรายงาน',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ color: 'var(--kpc-text-strong)', fontWeight: 500 }}>{r.title}</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{reportSummary(r)}</span>
        </div>
      ),
    },
    { key: 'kind', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone="info" pip={false} square>{KIND_LABEL[r.kind]}</Badge> },
    { key: 'range', header: 'ช่วงวันที่', cell: (r) => <span className="mono" style={{ fontSize: 13 }}>{r.fromLabel} – {r.toLabel}</span> },
    { key: 'fee', header: 'ยอดรวม (บาท)', align: 'right', cell: (r) => { const a = reportAmount(r); return a === null ? <span style={{ color: 'var(--kpc-text-faint)' }}>—</span> : <span className="amt mono">{money(a)}</span> } },
    { key: 'savedby', header: 'ผู้สร้าง', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    {
      key: 'act',
      header: '',
      align: 'center',
      cell: (r) => (
        <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิด</Button>
          <Button variant="ghost" size="sm" onClick={() => {
            if (confirm(`ลบรายงาน "${r.title}" ?`)) removeGeneralReport(r.id)
          }}>ลบ</Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="รายงานทั่วไป"
        sub="General Reports · รายงานที่สร้างและเก็บไว้เป็นไฟล์ PDF"
      />

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ยังไม่มีรายงาน</div>
          <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginTop: 6 }}>
            สร้างรายงานได้จากหน้า <strong>บันทึกเที่ยวรถโม่</strong> → เลือกช่วงวัน → กดปุ่ม “สร้างรายงาน”
          </div>
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายงาน`} />
      )}

      <DocModal open={!!active} title={active?.title ?? ''} onClose={() => setActive(null)} maxWidth={active?.kind === 'payroll' ? 1180 : 820}>
        {active && (active.kind === 'commission'
          ? <CommissionReportDoc report={active} />
          : active.kind === 'attendance'
            ? <AttendanceReportDoc report={active} />
            : active.kind === 'price-list'
              ? <PriceListReportDoc report={active} />
              : active.kind === 'transport-pricing'
                ? <TransportPriceReportDoc report={active} />
                : active.kind === 'payroll'
                  ? <PayrollReportDoc report={active} />
                  : active.kind === 'mix-design'
                    ? <MixDesignReportDoc report={active} />
                    : active.kind === 'foundry-formula'
                    ? <FoundryFormulaReportDoc report={active} />
                    : active.kind === 'stock'
                      ? <StockReportDoc report={active} />
                      : active.kind === 'ledger'
                        ? <LedgerReportDoc report={active} />
                        : active.kind === 'employees'
                          ? <EmployeeReportDoc report={active} />
                          : active.kind === 'expense'
                            ? <ExpenseReportDoc report={active} />
                            : active.kind === 'purchase-account'
                              ? <PurchaseAccountReportDoc report={active} />
                              : active.kind === 'mid-month-advance'
                                ? <MidMonthAdvanceReportDoc report={active} />
                                : <TruckTripReportDoc report={active} />)}
      </DocModal>
    </>
  )
}
