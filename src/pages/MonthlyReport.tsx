import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { PageHeader } from '../components/Layout'
import { Button, Badge, MonthSelect } from '../components/ui'
import { KpiCard, Donut, Legend, type Seg } from '../components/charts'
import { monthTotals, productMix, dailyM3, customerAgg, INVOICES, MONTHLY_TREND, MONTHS, LATEST_MONTH, monthLabel, baht, bahtShort, qm } from '../data/selectors'
import { COMPANY } from '../data/real'

const MIX_COLORS = ['var(--kpc-primary, #0E0EE6)', '#8585F8', '#B4B4FB', '#D8D8FD', '#969CA6', '#C2C8D0']

/** Rough estimate of how much of monthly cost rolls into payables — i.e.
    cement / fuel / suppliers we owe at month-end. Adjust when a real
    accounts-payable module exists. */
const SUPPLIER_CREDIT_RATIO = 0.40

export function MonthlyReport() {
  /* `month` accepts either a numeric month (1-12) or 'all' to render the
     full-year roll-up — replaces the separate YearlyReport page. */
  const [month, setMonth] = useState<number | 'all'>(LATEST_MONTH)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const isYear = month === 'all'
  const periodLabel = isYear ? 'ทั้งปี 2569' : monthLabel(month)
  const reportTitle = isYear ? 'รายงานประจำปี' : 'รายงานประจำเดือน'

  /* Totals — sum across every month when in "ทั้งปี" mode, else single month. */
  const t = isYear
    ? MONTHS.reduce(
        (acc, m) => {
          const mt = monthTotals(m.num)
          acc.revenue += mt.revenue
          acc.m3All += mt.m3All
          acc.m3Sold += mt.m3Sold
          acc.tickets += mt.tickets
          acc.credit += mt.credit
          acc.cash += mt.cash
          acc.invoices += mt.invoices
          acc.overdueCount += mt.overdueCount
          return acc
        },
        { revenue: 0, m3All: 0, m3Sold: 0, tickets: 0, credit: 0, cash: 0, invoices: 0, overdueCount: 0 },
      )
    : monthTotals(month)
  const net = t.revenue
  const vat = Math.round(net * 0.07 * 100) / 100
  const estCost = Math.round(net * 0.62)
  const grossProfit = net - estCost

  const summary = [
    { label: 'ยอดขายรวม (ก่อน VAT)', value: baht(net) },
    { label: 'ภาษีมูลค่าเพิ่ม 7%', value: baht(vat) },
    { label: 'รวมเรียกเก็บ', value: baht(net + vat) },
    { label: 'กำไรขั้นต้น (ประมาณ)', value: baht(grossProfit), invert: true },
  ]

  /* Product mix — for "ทั้งปี" aggregate across every month's productMix. */
  const mixRaw = isYear
    ? (() => {
        const map = new Map<string, { label: string; m3: number }>()
        for (const m of MONTHS) {
          for (const p of productMix(m.num)) {
            const ex = map.get(p.code) ?? { label: p.label, m3: 0 }
            ex.m3 += p.m3
            map.set(p.code, ex)
          }
        }
        const total = [...map.values()].reduce((s, p) => s + p.m3, 0) || 1
        return [...map.entries()]
          .map(([code, p]) => ({ code, label: p.label, m3: p.m3, pct: Math.round((p.m3 / total) * 100) }))
          .sort((a, b) => b.m3 - a.m3)
      })()
    : productMix(month)
  const mix: Seg[] = mixRaw.slice(0, 5).map((p, i) => ({ label: p.label, pct: p.pct, color: MIX_COLORS[i] }))
  const restPct = mixRaw.slice(5).reduce((s, p) => s + p.pct, 0)
  if (restPct > 0) mix.push({ label: 'อื่นๆ', pct: restPct, color: MIX_COLORS[5] })

  /* Daily breakdown still drives the Excel export. Empty in "ทั้งปี" mode —
     the monthly trend table replaces it. */
  const daily = isYear ? [] : dailyM3(month)

  /* ---------- AR (เงินลูกค้าค้าง) ----------
     In "ทั้งปี" mode the "month" figures mirror the all-time figures, so the
     KPI/finance cards stay meaningful without duplicating data. */
  const invScope = isYear ? INVOICES : INVOICES.filter((i) => i.month === month)
  const monthOutstandingAmt = invScope.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0)
  const monthOutstandingCount = invScope.filter((i) => i.status !== 'paid').length
  const monthOverdueAmt = invScope.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const monthOverdueCount = invScope.filter((i) => i.status === 'overdue').length

  /* All-time figures are always the cumulative year-wide totals. */
  const allOutstandingAmt = INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0)
  const allOverdueAmt = INVOICES.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const allOverdueCount = INVOICES.filter((i) => i.status === 'overdue').length
  const overdueCustomers = new Set(INVOICES.filter((i) => i.status === 'overdue').map((i) => i.customer)).size

  /* ---------- Top 5 customers / debtors for horizontal bar charts ---------- */
  const aggScope = customerAgg(month)
  const topCustomers = aggScope.filter((c) => c.sales > 0).slice(0, 5)
    .map((c) => ({ label: c.name, value: Math.round(c.sales * 1.07 * 100) / 100 }))
  const overdueByCustomer = new Map<string, number>()
  for (const inv of invScope) {
    if (inv.status === 'overdue') {
      overdueByCustomer.set(inv.customer, (overdueByCustomer.get(inv.customer) ?? 0) + inv.total)
    }
  }
  const topDebtors = [...overdueByCustomer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ label: name, value }))

  /* ---------- AP (เงินที่บริษัทค้างจ่ายซัพพลายเออร์) — placeholder estimate ---------- */
  const estPayablesCement = Math.round(estCost * SUPPLIER_CREDIT_RATIO * 0.65) /* cement ≈ 65% of cost */
  const estPayablesFuel   = Math.round(estCost * SUPPLIER_CREDIT_RATIO * 0.20) /* fuel ≈ 20% of cost */
  const estPayablesOther  = Math.round(estCost * SUPPLIER_CREDIT_RATIO * 0.15) /* misc ≈ 15% of cost */
  const estPayablesTotal  = estPayablesCement + estPayablesFuel + estPayablesOther

  /* File-name slug: "monthly-report-{month}-2569" or "yearly-report-2569".
     Avoid spaces / dots that could trip browsers' download handlers. */
  const slug = isYear
    ? 'yearly-report-2569'
    : `monthly-report-${monthLabel(month).replace(/\s+/g, '-').replace(/\./g, '')}`

  const exportPdf = async () => {
    if (!reportRef.current || exporting) return
    setExporting('pdf')
    /* Let React paint the `.report-pdf-snapshot` class before capture. */
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    try {
      const node = reportRef.current
      /* Capture the entire element at 2× for crisp print quality. */
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1240, /* a touch wider than the 1200px snapshot for safety */
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageWidth = pdf.internal.pageSize.getWidth()   /* 210mm */
      const pageHeight = pdf.internal.pageSize.getHeight() /* 297mm */
      const margin = 8                                      /* mm — slim margin keeps content as large as possible */
      const availW = pageWidth - 2 * margin
      const availH = pageHeight - 2 * margin

      /* Fit the captured image inside the available area while preserving its
         aspect ratio. This guarantees ALL content shows on exactly one page. */
      const imgAspect = canvas.width / canvas.height
      const areaAspect = availW / availH
      let drawW: number, drawH: number
      if (imgAspect > areaAspect) {
        /* image relatively wider than the page area — width is the limit. */
        drawW = availW
        drawH = availW / imgAspect
      } else {
        /* image relatively taller — height is the limit. */
        drawH = availH
        drawW = availH * imgAspect
      }
      const x = (pageWidth - drawW) / 2
      const y = margin /* anchor at top so the report starts from the top of the page */

      pdf.addImage(imgData, 'JPEG', x, y, drawW, drawH, undefined, 'FAST')
      pdf.save(`${slug}.pdf`)
    } catch (err) {
      console.error('Monthly report PDF export failed', err)
    } finally {
      setExporting(null)
    }
  }

  const exportExcel = () => {
    if (exporting) return
    setExporting('excel')
    try {
      const rows: (string | number)[][] = []
      const stripBaht = (b: string) => b.replace(/^฿/, '').replace(/,/g, '')

      rows.push([reportTitle, periodLabel])
      rows.push([])

      rows.push(['สรุปรายรับ'])
      for (const s of summary) rows.push([s.label, stripBaht(s.value)])
      rows.push([])

      rows.push(['ตัวเลขรวม'])
      rows.push(['ปริมาณผลิต (m³)', Math.round(t.m3All)])
      rows.push(['ปริมาณขายจริง (m³)', Math.round(t.m3Sold)])
      rows.push(['จำนวนใบจ่ายคอนกรีต', t.tickets])
      rows.push(['จำนวนใบกำกับภาษี', t.invoices])
      rows.push(['ขายเงินสด/โอน', stripBaht(baht(t.cash))])
      rows.push(['ขายเครดิต (ค้าง)', stripBaht(baht(t.credit))])
      rows.push(['ราคาขายเฉลี่ย / m³', t.m3Sold ? Math.round(net / t.m3Sold) : 0])
      rows.push([])

      rows.push(['ลูกหนี้ — เงินลูกค้าค้างชำระ'])
      rows.push(['ใบกำกับค้างชำระ (เดือนนี้)', monthOutstandingCount, stripBaht(baht(monthOutstandingAmt))])
      rows.push(['ใบกำกับเลยกำหนด (เดือนนี้)', monthOverdueCount, stripBaht(baht(monthOverdueAmt))])
      rows.push(['ลูกหนี้รวมทั้งปี (สะสม)', '', stripBaht(baht(allOutstandingAmt))])
      rows.push(['เลยกำหนดสะสมทั้งปี', allOverdueCount, stripBaht(baht(allOverdueAmt))])
      rows.push(['จำนวนลูกค้าที่เลยกำหนด', overdueCustomers])
      rows.push([])

      rows.push(['เจ้าหนี้ — บริษัทค้างจ่าย (ประมาณการ)'])
      rows.push(['ค่าปูน/วัสดุ', stripBaht(baht(estPayablesCement))])
      rows.push(['ค่าน้ำมัน/บำรุงรักษา', stripBaht(baht(estPayablesFuel))])
      rows.push(['อื่นๆ', stripBaht(baht(estPayablesOther))])
      rows.push(['รวมประมาณ', stripBaht(baht(estPayablesTotal))])
      rows.push([])

      rows.push(['ลูกค้ายอดสั่งสูงสุด 5 อันดับ'])
      rows.push(['อันดับ', 'ลูกค้า', 'ยอดขาย รวม VAT (บาท)'])
      topCustomers.forEach((c, i) => rows.push([i + 1, c.label, Math.round(c.value)]))
      rows.push([])

      rows.push(['ลูกหนี้ยอดค้างสูงสุด 5 อันดับ (เลยกำหนดชำระ)'])
      rows.push(['อันดับ', 'ลูกค้า', 'ยอดค้างเลยกำหนด (บาท)'])
      topDebtors.forEach((c, i) => rows.push([i + 1, c.label, Math.round(c.value)]))
      rows.push([])

      if (isYear) {
        rows.push(['ยอดขายรายเดือน'])
        rows.push(['เดือน', 'ยอดขาย (บาท)', 'ปริมาณ (m³)', 'จำนวนใบจ่าย'])
        for (const m of MONTHLY_TREND) {
          rows.push([m.short, Math.round(m.revenue), Math.round(m.m3 * 100) / 100, m.tickets])
        }
      } else {
        rows.push(['ปริมาณรายวัน'])
        rows.push(['วันที่', 'ปริมาณ (m³)', 'ยอดขาย (บาท)'])
        for (const d of daily) rows.push([d.day, Math.round(d.m3 * 100) / 100, Math.round(d.sales)])
      }
      rows.push([])

      rows.push(['สัดส่วนสินค้า'])
      rows.push(['รหัสสินค้า', 'รายการ', 'ปริมาณ (m³)', 'สัดส่วน (%)'])
      for (const p of mixRaw) rows.push([p.code, p.label, Math.round(p.m3 * 100) / 100, p.pct])

      const csvLines = rows.map((r) =>
        r.map((cell) => {
          const s = String(cell ?? '')
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        }).join(',')
      )
      const csv = '﻿' + csvLines.join('\r\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slug}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (err) {
      console.error('Monthly report Excel export failed', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="รายงานประจำเดือน / ปี"
        sub={`${isYear ? 'Yearly Report' : 'Monthly Report'} · ${periodLabel}`}
        actions={
          <>
            <MonthSelect value={month} onChange={setMonth} allowAll />
            <Button variant="secondary" onClick={exportPdf} disabled={!!exporting}>
              {exporting === 'pdf' ? 'กำลังสร้าง PDF...' : 'พิมพ์ PDF'}
            </Button>
            <Button variant="primary" onClick={exportExcel} disabled={!!exporting}>
              {exporting === 'excel' ? 'กำลังสร้าง Excel...' : 'ส่งออก Excel'}
            </Button>
          </>
        }
      />

      <div ref={reportRef} className={exporting === 'pdf' ? 'report-pdf-snapshot' : ''}>
        <div className="report-header">
          <img src="/logo.jpg" alt="KPC" className="rh-logo" />
          <div className="rh-co">
            <div className="rh-co-name">{COMPANY.name}</div>
            <div className="rh-co-line">({COMPANY.branch}) {COMPANY.address}</div>
            <div className="rh-co-line">เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.tel}</div>
          </div>
          <div className="rh-title">
            <div className="rh-tt">{reportTitle}</div>
            <div className="rh-meta">{periodLabel}</div>
            <div className="rh-date">ออก ณ {new Date().toLocaleDateString('th-TH')}</div>
          </div>
        </div>

        <div className="grid g-4" style={{ marginBottom: 16 }}>
          {summary.map((s) => (
            <KpiCard key={s.label} label={s.label} value={s.value} invert={s.invert} />
          ))}
        </div>

        <div className="grid g-4" style={{ marginBottom: 16 }}>
          <KpiCard label="ปริมาณผลิต · Volume" value={qm(Math.round(t.m3All))} unit="m³" note={isYear ? `ทั้งปี · ${MONTHS.length} เดือน` : 'ทั้งเดือน'} />
          <KpiCard
            label={isYear ? 'ค้างชำระสะสม · Outstanding' : 'ค้างชำระเดือนนี้ · Outstanding'}
            value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(monthOutstandingAmt)}</span>}
            note={`${monthOutstandingCount} ใบ · เกินกำหนด ${monthOverdueCount}`}
          />
          <KpiCard
            label="ค้างชำระสะสมทั้งปี · Outstanding YTD"
            value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(allOutstandingAmt)}</span>}
            note={`เลยกำหนดสะสม ${allOverdueCount} ใบ · ${overdueCustomers} ลูกค้า`}
          />
          <KpiCard label="เฉลี่ยต่อคิว · Avg / m³" value={baht(t.m3Sold ? Math.round(net / t.m3Sold) : 0)} note="ราคาขายเฉลี่ย" />
        </div>

        {/* Product mix donut + monthly revenue line chart side by side. */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 16 }}>
          <div className="card row" style={{ gap: 20 }}>
            <Donut segments={mix} />
            <div className="stack" style={{ gap: 11, flex: 1 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สัดส่วนสินค้า</div>
                <div className="card-meta">{periodLabel} · {isYear ? `${MONTHS.length} เดือน` : `${daily.length} วัน`} · {qm(Math.round(t.m3All))} m³</div>
              </div>
              <Legend segments={mix} />
            </div>
          </div>

          <div className="card stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ยอดขายรายเดือน · 2569</div>
                <div className="card-meta">Jan–Jun · รวม {baht(MONTHLY_TREND.reduce((s, m) => s + m.revenue, 0))}</div>
              </div>
              <Badge tone="info" pip={false} square>{MONTHLY_TREND.length} เดือน</Badge>
            </div>
            <LineChart
              data={MONTHLY_TREND.map((m) => ({
                label: m.short.toUpperCase().replace(/\./g, ''),
                value: m.revenue,
                highlight: !isYear && m.month === month,
              }))}
            />
          </div>
        </div>

        {/* Finance summary — three separate cards so each section has room to
            breathe (replaces the previous cramped 3-column single card). */}
        <div className="row" style={{ gap: 8, marginBottom: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สรุปการเงิน · {periodLabel}</span>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone="warning" square pip={false}>เครดิต {net ? Math.round((t.credit / net) * 100) : 0}%</Badge>
            {allOverdueCount > 0 && <Badge tone="danger" square pip={false}>เกินกำหนด {allOverdueCount} ใบ</Badge>}
          </div>
        </div>

        <div className="grid g-3" style={{ gap: 16 }}>
          {/* รายได้ · ต้นทุน · กำไร */}
          <FinanceCard title="รายได้ · ต้นทุน · กำไร" tone="info">
            <Row k="ยอดขายสุทธิ" v={baht(net)} />
            <Row k="ขายเงินสด/โอน" v={baht(t.cash)} />
            <Row k="ขายเครดิต" v={baht(t.credit)} />
            <div className="divider" />
            <Row k="ต้นทุนประมาณ (62%)" v={baht(estCost)} />
            <Row k="กำไรขั้นต้น" v={baht(grossProfit)} strong />
          </FinanceCard>

          {/* ลูกหนี้ · เงินลูกค้าค้าง */}
          <FinanceCard title="ลูกหนี้ · เงินลูกค้าค้าง" tone="warning">
            {isYear ? (
              <>
                <Row k="ลูกหนี้สะสมทั้งปี" v={baht(allOutstandingAmt)} hint={`${monthOutstandingCount} ใบ`} strong />
                <Row k="เลยกำหนดสะสม" v={baht(allOverdueAmt)} hint={`${allOverdueCount} ใบ`} danger />
                <div className="divider" />
                <Row k="ลูกค้าเลยกำหนด" v={`${overdueCustomers} ราย`} />
              </>
            ) : (
              <>
                <Row k="ค้างชำระเดือนนี้" v={baht(monthOutstandingAmt)} hint={`${monthOutstandingCount} ใบ`} />
                <Row k="เลยกำหนดเดือนนี้" v={baht(monthOverdueAmt)} hint={`${monthOverdueCount} ใบ`} danger />
                <div className="divider" />
                <Row k="ลูกหนี้สะสมทั้งปี" v={baht(allOutstandingAmt)} strong />
                <Row k="เลยกำหนดสะสม" v={baht(allOverdueAmt)} hint={`${allOverdueCount} ใบ`} danger />
                <Row k="ลูกค้าเลยกำหนด" v={`${overdueCustomers} ราย`} />
              </>
            )}
          </FinanceCard>

          {/* เจ้าหนี้ · บริษัทค้างจ่าย */}
          <FinanceCard title="เจ้าหนี้ · บริษัทค้างจ่าย" tone="neutral" hint="ประมาณการจาก 40% ของต้นทุน (รอระบบเจ้าหนี้)">
            <Row k="ค่าปูน/วัสดุ" v={baht(estPayablesCement)} />
            <Row k="ค่าน้ำมัน/บำรุง" v={baht(estPayablesFuel)} />
            <Row k="อื่นๆ (โสหุ้ย)" v={baht(estPayablesOther)} />
            <div className="divider" />
            <Row k="รวมประมาณ" v={baht(estPayablesTotal)} strong />
          </FinanceCard>
        </div>

        {/* Top 5 customers (sales) + top 5 debtors (outstanding) — horizontal bars. */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card stack" style={{ gap: 10, padding: 16, borderTop: '3px solid #16a34a' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', letterSpacing: 0.1 }}>
                ลูกค้ายอดสั่งสูงสุด · Top 5
              </div>
              <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 3 }}>
                {periodLabel} · เรียงตามยอดขาย (รวม VAT 7%)
              </div>
            </div>
            <HBarChart data={topCustomers} color="#16a34a" emptyText={isYear ? 'ยังไม่มียอดขายในปีนี้' : 'ยังไม่มียอดขายในเดือนนี้'} />
          </div>

          <div className="card stack" style={{ gap: 10, padding: 16, borderTop: '3px solid #dc2626' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', letterSpacing: 0.1 }}>
                ลูกหนี้ยอดค้างสูงสุด · Top 5
              </div>
              <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 3 }}>
                {periodLabel} · เฉพาะใบกำกับที่เลยกำหนดชำระ (รวม VAT)
              </div>
            </div>
            <HBarChart data={topDebtors} color="#dc2626" emptyText={isYear ? 'ไม่มีลูกหนี้เลยกำหนดในปีนี้' : 'ไม่มีลูกหนี้เลยกำหนดในเดือนนี้'} />
          </div>
        </div>
      </div>
    </>
  )
}

/** Horizontal bar chart: label on the left, bar in the middle, value on the
    right. Bar width is value / max. Works for any positive-numeric data set. */
export function HBarChart({
  data,
  color,
  emptyText,
}: {
  data: { label: string; value: number }[]
  color: string
  emptyText: string
}) {
  if (!data.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--kpc-text-faint)', padding: '24px 4px', textAlign: 'center' }}>
        {emptyText}
      </div>
    )
  }
  const max = Math.max(...data.map((d) => d.value))
  return (
    <div className="stack" style={{ gap: 10 }}>
      {data.map((d, i) => {
        const pct = max ? Math.max(2, (d.value / max) * 100) : 0
        return (
          <div key={i} className="stack" style={{ gap: 4 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--kpc-text-strong)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {i + 1}. {d.label}
              </span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>
                {bahtShort(d.value)}
              </span>
            </div>
            <div style={{ height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FinanceCard({
  title,
  tone,
  hint,
  children,
}: {
  title: string
  tone: 'info' | 'warning' | 'danger' | 'neutral'
  hint?: string
  children: React.ReactNode
}) {
  const accent = tone === 'info' ? 'var(--kpc-primary-ink)'
    : tone === 'warning' ? '#b45309'
    : tone === 'danger' ? 'var(--kpc-danger-ink)'
    : 'var(--kpc-text-muted)'
  return (
    <div className="card stack" style={{ gap: 12, padding: 16, borderTop: `3px solid ${accent}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, letterSpacing: 0.1 }}>
          {title}
        </div>
        {hint && <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 3 }}>{hint}</div>}
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

/** Simple SVG line chart used for the monthly revenue trend. Uses a fixed
    viewBox so the SVG scales to whatever width the card gives it. */
export function LineChart({ data }: { data: { label: string; value: number; highlight?: boolean }[] }) {
  const W = 480, H = 200
  const pad = { top: 18, right: 18, bottom: 30, left: 8 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.15

  const points = data.map((d, i) => {
    const x = data.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (data.length - 1)) * innerW
    const y = pad.top + innerH - (d.value / max) * innerH
    return { x, y, ...d }
  })
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  /* Soft area fill under the line for visual weight. */
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`

  const gridYs = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block' }}>
      {/* horizontal grid lines */}
      {gridYs.map((g) => {
        const y = pad.top + innerH * (1 - g)
        return <line key={g} x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#e5e7eb" strokeWidth="0.6" />
      })}

      {/* area + line */}
      <path d={areaD} fill="var(--kpc-primary-50, #eef2ff)" opacity="0.55" />
      <path d={pathD} fill="none" stroke="var(--kpc-primary, #0E0EE6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* dots + value labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={p.highlight ? 5 : 3.5}
            fill={p.highlight ? 'var(--kpc-primary-ink, #1d4ed8)' : 'var(--kpc-primary, #0E0EE6)'}
            stroke="#fff"
            strokeWidth="1.5"
          />
          <text
            x={p.x}
            y={p.y - 9}
            fontSize="11"
            textAnchor="middle"
            fill={p.highlight ? 'var(--kpc-primary-ink, #1d4ed8)' : 'var(--kpc-text-strong)'}
            fontWeight={p.highlight ? 700 : 500}
            fontFamily="var(--kpc-font-mono)"
          >
            ฿{(p.value / 1_000_000).toFixed(1)}M
          </text>
        </g>
      ))}

      {/* month labels */}
      {points.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={H - 8}
          fontSize="11"
          textAnchor="middle"
          fill={p.highlight ? 'var(--kpc-primary-ink, #1d4ed8)' : 'var(--kpc-text-muted)'}
          fontWeight={p.highlight ? 700 : 500}
        >
          {p.label}
        </text>
      ))}
    </svg>
  )
}

export function Row({ k, v, hint, danger, strong }: { k: string; v: string; hint?: string; danger?: boolean; strong?: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 12.5, color: 'var(--kpc-text-muted)' }}>{k}</span>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
        {hint && <span style={{ fontSize: 10, color: 'var(--kpc-text-faint)' }}>{hint}</span>}
        <span className="mono" style={{ fontSize: 13, fontWeight: strong ? 700 : 500, color: danger ? 'var(--kpc-danger-ink)' : strong ? 'var(--kpc-primary-ink)' : 'var(--kpc-text-strong)' }}>{v}</span>
      </span>
    </div>
  )
}
