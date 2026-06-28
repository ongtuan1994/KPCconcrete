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
import { qm } from '../data/selectors'
import { useCreatedDocs, removeGeneralReport, type GeneralReport } from '../data/createdDocs'

const money = (n: number) => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const KIND_LABEL: Record<GeneralReport['kind'], string> = {
  'truck-trips': 'บันทึกเที่ยวรถโม่',
  'commission': 'ค่าคอมมิชชั่น',
  'attendance': 'บันทึกลงเวลางาน',
  'price-list': 'ราคาสินค้า',
  'transport-pricing': 'ราคาค่าขนส่ง',
  'payroll': 'จ่ายเงินเดือน',
}

/* Union-safe accessors — each report kind carries a different payload. */
const reportAmount = (r: GeneralReport): number | null =>
  r.kind === 'commission' ? r.total
    : r.kind === 'truck-trips' ? r.totals.feeTotal
      : r.kind === 'payroll' ? r.totals.net
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

      <DocModal open={!!active} title={active?.title ?? ''} onClose={() => setActive(null)}>
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
                  : <TruckTripReportDoc report={active} />)}
      </DocModal>
    </>
  )
}
