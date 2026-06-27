import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { CUSTOMER_MASTER, type Customer } from '../../data/real'
import { customerPerson } from '../../data/selectors'
import { addCustomer, useCreatedDocs } from '../../data/createdDocs'

const DEFAULT_CREDIT_DAYS = 30

function nextCustomerId(existing: Customer[]): string {
  let max = 0
  for (const c of existing) {
    const n = parseInt(c.id.replace(/^C/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `C${String(max + 1).padStart(4, '0')}`
}

/** Quick-add modal for creating a new customer inline (e.g. from inside the
    delivery-ticket form). Returns the saved customer via `onCreated` so the
    parent can immediately auto-fill its customer field. */
export function NewCustomerForm({
  open,
  onClose,
  onCreated,
  initialName,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: Customer) => void
  initialName?: string
}) {
  const created = useCreatedDocs()
  const [customerName, setCustomerName] = useState('')
  const [unit, setUnit] = useState('')
  const [legalName, setLegalName] = useState('')
  const [type, setType] = useState('ขายลูกค้า')
  const [terms, setTerms] = useState('เครดิต')
  const [phone, setPhone] = useState('')
  const [taxId, setTaxId] = useState('')
  const [creditDays, setCreditDays] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setCustomerName(initialName ?? ''); setUnit('')
    setLegalName(''); setType('ขายลูกค้า'); setTerms('เครดิต')
    setPhone(''); setTaxId('')
    setCreditDays(''); setCreditLimit(''); setErr('')
  }, [open, initialName])

  /* Distinct existing customer names for the autocomplete — lets staff pick a
     customer they already have and just add a new หน่วยงาน under it. */
  const knownNames = Array.from(
    new Set([...created.customersAdded, ...CUSTOMER_MASTER].map(customerPerson)),
  ).sort((a, b) => a.localeCompare(b, 'th'))

  const submit = () => {
    setErr('')
    const cn = customerName.trim()
    const u = unit.trim()
    if (!cn) return setErr('กรุณาระบุชื่อลูกค้า')
    /* The join key stays the composite "ชื่อลูกค้า หน่วยงาน" so tickets/invoices
       can reference a specific site; the parts are stored separately for grouping. */
    const fullName = [cn, u].filter(Boolean).join(' ')
    /* Reject duplicates against the master + previously-added customers. */
    const allByName = [...created.customersAdded, ...CUSTOMER_MASTER]
    if (allByName.some((c) => c.name === fullName)) {
      return setErr(`มีลูกค้า/หน่วยงาน "${fullName}" อยู่แล้ว`)
    }
    const c: Customer = {
      id: nextCustomerId([...created.customersAdded, ...CUSTOMER_MASTER]),
      name: fullName,
      customerName: cn,
      unit: u || undefined,
      type,
      terms,
      legalName: legalName.trim(),
      address: '',
      taxId: taxId.trim(),
      phone: phone.trim() || undefined,
      creditDays: terms === 'เครดิต' && creditDays.trim() ? Number(creditDays) : undefined,
      creditLimit: terms === 'เครดิต' && creditLimit.trim() ? Number(creditLimit) : undefined,
    }
    addCustomer(c)
    onCreated(c)
  }

  return (
    <Modal
      open={open}
      title="เพิ่มลูกค้า / หน่วยงานใหม่"
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>บันทึก</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12, marginBottom: 12 }}>
        <Field label="ชื่อลูกค้า" required hint="ลูกค้าคนเดียวกันใช้ชื่อเดิม แล้วเพิ่มหน่วยงานใหม่ได้">
          <Input placeholder="เช่น คุณสมชาย" value={customerName} onChange={(e) => setCustomerName(e.target.value)} list="kpc-known-customers" />
          <datalist id="kpc-known-customers">
            {knownNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </Field>
        <Field label="หน่วยงาน" hint="เช่น ไซต์งาน / สาขา (ปล่อยว่างได้)">
          <Input placeholder="เช่น ซอย 5" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="ประเภท" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ขายลูกค้า">ขายลูกค้า</option>
            <option value="โรงหล่อ">โรงหล่อ</option>
            <option value="ใช้เอง">ใช้เอง</option>
          </Select>
        </Field>
        <Field label="เงื่อนไขชำระ" required>
          <Select value={terms} onChange={(e) => setTerms(e.target.value)}>
            <option value="เครดิต">เครดิต</option>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
          </Select>
        </Field>
        <Field label="เบอร์ติดต่อ">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="เช่น 081-234-5678" />
        </Field>
        <Field label="ชื่อนิติบุคคล (ถ้ามี)">
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="บจก. / หจก. ..." />
        </Field>
        <Field label="เลขผู้เสียภาษี" style={{ gridColumn: '1 / -1' }}>
          <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="—" />
        </Field>
      </div>

      {terms === 'เครดิต' && (
        <div className="card" style={{ padding: 12, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}><strong>เงื่อนไขเครดิต</strong></div>
          <div className="grid g-2" style={{ gap: 12 }}>
            <Field label="จำนวนวันเครดิต" hint={`ปล่อยว่าง = ใช้ค่าเริ่มต้น ${DEFAULT_CREDIT_DAYS} วัน`}>
              <Input type="number" min={1} max={120} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} placeholder={String(DEFAULT_CREDIT_DAYS)} />
            </Field>
            <Field label="วงเงินเครดิต (บาท)" hint="ปล่อยว่าง = ยังไม่กำหนด">
              <Input type="number" min={0} step={1000} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="เช่น 100000" />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}
