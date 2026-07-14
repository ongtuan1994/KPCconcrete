import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select, Pill, pickerMonths } from '../ui'
import { PRODUCTS, CUSTOMER_MASTER, DELIVERY_TICKETS, TRANSPORT_FEES, TRANSPORT_FULL_M3, SELF_PICKUP_DISCOUNT_PER_M3, type DeliveryTicket, type Product } from '../../data/real'
import { INVOICES, baht, cleanProductName, customerHasLegalName, LATEST_MONTH, type Invoice, type InvoiceLine, type InvStatus } from '../../data/selectors'
import { addInvoice, useCreatedDocs, useProducts } from '../../data/createdDocs'

/** `selfPickup` marks a line pulled from a ลูกค้ามารับเอง ticket: it carries the
    per-คิว pickup discount and is excluded from the under-load transport
    surcharge (no company delivery). */
interface LineDraft { code: string; qty: string; price: string; discount: string; selfPickup?: boolean }

const emptyLine = (): LineDraft => ({ code: PRODUCTS[0]?.code ?? '', qty: '', price: '', discount: '' })

function pad2(n: number) { return String(n).padStart(2, '0') }
function pad4(n: number) { return String(n).padStart(4, '0') }

function nextInvoiceNo(month: number, day: number, existing: Invoice[]) {
  const prefix = `IV69${pad2(month)}${pad2(day)}-`
  let max = 0
  for (const inv of existing) {
    if (inv.no.startsWith(prefix)) {
      const n = parseInt(inv.no.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${pad4(max + 1)}`
}

function plus30(date: string) {
  const [d, m, y] = date.split('/').map((x) => parseInt(x, 10))
  let nd = d + 30, nm = m, ny = y
  if (nd > 30) { nd -= 30; nm += 1 }
  if (nm > 12) { nm -= 12; ny += 1 }
  return `${pad2(nd)}/${pad2(nm)}/${ny}`
}

/** Match a single search token against a ticket: full dtNo, trailing serial, or ref. */
function ticketMatches(t: DeliveryTicket, token: string) {
  const tk = token.trim().toUpperCase()
  if (!tk) return false
  if (t.dtNo.toUpperCase() === tk) return true
  if ((t.ref ?? '').toUpperCase() === tk) return true
  /* allow numeric tail match: typing "11739" matches "DT26010311739". */
  if (/^\d+$/.test(tk) && t.dtNo.endsWith(tk)) return true
  return false
}

export function NewInvoiceForm({
  open,
  onClose,
  onIssued,
  createdInvoices,
  initialRefs,
  initialFdRefs,
}: {
  open: boolean
  onClose: () => void
  onIssued: (inv: Invoice) => void
  createdInvoices: Invoice[]
  /** When set, pre-fill the refs field and auto-pull ticket data on open. */
  initialRefs?: string
  /** When set, pre-fill the foundry-delivery refs and auto-pull on open. */
  initialFdRefs?: string
}) {
  const created = useCreatedDocs()
  /* Merged product list (seed + user-added), so foundry products added on the
     ราคาสินค้าโรงหล่อ page resolve here — both in the picker and when pulling from
     a ใบส่งสินค้าโรงหล่อ. */
  const products = useProducts()
  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.code, p])) as Record<string, Product>, [products])
  const [customer, setCustomer] = useState('')
  /* Default งวด to the latest selectable month (current month while it's 2569),
     matching the period picker — so a doc created today lands in this month. */
  const defaultMonth = pickerMonths().slice(-1)[0]?.num ?? LATEST_MONTH
  const [month, setMonth] = useState<number>(defaultMonth)
  const [day, setDay] = useState<string>('')
  const [pay, setPay] = useState<string>('เงินสด')
  /* สำนักงานใหญ่ / สาขา — for นิติบุคคล customers' tax invoices. */
  const [taxBranch, setTaxBranch] = useState<'head' | 'branch'>('head')
  const [branchCode, setBranchCode] = useState<string>('')
  const [refs, setRefs] = useState<string>('')
  /* Foundry-delivery-note numbers (รหัสใบส่งสินค้าโรงหล่อ) — a second pull source. */
  const [fdRefs, setFdRefs] = useState<string>('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [err, setErr] = useState<string>('')
  const [pullInfo, setPullInfo] = useState<string>('')
  /* Invoice number — auto-generated but editable. `noDirty` stops the auto-fill
     once the user types their own (real) number. */
  const [no, setNo] = useState<string>('')
  const [noDirty, setNoDirty] = useState(false)
  /* Show the สำนักงานใหญ่/สาขา control only for นิติบุคคล (customers with a legal name). */
  const isCompany = customerHasLegalName(customer)

  const all = useMemo(() => [...createdInvoices, ...INVOICES], [createdInvoices])
  const allTickets = useMemo(() => [...created.tickets, ...DELIVERY_TICKETS], [created.tickets])

  /* Keep the auto number in sync with งวด/วันที่ until the user edits it. */
  useEffect(() => {
    if (noDirty) return
    const dnum = parseInt(day, 10)
    setNo(dnum >= 1 && dnum <= 31 ? nextInvoiceNo(month, dnum, all) : '')
  }, [month, day, all, noDirty])

  /* Prices entered (and in PRODUCTS / TRANSPORT_FEES) are VAT-inclusive.
     For the printed Thai tax invoice we still need line items in pre-VAT form
     so VAT can be broken out at the bottom — so we divide each line by 1.07
     before pushing it into the Invoice. The form summary shows both:
     ฐานภาษี (subtotal) + VAT 7% + total (which equals what the user typed). */
  const computed = useMemo(() => {
    const ls: InvoiceLine[] = []
    let totalInclVat = 0
    let concreteQty = 0
    for (const ld of lines) {
      const p = productMap[ld.code]
      if (!p) continue
      const qty = Number(ld.qty)
      const priceInclVat = Number(ld.price)
      const discountInclVat = Math.max(0, Number(ld.discount) || 0)
      if (!qty || !priceInclVat) continue
      const netUnitInclVat = priceInclVat - discountInclVat
      const amountInclVat = Math.round(qty * netUnitInclVat * 100) / 100
      const pricePreVat = Math.round((priceInclVat / 1.07) * 100) / 100
      const discountPreVat = Math.round((discountInclVat / 1.07) * 100) / 100
      const amountPreVat = Math.round((amountInclVat / 1.07) * 100) / 100
      ls.push({
        code: p.code, name: cleanProductName(p.name), unit: p.unit, qty,
        price: pricePreVat,
        amount: amountPreVat,
        ...(discountPreVat > 0 ? { discount: discountPreVat } : {}),
      })
      totalInclVat += amountInclVat
      /* Only concrete the company actually delivers counts toward the under-load
         transport surcharge — exclude foundry precast and ลูกค้ามารับเอง lines
         (self-pickup ⇒ no delivery ⇒ no transport charge). */
      if (p.site !== 'foundry' && !ld.selfPickup) concreteQty += qty
    }

    /* Auto-add the under-load transport surcharge when total qty < 3 คิว.
       Look up the row in the current (possibly adjusted) fee schedule by
       rounding the m³ to the nearest 0.25 step. The schedule stores the
       VAT-inclusive total per row; convert to pre-VAT for the invoice line. */
    const liveFees = created.transportAdjustments[0]?.fees ?? TRANSPORT_FEES
    let surcharge: { shortfall: number; preVat: number; totalWithVat: number } | null = null
    if (concreteQty > 0 && concreteQty < TRANSPORT_FULL_M3) {
      const steppedM3 = Math.round(concreteQty * 4) / 4
      const row = liveFees.find((f) => Math.abs(f.m3 - steppedM3) < 0.01)
      if (row && row.totalWithVat > 0) {
        const preVat = Math.round((row.totalWithVat / 1.07) * 100) / 100
        surcharge = {
          shortfall: Math.round((TRANSPORT_FULL_M3 - steppedM3) * 100) / 100,
          preVat,
          totalWithVat: row.totalWithVat,
        }
      }
    }
    const transportLine: InvoiceLine | null = surcharge
      ? {
          code: 'TRANSPORT',
          name: `ค่าขนส่งไม่เต็มเที่ยว (ขาด ${surcharge.shortfall.toFixed(2)} คิว จาก ${TRANSPORT_FULL_M3} คิว)`,
          unit: 'ครั้ง',
          qty: 1,
          price: surcharge.preVat,
          amount: surcharge.preVat,
        }
      : null
    if (transportLine && surcharge) {
      ls.push(transportLine)
      totalInclVat += surcharge.totalWithVat
    }

    const total = Math.round(totalInclVat * 100) / 100
    const subtotal = Math.round((total / 1.07) * 100) / 100
    const vat = Math.round((total - subtotal) * 100) / 100
    /* Sum of per-unit discounts × qty across all lines (VAT-inclusive) — for the form summary. */
    const discountInclVat = lines.reduce((s, ld) => {
      const q = Number(ld.qty) || 0
      const d = Math.max(0, Number(ld.discount) || 0)
      return s + q * d
    }, 0)
    return { ls, subtotal, vat, total, transportLine, concreteQty, discountInclVat: Math.round(discountInclVat * 100) / 100 }
  }, [lines])

  const reset = () => {
    setCustomer(''); setMonth(defaultMonth); setDay(''); setPay('เงินสด')
    setTaxBranch('head'); setBranchCode('')
    setRefs(''); setFdRefs(''); setLines([emptyLine()]); setErr(''); setPullInfo('')
    setNo(''); setNoDirty(false)
  }

  /* When opened with initialRefs (from the delivery-tickets page), seed and auto-pull. */
  const lastInitialRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!open) { lastInitialRef.current = undefined; return }
    if (initialRefs && initialRefs !== lastInitialRef.current) {
      lastInitialRef.current = initialRefs
      setRefs(initialRefs)
      pullFromTickets(initialRefs)
    }
  }, [open, initialRefs]) // eslint-disable-line react-hooks/exhaustive-deps

  /* When opened from a foundry delivery note, seed รหัสใบส่งสินค้าโรงหล่อ and auto-pull. */
  const lastInitialFd = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!open) { lastInitialFd.current = undefined; return }
    if (initialFdRefs && initialFdRefs !== lastInitialFd.current) {
      lastInitialFd.current = initialFdRefs
      setFdRefs(initialFdRefs)
      pullFromFoundry(initialFdRefs)
    }
  }, [open, initialFdRefs]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Look up tickets by the refs input, then prefill customer / month / day / pay
      and group volumes by product into invoice lines. */
  const pullFromTickets = (override?: string) => {
    setErr(''); setPullInfo('')
    const source = override ?? refs
    const tokens = source.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)
    if (tokens.length === 0) {
      setErr('กรุณาใส่รหัสใบจ่ายคอนกรีต (เช่น DT26010311739 หรือ 11739) แล้วกดดึงข้อมูล')
      return
    }
    const matched: DeliveryTicket[] = []
    const missed: string[] = []
    for (const tk of tokens) {
      const t = allTickets.find((x) => ticketMatches(x, tk))
      if (t) matched.push(t)
      else missed.push(tk)
    }
    if (matched.length === 0) {
      setErr(`ไม่พบใบจ่ายตามที่ระบุ: ${missed.join(', ')}`)
      return
    }

    const customers = [...new Set(matched.map((t) => t.customer))]
    if (customers.length > 1) {
      setErr(`ใบจ่ายมีลูกค้าหลายราย (${customers.join(' / ')}) — กรุณาออกใบกำกับแยกตามลูกค้า`)
      return
    }

    /* Use the first ticket's date/month/pay; group lines by product+price. */
    const first = matched[0]
    const [dStr, mStr] = first.date.split('/')
    setCustomer(first.customer)
    setMonth(Number(mStr) || first.month)
    setDay(String(Number(dStr) || ''))
    if (first.pay) setPay(first.pay)

    /* Build invoice lines from the matched tickets. Price-per-unit precedence:
       1) the ticket's own price (when set, e.g. seed tickets)
       2) the PRODUCTS master price (incl. VAT) for that product code
       3) blank — falls through if the product code is unknown */
    const byKey = new Map<string, LineDraft>()
    let priceFilledFromMaster = 0
    let selfPickupLines = 0
    for (const t of matched) {
      const masterPrice = productMap[t.prod]?.price || 0
      const effPrice = t.price || masterPrice
      const isSelfPickup = t.pickup === 'รับเอง'
      /* Self-pickup lines get the per-คิว pickup discount and must not merge with
         delivered lines of the same product/price — key on pickup too. */
      const key = `${t.prod}__${effPrice}__${isSelfPickup ? 'self' : 'deliv'}`
      const existing = byKey.get(key)
      if (existing) {
        existing.qty = String((Number(existing.qty) || 0) + t.m3)
      } else {
        if (!t.price && masterPrice) priceFilledFromMaster += 1
        if (isSelfPickup) selfPickupLines += 1
        byKey.set(key, {
          code: t.prod,
          qty: String(t.m3),
          price: effPrice ? String(effPrice) : '',
          discount: isSelfPickup ? String(SELF_PICKUP_DISCOUNT_PER_M3) : '',
          ...(isSelfPickup ? { selfPickup: true } : {}),
        })
      }
    }
    setLines([...byKey.values()])

    const parts: string[] = [`ดึงข้อมูลจาก ${matched.length} ใบจ่าย`]
    if (priceFilledFromMaster > 0) parts.push(`เติมราคาจากตารางสินค้า ${priceFilledFromMaster} รายการ`)
    if (selfPickupLines > 0) parts.push(`หักส่วนลดลูกค้ามารับเอง ${SELF_PICKUP_DISCOUNT_PER_M3} บาท/คิว ${selfPickupLines} รายการ`)
    if (missed.length) parts.push(`ไม่พบ: ${missed.join(', ')}`)
    setPullInfo(parts.join(' · '))
  }

  /** Look up foundry delivery notes by their numbers, then prefill customer /
      month / day and build invoice lines from the foundry items (price filled
      from the product master, since the delivery note itself carries none). */
  const pullFromFoundry = (override?: string) => {
    setErr(''); setPullInfo('')
    const source = override ?? fdRefs
    const tokens = source.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)
    if (tokens.length === 0) {
      setErr('กรุณาใส่รหัสใบส่งสินค้าโรงหล่อ แล้วกดดึงข้อมูล')
      return
    }
    const matched = []
    const missed: string[] = []
    for (const tk of tokens) {
      const f = created.foundryDeliveries.find((x) => x.fdNo.toUpperCase() === tk.toUpperCase())
      if (f) matched.push(f); else missed.push(tk)
    }
    if (matched.length === 0) {
      setErr(`ไม่พบใบส่งสินค้าโรงหล่อตามที่ระบุ: ${missed.join(', ')}`)
      return
    }
    const customers = [...new Set(matched.map((f) => f.customer))]
    if (customers.length > 1) {
      setErr(`ใบส่งสินค้ามีลูกค้าหลายราย (${customers.join(' / ')}) — กรุณาออกใบกำกับแยกตามลูกค้า`)
      return
    }

    const first = matched[0]
    const [, mStr, dStr] = first.date.split('-')
    setCustomer(first.customer)
    setMonth(Number(mStr) || defaultMonth)
    setDay(String(Number(dStr) || ''))

    /* Group lines by product code + master price (incl VAT). */
    const byKey = new Map<string, LineDraft>()
    let priceFilledFromMaster = 0
    for (const f of matched) {
      for (const it of f.items) {
        const prod = productMap[it.code]
        const masterPrice = (prod?.pickupPrices && it.pickup)
          ? prod.pickupPrices[it.pickup]
          : (prod?.price || 0)
        const key = `${it.code}__${masterPrice}`
        const existing = byKey.get(key)
        if (existing) {
          existing.qty = String((Number(existing.qty) || 0) + it.qty)
        } else {
          if (masterPrice) priceFilledFromMaster += 1
          byKey.set(key, { code: it.code, qty: String(it.qty), price: masterPrice ? String(masterPrice) : '', discount: '' })
        }
      }
    }
    setLines([...byKey.values()])

    const parts: string[] = [`ดึงข้อมูลจาก ${matched.length} ใบส่งสินค้าโรงหล่อ`]
    if (priceFilledFromMaster > 0) parts.push(`เติมราคาจากตารางสินค้า ${priceFilledFromMaster} รายการ`)
    if (missed.length) parts.push(`ไม่พบ: ${missed.join(', ')}`)
    setPullInfo(parts.join(' · '))
  }

  const submit = () => {
    setErr('')
    if (!customer.trim()) return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    const dnum = parseInt(day, 10)
    if (!dnum || dnum < 1 || dnum > 31) return setErr('กรุณาระบุวันที่ (1–31)')
    if (computed.ls.length === 0) return setErr('กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ (จำนวน + ราคา)')

    const invNo = no.trim()
    if (!invNo) return setErr('กรุณากรอกเลขที่ใบกำกับ')
    if (all.some((i) => i.no === invNo)) return setErr(`เลขที่ใบกำกับ ${invNo} ถูกใช้แล้ว`)
    if (isCompany && taxBranch === 'branch' && !branchCode.trim()) return setErr('กรุณาระบุเลขที่สาขา')

    const date = `${pad2(dnum)}/${pad2(month)}/69`
    const dueDate = plus30(date)
    const paid = pay === 'เงินสด' || pay === 'โอน'
    const status: InvStatus = paid ? 'paid' : month < LATEST_MONTH ? 'overdue' : 'pending'
    const inv: Invoice = {
      no: invNo,
      month, date, dueDate, customer: customer.trim(), pay,
      taxBranch: isCompany ? taxBranch : undefined,
      branchCode: isCompany && taxBranch === 'branch' ? branchCode.trim() : undefined,
      lines: computed.ls,
      refs: [...refs.split(/[,\s]+/), ...fdRefs.split(/[,\s]+/)].map((x) => x.trim()).filter(Boolean),
      subtotal: computed.subtotal, vat: computed.vat, total: computed.total,
      status,
    }
    addInvoice(inv)
    onIssued(inv)
    reset()
  }

  const close = () => { reset(); onClose() }

  return (
    <Modal
      open={open}
      title="ออกใบกำกับภาษีใหม่"
      onClose={close}
      maxWidth={760}
      footer={
        <>
          <Button variant="secondary" onClick={close}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>ออกใบกำกับ</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div style={{ background: 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <Field label="รหัสใบจ่ายคอนกรีต (คั่นด้วย , หรือเว้นวรรค)" hint="ระบบจะดึงลูกค้า / วันที่ / สินค้า / ปริมาณให้อัตโนมัติ — ใส่ได้ทั้ง DT26010311739 หรือเลข ref 11739">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <Input placeholder="เช่น DT26010311739, 11740" value={refs} onChange={(e) => setRefs(e.target.value)} />
            <Button variant="tonal" onClick={() => pullFromTickets()}>ดึงข้อมูล</Button>
          </div>
        </Field>
        <Field label="รหัสใบส่งสินค้าโรงหล่อ (คั่นด้วย , หรือเว้นวรรค)" hint="ดึงลูกค้า / วันที่ / รายการสินค้าจากใบส่งสินค้าโรงหล่อ — เติมราคาจากตารางสินค้าให้" style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <Input placeholder="เช่น FD-690628-01" value={fdRefs} onChange={(e) => setFdRefs(e.target.value)} />
            <Button variant="tonal" onClick={() => pullFromFoundry()}>ดึงข้อมูล</Button>
          </div>
        </Field>
        {pullInfo && <div style={{ fontSize: 12, color: 'var(--kpc-primary-ink)', marginTop: 8 }}>✓ {pullInfo}</div>}
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Field label="เลขที่ใบกำกับ" required hint="สร้างอัตโนมัติจากงวด/วันที่ — แก้ไขเป็นเลขจริงได้" style={{ gridColumn: '1 / -1' }}>
          <Input className="input mono" value={no} onChange={(e) => { setNo(e.target.value); setNoDirty(true) }} placeholder="เช่น IV690621-0001 หรือ 690621-0001" />
        </Field>
        <Field label="ลูกค้า" required>
          <Input
            list="kpc-customer-list"
            placeholder="พิมพ์หรือเลือกลูกค้า"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
          <datalist id="kpc-customer-list">
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>
        {isCompany && (
          <Field label="สำนักงานใหญ่ / สาขา" hint="สำหรับลูกค้านิติบุคคล — พิมพ์บนใบกำกับภาษี" style={{ gridColumn: '1 / -1' }}>
            <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="pills">
                <Pill active={taxBranch === 'head'} onClick={() => setTaxBranch('head')}>สำนักงานใหญ่</Pill>
                <Pill active={taxBranch === 'branch'} onClick={() => setTaxBranch('branch')}>สาขา</Pill>
              </div>
              {taxBranch === 'branch' && (
                <Input style={{ maxWidth: 180 }} placeholder="เลขที่สาขา เช่น 00001" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
              )}
            </div>
          </Field>
        )}
        <Field label="วิธีชำระ" required>
          <Select value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
            <option value="เช็ค">เช็ค</option>
            <option value="เครดิต">เครดิต</option>
          </Select>
        </Field>
        <Field label="งวด (เดือน)" required>
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {pickerMonths().map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="วันที่ออก (1–31)" required>
          <Input type="number" min={1} max={31} placeholder="เช่น 21" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>รายการสินค้า</strong>
        <Button variant="ghost" size="sm" onClick={() => setLines([...lines, emptyLine()])}>+ เพิ่มรายการ</Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {lines.map((ld, i) => {
          const p = productMap[ld.code]
          const priceN = Number(ld.price) || 0
          const discN = Number(ld.discount) || 0
          const overDiscount = discN > 0 && discN > priceN
          return (
            <div key={i}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 36px', gap: 8, alignItems: 'end' }}>
                <Field label={i === 0 ? 'สินค้า' : undefined}>
                  <Select
                    value={ld.code}
                    onChange={(e) => {
                      const np = productMap[e.target.value]
                      const next = [...lines]
                      next[i] = { ...ld, code: e.target.value, price: ld.price || String(np?.price ?? '') }
                      setLines(next)
                    }}
                  >
                    {products.map((pr) => <option key={pr.code} value={pr.code}>{pr.code} — {pr.name}</option>)}
                  </Select>
                </Field>
                <Field label={i === 0 ? `จำนวน (${p?.unit ?? 'หน่วย'})` : undefined}>
                  <Input type="number" step="0.01" value={ld.qty} onChange={(e) => {
                    const next = [...lines]; next[i] = { ...ld, qty: e.target.value }; setLines(next)
                  }} />
                </Field>
                <Field label={i === 0 ? 'ราคา/หน่วย (รวม VAT)' : undefined}>
                  <Input type="number" step="0.01" value={ld.price} onChange={(e) => {
                    const next = [...lines]; next[i] = { ...ld, price: e.target.value }; setLines(next)
                  }} />
                </Field>
                <Field label={i === 0 ? 'ส่วนลด/หน่วย' : undefined}>
                  <Input
                    type="number" step="0.01" min={0} placeholder="0"
                    value={ld.discount}
                    onChange={(e) => {
                      const next = [...lines]; next[i] = { ...ld, discount: e.target.value }; setLines(next)
                    }}
                  />
                </Field>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (lines.length === 1) setLines([emptyLine()])
                  else setLines(lines.filter((_, k) => k !== i))
                }} aria-label="ลบแถว">✕</Button>
              </div>
              {overDiscount && (
                <div style={{ fontSize: 11, color: 'var(--kpc-danger)', marginTop: 4, paddingLeft: 4 }}>
                  ⚠ ส่วนลดมากกว่าราคา/หน่วย — กรุณาตรวจสอบ
                </div>
              )}
            </div>
          )
        })}
      </div>

      {computed.transportLine && (
        <div style={{
          marginBottom: 16,
          padding: '10px 12px',
          background: 'var(--kpc-primary-50)',
          border: '1px dashed var(--kpc-primary-100)',
          borderRadius: 8,
          fontSize: 13,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <strong>+ {computed.transportLine.name}</strong>
            <div style={{ color: 'var(--kpc-text-muted)', fontSize: 12, marginTop: 2 }}>
              เพิ่มอัตโนมัติ — รวมคอนกรีต {computed.concreteQty.toFixed(2)} คิว ไม่ถึง {TRANSPORT_FULL_M3} คิว · อ้างอิงจากตารางค่าขนส่งปัจจุบัน
            </div>
          </div>
          <strong className="mono">{baht(Math.round(computed.transportLine.amount * 1.07 * 100) / 100)}</strong>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', fontSize: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--kpc-text-muted)', marginBottom: 2 }}>* ราคาที่กรอกเป็นราคารวม VAT 7% แล้ว — แยกฐานภาษีและ VAT ออกตามนี้</div>
        {computed.discountInclVat > 0 && (
          <div style={{ color: '#15803d' }}>ส่วนลดรวม (รวม VAT): <strong className="mono">−{baht(computed.discountInclVat)}</strong></div>
        )}
        <div>ฐานภาษี (ก่อน VAT): <strong className="mono">{baht(computed.subtotal)}</strong></div>
        <div>ภาษีมูลค่าเพิ่ม 7%: <strong className="mono">{baht(computed.vat)}</strong></div>
        <div style={{ fontSize: 16 }}>จำนวนเงินรวมทั้งสิ้น (รวม VAT): <strong className="mono" style={{ color: 'var(--kpc-primary-ink)' }}>{baht(computed.total)}</strong></div>
      </div>
    </Modal>
  )
}
