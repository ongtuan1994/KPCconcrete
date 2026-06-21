import { useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { CUSTOMER_MASTER, MONTHS, PRODUCTS, DELIVERY_TICKETS, type DeliveryTicket, type PayMethod } from '../../data/real'
import { LATEST_MONTH } from '../../data/selectors'
import { addTicket } from '../../data/createdDocs'

function pad2(n: number) { return String(n).padStart(2, '0') }

/** Continue the existing dtNo serial (DT26MMDD<serial>) so new tickets blend in. */
function nextSerial(all: DeliveryTicket[]): number {
  let max = 0
  for (const t of all) {
    const tail = t.ref || t.dtNo.slice(-5)
    const n = parseInt(tail, 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return max + 1
}

export function NewDeliveryTicketForm({
  open,
  onClose,
  onSaved,
  createdTickets,
}: {
  open: boolean
  onClose: () => void
  onSaved: (t: DeliveryTicket) => void
  createdTickets: DeliveryTicket[]
}) {
  const [month, setMonth] = useState<number>(LATEST_MONTH)
  const [day, setDay] = useState<string>('')
  const [type, setType] = useState<string>('ขายลูกค้า')
  const [customer, setCustomer] = useState<string>('')
  const [prodCode, setProdCode] = useState<string>(PRODUCTS[0]?.code ?? '')
  const [m3, setM3] = useState<string>('')
  const [pay, setPay] = useState<PayMethod>('เงินสด')
  const [note, setNote] = useState<string>('')
  const [err, setErr] = useState<string>('')

  const all = useMemo(() => [...createdTickets, ...DELIVERY_TICKETS], [createdTickets])

  const reset = () => {
    setMonth(LATEST_MONTH); setDay(''); setType('ขายลูกค้า'); setCustomer('')
    setProdCode(PRODUCTS[0]?.code ?? ''); setM3(''); setPay('เงินสด')
    setNote(''); setErr('')
  }

  const submit = () => {
    setErr('')
    const dnum = parseInt(day, 10)
    if (!dnum || dnum < 1 || dnum > 31) return setErr('กรุณาระบุวันที่ (1–31)')
    if (!customer.trim() && type === 'ขายลูกค้า') return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    const q = Number(m3)
    if (!q || q <= 0) return setErr('กรุณาระบุปริมาณ (คิว)')

    const serial = nextSerial(all)
    const date = `${pad2(dnum)}/${pad2(month)}/69`
    const dtNo = `DT26${pad2(month)}${pad2(dnum)}${serial}`
    const ref = String(serial)
    const t: DeliveryTicket = {
      month, date, dtNo, ref, type,
      customer: customer.trim() || (type === 'โรงหล่อ' ? 'โรงหล่อ' : type),
      prod: prodCode,
      m3: q,
      /* Price/amount are intentionally 0 here — they're entered when the tax invoice is issued. */
      price: 0,
      amount: 0,
      invoice: '', billing: '',
      pay: type === 'ขายลูกค้า' ? pay : '' as PayMethod,
      note: note.trim(),
    }
    addTicket(t)
    onSaved(t)
    reset()
  }

  const close = () => { reset(); onClose() }

  return (
    <Modal
      open={open}
      title="บันทึกใบจ่ายคอนกรีตใหม่"
      onClose={close}
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" onClick={close}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>บันทึก</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field label="งวด (เดือน)" required>
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="วันที่ (1–31)" required>
          <Input type="number" min={1} max={31} placeholder="เช่น 21" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="ประเภท" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ขายลูกค้า">ขายลูกค้า</option>
            <option value="โรงหล่อ">โรงหล่อ</option>
            <option value="ใช้เอง">ใช้เอง</option>
          </Select>
        </Field>

        <Field label="ลูกค้า / หน่วยงาน" required={type === 'ขายลูกค้า'} style={{ gridColumn: '1 / -1' }}>
          <Input
            list="kpc-customer-list-dt"
            placeholder={type === 'ขายลูกค้า' ? 'พิมพ์หรือเลือกลูกค้า' : 'เช่น โรงหล่อ / หน่วยงานภายใน'}
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
          <datalist id="kpc-customer-list-dt">
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>

        <Field label="สินค้า" required style={{ gridColumn: '1 / -1' }}>
          <Select value={prodCode} onChange={(e) => setProdCode(e.target.value)}>
            {PRODUCTS.map((pr) => <option key={pr.code} value={pr.code}>{pr.code} — {pr.name}</option>)}
          </Select>
        </Field>

        <Field label="ปริมาณ (คิว)" required>
          <Input type="number" step="0.01" placeholder="เช่น 3.0" value={m3} onChange={(e) => setM3(e.target.value)} />
        </Field>
        <Field label="วิธีชำระ (เบื้องต้น)" hint={type !== 'ขายลูกค้า' ? 'ไม่ใช้กับงานภายใน' : 'กำหนดราคาตอนออกใบกำกับภาษี'}>
          <Select value={pay} onChange={(e) => setPay(e.target.value as PayMethod)} disabled={type !== 'ขายลูกค้า'}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
            <option value="เครดิต">เครดิต</option>
            <option value="">—</option>
          </Select>
        </Field>
        <Field label="หมายเหตุ">
          <Input placeholder="ระยะทาง / รหัสรถ / ผู้สั่ง ฯลฯ" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 12, fontSize: 13, color: 'var(--kpc-text-muted)' }}>
        ราคา/หน่วย และจำนวนเงินจะกำหนดตอน <strong>ออกใบกำกับภาษี</strong>
      </div>
    </Modal>
  )
}
