import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { PageHeader } from '../components/Layout'
import { Button, Badge, MonthSelect } from '../components/ui'
import { KpiCard, Donut, Legend, type Seg } from '../components/charts'
import { monthTotals, productMix, dailyM3, customerAgg, MONTHLY_TREND, MONTHS, LATEST_MONTH, monthLabel, baht, bahtShort, qm } from '../data/selectors'
import { AR_OUTSTANDING, AR_OUTSTANDING_TOTAL } from '../data/receivables'
import { COMPANY, PRODUCT_MAP } from '../data/real'
import { useCreatedDocs } from '../data/createdDocs'

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

  /* ---------- SITE breakdown ---------- */
  const created = useCreatedDocs()
  /* แพล้นปูน = the concrete business above (seed tickets/invoices). */
  const plant = { sales: net, m3All: t.m3All, m3Sold: t.m3Sold, tickets: t.tickets }
  /* โรงหล่อ = foundry deliveries + production, filtered to the selected period. */
  const monthOf = (iso: string) => Number(iso.slice(5, 7))
  const inPeriod = (iso: string) => isYear || monthOf(iso) === month
  const foundry = (() => {
    let salesValue = 0, pieces = 0
    let notes = 0
    for (const fd of created.foundryDeliveries) {
      if (!inPeriod(fd.date)) continue
      notes += 1
      for (const it of fd.items) {
        pieces += it.qty
        const p = PRODUCT_MAP[it.code]
        const price = (p?.pickupPrices && it.pickup) ? p.pickupPrices[it.pickup] : (p?.price ?? 0)
        salesValue += it.qty * price
      }
    }
    const produced = created.foundryReceipts.filter((r) => inPeriod(r.date)).reduce((s, r) => s + r.qty, 0)
    return { salesValue: Math.round(salesValue * 100) / 100, pieces: Math.round(pieces * 100) / 100, produced: Math.round(produced * 100) / 100, notes }
  })()

  /* ต้นทุนเสียหาย/สูญหาย — from stock reconciliations in the period, by scope. */
  const reconcileLoss = (scope: 'material' | 'foundry') =>
    Math.round(created.stockReconciles
      .filter((rc) => (rc.scope ?? 'material') === scope && inPeriod(rc.date))
      .reduce((s, rc) => s + (rc.lossValue || 0), 0) * 100) / 100
  const lossMaterial = reconcileLoss('material')
  const lossFoundry = reconcileLoss('foundry')
  const lossTotal = Math.round((lossMaterial + lossFoundry) * 100) / 100

  /* Foundry product mix — share of pieces delivered per product, for its donut. */
  const FOUNDRY_COLORS = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#d97706', '#b45309']
  const foundryMix: Seg[] = (() => {
    const map = new Map<string, number>()
    for (const fd of created.foundryDeliveries) {
      if (!inPeriod(fd.date)) continue
      for (const it of fd.items) map.set(it.code, (map.get(it.code) ?? 0) + it.qty)
    }
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, [, q]) => s + q, 0) || 1
    const segs: Seg[] = entries.slice(0, 5).map(([code, q], i) => ({
      label: PRODUCT_MAP[code]?.name ?? code,
      pct: Math.round((q / total) * 100),
      color: FOUNDRY_COLORS[i],
    }))
    const rest = entries.slice(5).reduce((s, [, q]) => s + Math.round((q / total) * 100), 0)
    if (rest > 0) segs.push({ label: 'อื่นๆ', pct: rest, color: FOUNDRY_COLORS[5] })
    return segs
  })()

  /* Foundry sales value per calendar month — drives the second trend line. */
  const foundrySalesByMonth = (() => {
    const map = new Map<number, number>()
    for (const fd of created.foundryDeliveries) {
      const mo = Number(fd.date.slice(5, 7))
      let v = 0
      for (const it of fd.items) {
        const p = PRODUCT_MAP[it.code]
        const price = p?.pickupPrices && it.pickup ? p.pickupPrices[it.pickup] : p?.price ?? 0
        v += it.qty * price
      }
      map.set(mo, (map.get(mo) ?? 0) + v)
    }
    return map
  })()

  const summary = [
    { label: 'ยอดขายรวม (ก่อน VAT)', value: baht(net) },
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

  /* ---------- ลูกหนี้ (AR) — REAL reconciled receivables snapshot ----------
     Sourced from the ลูกหนี้ page (AR_OUTSTANDING), NOT derived from invoices.
     It is a current snapshot, so the same figures apply to the monthly and the
     yearly view. */
  const arOutstandingTotal = AR_OUTSTANDING_TOTAL
  const arList = Object.entries(AR_OUTSTANDING).map(([name, r]) => ({ name, amount: r.amount, dueDate: r.dueDate }))
  /* A balance is overdue when its due date is strictly before today. */
  const isArOverdue = (dueDate: string) => {
    const [y, m, d] = dueDate.split('-').map(Number)
    const now = new Date()
    return new Date(y, m - 1, d).getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }
  const arDebtorCount = arList.filter((d) => d.amount > 0).length
  const arOverdueList = arList.filter((d) => d.amount > 0 && isArOverdue(d.dueDate))
  const arOverdueAmt = arOverdueList.reduce((s, d) => s + d.amount, 0)
  const arOverdueCount = arOverdueList.length

  /* ---------- Top 5 customers (sales) / debtors (real outstanding) ---------- */
  const topCustomers = customerAgg(month).filter((c) => c.sales > 0).slice(0, 5)
    .map((c) => ({ label: c.name, value: Math.round(c.sales * 1.07 * 100) / 100 }))
  const topDebtors = [...arList].filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((d) => ({ label: d.name, value: d.amount }))

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
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageWidth = pdf.internal.pageSize.getWidth()   /* 210mm */
      const pageHeight = pdf.internal.pageSize.getHeight() /* 297mm */
      const margin = 10                                     /* mm — uniform top/bottom/left/right margin */
      const availW = pageWidth - 2 * margin
      const availH = pageHeight - 2 * margin

      /* Fill the full content width on every page, then slice the capture into
         page-height chunks so the report keeps margins on all four sides and
         flows onto as many A4 pages as it needs. */
      const pxPerMm = canvas.width / availW
      const pageHpx = Math.floor(availH * pxPerMm)
      let renderedHpx = 0
      let first = true
      while (renderedHpx < canvas.height) {
        const sliceHpx = Math.min(pageHpx, canvas.height - renderedHpx)
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = sliceHpx
        const ctx = pageCanvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, sliceHpx)
        ctx.drawImage(canvas, 0, renderedHpx, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx)
        const sliceData = pageCanvas.toDataURL('image/jpeg', 0.95)
        if (!first) pdf.addPage()
        pdf.addImage(sliceData, 'JPEG', margin, margin, availW, sliceHpx / pxPerMm, undefined, 'FAST')
        renderedHpx += sliceHpx
        first = false
      }
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
      rows.push(['ยอดขายรวม (ก่อน VAT)', stripBaht(baht(net))])
      rows.push(['ภาษีมูลค่าเพิ่ม 7%', stripBaht(baht(vat))])
      rows.push(['รวมเรียกเก็บ', stripBaht(baht(net + vat))])
      rows.push(['กำไรขั้นต้น (ประมาณ)', stripBaht(baht(grossProfit))])
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

      rows.push(['แยกตาม SITE'])
      rows.push(['', 'แพล้นปูน', 'โรงหล่อ'])
      rows.push(['ยอดขาย/มูลค่าส่งมอบ (บาท)', Math.round(plant.sales), Math.round(foundry.salesValue)])
      rows.push(['ปริมาณผลิต', Math.round(plant.m3All), foundry.produced])
      rows.push(['ปริมาณขาย/ส่งมอบ', Math.round(plant.m3Sold), foundry.pieces])
      rows.push(['จำนวนใบ (จ่าย/ส่งสินค้า)', plant.tickets, foundry.notes])
      rows.push(['ต้นทุนเสียหาย/สูญหาย (บาท)', Math.round(lossMaterial), Math.round(lossFoundry)])
      rows.push(['ต้นทุนเสียหาย/สูญหาย รวม (บาท)', Math.round(lossTotal)])
      rows.push([])

      rows.push(['ลูกหนี้ — เงินลูกค้าค้างชำระ (ยอดจริงจากหน้าลูกหนี้)'])
      rows.push(['ลูกหนี้คงค้างปัจจุบัน', arDebtorCount, stripBaht(baht(arOutstandingTotal))])
      rows.push(['เลยกำหนดชำระ', arOverdueCount, stripBaht(baht(arOverdueAmt))])
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

      rows.push(['ลูกหนี้ยอดค้างสูงสุด 5 อันดับ (ยอดคงค้างจริง)'])
      rows.push(['อันดับ', 'ลูกค้า', 'ยอดคงค้าง (บาท)'])
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

        {/* ===== การเงิน-การผลิต (รวม) — KPI cards (left) + monthly trend (right) ===== */}
        <div className="row" style={{ gap: 8, margin: '2px 0 6px', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>การเงิน-การผลิต (รวม) · {periodLabel}</span>
          <Badge tone="info" pip={false} square>กิจไพศาลคอนกรีต</Badge>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12, alignItems: 'stretch' }}>
          {/* left half — combined finance/production KPI cards */}
          <div className="grid g-2" style={{ gap: 8 }}>
            {summary.map((s) => (
              <KpiCard key={s.label} label={s.label} value={s.value} invert={s.invert} />
            ))}
            <KpiCard
              label="ต้นทุนเสียหาย/สูญหาย · Loss"
              value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(lossTotal)}</span>}
              note="วัตถุดิบ + โรงหล่อ"
            />
            <KpiCard
              label="ลูกหนี้คงค้าง · Outstanding"
              value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(arOutstandingTotal)}</span>}
              note={`${arDebtorCount} ราย · เลยกำหนด ${arOverdueCount}`}
            />
          </div>

          {/* right half — monthly revenue trend */}
          <div className="card stack" style={{ gap: 6, padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ยอดขายรายเดือน · 2569</div>
                <div className="card-meta">Jan–Jun · รวม {baht(MONTHLY_TREND.reduce((s, m) => s + m.revenue, 0))}</div>
              </div>
              <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                <span className="row" style={{ gap: 7, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>
                  <span style={{ width: 20, height: 4, borderRadius: 3, background: 'var(--kpc-primary, #0E0EE6)' }} />แพล้นปูน
                </span>
                <span className="row" style={{ gap: 7, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>
                  <span style={{ width: 20, height: 4, borderRadius: 3, background: '#f59e0b' }} />โรงหล่อ
                </span>
              </div>
            </div>
            <LineChart
              data={MONTHLY_TREND.map((m) => ({
                label: m.short.toUpperCase().replace(/\./g, ''),
                value: m.revenue,
                highlight: !isYear && m.month === month,
              }))}
              /* TODO(mock): foundry trend seeded at ~half of plant revenue until real
                 foundry deliveries accumulate; real values are added on top. */
              series2={MONTHLY_TREND.map((m) => Math.round(m.revenue * 0.5) + (foundrySalesByMonth.get(m.month) ?? 0))}
            />
          </div>
        </div>

        {/* ===== การเงิน-การผลิต แยกตาม SITE ===== */}
        <div className="row" style={{ gap: 8, margin: '2px 0 6px', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>การเงิน-การผลิต แยกตาม SITE · {periodLabel}</span>
          <Badge tone="neutral" pip={false} square>แพล้นปูน + โรงหล่อ</Badge>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="card stack" style={{ gap: 8, padding: 12, borderTop: '3px solid var(--kpc-primary)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--kpc-primary-ink)' }}>แพล้นปูน · Concrete Plant</div>
            <div className="grid g-2" style={{ gap: 8 }}>
              <KpiCard label="ยอดขาย · Sales" value={baht(plant.sales)} note="ก่อน VAT" />
              <KpiCard label="ปริมาณผลิต · Volume" value={qm(Math.round(plant.m3All))} unit="m³" note="ผลิตรวม" />
              <KpiCard label="ปริมาณขาย · Sold" value={qm(Math.round(plant.m3Sold))} unit="m³" note="ส่งลูกค้า" />
              <KpiCard label="ต้นทุนเสียหาย/สูญหาย · Loss" value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(lossMaterial)}</span>} note="จากกระทบยอด" />
            </div>
          </div>
          <div className="card stack" style={{ gap: 8, padding: 12, borderTop: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>โรงหล่อ · Foundry</div>
            <div className="grid g-2" style={{ gap: 8 }}>
              <KpiCard label="มูลค่าส่งมอบ · Delivered" value={baht(foundry.salesValue)} note="รวม VAT (ประมาณ)" />
              <KpiCard label="ผลิตเข้าสต๊อก · Produced" value={qm(foundry.produced)} note="ชิ้น/แผ่น/ต้น" />
              <KpiCard label="จำนวนส่งมอบ · Pieces" value={qm(foundry.pieces)} note="ส่งให้ลูกค้า" />
              <KpiCard label="ต้นทุนเสียหาย/สูญหาย · Loss" value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(lossFoundry)}</span>} note="จากกระทบยอด" />
            </div>
          </div>
        </div>

        {/* Product mix donuts — concrete plant vs foundry, aligned by site. */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="card row" style={{ gap: 20, borderTop: '3px solid var(--kpc-primary)' }}>
            <Donut segments={mix} />
            <div className="stack" style={{ gap: 11, flex: 1 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-primary-ink)' }}>สัดส่วนสินค้า · แพล้นปูน</div>
                <div className="card-meta">{periodLabel} · {qm(Math.round(t.m3All))} m³</div>
              </div>
              <Legend segments={mix} />
            </div>
          </div>

          <div className="card row" style={{ gap: 20, borderTop: '3px solid #f59e0b' }}>
            {foundryMix.length > 0 ? (
              <>
                <Donut segments={foundryMix} />
                <div className="stack" style={{ gap: 11, flex: 1 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#b45309' }}>สัดส่วนสินค้า · โรงหล่อ</div>
                    <div className="card-meta">{periodLabel} · {qm(foundry.pieces)} ชิ้น</div>
                  </div>
                  <Legend segments={foundryMix} />
                </div>
              </>
            ) : (
              <div className="stack" style={{ gap: 6, flex: 1, justifyContent: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#b45309' }}>สัดส่วนสินค้า · โรงหล่อ</div>
                <div className="card-meta">ยังไม่มีการส่งมอบสินค้าโรงหล่อใน{isYear ? 'ปีนี้' : 'เดือนนี้'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Finance summary — three separate cards so each section has room to
            breathe (replaces the previous cramped 3-column single card). */}
        <div className="row" style={{ gap: 8, marginBottom: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สรุปการเงิน · {periodLabel}</span>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone="warning" square pip={false}>เครดิต {net ? Math.round((t.credit / net) * 100) : 0}%</Badge>
            {arOverdueCount > 0 && <Badge tone="danger" square pip={false}>เลยกำหนด {arOverdueCount} ราย</Badge>}
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

          {/* ลูกหนี้ · เงินลูกค้าค้าง — ยอดจริงจากหน้าลูกหนี้ (กระทบยอดล่าสุด) */}
          <FinanceCard title="ลูกหนี้ · เงินลูกค้าค้าง" tone="warning" hint="ยอดคงค้างจริงจากหน้าลูกหนี้ · ยอด ณ ปัจจุบัน">
            <Row k="ลูกหนี้คงค้าง (ปัจจุบัน)" v={baht(arOutstandingTotal)} hint={`${arDebtorCount} ราย`} strong />
            <Row k="เลยกำหนดชำระ" v={baht(arOverdueAmt)} hint={`${arOverdueCount} ราย`} danger />
            <div className="divider" />
            <Row k="ลูกค้าที่ยังค้าง" v={`${arDebtorCount} ราย`} />
            <Row k="ลูกค้าเลยกำหนด" v={`${arOverdueCount} ราย`} />
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
                ยอดคงค้างจริงจากหน้าลูกหนี้ · ยอด ณ ปัจจุบัน
              </div>
            </div>
            <HBarChart data={topDebtors} color="#dc2626" emptyText="ไม่มีลูกหนี้คงค้าง" />
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
export function LineChart({ data, series2 }: { data: { label: string; value: number; highlight?: boolean }[]; series2?: number[] }) {
  const W = 480, H = 140
  const pad = { top: 16, right: 18, bottom: 26, left: 8 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const max = Math.max(1, ...data.map((d) => d.value), ...(series2 ?? [])) * 1.15

  const xAt = (i: number) => (data.length === 1 ? pad.left + innerW / 2 : pad.left + (i / (data.length - 1)) * innerW)
  const yAt = (v: number) => pad.top + innerH - (v / max) * innerH

  const points = data.map((d, i) => ({ x: xAt(i), y: yAt(d.value), ...d }))
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  /* Soft area fill under the line for visual weight. */
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`

  /* Optional second series — foundry sales, drawn in amber. */
  const FOUNDRY = '#f59e0b'
  const points2 = series2 ? series2.map((v, i) => ({ x: xAt(i), y: yAt(v), value: v })) : null
  const pathD2 = points2 ? points2.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : ''

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
      <path d={pathD} fill="none" stroke="var(--kpc-primary, #0E0EE6)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* foundry line + dots (no value labels — keeps the chart readable) */}
      {points2 && (
        <>
          <path d={pathD2} fill="none" stroke={FOUNDRY} strokeWidth="1.2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
          {points2.map((p, i) => (
            <circle key={`f${i}`} cx={p.x} cy={p.y} r={3} fill={FOUNDRY} stroke="#fff" strokeWidth="1.5" />
          ))}
        </>
      )}

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
