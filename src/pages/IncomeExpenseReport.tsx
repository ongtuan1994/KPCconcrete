import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Pill, Field, Select } from '../components/ui'
import { DocModal } from '../components/documents/DocModal'
import { INVOICES, ticketYear, monthName, baht } from '../data/selectors'
import { PRODUCT_MAP } from '../data/real'
import { useCreatedDocs, useProducts, costCenterLabel } from '../data/createdDocs'

const MONTH_TH = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const _now = new Date()
const CUR_MONTH = _now.getMonth() + 1
const CUR_YEAR_BE = _now.getFullYear() + 543
const r2 = (n: number) => Math.round(n * 100) / 100
/** Share of a sub-item within its section total, e.g. "42.5%" (— when total is 0). */
const pctStr = (amount: number, total: number) => (total > 0 ? `${(amount / total * 100).toFixed(1)}%` : '—')

/** หมวด 2 (ค่าวัตถุดิบและอุปกรณ์ในการผลิต) = the built-in ค่าซื้อวัตถุดิบ category. */
const RAW_MATERIAL_CAT = 'ค่าซื้อวัตถุดิบ'
/** หมวด 3 lists every cost center grouped under this cost center (see ประเภทบัญชี page). */
const SGA_GROUP = 'ค่าใช้จ่ายในการขายและบริหาร'

type SiteKey = 'plant' | 'foundry'
const SITE_TH: Record<SiteKey, string> = { plant: 'แพล้นปูน', foundry: 'โรงหล่อ' }

/** ประมาณการรายได้และค่าใช้จ่าย — a simple per-SITE P&L estimate for a period:
    revenue (cash / credit) − production raw materials − selling & admin expenses. */
export function IncomeExpenseReport() {
  const created = useCreatedDocs()
  const products = useProducts()
  const labels = created.costCenterLabels
  const parents = created.costCenterParents
  const priceOf = (code: string) => products.find((p) => p.code === code) ?? PRODUCT_MAP[code]
  const isFoundryInvoice = (inv: { lines: { code: string }[] }) => inv.lines.some((l) => priceOf(l.code)?.site === 'foundry')

  const [site, setSite] = useState<SiteKey>('plant')
  const [pYear, setPYear] = useState<number>(CUR_YEAR_BE)
  const [pMonth, setPMonth] = useState<number | 'all'>(CUR_MONTH)
  const [showPrint, setShowPrint] = useState(false)

  const mergedInvoices = useMemo(() => [...created.invoices, ...INVOICES], [created.invoices])

  const years = useMemo(() => {
    const s = new Set<number>([CUR_YEAR_BE, pYear])
    for (const inv of mergedInvoices) s.add(ticketYear(inv))
    for (const e of created.expenseRecords) { const y = Number(e.date.slice(0, 4)); if (y) s.add(y + 543) }
    return [...s].sort((a, b) => b - a)
  }, [mergedInvoices, created.expenseRecords, pYear])

  const expInPeriod = (iso: string) => !!iso && Number(iso.slice(0, 4)) + 543 === pYear && (pMonth === 'all' || Number(iso.slice(5, 7)) === pMonth)

  /* 1) รายได้จากการขายสินค้า — invoices for this SITE/period, VAT-inclusive total,
     split cash (เงินสด/โอน) vs credit (เครดิต/เช็ค). */
  const revenue = useMemo(() => {
    let cash = 0, credit = 0
    for (const inv of mergedInvoices) {
      const invSite: SiteKey = isFoundryInvoice(inv) ? 'foundry' : 'plant'
      if (invSite !== site) continue
      if (ticketYear(inv) !== pYear || (pMonth !== 'all' && inv.month !== pMonth)) continue
      const isCredit = inv.pay === 'เครดิต' || inv.pay === 'เช็ค'
      if (isCredit) credit += inv.total; else cash += inv.total
    }
    return { cash: r2(cash), credit: r2(credit), total: r2(cash + credit) }
  }, [mergedInvoices, site, pYear, pMonth, products])

  /* 2) ค่าวัตถุดิบและอุปกรณ์ในการผลิต — บันทึกรายจ่าย หมวด ค่าซื้อวัตถุดิบ (รวม VAT). */
  const rawMaterial = useMemo(() => {
    let sum = 0
    for (const e of created.expenseRecords) {
      if (e.category !== RAW_MATERIAL_CAT || e.site !== SITE_TH[site] || !expInPeriod(e.date)) continue
      sum += e.amount
    }
    return r2(sum)
  }, [created.expenseRecords, site, pYear, pMonth])

  /* 3) ค่าใช้จ่ายในการขายและบริหาร — one line per cost center grouped under SGA_GROUP. */
  const sga = useMemo(() => {
    const underGroup = (name: string) => {
      let cur: string | undefined = parents[name]
      const seen = new Set<string>()
      while (cur && !seen.has(cur)) { if (cur === SGA_GROUP) return true; seen.add(cur); cur = parents[cur] }
      return false
    }
    /* Grouped centers all carry a parent link, so parents' keys cover them. */
    const centers = [...new Set(Object.keys(parents))].filter((n) => n !== RAW_MATERIAL_CAT && underGroup(n))
    const lines = centers.map((name) => {
      let sum = 0
      for (const e of created.expenseRecords) {
        if (e.category !== name || e.site !== SITE_TH[site] || !expInPeriod(e.date)) continue
        sum += e.amount
      }
      return { name, label: costCenterLabel(name, labels), amount: r2(sum) }
    })
    lines.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) }
  }, [created.expenseRecords, parents, labels, site, pYear, pMonth])

  const net = r2(revenue.total - rawMaterial - sga.total)
  const periodLabel = pMonth === 'all' ? `ทั้งปี ${pYear}` : `${monthName(pMonth)} ${pYear}`
  /* Printed header — "ประจำเดือน <เดือน> ปี <ปี พ.ศ.>" (or "ประจำปี <ปี>" for ทั้งปี). */
  const periodHeading = pMonth === 'all' ? `ประจำปี ${pYear}` : `ประจำเดือน ${monthName(pMonth)} ปี ${pYear}`

  return (
    <>
      <PageHeader
        title="ประมาณการรายได้และค่าใช้จ่าย"
        sub={`Income / Expense Estimate · ${SITE_TH[site]} · ${periodLabel}`}
        actions={<Button variant="secondary" onClick={() => setShowPrint(true)}>พิมพ์รายงาน</Button>}
      />

      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <div className="pills">
          {(['plant', 'foundry'] as SiteKey[]).map((s) => (
            <Pill key={s} active={s === site} onClick={() => setSite(s)}>{SITE_TH[s]}</Pill>
          ))}
        </div>
        <Field label="ปี (พ.ศ.)" style={{ width: 120 }}>
          <Select value={String(pYear)} onChange={(e) => setPYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="เดือน" style={{ width: 150 }}>
          <Select value={String(pMonth)} onChange={(e) => setPMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">ทั้งปี</option>
            {MONTH_TH.map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
          </Select>
        </Field>
      </div>

      <div className="card" style={{ maxWidth: 720, padding: '20px 24px' }}>
        {/* 1) รายได้ */}
        <Section title="1. รายได้จากการขายสินค้า">
          <Line label="ลูกค้าเงินสด" value={revenue.cash} pct={pctStr(revenue.cash, revenue.total)} />
          <Line label="ลูกค้าเครดิต" value={revenue.credit} pct={pctStr(revenue.credit, revenue.total)} />
          <Subtotal label="รวมรายได้" value={revenue.total} />
        </Section>

        {/* 2) ค่าใช้จ่ายดำเนินงาน (ต้นทุนการผลิต) */}
        <Section title="2. ค่าใช้จ่ายที่เกิดขึ้นในการดำเนินงาน">
          <Line label={costCenterLabel(RAW_MATERIAL_CAT, labels)} value={rawMaterial} />
        </Section>

        {/* 3) ค่าใช้จ่ายขายและบริหาร */}
        <Section title="3. ค่าใช้จ่ายในการขายและบริหาร">
          {sga.lines.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--kpc-text-faint)', padding: '4px 0' }}>
              ยังไม่มี cost center ในกลุ่ม “{SGA_GROUP}” — สร้างกลุ่มนี้แล้วจัด cost center เข้ากลุ่มได้ที่หน้าประเภทบัญชี cost center
            </div>
          ) : (
            <>
              {sga.lines.map((l) => <Line key={l.name} label={l.label} value={l.amount} pct={pctStr(l.amount, sga.total)} />)}
              <Subtotal label="รวมค่าใช้จ่ายขายและบริหาร" value={sga.total} />
            </>
          )}
        </Section>

        {/* Net */}
        <div style={{ borderTop: '2px solid var(--kpc-neutral-300)', marginTop: 16, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <div>
            <strong style={{ fontSize: 15 }}>ประมาณการกำไร/ขาดทุนสุทธิในการดำเนินงาน</strong>
            <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 2 }}>= รายได้ − ค่าวัตถุดิบการผลิต − ค่าใช้จ่ายขายและบริหาร</div>
          </div>
          <strong className="mono" style={{ fontSize: 18, color: net >= 0 ? '#15803d' : '#b91c1c' }}>{baht(net)}</strong>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 12, maxWidth: 720 }}>
        * รายได้ = ยอดใบกำกับภาษี (รวม VAT) ของ{SITE_TH[site]} · เงินสด = เงินสด/โอน · เครดิต = เครดิต/เช็ค · ค่าใช้จ่ายดึงจากบันทึกรายจ่าย (รวม VAT) ตาม SITE และช่วงเวลาที่เลือก
      </p>

      <DocModal
        open={showPrint}
        title="ประมาณการรายได้และค่าใช้จ่าย"
        onClose={() => setShowPrint(false)}
        maxWidth={780}
        shareName={`ประมาณการรายได้-ค่าใช้จ่าย ${SITE_TH[site]} ${periodHeading}`}
      >
        <div style={{ background: '#fff', color: '#14171b', padding: '15mm 16mm', fontSize: 13.5, lineHeight: 1.55 }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <img src="/logo.jpg" alt="กิจไพศาลคอนกรีต" style={{ width: 74, height: 'auto', objectFit: 'contain', display: 'inline-block', marginBottom: 8 }} />
            <div style={{ fontSize: 19, fontWeight: 700 }}>ประมาณการรายได้และค่าใช้จ่าย</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>บจก. กิจไพศาลคอนกรีต ( {SITE_TH[site]} )</div>
            <div style={{ fontSize: 14, marginTop: 3 }}>{periodHeading}</div>
          </div>

          <DocSection n={1} title="รายได้จากการขายสินค้า" />
          <DocRow label="ลูกค้าเงินสด" value={revenue.cash} pct={pctStr(revenue.cash, revenue.total)} indent />
          <DocRow label="ลูกค้าเครดิต" value={revenue.credit} pct={pctStr(revenue.credit, revenue.total)} indent />
          <DocRow label="รวมรายได้" value={revenue.total} bold rule />

          <DocSection n={2} title="ค่าใช้จ่ายที่เกิดขึ้นในการดำเนินงาน" />
          <DocRow label={costCenterLabel(RAW_MATERIAL_CAT, labels)} value={rawMaterial} indent />

          <DocSection n={3} title="ค่าใช้จ่ายในการขายและบริหาร" />
          {sga.lines.length === 0
            ? <div style={{ paddingLeft: 24, color: '#666', fontSize: 13 }}>— ไม่มีรายการ —</div>
            : sga.lines.map((l) => <DocRow key={l.name} label={l.label} value={l.amount} pct={pctStr(l.amount, sga.total)} indent />)}
          {sga.lines.length > 0 && <DocRow label="รวมค่าใช้จ่ายขายและบริหาร" value={sga.total} bold rule />}

          <div style={{ borderTop: '2px solid #333', marginTop: 16, paddingTop: 12, display: 'flex', justifyContent: 'space-between', gap: 16, fontWeight: 700, fontSize: 15 }}>
            <span>ประมาณการกำไร/ขาดทุนสุทธิในการดำเนินงาน</span>
            <span className="mono">{baht(net)}</span>
          </div>
        </div>
      </DocModal>
    </>
  )
}

function DocSection({ n, title }: { n: number; title: string }) {
  return <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 16, marginBottom: 6 }}>{n}. {title}</div>
}
function DocRow({ label, value, pct, indent, bold, rule }: { label: string; value: number; pct?: string; indent?: boolean; bold?: boolean; rule?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 16, padding: '4px 0',
      paddingLeft: indent ? 24 : 0, fontWeight: bold ? 700 : 400,
      borderTop: rule ? '1px solid #999' : undefined, marginTop: rule ? 4 : 0,
    }}>
      <span>{label}</span>
      <span style={{ display: 'inline-flex', gap: 14, alignItems: 'baseline' }}>
        {pct && <span style={{ fontSize: 12, color: '#666', minWidth: 48, textAlign: 'right' }}>{pct}</span>}
        <span className="mono" style={{ minWidth: 120, textAlign: 'right' }}>{baht(value)}</span>
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--kpc-text-strong)', marginBottom: 8 }}>{title}</div>
      <div style={{ paddingLeft: 12 }}>{children}</div>
    </div>
  )
}
function Line({ label, value, pct }: { label: string; value: number; pct?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--kpc-text-muted)' }}>{label}</span>
      <span style={{ display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
        {pct && <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)', minWidth: 52, textAlign: 'right' }}>{pct}</span>}
        <span className="mono" style={{ color: 'var(--kpc-text-strong)', minWidth: 116, textAlign: 'right' }}>{baht(value)}</span>
      </span>
    </div>
  )
}
function Subtotal({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0 2px', marginTop: 4, borderTop: '1px solid var(--kpc-border)', fontSize: 14, fontWeight: 700 }}>
      <span>{label}</span>
      <span className="mono">{baht(value)}</span>
    </div>
  )
}
