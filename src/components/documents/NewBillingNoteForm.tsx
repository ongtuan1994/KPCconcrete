import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select, Checkbox, Pill, pickerMonths } from '../ui'
import { CUSTOMER_MASTER } from '../../data/real'
import { INVOICES, BILLING_NOTES, baht, customerLegalName, LATEST_MONTH, type BillingNote, type Invoice } from '../../data/selectors'
import { addBillingNote, updateBillingNote, useCreatedDocs } from '../../data/createdDocs'

function pad2(n: number) { return String(n).padStart(2, '0') }
function pad4(n: number) { return String(n).padStart(4, '0') }

/** Next free เลขที่ใบวางบิล for a งวด (BN69MM-NNNN), one past the highest already
    taken. `used` carries every number in play — including deleted notes, which can
    be restored later and would then collide. */
function nextBnNo(month: number, used: Iterable<string>) {
  const prefix = `BN69${pad2(month)}-`
  let max = 0
  for (const no of used) {
    if (no.startsWith(prefix)) {
      const n = parseInt(no.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${pad4(max + 1)}`
}

/** ออก / แก้ไขใบวางบิล. Passing `editBn` switches the form to edit mode: the note's
    values are hydrated in, เลขที่เอกสาร is kept, and saving patches the existing
    note instead of adding a new one. */
export function NewBillingNoteForm({
  open,
  onClose,
  onIssued,
  createdBns,
  extraInvoices,
  editBn,
}: {
  open: boolean
  onClose: () => void
  onIssued: (bn: BillingNote) => void
  createdBns: BillingNote[]
  extraInvoices: Invoice[]
  editBn?: BillingNote | null
}) {
  const isEdit = !!editBn
  const [customer, setCustomer] = useState('')
  /* เลขที่ใบวางบิล — เติมอัตโนมัติจากงวด แต่แก้เป็นเลขจริงได้ก่อนออกใบ. `noDirty`
     หยุดการเติมอัตโนมัติเมื่อผู้ใช้พิมพ์เอง (แบบเดียวกับฟอร์มใบกำกับภาษี). */
  const [no, setNo] = useState<string>('')
  const [noDirty, setNoDirty] = useState(false)
  /* Default งวด to the latest selectable month (current month while it's 2569). */
  const defaultMonth = pickerMonths().slice(-1)[0]?.num ?? LATEST_MONTH
  const [month, setMonth] = useState<number>(defaultMonth)
  const [day, setDay] = useState<string>('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string>('')
  /* Issue-in-company-name is an explicit opt-in — default บุคคลธรรมดา (individual).
     Mirrors the tax-invoice form so a ใบวางบิล can print the นิติบุคคล name too. */
  const [asCompany, setAsCompany] = useState(false)
  const [legalName, setLegalName] = useState<string>('')
  /* 'none' = ไม่พิมพ์บรรทัดสำนักงานใหญ่/สาขาเลย — บันทึกเป็น taxBranch: undefined. */
  const [taxBranch, setTaxBranch] = useState<'head' | 'branch' | 'none'>('head')
  const [branchCode, setBranchCode] = useState<string>('')

  /* Load the note being edited into the form. Runs only when the modal opens on a
     new editBn — a note always has a customer and ≥1 invoice, so this always
     changes state and the prefill effect below is guaranteed to run (and clear
     the skip flag) right after. */
  const skipLegalPrefill = useRef(false)
  useEffect(() => {
    if (!open || !editBn) return
    skipLegalPrefill.current = true
    setCustomer(editBn.customer)
    setMonth(editBn.month)
    const dnum = parseInt(editBn.date, 10)
    setDay(dnum >= 1 && dnum <= 31 ? String(dnum) : '')
    setNo(editBn.no); setNoDirty(false)
    setPicked(new Set(editBn.invoices.map((i) => i.no)))
    setAsCompany(editBn.entityType === 'company')
    setLegalName(editBn.legalName ?? '')
    /* Saved notes store 'ไม่แสดง' as an absent taxBranch — show it as that choice
       again, but only for a นิติบุคคล (บุคคลธรรมดา never prints the line). */
    setTaxBranch(editBn.entityType === 'company' && !editBn.taxBranch ? 'none' : editBn.taxBranch ?? 'head')
    setBranchCode(editBn.branchCode ?? '')
    setErr('')
  }, [open, editBn])

  /* Prefill the ชื่อนิติบุคคล from the customer registry when ticking company —
     except on the render right after hydrating an edit, which would otherwise
     overwrite the name saved on the note. */
  useEffect(() => {
    if (skipLegalPrefill.current) { skipLegalPrefill.current = false; return }
    if (asCompany) setLegalName(customerLegalName(customer))
  }, [customer, asCompany])

  /* Customer suggestions from the LIVE registry (ทะเบียนลูกค้า): quick-added
     customers first, then the seed master — same source the registry page uses,
     so a newly-added customer is selectable here too. */
  const created = useCreatedDocs()
  const customerList = useMemo(() => [...created.customersAdded, ...CUSTOMER_MASTER], [created.customersAdded])

  const allBns = useMemo(() => [...createdBns, ...BILLING_NOTES], [createdBns])
  const allInv = useMemo(() => [...extraInvoices, ...INVOICES], [extraInvoices])

  /* เลขที่ที่ถูกใช้ไปแล้ว — รวมใบที่ลบไปด้วย เพราะกู้คืนได้ทีหลังแล้วจะชนกัน. */
  const usedNos = useMemo(() => {
    const s = new Set(allBns.map((b) => b.no))
    for (const d of created.deletedBillingNotes) s.add(d.no)
    return s
  }, [allBns, created.deletedBillingNotes])

  /* Keep the auto number in sync with งวด until the user types their own. Edit mode
     keeps the note's existing number, so it never re-generates. */
  useEffect(() => {
    if (isEdit || noDirty) return
    setNo(nextBnNo(month, usedNos))
  }, [month, usedNos, noDirty, isEdit])

  const noTrim = no.trim()
  const noDuplicate = !isEdit && !!noTrim && usedNos.has(noTrim)

  /* Selectable invoices = this customer's unpaid ones. When editing, the note's
     own invoices stay listed even if one has since been marked จ่ายแล้ว — else
     saving would silently drop it from the note. */
  const candidates = useMemo(() => {
    if (!customer.trim()) return [] as Invoice[]
    const cname = customer.trim()
    const unpaid = allInv.filter((i) => i.customer === cname && i.status !== 'paid')
    if (!editBn) return unpaid
    const seen = new Set(unpaid.map((i) => i.no))
    return [...unpaid, ...editBn.invoices.filter((i) => i.customer === cname && !seen.has(i.no))]
  }, [customer, allInv, editBn])

  const selected = useMemo(() => candidates.filter((i) => picked.has(i.no)), [candidates, picked])
  const total = useMemo(() => selected.reduce((s, i) => s + i.total, 0), [selected])

  const toggle = (invNo: string) => {
    const next = new Set(picked)
    if (next.has(invNo)) next.delete(invNo); else next.add(invNo)
    setPicked(next)
  }

  const reset = () => {
    setCustomer(''); setMonth(defaultMonth); setDay(''); setPicked(new Set()); setErr('')
    setAsCompany(false); setLegalName(''); setTaxBranch('head'); setBranchCode('')
    setNo(''); setNoDirty(false)
  }

  const submit = () => {
    setErr('')
    if (!noTrim) return setErr('กรุณากรอกเลขที่ใบวางบิล')
    if (noDuplicate) return setErr(`เลขที่ใบวางบิล ${noTrim} ถูกใช้แล้ว`)
    if (!customer.trim()) return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    if (selected.length === 0) return setErr('กรุณาเลือกใบกำกับที่ต้องการรวมในใบวางบิลอย่างน้อย 1 ใบ')
    if (asCompany && !legalName.trim()) return setErr('กรุณาระบุชื่อนิติบุคคล')
    if (asCompany && taxBranch === 'branch' && !branchCode.trim()) return setErr('กรุณาระบุเลขที่สาขา')
    const dnum = parseInt(day, 10)
    const dateStr = dnum && dnum >= 1 && dnum <= 31 ? `${pad2(dnum)}/${pad2(month)}/69` : `__/${pad2(month)}/69`

    const bn: BillingNote = {
      /* เลขที่เอกสารคงที่เมื่อแก้ไข — ใบวางบิลที่ส่งลูกค้าไปแล้วต้องอ้างเลขเดิมได้. */
      no: editBn ? editBn.no : noTrim,
      month,
      date: dateStr,
      customer: customer.trim(),
      entityType: asCompany ? 'company' : 'person',
      legalName: asCompany ? legalName.trim() : undefined,
      taxBranch: asCompany && taxBranch !== 'none' ? taxBranch : undefined,
      branchCode: asCompany && taxBranch === 'branch' ? branchCode.trim() : undefined,
      invoices: selected.slice().sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10)),
      total: Math.round(total * 100) / 100,
    }
    if (editBn) updateBillingNote(bn); else addBillingNote(bn)
    onIssued(bn)
    reset()
  }

  const close = () => { reset(); onClose() }

  return (
    <Modal
      open={open}
      title={isEdit ? `แก้ไขใบวางบิล ${editBn!.no}` : 'ออกใบวางบิลใหม่'}
      onClose={close}
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" onClick={close}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>{isEdit ? 'บันทึกการแก้ไข' : 'ออกใบวางบิล'}</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field
          label="เลขที่ใบวางบิล"
          required
          hint={isEdit
            ? 'เลขที่คงที่ — แก้ไขรายละเอียดอื่นได้'
            : 'เติมอัตโนมัติจากงวด — แก้เป็นเลขอื่นได้ · ต้องไม่ซ้ำกับใบที่มีอยู่'}
          style={{ gridColumn: '1 / -1' }}
        >
          <Input
            className="input mono"
            value={no}
            readOnly={isEdit}
            onChange={(e) => { setNo(e.target.value); setNoDirty(true) }}
            placeholder="เช่น BN6907-0001"
            style={isEdit ? { background: 'var(--kpc-surface-alt)' } : undefined}
          />
          {noDuplicate && (
            <div style={{ color: 'var(--kpc-danger)', fontSize: 12, marginTop: 4 }}>
              เลขที่ {noTrim} ถูกใช้แล้ว — กรุณาเปลี่ยนเป็นเลขอื่น
            </div>
          )}
        </Field>
        <Field label="ลูกค้า" required style={{ gridColumn: '1 / -1' }}>
          <Input
            list="kpc-customer-list-bn"
            placeholder="พิมพ์หรือเลือกลูกค้า"
            value={customer}
            onChange={(e) => { setCustomer(e.target.value); setPicked(new Set()) }}
          />
          <datalist id="kpc-customer-list-bn">
            {customerList.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>
        <Field label="ประเภทผู้ซื้อ" hint="ค่าเริ่มต้น = บุคคลธรรมดา · ติ๊กเมื่อออกในนามบริษัท/หจก." style={{ gridColumn: '1 / -1' }}>
          <Checkbox checked={asCompany} onChange={() => setAsCompany((v) => !v)}>ออกในนามนิติบุคคล (บริษัท / หจก.)</Checkbox>
        </Field>
        {asCompany && (
          <>
            <Field label="ชื่อนิติบุคคล" required hint="ดึงจากทะเบียนลูกค้าถ้ามี — แก้ไข/กรอกเองได้ · พิมพ์เป็นนามลูกค้าบนใบวางบิล" style={{ gridColumn: '1 / -1' }}>
              <Input placeholder="เช่น บริษัท ... จำกัด / หจก. ..." value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
            <Field label="สำนักงานใหญ่ / สาขา" hint="พิมพ์บนใบวางบิล · เลือก “ไม่แสดง” เพื่อไม่พิมพ์บรรทัดนี้" style={{ gridColumn: '1 / -1' }}>
              <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="pills">
                  <Pill active={taxBranch === 'head'} onClick={() => setTaxBranch('head')}>สำนักงานใหญ่</Pill>
                  <Pill active={taxBranch === 'branch'} onClick={() => setTaxBranch('branch')}>สาขา</Pill>
                  <Pill active={taxBranch === 'none'} onClick={() => setTaxBranch('none')}>ไม่แสดง</Pill>
                </div>
                {taxBranch === 'branch' && (
                  <Input style={{ maxWidth: 180 }} placeholder="เลขที่สาขา เช่น 00001" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
                )}
              </div>
            </Field>
          </>
        )}
        <Field label="งวด (เดือน)">
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {pickerMonths().map((m) => <option key={m.num} value={m.num}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="วันที่วางบิล (1–31)" hint="เว้นว่างได้">
          <Input type="number" min={1} max={31} placeholder="เช่น 25" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>เลือกใบกำกับที่ยังค้างชำระ</strong>
        <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--kpc-text-muted)' }}>
          {customer ? `พบ ${candidates.length} ใบของ "${customer}"` : 'กรอกชื่อลูกค้าเพื่อแสดงรายการ'}
        </span>
      </div>

      <div style={{ border: '1px solid var(--kpc-border)', borderRadius: 8, maxHeight: 280, overflow: 'auto' }}>
        {candidates.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--kpc-text-muted)', textAlign: 'center' }}>
            ไม่มีใบกำกับที่ค้างชำระ
          </div>
        ) : (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--kpc-surface-alt)' }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', width: 40 }}></th>
                <th style={{ textAlign: 'left', padding: '8px 12px' }}>เลขที่</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>วันที่</th>
                <th style={{ textAlign: 'center', padding: '8px 12px' }}>ครบกำหนด</th>
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
                  <td className="mono" style={{ padding: '8px 12px', textAlign: 'center' }}>{inv.dueDate}</td>
                  <td className="mono" style={{ padding: '8px 12px', textAlign: 'right' }}>{baht(inv.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 12, marginTop: 12, textAlign: 'right', fontSize: 15 }}>
        เลือกแล้ว <strong>{selected.length}</strong> ใบ · ยอดรวม:
        <strong className="mono" style={{ marginLeft: 8, color: 'var(--kpc-primary-ink)' }}>{baht(total)}</strong>
      </div>
    </Modal>
  )
}
