import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { CUSTOMER_MASTER, PRODUCTS } from '../../data/real'
import { cleanProductName } from '../../data/selectors'
import { addQuotation, updateQuotation, useCreatedDocs, type Quotation, type QuotationItem } from '../../data/createdDocs'
import { NewCustomerForm } from './NewCustomerForm'

const r2 = (n: number) => Math.round(n * 100) / 100
const num2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Today as ISO yyyy-mm-dd for the <input type="date"> default. */
function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Next QT number for the given issue date: QT + พ.ศ.(2 digits) + MM + DD + running(3).
    e.g. 2026-07-10 → QT690710-001. Scans same-day quotations so re-runs don't clash. */
function nextQtNo(dateIso: string, existing: Quotation[]): string {
  const [y, m, d] = dateIso.split('-')
  if (!y || !m || !d) return ''
  const yy = String(Number(y) + 543).slice(2)
  const prefix = `QT${yy}${m}${d}-`
  let max = 0
  for (const q of existing) {
    if (q.qtNo.startsWith(prefix)) {
      const n = parseInt(q.qtNo.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

interface DraftLine { code: string; qty: string; price: string; discount: string }
const emptyLine = (): DraftLine => ({ code: PRODUCTS[0]?.code ?? '', qty: '', price: '', discount: '' })

export function NewQuotationForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: (q: Quotation) => void
  /** When provided, the form edits this existing quotation instead of creating one. */
  editing?: Quotation | null
}) {
  const created = useCreatedDocs()
  const isEdit = !!editing
  const [date, setDate] = useState(todayIso())
  const [customer, setCustomer] = useState('')
  const [terms, setTerms] = useState<'เงินสด' | 'เครดิต'>('เงินสด')
  const [creditDays, setCreditDays] = useState('')
  const [validDays, setValidDays] = useState('')
  const [showVat, setShowVat] = useState(true)
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()])
  const [note, setNote] = useState('')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [err, setErr] = useState('')

  /* Keep the new number stable per issue date while the create form is open; in
     edit mode the quotation keeps its original qtNo. */
  const newQtNo = useMemo(() => nextQtNo(date, created.quotations), [date, created.quotations, open])
  const qtNo = editing?.qtNo ?? newQtNo

  useEffect(() => {
    if (!open) return
    if (editing) {
      setDate(editing.date)
      setCustomer(editing.customer)
      setTerms(editing.terms)
      setCreditDays(editing.creditDays != null ? String(editing.creditDays) : '')
      setValidDays(editing.validDays != null ? String(editing.validDays) : '')
      setShowVat(editing.showVat)
      setLines(editing.items.map((it) => ({ code: it.code, qty: String(it.qty), price: String(it.price), discount: it.discount != null ? String(it.discount) : '' })))
      setNote(editing.note ?? '')
    } else {
      setDate(todayIso()); setCustomer(''); setTerms('เงินสด'); setCreditDays(''); setValidDays('')
      setShowVat(true); setLines([emptyLine()]); setNote('')
    }
    setErr('')
  }, [open, editing])

  const addRow = () => setLines((rows) => [...rows, emptyLine()])
  const removeRow = (i: number) => setLines((rows) => (rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i)))
  const setRow = (i: number, patch: Partial<DraftLine>) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  /* Picking a product seeds its master price (VAT-inclusive) as a starting point. */
  const pickProduct = (i: number, code: string) => {
    const p = PRODUCTS.find((x) => x.code === code)
    setRow(i, { code, price: lines[i].price || String(p?.price ?? '') })
  }

  const totals = useMemo(() => {
    let gross = 0, discountTotal = 0, net = 0
    for (const l of lines) {
      const qty = Number(l.qty) || 0
      const price = Number(l.price) || 0
      const disc = Math.max(0, Number(l.discount) || 0)
      gross += qty * price
      discountTotal += qty * disc
      net += qty * (price - disc)
    }
    gross = r2(gross); discountTotal = r2(discountTotal); net = r2(net)
    const preVat = showVat ? r2(net / 1.07) : net
    const vat = showVat ? r2(net - preVat) : 0
    return { gross, discountTotal, net, preVat, vat }
  }, [lines, showVat])

  const submit = () => {
    setErr('')
    if (!customer.trim()) return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    if (!date) return setErr('กรุณาระบุวันที่')

    const cleaned: QuotationItem[] = []
    for (const l of lines) {
      if (!l.code) continue
      const qty = Number(l.qty)
      const price = Number(l.price)
      const disc = Math.max(0, Number(l.discount) || 0)
      if (!qty || qty <= 0) return setErr('กรุณาระบุจำนวนของทุกรายการ (มากกว่า 0)')
      if (!price || price <= 0) return setErr('กรุณาระบุราคาต่อหน่วยของทุกรายการ (มากกว่า 0)')
      const p = PRODUCTS.find((x) => x.code === l.code)
      cleaned.push({
        code: l.code,
        name: cleanProductName(p?.name ?? l.code),
        qty,
        unit: p?.unit ?? 'คิว',
        price,
        ...(disc > 0 ? { discount: disc } : {}),
        amount: r2(qty * (price - disc)),
      })
    }
    if (cleaned.length === 0) return setErr('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')

    const q: Quotation = {
      id: qtNo,
      qtNo,
      date,
      customer: customer.trim(),
      terms,
      creditDays: terms === 'เครดิต' ? (creditDays.trim() ? Number(creditDays) : 30) : undefined,
      validDays: validDays.trim() ? Number(validDays) : 30,
      showVat,
      items: cleaned,
      note: note.trim() || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }
    if (isEdit) updateQuotation(q)
    else addQuotation(q)
    onSaved(q)
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `แก้ไขใบเสนอราคา ${qtNo}` : 'ออกใบเสนอราคาใหม่'}
      onClose={onClose}
      maxWidth={860}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>บันทึก</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field label="เลขที่ใบเสนอราคา" hint={isEdit ? 'เลขที่เดิม (แก้ไขไม่ได้)' : 'ระบบออกเลขให้อัตโนมัติ'}>
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>
            {qtNo || '—'}
          </div>
        </Field>
        <Field label="วันที่" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ยืนราคาภายใน (วัน)" hint="ปล่อยว่าง = 30 วัน">
          <Input type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} placeholder="30" />
        </Field>

        <Field label="ลูกค้า / หน่วยงาน" required style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <Input
              list="kpc-customer-list-qt"
              placeholder="พิมพ์หรือเลือกลูกค้า"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="tonal" size="sm" onClick={() => setShowAddCustomer(true)} title="เพิ่มลูกค้า/หน่วยงานใหม่">
              + เพิ่มลูกค้าใหม่
            </Button>
          </div>
          <datalist id="kpc-customer-list-qt">
            {created.customersAdded.map((c) => <option key={c.id} value={c.name} />)}
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>

        <Field label="เงื่อนไขการชำระ" required>
          <Select value={terms} onChange={(e) => setTerms(e.target.value as 'เงินสด' | 'เครดิต')}>
            <option value="เงินสด">เงินสด</option>
            <option value="เครดิต">เครดิต</option>
          </Select>
        </Field>
        {terms === 'เครดิต' && (
          <Field label="จำนวนวันเครดิต" hint="ปล่อยว่าง = 30 วัน">
            <Input type="number" min={1} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} placeholder="30" />
          </Field>
        )}
        <Field label="รูปแบบราคา (VAT)" required hint="โชว์ = แจกแจง VAT ในเอกสาร">
          <Select value={showVat ? 'vat' : 'novat'} onChange={(e) => setShowVat(e.target.value === 'vat')}>
            <option value="vat">โชว์ VAT (ราคารวม VAT)</option>
            <option value="novat">ไม่โชว์ VAT</option>
          </Select>
        </Field>
      </div>

      {/* ---- Product line items ---- */}
      <div style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>
            รายการสินค้า <span className="req">*</span>
            <span style={{ fontWeight: 400, color: 'var(--kpc-text-faint)', marginLeft: 6 }}>
              {showVat ? '(ราคา/หน่วย = รวม VAT)' : '(ราคาสุทธิ ไม่คิด VAT)'}
            </span>
          </label>
          <Button variant="tonal" size="sm" onClick={addRow}>+ เพิ่มรายการ</Button>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          {lines.map((row, i) => {
            const p = PRODUCTS.find((x) => x.code === row.code)
            const amount = r2((Number(row.qty) || 0) * ((Number(row.price) || 0) - Math.max(0, Number(row.discount) || 0)))
            return (
              <div key={i} className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Select value={row.code} onChange={(e) => pickProduct(i, e.target.value)}>
                    {PRODUCTS.map((pr) => <option key={pr.code} value={pr.code}>{pr.code} — {cleanProductName(pr.name)}</option>)}
                  </Select>
                </div>
                <div style={{ width: 96 }}>
                  <Input type="number" step="0.01" min={0} placeholder={`จำนวน (${p?.unit ?? 'คิว'})`} value={row.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
                </div>
                <div style={{ width: 110 }}>
                  <Input type="number" step="0.01" min={0} placeholder="ราคา/หน่วย" value={row.price} onChange={(e) => setRow(i, { price: e.target.value })} />
                </div>
                <div style={{ width: 96 }}>
                  <Input type="number" step="0.01" min={0} placeholder="ส่วนลด" value={row.discount} onChange={(e) => setRow(i, { discount: e.target.value })} />
                </div>
                <div style={{ width: 108, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: 'var(--kpc-font-mono)', fontSize: 13 }}>
                  {num2(amount)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(i)}
                  disabled={lines.length === 1}
                  title="ลบรายการ"
                  style={{ color: lines.length === 1 ? 'var(--kpc-text-faint)' : 'var(--kpc-danger)' }}
                  aria-label="ลบรายการ"
                >
                  ✕
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ---- Totals preview ---- */}
      <div className="card" style={{ padding: 12, marginBottom: 16, background: 'var(--kpc-surface-alt)' }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
          <span>รวมเงิน</span><span className="mono">{num2(totals.gross)}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
          <span>ส่วนลด</span><span className="mono">{totals.discountTotal ? num2(totals.discountTotal) : '-'}</span>
        </div>
        {showVat && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
              <span>ราคาก่อน VAT</span><span className="mono">{num2(totals.preVat)}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
              <span>ภาษีมูลค่าเพิ่ม 7%</span><span className="mono">{num2(totals.vat)}</span>
            </div>
          </>
        )}
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 14, fontWeight: 700, marginTop: 4, borderTop: '1px solid var(--kpc-border)', paddingTop: 6 }}>
          <span>รวมราคาทั้งสิ้น</span><span className="mono">{num2(totals.net)}</span>
        </div>
      </div>

      <Field label="หมายเหตุ" style={{ marginBottom: 4 }}>
        <Input placeholder="รายละเอียดเพิ่มเติม / เงื่อนไข ฯลฯ" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <NewCustomerForm
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        initialName={customer}
        onCreated={(c) => { setCustomer(c.name); setShowAddCustomer(false) }}
      />
    </Modal>
  )
}
