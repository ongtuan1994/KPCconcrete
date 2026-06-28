import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, SearchInput, Field, Input, Select, SavedBy } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { FoundryDeliveryDoc } from '../components/documents/FoundryDeliveryDoc'
import { IconPlus } from '../components/icons'
import { PRODUCTS, CUSTOMER_MASTER } from '../data/real'
import { cleanProductName as cleanName } from '../data/selectors'
import {
  useCreatedDocs, addFoundryDelivery, removeFoundryDelivery, CAN_DELETE,
  type FoundryDelivery, type FoundryDeliveryItem,
} from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/* Foundry-only products feed the line-item picker. */
const FOUNDRY_PRODUCTS = PRODUCTS.filter((p) => p.site === 'foundry')
const PROD_BY_CODE = Object.fromEntries(FOUNDRY_PRODUCTS.map((p) => [p.code, p]))
const optionLabel = (code: string) => {
  const p = PROD_BY_CODE[code]
  return p ? `${cleanName(p.name)} (${p.unit})` : code
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

export function FoundryDeliveries() {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [active, setActive] = useState<FoundryDelivery | null>(null)
  const created = useCreatedDocs()
  const navigate = useNavigate()
  const all = created.foundryDeliveries

  const rows = useMemo(
    () =>
      all.filter((f) => {
        if (!query) return true
        const hay = `${f.fdNo} ${f.customer} ${f.vehicle} ${f.items.map((i) => i.name).join(' ')}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      }),
    [all, query],
  )

  const totalItems = all.reduce((s, f) => s + f.items.reduce((a, it) => a + it.qty, 0), 0)

  const exportExcel = () => {
    const head = ['เลขที่ส่งสินค้า', 'วันที่', 'ลูกค้า', 'ทะเบียนรถ', 'รายการสินค้า', 'รวมจำนวน', 'หมายเหตุ']
    const body = rows.map((f) => [
      f.fdNo, fmtDate(f.date), f.customer, f.vehicle,
      f.items.map((i) => `${i.name} x${i.qty} ${i.unit}`).join(' / '),
      f.items.reduce((a, it) => a + it.qty, 0), f.note ?? '',
    ])
    downloadCsv('foundry-deliveries', [head, ...body])
  }

  const columns: Column<FoundryDelivery>[] = [
    { key: 'no', header: 'เลขที่ส่งสินค้า', cell: (r) => <span className="mono">{r.fdNo}</span>, className: 'docno' },
    { key: 'date', header: 'วันที่', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'cust', header: 'ลูกค้า', cell: (r) => <span style={{ color: 'var(--kpc-text-strong)' }}>{r.customer}</span> },
    { key: 'veh', header: 'ทะเบียนรถ', align: 'center', cell: (r) => (r.vehicle ? <span className="mono">{r.vehicle}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'items', header: 'รายการ', align: 'right', cell: (r) => <span className="mono">{r.items.length} รายการ</span> },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'audit', header: '', align: 'center', cell: (r) => <AuditButton item={{ category: 'sales', group: 'ใบส่งสินค้าโรงหล่อ', ref: r.fdNo, label: r.fdNo, sub: `${r.customer} · ${r.items.length} รายการ`, route: '/foundry-deliveries' }} /> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: FoundryDelivery) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบใบส่งสินค้า ${r.fdNo} ?`)) removeFoundryDelivery(r.fdNo) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบส่งสินค้าโรงหล่อ"
        sub={`Foundry Delivery Notes · ${all.length} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> ออกใบส่งสินค้า</Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบส่งสินค้า · Notes" value={all.length.toString()} note="ใบ" />
        <KpiCard label="รวมจำนวนสินค้า · Items" value={totalItems.toLocaleString()} note="ชิ้น/แผ่น/ต้น" invert />
        <KpiCard label="ลูกค้า · Customers" value={new Set(all.map((f) => f.customer)).size.toString()} note="รายที่ส่งแล้ว" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ส่งสินค้า / ลูกค้า / ทะเบียนรถ" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีใบส่งสินค้าโรงหล่อ — กด <strong>“ออกใบส่งสินค้า”</strong> เพื่อเริ่ม
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
      )}

      <NewFoundryDeliveryForm
        open={showForm}
        onClose={() => setShowForm(false)}
        existing={all}
        onSaved={(f) => { setShowForm(false); setQuery(f.fdNo); setActive(f) }}
      />

      <DocModal
        open={!!active}
        title={active ? `ใบส่งสินค้าชั่วคราว ${active.fdNo}` : ''}
        onClose={() => setActive(null)}
        extraActions={active ? (
          <Button variant="tonal" onClick={() => navigate('/invoices', { state: { invoiceFromFoundry: active.fdNo } })}>ออกใบกำกับภาษี</Button>
        ) : undefined}
      >
        {active && <FoundryDeliveryDoc fd={active} />}
      </DocModal>
    </>
  )
}

type ItemDraft = { code: string; qty: string; pickup: 'รับเอง' | 'จัดส่ง' }
const emptyItem = (): ItemDraft => ({ code: FOUNDRY_PRODUCTS[0]?.code ?? '', qty: '', pickup: 'รับเอง' })

function NewFoundryDeliveryForm({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing: FoundryDelivery[]; onSaved: (f: FoundryDelivery) => void }) {
  const [fdNo, setFdNo] = useState('')
  const [date, setDate] = useState(todayIso())
  const [customer, setCustomer] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()])
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setFdNo(''); setDate(todayIso()); setCustomer(''); setVehicle(''); setItems([emptyItem()]); setNote(''); setErr('')
  }, [open])

  const setItem = (i: number, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addItem = () => setItems((prev) => [...prev, emptyItem()])
  const removeItem = (i: number) => setItems((prev) => (prev.length <= 1 ? [emptyItem()] : prev.filter((_, idx) => idx !== i)))

  const submit = () => {
    setErr('')
    if (!fdNo.trim()) return setErr('กรุณาระบุเลขที่ส่งสินค้า')
    if (existing.some((f) => f.fdNo.toLowerCase() === fdNo.trim().toLowerCase())) return setErr(`เลขที่ส่งสินค้า "${fdNo.trim()}" มีอยู่แล้ว`)
    if (!date) return setErr('กรุณาระบุวันที่')
    if (!customer.trim()) return setErr('กรุณาระบุชื่อลูกค้า')
    const filled = items.filter((it) => it.code && Number(it.qty) > 0)
    if (filled.length === 0) return setErr('กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการ (พร้อมจำนวน)')

    const savedItems: FoundryDeliveryItem[] = filled.map((it) => {
      const p = PROD_BY_CODE[it.code]
      return { code: p.code, name: cleanName(p.name), unit: p.unit, qty: Number(it.qty), pickup: p.pickupPrices ? it.pickup : undefined }
    })
    const fd: FoundryDelivery = {
      id: fdNo.trim(), fdNo: fdNo.trim(), date, customer: customer.trim(), vehicle: vehicle.trim(),
      items: savedItems, note: note.trim() || undefined, createdAt: new Date().toISOString(),
    }
    addFoundryDelivery(fd)
    onSaved(fd)
  }

  return (
    <Modal open={open} title="ออกใบส่งสินค้าโรงหล่อ" onClose={onClose} maxWidth={720}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>ออกใบส่งสินค้า</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="เลขที่ส่งสินค้า" required hint="กรอกเลขที่ตามเล่มใบส่งสินค้า">
          <Input placeholder="เช่น 0001 / FD-690628-01" value={fdNo} onChange={(e) => setFdNo(e.target.value)} />
        </Field>
        <Field label="วันที่" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="ชื่อลูกค้า" required style={{ gridColumn: '1 / -1' }}>
          <Input list="kpc-customer-list-fd" placeholder="พิมพ์หรือเลือกลูกค้า" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <datalist id="kpc-customer-list-fd">
            {CUSTOMER_MASTER.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </Field>
        <Field label="ทะเบียนรถ" style={{ gridColumn: '1 / -1' }} hint="เลขทะเบียนรถที่นำส่ง">
          <Input placeholder="เช่น 70-1234 ระนอง" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>รายการสินค้า (เฉพาะโรงหล่อ)</label>
          <Button variant="ghost" size="sm" onClick={addItem}>+ เพิ่มรายการ</Button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, fontSize: 11, color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
            <span style={{ flex: 1 }}>สินค้า</span>
            <span style={{ width: 130 }}>การรับของ</span>
            <span style={{ width: 90, textAlign: 'right' }}>จำนวน</span>
            <span style={{ width: 28 }} />
          </div>
          {items.map((it, i) => {
            const byPickup = !!PROD_BY_CODE[it.code]?.pickupPrices
            return (
              <div className="row" key={i} style={{ gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Select value={it.code} onChange={(e) => setItem(i, { code: e.target.value })}>
                    {FOUNDRY_PRODUCTS.map((p) => <option key={p.code} value={p.code}>{optionLabel(p.code)}</option>)}
                  </Select>
                </div>
                <div style={{ width: 130 }}>
                  {byPickup
                    ? <Select value={it.pickup} onChange={(e) => setItem(i, { pickup: e.target.value as 'รับเอง' | 'จัดส่ง' })}>
                        <option value="รับเอง">รับเอง</option>
                        <option value="จัดส่ง">จัดส่ง</option>
                      </Select>
                    : <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>—</span>}
                </div>
                <Input style={{ width: 90, textAlign: 'right' }} type="number" min={0} step="any" placeholder="0" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                <Button variant="ghost" size="sm" onClick={() => removeItem(i)} style={{ width: 28, color: 'var(--kpc-danger)' }} aria-label="ลบรายการ">✕</Button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid g-2" style={{ gap: 12, marginTop: 12 }}>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
