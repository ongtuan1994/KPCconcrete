import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { CREDITOR_MASTER, type Creditor } from '../../data/creditors'
import { addSupplier, updateSupplier, nextSupplierId, useCreatedDocs } from '../../data/createdDocs'

const DEFAULT_CREDIT_DAYS = 30

/** Add/edit modal for a supplier (ซัพพลายเออร์). Used inline from the
    ใบสั่งซื้อ / ใบสำคัญจ่าย forms (add) and from the ทะเบียนซัพพลายเออร์ page
    (add + edit). When `edit` is passed the form updates that supplier instead of
    creating a new one; edits merge on top of the creditor master + added list.
    Returns the saved supplier via `onCreated`. */
export function NewSupplierForm({
  open,
  onClose,
  onCreated,
  initialName,
  edit,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: Creditor) => void
  initialName?: string
  edit?: Creditor
}) {
  const created = useCreatedDocs()
  const isEdit = !!edit
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [terms, setTerms] = useState<'เครดิต' | 'เงินสด'>('เครดิต')
  const [creditDays, setCreditDays] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    if (edit) {
      setName(edit.name)
      setNote(edit.note ?? '')
      setTerms(edit.terms)
      setCreditDays(edit.creditDays != null ? String(edit.creditDays) : '')
      setCreditLimit(edit.creditLimit != null ? String(edit.creditLimit) : '')
    } else {
      setName(initialName ?? ''); setNote(''); setTerms('เครดิต')
      setCreditDays(''); setCreditLimit('')
    }
    setErr('')
  }, [open, initialName, edit])

  const submit = () => {
    setErr('')
    const nm = name.trim()
    if (!nm) return setErr('กรุณาระบุชื่อซัพพลายเออร์')
    /* Reject duplicate names against the master + added suppliers, ignoring the
       record being edited itself. */
    const all = [...created.suppliersAdded, ...CREDITOR_MASTER]
    if (all.some((c) => c.name === nm && c.id !== edit?.id)) {
      return setErr(`มีซัพพลายเออร์ "${nm}" อยู่แล้ว`)
    }

    if (isEdit && edit) {
      updateSupplier(edit.id, {
        name: nm,
        note: note.trim() || undefined,
        terms,
        creditDays: terms === 'เครดิต' ? (creditDays.trim() ? Number(creditDays) : DEFAULT_CREDIT_DAYS) : undefined,
        creditLimit: terms === 'เครดิต' && creditLimit.trim() ? Number(creditLimit) : undefined,
      })
      onCreated({ ...edit, name: nm })
      return
    }

    const c: Creditor = {
      id: nextSupplierId(all),
      name: nm,
      terms,
      note: note.trim() || undefined,
      creditDays: terms === 'เครดิต' ? (creditDays.trim() ? Number(creditDays) : DEFAULT_CREDIT_DAYS) : undefined,
      creditLimit: terms === 'เครดิต' && creditLimit.trim() ? Number(creditLimit) : undefined,
      outstanding: 0,
    }
    addSupplier(c)
    onCreated(c)
  }

  return (
    <Modal
      open={open}
      title={isEdit ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์ใหม่'}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>บันทึก</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {isEdit && edit && (
        <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginBottom: 12 }}>
          รหัส <span className="mono" style={{ color: 'var(--kpc-text-strong)' }}>{edit.id}</span>
        </div>
      )}

      <div className="grid g-2" style={{ gap: 12, marginBottom: 12 }}>
        <Field label="ชื่อซัพพลายเออร์" required style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เช่น บจก.ตัวอย่างวัสดุ" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="หมวดสินค้า/บริการ" hint="เช่น ปูนผง / ขนส่ง (ปล่อยว่างได้)" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เช่น ปูนผง" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="เงื่อนไขชำระ" required>
          <Select value={terms} onChange={(e) => setTerms(e.target.value as 'เครดิต' | 'เงินสด')}>
            <option value="เครดิต">เครดิต</option>
            <option value="เงินสด">เงินสด</option>
          </Select>
        </Field>
      </div>

      {terms === 'เครดิต' && (
        <div className="card" style={{ padding: 12, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}><strong>เงื่อนไขเครดิต</strong></div>
          <div className="grid g-2" style={{ gap: 12 }}>
            <Field label="จำนวนวันเครดิต" hint={`ปล่อยว่าง = ${DEFAULT_CREDIT_DAYS} วัน`}>
              <Input type="number" min={1} max={120} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} placeholder={String(DEFAULT_CREDIT_DAYS)} />
            </Field>
            <Field label="วงเงินเครดิต (บาท)" hint="ปล่อยว่าง = ไม่จำกัด">
              <Input type="number" min={0} step={1000} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="เช่น 100000" />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}
