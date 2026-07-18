import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { CUSTOMER_MASTER, DELIVERY_TICKETS, VEHICLES, VEHICLE_MAP, ISSUERS, SELF_PICKUP_DISCOUNT_PER_M3, pickupIsDelivered, type DeliveryTicket, type PayMethod, type TicketPickup } from '../../data/real'
import { monthLabel } from '../../data/selectors'
import { addTicket, updateTicket, useCreatedDocs, useProducts } from '../../data/createdDocs'
import { NewCustomerForm } from './NewCustomerForm'

function pad2(n: number) { return String(n).padStart(2, '0') }

/** งวด (เดือน) options — full B.E. 2569 year so tickets can be issued for the
    current month and beyond (seed data only covered Jan–Jun). */
const MONTH_OPTS = Array.from({ length: 12 }, (_, i) => i + 1)
/** Current calendar month (1–12) — the sensible default งวด for a new ticket. */
const CURRENT_MONTH = new Date().getMonth() + 1


/** Optional pre-fill values, e.g. when issuing a ticket from a sales order. */
export interface DeliveryTicketInitial {
  customer?: string
  prodCode?: string
  m3?: string
  note?: string
  type?: string
}

export function NewDeliveryTicketForm({
  open,
  onClose,
  onSaved,
  createdTickets,
  initial,
  editTicket,
}: {
  open: boolean
  onClose: () => void
  onSaved: (t: DeliveryTicket) => void
  createdTickets: DeliveryTicket[]
  initial?: DeliveryTicketInitial | null
  /** When set, the form edits this existing (user-created) ticket instead of adding. */
  editTicket?: DeliveryTicket | null
}) {
  const isEdit = !!editTicket
  /* Delivery tickets only cover concrete products — precast excluded — and only
     ones still on sale (จำหน่าย). Built from the live merged list so user-added
     products appear and งดจำหน่าย ones are hidden. */
  const merged = useProducts()
  const sellable = useMemo(() => merged.filter((p) => p.category !== 'precast' && !p.discontinued), [merged])
  const [dtNoDigits, setDtNoDigits] = useState<string>('') /* user types 11 digits; "DT" prefix is implicit */
  const [month, setMonth] = useState<number>(CURRENT_MONTH)
  /* Default the delivery date to today — most tickets are issued the same day. */
  const [day, setDay] = useState<string>(String(new Date().getDate()))
  const [type, setType] = useState<string>('ขายลูกค้า')
  const [customer, setCustomer] = useState<string>('')
  const [prodCode, setProdCode] = useState<string>(sellable[0]?.code ?? '')
  const [m3, setM3] = useState<string>('')
  /* การรับของ (customer sales only): 'จัดส่ง' = บริษัทจัดส่ง (default),
     'รับเอง' = ลูกค้ามารับเอง (หัก 100 บาท/คิว ตอนออกใบกำกับ, ไม่ต้องมีรถ/คนขับ), หรือ
     'จัดส่งละเว้นค่าขนส่ง' = บริษัทจัดส่งแต่ไม่คิดค่าขนส่งไม่เต็มเที่ยว (ยังต้องระบุรถ). */
  const [pickup, setPickup] = useState<TicketPickup>('จัดส่ง')
  const [vehicle, setVehicle] = useState<string>(VEHICLES[0]?.id ?? '')
  const [pay, setPay] = useState<PayMethod>('เครดิต')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const created = useCreatedDocs()
  const [issuer, setIssuer] = useState<string>(ISSUERS[0] ?? '')
  const [receiver, setReceiver] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [err, setErr] = useState<string>('')

  const all = useMemo(() => [...createdTickets, ...DELIVERY_TICKETS], [createdTickets])

  /* Dropdown options — the sellable list, plus the currently-selected product if
     it has since been set งดจำหน่าย, so editing an old ticket keeps its item. */
  const options = useMemo(() => {
    if (prodCode && !sellable.some((p) => p.code === prodCode)) {
      const cur = merged.find((p) => p.code === prodCode)
      if (cur) return [cur, ...sellable]
    }
    return sellable
  }, [merged, sellable, prodCode])

  /* Prefill every field from the ticket being edited when the form opens. */
  useEffect(() => {
    if (!open || !editTicket) return
    setDtNoDigits(editTicket.dtNo.replace(/^DT/, ''))
    setMonth(editTicket.month)
    setDay(String(parseInt(editTicket.date.slice(0, 2), 10) || new Date().getDate()))
    setType(editTicket.type)
    setCustomer(editTicket.customer)
    setProdCode(editTicket.prod)
    setM3(String(editTicket.m3))
    setPickup(editTicket.pickup || 'จัดส่ง')
    setVehicle(editTicket.vehicle || VEHICLES[0]?.id || '')
    setPay((editTicket.pay || 'เครดิต') as PayMethod)
    setIssuer(editTicket.issuer || ISSUERS[0] || '')
    setReceiver(editTicket.receiver ?? '')
    setNote(editTicket.note ?? '')
    setErr('')
  }, [open, editTicket])

  /* Apply pre-fill values (e.g. issuing from a sales order) when the form opens.
     Only fields supplied by `initial` are overridden — the rest keep defaults. */
  useEffect(() => {
    if (!open || !initial || editTicket) return
    if (initial.type) setType(initial.type)
    if (initial.customer !== undefined) setCustomer(initial.customer)
    if (initial.prodCode && sellable.some((p) => p.code === initial.prodCode)) setProdCode(initial.prodCode)
    if (initial.m3 !== undefined) setM3(initial.m3)
    if (initial.note !== undefined) setNote(initial.note)
  }, [open, initial, editTicket])

  /* Live duplicate check: when the user has typed all 11 digits, mark
     whether that dtNo already exists so the field can flag it before
     they try to submit. */
  const isDtNoComplete = dtNoDigits.length === 11
  /* In edit mode the number is fixed to this ticket, so an existing match is itself. */
  const dtNoDuplicate = !isEdit && isDtNoComplete && all.some((t) => t.dtNo === `DT${dtNoDigits}`)

  const reset = () => {
    setDtNoDigits('')
    setMonth(CURRENT_MONTH); setDay(String(new Date().getDate())); setType('ขายลูกค้า'); setCustomer('')
    setProdCode(sellable[0]?.code ?? ''); setM3('')
    setPickup('จัดส่ง')
    setVehicle(VEHICLES[0]?.id ?? ''); setPay('เครดิต')
    setIssuer(ISSUERS[0] ?? ''); setReceiver(''); setNote(''); setErr('')
  }

  const submit = () => {
    setErr('')
    if (dtNoDigits.length !== 11) return setErr('กรุณาใส่เลขใบจ่าย 11 หลัก (ระบบจะนำหน้าด้วย DT)')
    const dtNo = isEdit ? editTicket!.dtNo : `DT${dtNoDigits}`
    if (!isEdit && all.some((t) => t.dtNo === dtNo)) return setErr(`เลขใบจ่าย ${dtNo} ถูกใช้แล้ว`)

    const dnum = parseInt(day, 10)
    if (!dnum || dnum < 1 || dnum > 31) return setErr('กรุณาระบุวันที่ (1–31)')
    if (!customer.trim() && type === 'ขายลูกค้า') return setErr('กรุณาเลือกหรือกรอกชื่อลูกค้า')
    const q = Number(m3)
    if (!q || q <= 0) return setErr('กรุณาระบุปริมาณ (คิว)')
    /* หมายเลขรถ + พนักงานจัดส่ง ใช้เฉพาะงานขายลูกค้าที่ "บริษัทจัดส่ง" (รวมแบบละเว้น
       ค่าขนส่ง — ยังต้องมีรถไว้คำนวณค่าวิ่งเที่ยวรถโม่) — โรงหล่อ/ใช้เอง และ
       "ลูกค้ามารับเอง" ข้ามได้ (ลูกค้าใช้รถตัวเอง). */
    const isCustomerSale = type === 'ขายลูกค้า'
    const needsVehicle = isCustomerSale && pickupIsDelivered(pickup)
    if (needsVehicle) {
      if (!vehicle) return setErr('กรุณาเลือกหมายเลขรถ')
      const v = VEHICLE_MAP[vehicle]
      if (v && q > v.maxM3) return setErr(`รถ ${v.id} ขนได้สูงสุด ${v.maxM3} คิว (ใส่ ${q} คิวเกินกำหนด)`)
    }
    if (!issuer) return setErr('กรุณาเลือกผู้จ่ายสินค้า')

    const date = `${pad2(dnum)}/${pad2(month)}/69`
    /* ref mirrors seed-data convention: trailing 5 digits of the dtNo. */
    const ref = dtNoDigits.slice(-5)
    /* Fields the form owns — shared by add and edit. Price/amount/invoice are
       managed elsewhere (set at tax-invoice time), so edit preserves them. */
    const fields = {
      month, date, type,
      customer: customer.trim() || (type === 'โรงหล่อ' ? 'โรงหล่อ' : type),
      prod: prodCode,
      m3: q,
      pay: (isCustomerSale ? pay : '') as PayMethod,
      note: note.trim(),
      /* การรับของ: บันทึกเฉพาะงานขายลูกค้า (undefined สำหรับโรงหล่อ/ใช้เอง ⇒ ถือเป็นจัดส่ง). */
      pickup: isCustomerSale ? pickup : undefined,
      /* Vehicle + driver only when the company delivers (ขายลูกค้า + จัดส่ง);
         blank for โรงหล่อ/ใช้เอง and for ลูกค้ามารับเอง (customer's own vehicle).
         Driver is snapshotted from the vehicle master so the ticket stays
         accurate even if the driver assignment changes later. */
      vehicle: needsVehicle ? vehicle : '',
      driver: needsVehicle ? (VEHICLE_MAP[vehicle]?.driver || '') : '',
      issuer,
      receiver: receiver.trim() || undefined,
      ref,
    }
    if (isEdit) {
      updateTicket(dtNo, fields)
      onSaved({ ...editTicket!, ...fields })
    } else {
      const t: DeliveryTicket = { dtNo, ...fields, price: 0, amount: 0, invoice: '', billing: '' }
      addTicket(t)
      onSaved(t)
    }
    reset()
  }

  const close = () => { reset(); onClose() }

  return (
    <Modal
      open={open}
      title={isEdit ? `แก้ไขใบจ่ายคอนกรีต ${editTicket!.dtNo}` : 'บันทึกใบจ่ายคอนกรีตใหม่'}
      onClose={close}
      maxWidth={720}
      footer={
        <>
          <Button variant="secondary" onClick={close}>ยกเลิก</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={dtNoDuplicate}
            title={dtNoDuplicate ? 'เลขใบจ่ายซ้ำ — แก้ก่อนบันทึก' : undefined}
          >
            {isEdit ? 'บันทึกการแก้ไข' : 'บันทึก'}
          </Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field
          label="เลขที่ใบจ่าย"
          required
          error={dtNoDuplicate}
          hint={(() => {
            if (isEdit) return 'เลขใบจ่ายคงที่ — แก้ไขรายละเอียดอื่นได้'
            if (!dtNoDigits) return 'ใส่เลข 11 หลัก ระบบนำหน้าด้วย "DT" ให้อัตโนมัติ'
            if (dtNoDuplicate) return `⚠ เลขใบจ่าย DT${dtNoDigits} ถูกใช้แล้ว — กรุณาเปลี่ยน`
            if (isDtNoComplete) return `✓ DT${dtNoDigits} (ใช้ได้)`
            return `ใส่เลขอีก ${11 - dtNoDigits.length} หลัก — DT${dtNoDigits}…`
          })()}
          style={{ gridColumn: '1 / -1' }}
        >
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <span
              className="mono"
              style={{
                padding: '11px 14px',
                background: 'var(--kpc-surface-alt)',
                border: '1.5px solid var(--kpc-neutral-300)',
                borderRight: 'none',
                borderRadius: '8px 0 0 8px',
                fontWeight: 700,
                color: 'var(--kpc-text-strong)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              DT
            </span>
            <Input
              className="input"
              inputMode="numeric"
              placeholder="เช่น 26021511739"
              value={dtNoDigits}
              readOnly={isEdit}
              onChange={(e) => setDtNoDigits(e.target.value.replace(/\D/g, '').slice(0, 11))}
              style={{ borderRadius: '0 8px 8px 0', flex: 1, fontFamily: 'var(--kpc-font-mono)', ...(isEdit ? { background: 'var(--kpc-surface-alt)' } : {}) }}
            />
          </div>
        </Field>

        <Field label="งวด (เดือน)" required>
          <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_OPTS.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </Select>
        </Field>
        <Field label="วันที่จ่ายสินค้า" required hint="ค่าเริ่มต้น = วันนี้ (1–31)">
          <Input type="number" min={1} max={31} placeholder="เช่น 21" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="ประเภท" required>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={{ background: 'var(--kpc-primary)', color: '#fff', fontWeight: 600, borderColor: 'var(--kpc-primary)' }}
          >
            <option style={{ background: '#fff', color: 'var(--kpc-text-strong)' }} value="ขายลูกค้า">ขายลูกค้า</option>
            <option style={{ background: '#fff', color: 'var(--kpc-text-strong)' }} value="โรงหล่อ">โรงหล่อ</option>
            <option style={{ background: '#fff', color: 'var(--kpc-text-strong)' }} value="ใช้เอง">ใช้เอง</option>
          </Select>
        </Field>

        {/* การรับของ — เฉพาะงานขายลูกค้า. ลูกค้ามารับเอง = หัก 100 บาท/คิว ตอนออกใบกำกับ
            และไม่ต้องระบุรถ/พนักงานจัดส่ง. */}
        {type === 'ขายลูกค้า' && (
          <Field
            label="การรับของ"
            required
            hint={(() => {
              if (pickup === 'รับเอง') return `หัก ${SELF_PICKUP_DISCOUNT_PER_M3} บาท/คิว ตอนออกใบกำกับ`
              if (pickup === 'จัดส่งละเว้นค่าขนส่ง') return 'บริษัทจัดส่ง — ไม่คิดค่าขนส่งไม่เต็มเที่ยว (แต่ยังต้องระบุรถ)'
              return 'บริษัทจัดส่งด้วยรถโรงงาน'
            })()}
            style={{ gridColumn: 'span 1' }}
          >
            <Select value={pickup} onChange={(e) => setPickup(e.target.value as TicketPickup)}>
              <option value="จัดส่ง">บริษัทจัดส่ง</option>
              <option value="จัดส่งละเว้นค่าขนส่ง">บริษัทจัดส่ง (ละเว้นค่าขนส่ง)</option>
              <option value="รับเอง">ลูกค้ามารับเอง</option>
            </Select>
          </Field>
        )}

        <Field label="ลูกค้า / หน่วยงาน" required={type === 'ขายลูกค้า'} style={{ gridColumn: type === 'ขายลูกค้า' ? 'span 2' : '1 / -1' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <Input
              list="kpc-customer-list-dt"
              placeholder={type === 'ขายลูกค้า' ? 'พิมพ์หรือเลือกลูกค้า' : 'เช่น โรงหล่อ / หน่วยงานภายใน'}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="tonal" size="sm" onClick={() => setShowAddCustomer(true)} title="เพิ่มลูกค้า/หน่วยงานใหม่">
              + เพิ่มลูกค้าใหม่
            </Button>
          </div>
          <datalist id="kpc-customer-list-dt">
            {created.customersAdded.map((c) => <option key={c.id} value={c.name} />)}
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>

        <Field label="สินค้า" required style={{ gridColumn: '1 / -1' }}>
          <Select value={prodCode} onChange={(e) => setProdCode(e.target.value)}>
            {options.map((pr) => <option key={pr.code} value={pr.code}>{pr.code} — {pr.name}{pr.discontinued ? ' (งดจำหน่าย)' : ''}</option>)}
          </Select>
        </Field>

        {/* หมายเลขรถ + พนักงานจัดส่ง แสดงเฉพาะงานขายลูกค้าที่บริษัทจัดส่ง (รวมแบบละเว้น
            ค่าขนส่ง) — โรงหล่อ/ใช้เอง และลูกค้ามารับเอง ไม่ต้องเลือก. */}
        {type === 'ขายลูกค้า' && pickupIsDelivered(pickup) && (
          <>
            <Field label="หมายเลขรถ" required hint={(() => {
              const v = VEHICLE_MAP[vehicle]; if (!v) return ''
              const q = Number(m3)
              if (q && q > v.maxM3) return `เกินพิกัด ${v.maxM3} คิว`
              return `ขนได้สูงสุด ${v.maxM3} คิว`
            })()} error={(() => {
              const v = VEHICLE_MAP[vehicle]; const q = Number(m3)
              return !!(v && q && q > v.maxM3)
            })()}>
              <Select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                {VEHICLES.map((v) => (
                  <option key={v.id} value={v.id}>รถ {v.id} (สูงสุด {v.maxM3} คิว)</option>
                ))}
              </Select>
            </Field>
            <Field label="พนักงานจัดส่ง" hint="ดึงจากหมายเลขรถอัตโนมัติ">
              {(() => {
                const driver = VEHICLE_MAP[vehicle]?.driver
                return (
                  <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', color: driver ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>
                    {driver || 'ยังไม่ได้ระบุพนักงาน'}
                  </div>
                )
              })()}
            </Field>
          </>
        )}
        <Field label="ผู้จ่ายสินค้า" required hint="พนักงานที่กรอกใบจ่ายนี้">
          <Select value={issuer} onChange={(e) => setIssuer(e.target.value)}>
            {ISSUERS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </Field>

        {/* ปริมาณ | ผู้รับสินค้า | วิธีชำระ อยู่แถวเดียวกัน — บังคับ ปริมาณ ขึ้นคอลัมน์แรก
            เพื่อให้เรียงตรงเสมอ ไม่ว่าจะมีช่องรถ/พนักงานจัดส่งหรือไม่. */}
        <Field label="ปริมาณ (คิว)" required style={{ gridColumn: '1 / span 1' }}>
          <Input type="number" step="0.01" placeholder="เช่น 3.0" value={m3} onChange={(e) => setM3(e.target.value)} />
        </Field>
        <Field label="ผู้รับสินค้า" hint="ชื่อผู้รับของหน้างาน (ไม่บังคับ)">
          <Input placeholder="เช่น สมชาย / หัวหน้าช่าง / —" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
        </Field>
        <Field label="วิธีชำระ (เบื้องต้น)" hint={type !== 'ขายลูกค้า' ? 'ไม่ใช้กับงานภายใน' : 'กำหนดราคาตอนออกใบกำกับภาษี'}>
          <Select value={pay} onChange={(e) => setPay(e.target.value as PayMethod)} disabled={type !== 'ขายลูกค้า'}>
            <option value="เงินสด">เงินสด</option>
            <option value="โอน">โอน</option>
            <option value="เช็ค">เช็ค</option>
            <option value="เครดิต">เครดิต</option>
            <option value="">—</option>
          </Select>
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="ระยะทาง / ผู้สั่ง / รายละเอียดเพิ่มเติม ฯลฯ" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div style={{ borderTop: '1px solid var(--kpc-border)', paddingTop: 12, fontSize: 13, color: 'var(--kpc-text-muted)' }}>
        ราคา/หน่วย และจำนวนเงินจะกำหนดตอน <strong>ออกใบกำกับภาษี</strong>
      </div>

      <NewCustomerForm
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        initialName={customer}
        onCreated={(c) => {
          /* Auto-fill the customer field with the newly-saved name. */
          setCustomer(c.name)
          /* If the new customer is credit-only, also nudge pay to เครดิต. */
          if (c.terms === 'เครดิต') setPay('เครดิต')
          setShowAddCustomer(false)
        }}
      />
    </Modal>
  )
}
