import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { CUSTOMER_MASTER, PRODUCTS } from '../../data/real'
import { addSalesOrder, updateSalesOrder, useCreatedDocs, type SalesOrder, type SalesOrderItem } from '../../data/createdDocs'
import { NewCustomerForm } from './NewCustomerForm'

/** Today's date as an ISO yyyy-mm-dd string for the <input type="date"> default. */
function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Allocate the next SO-prefixed running number, scanning existing orders so
    re-runs don't clash. Defaults to SO00001 when none exist. */
function nextSoNo(existing: SalesOrder[]): string {
  let max = 0
  for (const s of existing) {
    const n = parseInt(s.soNo.replace(/^SO/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `SO${String(max + 1).padStart(5, '0')}`
}

/* Products split by SITE: แพล้นปูน (คอนกรีต/lean, non-precast) vs โรงหล่อ (foundry). */
const PLANT_PRODUCTS = PRODUCTS.filter((p) => p.category !== 'precast')
const FOUNDRY_PRODUCTS = PRODUCTS.filter((p) => p.site === 'foundry')
const productsFor = (site: SalesOrderSite) => (site === 'foundry' ? FOUNDRY_PRODUCTS : PLANT_PRODUCTS)

type SalesOrderSite = 'plant' | 'foundry'
/** Which SITE an existing order belongs to — its stored `site`, else inferred
    from whether any line is a foundry product. */
function inferSite(so: SalesOrder): SalesOrderSite {
  return so.site ?? (so.items.some((it) => FOUNDRY_PRODUCTS.some((p) => p.code === it.code)) ? 'foundry' : 'plant')
}

/** One editable product row in the form (qty kept as a string while typing). */
interface DraftItem { code: string; qty: string }

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024 /* ~4MB — keep localStorage within quota */

export function NewSalesOrderForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: (so: SalesOrder) => void
  /** When provided, the form edits this existing order instead of creating one. */
  editing?: SalesOrder | null
}) {
  const created = useCreatedDocs()
  const isEdit = !!editing
  const [orderDate, setOrderDate] = useState<string>(todayIso())
  const [useDate, setUseDate] = useState<string>('')
  const [customer, setCustomer] = useState<string>('')
  const [site, setSite] = useState<SalesOrderSite>('plant')
  const [items, setItems] = useState<DraftItem[]>([{ code: PLANT_PRODUCTS[0]?.code ?? '', qty: '' }])
  const [note, setNote] = useState<string>('')
  const [attachment, setAttachment] = useState<SalesOrder['attachment']>(undefined)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [err, setErr] = useState<string>('')

  /* Keep the new-order number stable while the create form is open; in edit
     mode the order keeps its original soNo. */
  const newSoNo = useMemo(() => nextSoNo(created.salesOrders), [created.salesOrders, open])
  const soNo = editing?.soNo ?? newSoNo

  useEffect(() => {
    if (!open) return
    if (editing) {
      setOrderDate(editing.orderDate)
      setUseDate(editing.useDate)
      setCustomer(editing.customer)
      setSite(inferSite(editing))
      setItems(editing.items.map((it) => ({ code: it.code, qty: String(it.qty) })))
      setNote(editing.note ?? '')
      setAttachment(editing.attachment)
    } else {
      setOrderDate(todayIso()); setUseDate(''); setCustomer(''); setSite('plant')
      setItems([{ code: PLANT_PRODUCTS[0]?.code ?? '', qty: '' }])
      setNote(''); setAttachment(undefined)
    }
    setErr('')
  }, [open, editing])

  const siteProducts = productsFor(site)
  /* Switching SITE resets the lines to a single default product of the new site,
     since a plant code isn't valid in the foundry list and vice-versa. */
  const changeSite = (s: SalesOrderSite) => { setSite(s); setItems([{ code: productsFor(s)[0]?.code ?? '', qty: '' }]) }
  const addRow = () => setItems((rows) => [...rows, { code: siteProducts[0]?.code ?? '', qty: '' }])
  const removeRow = (i: number) => setItems((rows) => (rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i)))
  const setRow = (i: number, patch: Partial<DraftItem>) =>
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const onPickFile = (file: File | null) => {
    setErr('')
    if (!file) { setAttachment(undefined); return }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setErr('ไฟล์แนบใหญ่เกิน 4MB — กรุณาเลือกไฟล์ที่เล็กลง')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAttachment({ name: file.name, type: file.type, dataUrl: String(reader.result) })
    reader.onerror = () => setErr('อ่านไฟล์แนบไม่สำเร็จ')
    reader.readAsDataURL(file)
  }

  const submit = () => {
    setErr('')
    if (!customer.trim()) return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    if (!orderDate) return setErr('กรุณาระบุวันที่สั่ง')
    if (!useDate) return setErr('กรุณาระบุวันที่ลูกค้าใช้')

    const cleaned: SalesOrderItem[] = []
    for (const r of items) {
      const qty = Number(r.qty)
      if (!r.code) continue
      if (!qty || qty <= 0) return setErr('กรุณาระบุจำนวนของทุกรายการสินค้า (มากกว่า 0)')
      const p = PRODUCTS.find((x) => x.code === r.code)
      cleaned.push({ code: r.code, name: p?.name ?? r.code, qty, unit: p?.unit ?? 'คิว' })
    }
    if (cleaned.length === 0) return setErr('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ')

    const so: SalesOrder = {
      id: soNo,
      soNo,
      orderDate,
      useDate,
      customer: customer.trim(),
      site,
      items: cleaned,
      /* Preserve the existing status when editing; new orders start as 'รอผลิต'. */
      status: editing?.status ?? 'รอผลิต',
      note: note.trim() || undefined,
      attachment,
      /* Preserve the original creation time when editing. */
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }
    if (isEdit) updateSalesOrder(so)
    else addSalesOrder(so)
    onSaved(so)
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `แก้ไขใบสั่งขาย ${soNo}` : 'บันทึกใบสั่งขายใหม่'}
      onClose={onClose}
      maxWidth={760}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>บันทึก</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field label="เลขที่ใบสั่งขาย" hint={isEdit ? 'เลขที่เดิม (แก้ไขไม่ได้)' : 'ระบบออกเลขให้อัตโนมัติ'}>
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>
            {soNo}
          </div>
        </Field>
        <Field label="วันที่สั่ง" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </Field>
        <Field label="วันที่ลูกค้าใช้" required hint="วันที่ลูกค้าต้องการใช้สินค้า">
          <Input type="date" value={useDate} min={orderDate || undefined} onChange={(e) => setUseDate(e.target.value)} />
        </Field>

        <Field label="ลูกค้า / หน่วยงาน" required style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <Input
              list="kpc-customer-list-so"
              placeholder="พิมพ์หรือเลือกลูกค้า"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="tonal" size="sm" onClick={() => setShowAddCustomer(true)} title="เพิ่มลูกค้า/หน่วยงานใหม่">
              + เพิ่มลูกค้าใหม่
            </Button>
          </div>
          <datalist id="kpc-customer-list-so">
            {created.customersAdded.map((c) => <option key={c.id} value={c.name} />)}
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>
      </div>

      {/* ---- SITE selector: which product source ---- */}
      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <Field label="ประเภทสินค้า (SITE)" required hint="เลือกก่อน แล้วรายการสินค้าจะแสดงตาม SITE นี้">
          <Select value={site} onChange={(e) => changeSite(e.target.value as SalesOrderSite)}>
            <option value="plant">สินค้าแพล้นปูน (คอนกรีต · อ้างอิงใบจ่ายคอนกรีต)</option>
            <option value="foundry">สินค้าโรงหล่อ (แผ่นพื้น/เสาไอ · อ้างอิงใบส่งสินค้าโรงหล่อ)</option>
          </Select>
        </Field>
      </div>

      {/* ---- Product line items (เลือกได้หลายรายการ) — filtered by SITE ---- */}
      <div style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>
            {site === 'foundry' ? 'รายการสินค้าโรงหล่อ' : 'รายการสินค้าแพล้นปูน'} <span className="req">*</span>
          </label>
          <Button variant="tonal" size="sm" onClick={addRow}>+ เพิ่มรายการ</Button>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          {items.map((row, i) => {
            const p = siteProducts.find((x) => x.code === row.code)
            return (
              <div key={i} className="row" style={{ gap: 8, alignItems: 'stretch' }}>
                <div style={{ flex: 1 }}>
                  <Select value={row.code} onChange={(e) => setRow(i, { code: e.target.value })}>
                    {siteProducts.map((pr) => <option key={pr.code} value={pr.code}>{pr.code} — {pr.name}</option>)}
                  </Select>
                </div>
                <div style={{ width: 130 }}>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={`จำนวน (${p?.unit ?? 'คิว'})`}
                    value={row.qty}
                    onChange={(e) => setRow(i, { qty: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(i)}
                  disabled={items.length === 1}
                  title="ลบรายการ"
                  style={{ color: items.length === 1 ? 'var(--kpc-text-faint)' : 'var(--kpc-danger)' }}
                  aria-label="ลบรายการ"
                >
                  ✕
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="แนบใบสั่งซื้อของลูกค้า" hint="หลักฐาน (ถ้ามี) · รูปภาพหรือ PDF ไม่เกิน 4MB" style={{ gridColumn: '1 / -1' }}>
          <input
            className="input"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {attachment && (
            <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 4 }}>
              แนบแล้ว: <strong>{attachment.name}</strong>
              <button
                type="button"
                onClick={() => setAttachment(undefined)}
                style={{ marginLeft: 8, color: 'var(--kpc-danger)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ลบไฟล์
              </button>
            </span>
          )}
        </Field>

        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม / เงื่อนไข / ผู้สั่ง ฯลฯ" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <NewCustomerForm
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        initialName={customer}
        onCreated={(c) => {
          setCustomer(c.name)
          setShowAddCustomer(false)
        }}
      />
    </Modal>
  )
}
