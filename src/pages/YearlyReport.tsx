import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { PageHeader } from '../components/Layout'
import { Button, Badge } from '../components/ui'
import { KpiCard, Donut, Legend, type Seg } from '../components/charts'
import { FinanceCard, Row, HBarChart, LineChart } from './MonthlyReport'
import {
  monthTotals,
  productMix,
  customerAgg,
  INVOICES,
  MONTHS,
  MONTHLY_TREND,
  baht,
  qm,
} from '../data/selectors'
import { COMPANY } from '../data/real'

const MIX_COLORS = ['var(--kpc-primary, #0E0EE6)', '#8585F8', '#B4B4FB', '#D8D8FD', '#969CA6', '#C2C8D0']
const SUPPLIER_CREDIT_RATIO = 0.40
const YEAR_LABEL = 'ปี 2569'
const YEAR_SHORT = '2569'

export function YearlyReport() {
  const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  /* ---------- Aggregate every month into a single set of totals ---------- */
  const t = MONTHS.reduce(
    (acc, m) => {
      const mt = monthTotals(m.num)
      acc.revenue += mt.revenue
      acc.m3All += mt.m3All
      acc.m3Sold += mt.m3Sold
      acc.tickets += mt.tickets
      acc.credit += mt.credit
      acc.cash += mt.cash
      acc.invoices += mt.invoices
      return acc
    },
    { revenue: 0, m3All: 0, m3Sold: 0, tickets: 0, credit: 0, cash: 0, invoices: 0 }
  )

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

  /* ---------- Product mix aggregated across the whole year ---------- */
  const mixMap = new Map<string, { label: string; m3: number }>()
  for (const m of MONTHS) {
    for (const p of productMix(m.num)) {
      const ex = mixMap.get(p.code) ?? { label: p.label, m3: 0 }
      ex.m3 += p.m3
      mixMap.set(p.code, ex)
    }
  }
  const mixTotal = [...mixMap.values()].reduce((s, p) => s + p.m3, 0) || 1
  const mixRaw = [...mixMap.entries()]
    .map(([code, p]) => ({ code, label: p.label, m3: p.m3, pct: Math.round((p.m3 / mixTotal) * 100) }))
    .sort((a, b) => b.m3 - a.m3)
  const mix: Seg[] = mixRaw.slice(0, 5).map((p, i) => ({ label: p.label, pct: p.pct, color: MIX_COLORS[i] }))
  const restPct = mixRaw.slice(5).reduce((s, p) => s + p.pct, 0)
  if (restPct > 0) mix.push({ label: 'อื่นๆ', pct: restPct, color: MIX_COLORS[5] })

  /* ---------- AR ---------- */
  const yearOutstandingAmt = INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.total, 0)
  const yearOutstandingCount = INVOICES.filter((i) => i.status !== 'paid').length
  const yearOverdueAmt = INVOICES.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.total, 0)
  const yearOverdueCount = INVOICES.filter((i) => i.status === 'overdue').length
  const overdueCustomers = new Set(INVOICES.filter((i) => i.status === 'overdue').map((i) => i.customer)).size

  /* ---------- AP placeholder ---------- */
  const estPayablesCement = Math.round(estCost * SUPPLIER_CREDIT_RATIO * 0.65)
  const estPayablesFuel = Math.round(estCost * SUPPLIER_CREDIT_RATIO * 0.20)
  const estPayablesOther = Math.round(estCost * SUPPLIER_CREDIT_RATIO * 0.15)
  const estPayablesTotal = estPayablesCement + estPayablesFuel + estPayablesOther

  /* ---------- Top 5 customers / overdue debtors (whole year) ---------- */
  const aggAll = customerAgg('all')
  const topCustomers = aggAll.filter((c) => c.sales > 0).slice(0, 5)
    .map((c) => ({ label: c.name, value: Math.round(c.sales * 1.07 * 100) / 100 }))

  const overdueByCustomer = new Map<string, number>()
  for (const inv of INVOICES) {
    if (inv.status === 'overdue') {
      overdueByCustomer.set(inv.customer, (overdueByCustomer.get(inv.customer) ?? 0) + inv.total)
    }
  }
  const topDebtors = [...overdueByCustomer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ label: name, value }))

  const slug = `yearly-report-${YEAR_SHORT}`

  const exportPdf = async () => {
    if (!reportRef.current || exporting) return
    setExporting('pdf')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    try {
      const node = reportRef.current
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 1240,
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 8
      const availW = pageWidth - 2 * margin
      const availH = pageHeight - 2 * margin
      const imgAspect = canvas.width / canvas.height
      const areaAspect = availW / availH
      let drawW: number, drawH: number
      if (imgAspect > areaAspect) {
        drawW = availW
        drawH = availW / imgAspect
      } else {
        drawH = availH
        drawW = availH * imgAspect
      }
      const x = (pageWidth - drawW) / 2
      const y = margin
      pdf.addImage(imgData, 'JPEG', x, y, drawW, drawH, undefined, 'FAST')
      pdf.save(`${slug}.pdf`)
    } catch (err) {
      console.error('Yearly report PDF export failed', err)
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

      rows.push(['รายงานประจำปี', YEAR_LABEL])
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

      rows.push(['ลูกหนี้ — เงินลูกค้าค้างชำระ (สะสมทั้งปี)'])
      rows.push(['ใบกำกับค้างชำระ', yearOutstandingCount, stripBaht(baht(yearOutstandingAmt))])
      rows.push(['ใบกำกับเลยกำหนด', yearOverdueCount, stripBaht(baht(yearOverdueAmt))])
      rows.push(['จำนวนลูกค้าที่เลยกำหนด', overdueCustomers])
      rows.push([])

      rows.push(['เจ้าหนี้ — บริษัทค้างจ่าย (ประมาณการ)'])
      rows.push(['ค่าปูน/วัสดุ', stripBaht(baht(estPayablesCement))])
      rows.push(['ค่าน้ำมัน/บำรุงรักษา', stripBaht(baht(estPayablesFuel))])
      rows.push(['อื่นๆ', stripBaht(baht(estPayablesOther))])
      rows.push(['รวมประมาณ', stripBaht(baht(estPayablesTotal))])
      rows.push([])

      rows.push(['ลูกค้ายอดสั่งสูงสุด 5 อันดับ (ทั้งปี)'])
      rows.push(['อันดับ', 'ลูกค้า', 'ยอดขาย รวม VAT (บาท)'])
      topCustomers.forEach((c, i) => rows.push([i + 1, c.label, Math.round(c.value)]))
      rows.push([])

      rows.push(['ลูกหนี้ยอดค้างสูงสุด 5 อันดับ (เลยกำหนดชำระ ทั้งปี)'])
      rows.push(['อันดับ', 'ลูกค้า', 'ยอดค้างเลยกำหนด (บาท)'])
      topDebtors.forEach((c, i) => rows.push([i + 1, c.label, Math.round(c.value)]))
      rows.push([])

      rows.push(['ยอดขายรายเดือน'])
      rows.push(['เดือน', 'ยอดขาย (บาท)', 'ปริมาณ (m³)', 'จำนวนใบจ่าย'])
      for (const m of MONTHLY_TREND) {
        rows.push([m.short, Math.round(m.revenue), Math.round(m.m3 * 100) / 100, m.tickets])
      }
      rows.push([])

      rows.push(['สัดส่วนสินค้า (ทั้งปี)'])
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
      console.error('Yearly report Excel export failed', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="รายงานประจำปี"
        sub={`Yearly Report · ${YEAR_LABEL}`}
        actions={
          <>
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
            <div className="rh-tt">รายงานประจำปี</div>
            <div className="rh-meta">{YEAR_LABEL}</div>
            <div className="rh-date">ออก ณ {new Date().toLocaleDateString('th-TH')}</div>
          </div>
        </div>

        <div className="grid g-4" style={{ marginBottom: 16 }}>
          {summary.map((s) => (
            <KpiCard key={s.label} label={s.label} value={s.value} invert={s.invert} />
          ))}
        </div>

        <div className="grid g-4" style={{ marginBottom: 16 }}>
          <KpiCard label="ปริมาณผลิต · Volume" value={qm(Math.round(t.m3All))} unit="m³" note={`ทั้งปี · ${MONTHS.length} เดือน`} />
          <KpiCard
            label="ค้างชำระสะสม · Outstanding"
            value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(yearOutstandingAmt)}</span>}
            note={`${yearOutstandingCount} ใบ · เกินกำหนด ${yearOverdueCount}`}
          />
          <KpiCard
            label="เลยกำหนดชำระ · Overdue"
            value={<span style={{ color: 'var(--kpc-danger-ink, #b91c1c)' }}>{baht(yearOverdueAmt)}</span>}
            note={`${yearOverdueCount} ใบ · ${overdueCustomers} ลูกค้า`}
          />
          <KpiCard label="เฉลี่ยต่อคิว · Avg / m³" value={baht(t.m3Sold ? Math.round(net / t.m3Sold) : 0)} note="ราคาขายเฉลี่ยทั้งปี" />
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 16 }}>
          <div className="card row" style={{ gap: 20 }}>
            <Donut segments={mix} />
            <div className="stack" style={{ gap: 11, flex: 1 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สัดส่วนสินค้า · ทั้งปี</div>
                <div className="card-meta">{YEAR_LABEL} · {qm(Math.round(t.m3All))} m³</div>
              </div>
              <Legend segments={mix} />
            </div>
          </div>

          <div className="card stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ยอดขายรายเดือน · {YEAR_SHORT}</div>
                <div className="card-meta">รวม {baht(MONTHLY_TREND.reduce((s, m) => s + m.revenue, 0))}</div>
              </div>
              <Badge tone="info" pip={false} square>{MONTHLY_TREND.length} เดือน</Badge>
            </div>
            <LineChart
              data={MONTHLY_TREND.map((m) => ({
                label: m.short.toUpperCase().replace(/\./g, ''),
                value: m.revenue,
              }))}
            />
          </div>
        </div>

        <div className="row" style={{ gap: 8, marginBottom: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>สรุปการเงิน · {YEAR_LABEL}</span>
          <div className="row" style={{ gap: 6 }}>
            <Badge tone="warning" square pip={false}>เครดิต {net ? Math.round((t.credit / net) * 100) : 0}%</Badge>
            {yearOverdueCount > 0 && <Badge tone="danger" square pip={false}>เกินกำหนด {yearOverdueCount} ใบ</Badge>}
          </div>
        </div>

        <div className="grid g-3" style={{ gap: 16 }}>
          <FinanceCard title="รายได้ · ต้นทุน · กำไร" tone="info">
            <Row k="ยอดขายสุทธิ" v={baht(net)} />
            <Row k="ขายเงินสด/โอน" v={baht(t.cash)} />
            <Row k="ขายเครดิต" v={baht(t.credit)} />
            <div className="divider" />
            <Row k="ต้นทุนประมาณ (62%)" v={baht(estCost)} />
            <Row k="กำไรขั้นต้น" v={baht(grossProfit)} strong />
          </FinanceCard>

          <FinanceCard title="ลูกหนี้ · เงินลูกค้าค้าง" tone="warning">
            <Row k="ค้างชำระสะสม" v={baht(yearOutstandingAmt)} hint={`${yearOutstandingCount} ใบ`} />
            <Row k="เลยกำหนดสะสม" v={baht(yearOverdueAmt)} hint={`${yearOverdueCount} ใบ`} danger />
            <div className="divider" />
            <Row k="ลูกค้าเลยกำหนด" v={`${overdueCustomers} ราย`} />
          </FinanceCard>

          <FinanceCard title="เจ้าหนี้ · บริษัทค้างจ่าย" tone="neutral" hint="ประมาณการจาก 40% ของต้นทุน (รอระบบเจ้าหนี้)">
            <Row k="ค่าปูน/วัสดุ" v={baht(estPayablesCement)} />
            <Row k="ค่าน้ำมัน/บำรุง" v={baht(estPayablesFuel)} />
            <Row k="อื่นๆ (โสหุ้ย)" v={baht(estPayablesOther)} />
            <div className="divider" />
            <Row k="รวมประมาณ" v={baht(estPayablesTotal)} strong />
          </FinanceCard>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <div className="card stack" style={{ gap: 10, padding: 16, borderTop: '3px solid #16a34a' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', letterSpacing: 0.1 }}>
                ลูกค้ายอดสั่งสูงสุด · Top 5
              </div>
              <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 3 }}>
                {YEAR_LABEL} · เรียงตามยอดขาย (รวม VAT 7%)
              </div>
            </div>
            <HBarChart data={topCustomers} color="#16a34a" emptyText="ยังไม่มียอดขายในปีนี้" />
          </div>

          <div className="card stack" style={{ gap: 10, padding: 16, borderTop: '3px solid #dc2626' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', letterSpacing: 0.1 }}>
                ลูกหนี้ยอดค้างสูงสุด · Top 5
              </div>
              <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 3 }}>
                {YEAR_LABEL} · เฉพาะใบกำกับที่เลยกำหนดชำระ (รวม VAT)
              </div>
            </div>
            <HBarChart data={topDebtors} color="#dc2626" emptyText="ไม่มีลูกหนี้เลยกำหนดในปีนี้" />
          </div>
        </div>
      </div>
    </>
  )
}
