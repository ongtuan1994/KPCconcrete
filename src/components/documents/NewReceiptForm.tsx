import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select, Checkbox, pickerMonths } from '../ui'
import { CUSTOMER_MASTER } from '../../data/real'
import { INVOICES, RECEIPTS, baht, LATEST_MONTH, type Invoice, type Receipt } from '../../data/selectors'
import { addReceipt } from '../../data/createdDocs'

function pad2(n: number) { return String(n).padStart(2, '0') }
function pad4(n: number) { return String(n).padStart(4, '0') }

function nextReceiptNo(month: number, existing: Receipt[]) {
  const prefix = `RC69${pad2(month)}-`
  let max = 0
  for (const r of existing) {
    if (r.no.startsWith(prefix)) {
      const n = parseInt(r.no.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${pad4(max + 1)}`
}

export function NewReceiptForm({
  open,
  onClose,
  onIssued,
  createdReceipts,
  extraInvoices,
  initialInvoiceNo,
  initialCustomer,
}: {
  open: boolean
  onClose: () => void
  onIssued: (rc: Receipt) => void
  createdReceipts: Receipt[]
  extraInvoices: Invoice[]
  /** When set, prefill customer / date / pay and tick this invoice on open. */
  initialInvoiceNo?: string
  /** When set (e.g. from the debtors ledger), prefill just the customer name. */
  initialCustomer?: string
}) {
  const [customer, setCustomer] = useState('')
  const [month, setMonth] = useState<number>(LATEST_MONTH)
  const [day, setDay] = useState<string>('')
  const [method, setMethod] = useState<string>('เงินสด')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [extraAmount, setExtraAmount] = useState<string>('')
  const [err, setErr] = useState<string>('')

  const allReceipts = useMemo(() => [...createdReceipts, ...RECEIPTS], [createdReceipts])
  const allInv = useMemo(() => [...extraInvoices, ...INVOICES], [extraInvoices])

  const candidates = useMemo(() => {
    if (!customer.trim()) return [] as Invoice[]
    const cname = customer.trim()
    return allInv.filter((i) => i.customer === cname)
  }, [customer, allInv])

  const selected = useMemo(() => candidates.filter((i) => picked.has(i.no)), [candidates, picked])
  const baseTotal = useMemo(() => selected.reduce((s, i) => s + i.total, 0), [selected])
  const total = useMemo(() => {
    const e = Number(extraAmount)
    return Number.isFinite(e) && e > 0 ? e : baseTotal
  }, [baseTotal, extraAmount])

  const toggle = (no: string) => {
    const next = new Set(picked)
    if (next.has(no)) next.delete(no); else next.add(no)
    setPicked(next)
  }

  const reset = () => {
    setCustomer(''); setMonth(LATEST_MONTH); setDay(''); setMethod('เงินสด')
    setPicked(new Set()); setExtraAmount(''); setErr('')
  }

  /* When opened with initialInvoiceNo (from the invoices page), prefill from
     that invoice and tick it. Stable ref prevents repeated overwrites. */
  const lastInitialRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!open) { lastInitialRef.current = undefined; return }
    if (initialInvoiceNo && initialInvoiceNo !== lastInitialRef.current) {
      lastInitialRef.current = initialInvoiceNo
      const inv = [...extraInvoices, ...INVOICES].find((i) => i.no === initialInvoiceNo)
      if (!inv) return
      setCustomer(inv.customer)
      setMonth(inv.month)
      const dd = parseInt(inv.date.slice(0, 2), 10)
      if (dd) setDay(String(dd))
      if (inv.pay) setMethod(inv.pay)
      setPicked(new Set([inv.no]))
    }
  }, [open, initialInvoiceNo, extraInvoices])

  /* Prefill just the customer name when opened from the debtors ledger
     ("ชำระหนี้"). Runs only when no specific invoice was supplied. */
  const lastCustomerRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!open) { lastCustomerRef.current = undefined; return }
    if (!initialInvoiceNo && initialCustomer && initialCustomer !== lastCustomerRef.current) {
      lastCustomerRef.current = initialCustomer
      setCustomer(initialCustomer)
      setPicked(new Set())
    }
  }, [open, initialCustomer, initialInvoiceNo])

  const submit = () => {
    setErr('')
    if (!customer.trim()) return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    const dnum = parseInt(day, 10)
    if (!dnum || dnum < 1 || dnum > 31) return setErr('กรุณาระบุวันที่รับเงิน (1–31)')
    if (total <= 0) return setErr('กรุณาเลือกใบกำกับ หรือกรอกจำนวนเงินที่รับ')

    const date = `${pad2(dnum)}/${pad2(month)}/69`
    const rc: Receipt = {
      no: nextReceiptNo(month, allReceipts),
      month, date, customer: customer.trim(),
      invoiceNos: selected.map((i) => i.no),
      amount: Math.round(total * 100) / 100,
      method,
    }
    addReceipt(rc)
    onIssued(rc)
    reset()
  }

  const close = () => { reset(); onClose() }

  return (
    <Modal
      open={open}
      title="ออกใบเสร็จรับเงินใหม่"
      onClose={close}
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" onClick={close}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>ออกใบเสร็จ</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Field label="ลูกค้า" required style={{ gridColumn: '1 / -1' }}>
          <Input
            list="kpc-customer-list-rc"
            placeholder="พิมพ์หรือเลือกลูกค้า"
            value={customer}
            onChange={(e) => { setCustomer(e.target.value); setPicked(new Set()) }}
          />
          <datalist id="kpc-customer-list-rc">
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>
        <Field label="งวด (เดือน)" required>
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {pickerMonths().map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="วันที่รับเงิน (1–31)" required>
          <Input type="number" min={1} max={31} placeholder="เช่น 21" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="วิธีรับชำระ" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
            <option value="เช็ค">เช็ค</option>
            <option value="เครดิต">เครดิต</option>
          </Select>
        </Field>
        <Field label="หรือกรอกยอดรับเอง (ถ้าไม่ใช่จากใบกำกับ)" hint="ปล่อยว่างเพื่อใช้ยอดรวมจากใบกำกับที่เลือก">
          <Input type="number" step="0.01" placeholder="เช่น 5000" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>เลือกใบกำกับที่ชำระ</strong>
        <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--kpc-text-muted)' }}>
          {customer ? `พบ ${candidates.length} ใบของ "${customer}"` : 'กรอกชื่อลูกค้าเพื่อแสดงรายการ'}
        </span>
      </div>

      <div style={{ border: '1px solid var(--kpc-border)', borderRadius: 8, maxHeight: 240, overflow: 'auto' }}>
        {candidates.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--kpc-text-muted)', textAlign: 'center' }}>
            ไม่มีใบกำกับของลูกค้านี้ (สามารถออกใบเสร็จโดยกรอกยอดเองได้)
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--kpc-surface-alt)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', width: 40 }}></th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>เลขที่</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>วันที่</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>สถานะ</th>
                <th style={{ textAlign: 'right', padding: '8px 12px' }}>ยอดรวม</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((inv) => (
                <tr key={inv.no} style={{ borderTop: '1px solid var(--kpc-border)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <Checkbox checked={picked.has(inv.no)} onChange={() => toggle(inv.no)}>{''}</Checkbox>
                  </td>
                  <td className="mono" style={{ padding: '8px 12px' }}>{inv.no}</td>
                  <td className="mono" style={{ padding: '8px 12px', textAlign: 'center' }}>{inv.date}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12 }}>{inv.status === 'paid' ? 'ชำระแล้ว' : inv.status === 'overdue' ? 'เกินกำหนด' : 'รอชำระ'}</td>
                  <td className="mono" style={{ padding: '8px 12px', textAlign: 'right' }}>{baht(inv.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 12, marginTop: 12, textAlign: 'right', fontSize: 15 }}>
        ยอดรับเงินรวม:
        <strong className="mono" style={{ marginLeft: 8, color: 'var(--kpc-primary-ink)' }}>{baht(total)}</strong>
      </div>
    </Modal>
  )
}
