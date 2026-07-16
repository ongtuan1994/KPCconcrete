import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Select } from '../components/ui'
import { KpiCard, Donut, Legend, type Seg } from '../components/charts'
import { INVOICES, prodShort, ticketYear, LATEST_MONTH, monthName, baht, bahtShort, qm } from '../data/selectors'
import { AR_OUTSTANDING, AR_OUTSTANDING_TOTAL } from '../data/receivables'
import { COMPANY, PRODUCT_MAP, DELIVERY_TICKETS } from '../data/real'
import { CREDITOR_MASTER } from '../data/creditors'
import { currentBuddhistYear, currentMonth } from '../utils/datetime'
import { canSharePdf, deliverPdf } from '../utils/sharePdf'
import { useCreatedDocs, useProducts } from '../data/createdDocs'

const MIX_COLORS = ['var(--kpc-primary, #0E0EE6)', '#8585F8', '#B4B4FB', '#D8D8FD', '#969CA6', '#C2C8D0']

export function MonthlyReport() {
  /* ---------- Real data = seed history + user-created documents ---------- */
  const created = useCreatedDocs()
  const products = useProducts()
  const priceOf = (code: string) => products.find((p) => p.code === code) ?? PRODUCT_MAP[code]
  const mergedTickets = [...created.tickets, ...DELIVERY_TICKETS]
  const mergedInvoices = [...created.invoices, ...INVOICES]
  /* An invoice is a โรงหล่อ invoice when any of its lines is a foundry product
     (same SITE test the ใบกำกับภาษี page uses), resolved against the merged product
     list so user-added foundry products count too. Plant invoices are the rest. */
  const isFoundryInvoice = (inv: { lines: { code: string }[] }) =>
    inv.lines.some((l) => priceOf(l.code)?.site === 'foundry')

  /* Available ปี (พ.ศ.) from the data, newest first. Default to the latest year,
     and within it the latest month that actually has data. */
  const years = [...new Set([currentBuddhistYear(), ...mergedTickets.map(ticketYear), ...mergedInvoices.map(ticketYear)])].sort((a, b) => b - a)
  const latest = mergedTickets.reduce(
    (best, tk) => { const y = ticketYear(tk); const key = y * 100 + tk.month; return key > best.key ? { key, year: y, month: tk.month } : best },
    { key: 0, year: years[0], month: LATEST_MONTH },
  )
  const [year, setYear] = useState<number>(latest.year)
  /* `month` accepts a numeric month (1-12) or 'all' for the full-year roll-up. */
  const [month, setMonth] = useState<number | 'all'>(latest.month)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | 'share' | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  const isYear = month === 'all'
  const periodLabel = isYear ? `ทั้งปี ${year}` : `${monthName(month)} ${year}`
  const reportTitle = isYear ? 'รายงานประจำปี' : 'รายงานประจำเดือน'

  /** "DD/MM/YY" delivery-ticket date → day number. */
  const dayOf = (date: string) => { const m = date.match(/^(\d{1,2})\//); return m ? Number(m[1]) : 0 }
  /** Buddhist year (พ.ศ.) of an ISO yyyy-mm-dd foundry date. */
  const yearOfIso = (iso: string) => Number(iso.slice(0, 4)) + 543

  /* Month totals from the merged ticket + invoice sets (seed + created) for a
     given (ปี, เดือน) — so the trend can roll across year boundaries. */
  const EN_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const totalsOfYM = (y: number, mo: number) => {
    const tix = mergedTickets.filter((tk) => ticketYear(tk) === y && tk.month === mo)
    /* ปริมาณขาย = concrete delivered on customer-sale tickets (ขายลูกค้า), whether or
       not they have been invoiced/priced yet — volume sold is recognized at delivery. */
    const custSales = tix.filter((tk) => tk.type === 'ขายลูกค้า')
    /* ยอดขาย = pre-VAT value of the tax invoices raised for the month (the billed
       source of truth), NOT the raw ticket amounts. credit/cash split the same
       invoice subtotals by pay method so they reconcile with ยอดขายสุทธิ. */
    const invs = mergedInvoices.filter((i) => ticketYear(i) === y && i.month === mo)
    return {
      revenue: invs.reduce((s, i) => s + i.subtotal, 0),
      /* แพล้นปูน only — excludes โรงหล่อ invoices, for the plant trend line. */
      plantRevenue: invs.filter((i) => !isFoundryInvoice(i)).reduce((s, i) => s + i.subtotal, 0),
      m3All: tix.reduce((s, tk) => s + tk.m3, 0),
      m3Sold: custSales.reduce((s, tk) => s + tk.m3, 0),
      tickets: tix.length,
      credit: invs.filter((i) => i.pay === 'เครดิต').reduce((s, i) => s + i.subtotal, 0),
      cash: invs.filter((i) => i.pay === 'เงินสด' || i.pay === 'โอน' || i.pay === 'เช็ค').reduce((s, i) => s + i.subtotal, 0),
      invoices: invs.length,
      overdueCount: invs.filter((i) => i.status === 'overdue').length,
    }
  }
  const totalsOf = (mo: number) => totalsOfYM(year, mo)

  /* Trend line = 6-month rolling window ending at the "anchor" month (the selected
     month, or the current month when viewing ทั้งปี). Crosses year boundaries. */
  const anchorMonth = isYear ? (year === currentBuddhistYear() ? currentMonth() : 12) : month
  const trendData = Array.from({ length: 6 }, (_, i) => {
    let m = anchorMonth - (5 - i), y = year
    while (m <= 0) { m += 12; y -= 1 }
    const tt = totalsOfYM(y, m)
    return { year: y, month: m, label: EN_SHORT[m - 1], revenue: tt.revenue, plantRevenue: tt.plantRevenue, m3: tt.m3All, tickets: tt.tickets }
  })

  /* Period totals — full selected YEAR when in "ทั้งปี" mode, else the single month. */
  const t = isYear
    ? Array.from({ length: 12 }, (_, i) => i + 1).reduce(
        (acc, mo) => {
          const mt = totalsOf(mo)
          acc.revenue += mt.revenue; acc.m3All += mt.m3All; acc.m3Sold += mt.m3Sold; acc.tickets += mt.tickets
          acc.credit += mt.credit; acc.cash += mt.cash; acc.invoices += mt.invoices; acc.overdueCount += mt.overdueCount
          return acc
        },
        { revenue: 0, m3All: 0, m3Sold: 0, tickets: 0, credit: 0, cash: 0, invoices: 0, overdueCount: 0 },
      )
    : totalsOf(month)
  const net = t.revenue
  const vat = Math.round(net * 0.07 * 100) / 100
  const estCost = Math.round(net * 0.62)
  const grossProfit = net - estCost

  /* ---------- SITE breakdown ---------- */
  /* แพล้นปูน = the concrete business above (merged tickets/invoices). */
  const plant = { sales: net, m3All: t.m3All, m3Sold: t.m3Sold, tickets: t.tickets }
  /* โรงหล่อ = foundry deliveries + production, filtered to the selected period. */
  const monthOf = (iso: string) => Number(iso.slice(5, 7))
  const inPeriod = (iso: string) => yearOfIso(iso) === year && (isYear || monthOf(iso) === month)
  const foundry = (() => {
    let salesValue = 0, pieces = 0
    let notes = 0
    for (const fd of created.foundryDeliveries) {
      if (!inPeriod(fd.date)) continue
      notes += 1
      for (const it of fd.items) {
        pieces += it.qty
        const p = priceOf(it.code)
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
      label: priceOf(code)?.name ?? code,
      pct: Math.round((q / total) * 100),
      color: FOUNDRY_COLORS[i],
    }))
    const rest = entries.slice(5).reduce((s, [, q]) => s + Math.round((q / total) * 100), 0)
    if (rest > 0) segs.push({ label: 'อื่นๆ', pct: rest, color: FOUNDRY_COLORS[5] })
    return segs
  })()

  /* Foundry sales value keyed by (พ.ศ.×100 + month) — the total of the tax invoices
     issued for โรงหล่อ each month (pre-VAT subtotal, to sit on the same basis as the
     แพล้นปูน trend line). Keyed so the rolling trend can cross year boundaries. */
  const foundrySalesByYM = (() => {
    const map = new Map<number, number>()
    for (const inv of mergedInvoices) {
      if (!isFoundryInvoice(inv)) continue
      const key = ticketYear(inv) * 100 + inv.month
      map.set(key, (map.get(key) ?? 0) + inv.subtotal)
    }
    return map
  })()

  const summary = [
    { label: 'ยอดขายรวม (ก่อน VAT)', value: baht(net) },
    { label: 'กำไรขั้นต้น (ประมาณ)', value: baht(grossProfit), invert: true },
  ]

  /* Product mix — m³ share per product from the merged tickets (period-aware). */
  const mixRaw = (() => {
    const byProd = new Map<string, number>()
    for (const tk of mergedTickets) {
      if (ticketYear(tk) !== year || !(isYear || tk.month === month)) continue
      byProd.set(tk.prod, (byProd.get(tk.prod) ?? 0) + tk.m3)
    }
    const total = [...byProd.values()].reduce((a, b) => a + b, 0) || 1
    return [...byProd.entries()].sort((a, b) => b[1] - a[1])
      .map(([code, m3]) => ({ code, label: prodShort(code), m3, pct: Math.round((m3 / total) * 100) }))
  })()
  const mix: Seg[] = mixRaw.slice(0, 5).map((p, i) => ({ label: p.label, pct: p.pct, color: MIX_COLORS[i] }))
  const restPct = mixRaw.slice(5).reduce((s, p) => s + p.pct, 0)
  if (restPct > 0) mix.push({ label: 'อื่นๆ', pct: restPct, color: MIX_COLORS[5] })

  /* Daily breakdown (merged) drives the Excel export. Empty in "ทั้งปี" mode —
     the monthly trend table replaces it. */
  const daily = isYear ? [] : (() => {
    const byDay = new Map<number, { m3: number; sales: number }>()
    for (const tk of mergedTickets.filter((x) => ticketYear(x) === year && x.month === month)) {
      const d = dayOf(tk.date)
      const e = byDay.get(d) ?? { m3: 0, sales: 0 }
      e.m3 += tk.m3; e.sales += tk.amount
      byDay.set(d, e)
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, v]) => ({ day, m3: v.m3, sales: v.sales }))
  })()

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

  /* ---------- Top 5 customers (invoiced sales) / debtors (real outstanding) ----------
     Ranked by the VAT-inclusive value of the tax invoices raised for the period —
     same billed source as ยอดขาย/the trend, so a customer appears the moment their
     sale is invoiced (even if the delivery ticket carried no price). */
  const topCustomers = (() => {
    const map = new Map<string, number>()
    for (const inv of mergedInvoices) {
      if (ticketYear(inv) !== year || !(isYear || inv.month === month)) continue
      map.set(inv.customer, (map.get(inv.customer) ?? 0) + inv.total)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, sales]) => ({ label: name, value: Math.round(sales * 100) / 100 }))
  })()
  const topDebtors = [...arList].filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((d) => ({ label: d.name, value: d.amount }))

  /* ---------- AP (เงินที่บริษัทค้างจ่ายซัพพลายเออร์) — REAL creditor outstanding ---------- */
  const creditors = [...created.suppliersAdded, ...CREDITOR_MASTER]
  const apList = creditors.filter((c) => (c.outstanding ?? 0) > 0).sort((a, b) => (b.outstanding ?? 0) - (a.outstanding ?? 0))
  const apTotal = Math.round(apList.reduce((s, c) => s + (c.outstanding ?? 0), 0) * 100) / 100
  const apCreditorCount = apList.length
  const apTop = apList.slice(0, 3).map((c) => ({ name: c.name, amount: c.outstanding ?? 0 }))
  const apRest = Math.round((apTotal - apTop.reduce((s, c) => s + c.amount, 0)) * 100) / 100

  /* File-name slug: "monthly-report-{month}-{year}" or "yearly-report-{year}".
     Avoid spaces / dots that could trip browsers' download handlers. */
  const slug = isYear
    ? `yearly-report-${year}`
    : `monthly-report-${monthName(month).replace(/\s+/g, '-')}-${year}`

  const exportPdf = (mode: 'save' | 'share' = 'save') => runPdf(mode)
  const runPdf = async (mode: 'save' | 'share') => {
    if (!reportRef.current || exporting) return
    setExporting(mode === 'share' ? 'share' : 'pdf')
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
      if (mode === 'share') {
        /* Share the same PDF via the phone's native share sheet (LINE, email, …),
           falling back to a download where sharing isn't supported. */
        await deliverPdf(pdf.output('blob'), `${reportTitle} ${periodLabel}`)
      } else {
        pdf.save(`${slug}.pdf`)
      }
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

      rows.push(['เจ้าหนี้ — บริษัทค้างจ่าย (ยอดจริงจากทะเบียนซัพพลายเออร์)'])
      rows.push(['เจ้าหนี้คงค้าง', apCreditorCount, stripBaht(baht(apTotal))])
      apTop.forEach((c) => rows.push([c.name, stripBaht(baht(c.amount))]))
      if (apRest > 0) rows.push(['เจ้าหนี้อื่นๆ', stripBaht(baht(apRest))])
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
        rows.push([`ยอดขายรายเดือน · ทั้งปี ${year}`])
        rows.push(['เดือน', 'ยอดขาย (บาท)', 'ปริมาณ (m³)', 'จำนวนใบจ่าย'])
        for (let mo = 1; mo <= 12; mo++) {
          const mt = totalsOf(mo)
          rows.push([monthName(mo), Math.round(mt.revenue), Math.round(mt.m3All * 100) / 100, mt.tickets])
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
            <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }}>
              {years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
            </Select>
            <Select value={String(month)} onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ width: 150 }}>
              <option value="all">ทั้งปี</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => exportPdf('save')} disabled={!!exporting}>
              {exporting === 'pdf' ? 'กำลังสร้าง PDF...' : 'พิมพ์ PDF'}
            </Button>
            {canSharePdf() && (
              <Button variant="secondary" onClick={() => exportPdf('share')} disabled={!!exporting}>
                {exporting === 'share' ? 'กำลังสร้าง...' : 'แชร์ PDF'}
              </Button>
            )}
            <Button variant="secondary" onClick={exportExcel} disabled={!!exporting}>
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
        <div className="grid g-2" style={{ gap: 12, marginBottom: 12, alignItems: 'stretch' }}>
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
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ยอดขายรายเดือน · 6 เดือนล่าสุด</div>
                <div className="card-meta">{trendData[0].label}–{trendData[trendData.length - 1].label} · รวม {baht(trendData.reduce((s, m) => s + m.revenue, 0))}</div>
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
              data={trendData.map((m) => ({
                label: m.label,
                /* แพล้นปูน line — plant invoices only (โรงหล่อ drawn separately as series2). */
                value: m.plantRevenue,
                highlight: !isYear && m.month === month && m.year === year,
              }))}
              /* Real foundry sales value per month (0 where none yet). */
              series2={trendData.map((m) => foundrySalesByYM.get(m.year * 100 + m.month) ?? 0)}
            />
          </div>
        </div>

        {/* ===== การเงิน-การผลิต แยกตาม SITE ===== */}
        <div className="row" style={{ gap: 8, margin: '2px 0 6px', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>การเงิน-การผลิต แยกตาม SITE · {periodLabel}</span>
          <Badge tone="neutral" pip={false} square>แพล้นปูน + โรงหล่อ</Badge>
        </div>
        <div className="grid g-2" style={{ gap: 12, marginBottom: 12 }}>
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
        <div className="grid g-2" style={{ gap: 16, marginBottom: 16 }}>
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

          {/* เจ้าหนี้ · บริษัทค้างจ่าย — ยอดจริงจากทะเบียนซัพพลายเออร์ */}
          <FinanceCard title="เจ้าหนี้ · บริษัทค้างจ่าย" tone="neutral" hint="ยอดคงค้างจริงจากทะเบียนซัพพลายเออร์ · ยอด ณ ปัจจุบัน">
            {apTop.length === 0
              ? <Row k="ไม่มียอดค้างจ่าย" v={baht(0)} />
              : apTop.map((c) => <Row key={c.name} k={c.name} v={baht(c.amount)} />)}
            {apRest > 0 && <Row k="เจ้าหนี้อื่นๆ" v={baht(apRest)} />}
            <div className="divider" />
            <Row k={`รวมคงค้าง (${apCreditorCount} ราย)`} v={baht(apTotal)} strong />
          </FinanceCard>
        </div>

        {/* Top 5 customers (sales) + top 5 debtors (outstanding) — horizontal bars. */}
        <div className="grid g-2" style={{ gap: 16, marginTop: 16 }}>
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
            {bahtShort(p.value)}
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
