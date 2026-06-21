import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { PRODUCTS, CUSTOMER_MASTER, MONTHS, DELIVERY_TICKETS, type DeliveryTicket } from '../../data/real'
import { INVOICES, baht, LATEST_MONTH, type Invoice, type InvoiceLine, type InvStatus } from '../../data/selectors'
import { addInvoice, useCreatedDocs } from '../../data/createdDocs'

interface LineDraft { code: string; qty: string; price: string }

const emptyLine = (): LineDraft => ({ code: PRODUCTS[0]?.code ?? '', qty: '', price: '' })

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
}: {
  open: boolean
  onClose: () => void
  onIssued: (inv: Invoice) => void
  createdInvoices: Invoice[]
  /** When set, pre-fill the refs field and auto-pull ticket data on open. */
  initialRefs?: string
}) {
  const created = useCreatedDocs()
  const [customer, setCustomer] = useState('')
  const [month, setMonth] = useState<number>(LATEST_MONTH)
  const [day, setDay] = useState<string>('')
  const [pay, setPay] = useState<string>('เงินสด')
  const [refs, setRefs] = useState<string>('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [err, setErr] = useState<string>('')
  const [pullInfo, setPullInfo] = useState<string>('')

  const all = useMemo(() => [...createdInvoices, ...INVOICES], [createdInvoices])
  const allTickets = useMemo(() => [...created.tickets, ...DELIVERY_TICKETS], [created.tickets])

  const computed = useMemo(() => {
    const ls: InvoiceLine[] = []
    for (const ld of lines) {
      const p = PRODUCTS.find((x) => x.code === ld.code)
      if (!p) continue
      const qty = Number(ld.qty)
      const price = Number(ld.price)
      if (!qty || !price) continue
      const amount = Math.round(qty * price * 100) / 100
      ls.push({ code: p.code, name: p.name, unit: p.unit, qty, price, amount })
    }
    const subtotal = Math.round(ls.reduce((s, l) => s + l.amount, 0) * 100) / 100
    const vat = Math.round(subtotal * 0.07 * 100) / 100
    const total = Math.round((subtotal + vat) * 100) / 100
    return { ls, subtotal, vat, total }
  }, [lines])

  const reset = () => {
    setCustomer(''); setMonth(LATEST_MONTH); setDay(''); setPay('เงินสด')
    setRefs(''); setLines([emptyLine()]); setErr(''); setPullInfo('')
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

    const byKey = new Map<string, LineDraft>()
    for (const t of matched) {
      const key = `${t.prod}__${t.price || 0}`
      const existing = byKey.get(key)
      if (existing) {
        existing.qty = String((Number(existing.qty) || 0) + t.m3)
      } else {
        byKey.set(key, {
          code: t.prod,
          qty: String(t.m3),
          /* User-created tickets save price=0; leave blank so the issuer fills it in. */
          price: t.price ? String(t.price) : '',
        })
      }
    }
    setLines([...byKey.values()])

    const parts: string[] = [`ดึงข้อมูลจาก ${matched.length} ใบจ่าย`]
    if (missed.length) parts.push(`ไม่พบ: ${missed.join(', ')}`)
    setPullInfo(parts.join(' · '))
  }

  const submit = () => {
    setErr('')
    if (!customer.trim()) return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    const dnum = parseInt(day, 10)
    if (!dnum || dnum < 1 || dnum > 31) return setErr('กรุณาระบุวันที่ (1–31)')
    if (computed.ls.length === 0) return setErr('กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ (จำนวน + ราคา)')

    const date = `${pad2(dnum)}/${pad2(month)}/69`
    const dueDate = plus30(date)
    const paid = pay === 'เงินสด' || pay === 'โอน'
    const status: InvStatus = paid ? 'paid' : month < LATEST_MONTH ? 'overdue' : 'pending'
    const inv: Invoice = {
      no: nextInvoiceNo(month, dnum, all),
      month, date, dueDate, customer: customer.trim(), pay,
      lines: computed.ls,
      refs: refs.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
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
        {pullInfo && <div style={{ fontSize: 12, color: 'var(--kpc-primary-ink)', marginTop: 8 }}>✓ {pullInfo}</div>}
      </div>

      <div className="grid g-2" style={{ marginBottom: 16 }}>
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
        <Field label="วิธีชำระ" required>
          <Select value={pay} onChange={(e) => setPay(e.target.value)}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
            <option value="เครดิต">เครดิต</option>
          </Select>
        </Field>
        <Field label="งวด (เดือน)" required>
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
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
          const p = PRODUCTS.find((x) => x.code === ld.code)
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 36px', gap: 8, alignItems: 'end' }}>
              <Field label={i === 0 ? 'สินค้า' : undefined}>
                <Select
                  value={ld.code}
                  onChange={(e) => {
                    const np = PRODUCTS.find((x) => x.code === e.target.value)
                    const next = [...lines]
                    next[i] = { ...ld, code: e.target.value, price: ld.price || String(np?.price ?? '') }
                    setLines(next)
                  }}
                >
                  {PRODUCTS.map((pr) => <option key={pr.code} value={pr.code}>{pr.code} — {pr.name}</option>)}
                </Select>
              </Field>
              <Field label={i === 0 ? `จำนวน (${p?.unit ?? 'หน่วย'})` : undefined}>
                <Input type="number" step="0.01" value={ld.qty} onChange={(e) => {
                  const next = [...lines]; next[i] = { ...ld, qty: e.target.value }; setLines(next)
                }} />
              </Field>
              <Field label={i === 0 ? 'ราคา/หน่วย' : undefined}>
                <Input type="number" step="0.01" value={ld.price} onChange={(e) => {
                  const next = [...lines]; next[i] = { ...ld, price: e.target.value }; setLines(next)
                }} />
              </Field>
              <Button variant="ghost" size="sm" onClick={() => {
                if (lines.length === 1) setLines([emptyLine()])
                else setLines(lines.filter((_, k) => k !== i))
              }} aria-label="ลบแถว">✕</Button>
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', fontSize: 14 }}>
        <div>รวมเป็นเงิน: <strong className="mono">{baht(computed.subtotal)}</strong></div>
        <div>ภาษีมูลค่าเพิ่ม 7%: <strong className="mono">{baht(computed.vat)}</strong></div>
        <div style={{ fontSize: 16 }}>จำนวนเงินรวมทั้งสิ้น: <strong className="mono" style={{ color: 'var(--kpc-primary-ink)' }}>{baht(computed.total)}</strong></div>
      </div>
    </Modal>
  )
}
