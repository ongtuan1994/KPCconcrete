import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, Field, Input, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { IconPlus } from '../components/icons'
import { CUSTOMER_MASTER, DELIVERY_TICKETS, type Customer } from '../data/real'
import { baht, qm, prodShort, customerAgg } from '../data/selectors'
import { useCreatedDocs, updateCustomer, type CustomerEdit } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type Filter = 'all' | 'registered' | 'ขายลูกค้า' | 'โรงหล่อ' | 'credit'

const TYPE_TONE: Record<string, Tone> = { ขายลูกค้า: 'info', โรงหล่อ: 'neutral', ใช้เอง: 'warning' }

const AGG_ALL = customerAgg('all')
const aggOf = (name: string) => AGG_ALL.find((a) => a.name === name)

/** Default credit-terms suggestion when a customer is "เครดิต" but no per-customer
    creditDays has been set yet — Thai concrete suppliers typically use 30 days. */
const DEFAULT_CREDIT_DAYS = 30

function mergeCustomer(c: Customer, edits: Record<string, CustomerEdit>): Customer {
  const e = edits[c.id]
  if (!e) return c
  return { ...c, ...e }
}

export function CustomerMaster() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Customer | null>(null)
  const [editing, setEditing] = useState<Customer | null>(null)
  const created = useCreatedDocs()

  /* Quick-added customers (e.g. from delivery-ticket form) appear at the top,
     then the seed master. Edits apply uniformly to both. */
  const list = useMemo(
    () => [...created.customersAdded, ...CUSTOMER_MASTER].map((c) => mergeCustomer(c, created.customerEdits)),
    [created.customerEdits, created.customersAdded],
  )

  const rows = useMemo(
    () =>
      list.filter((c) => {
        if (filter === 'registered' && (!c.taxId || c.taxId === '—')) return false
        if (filter === 'credit' && c.terms !== 'เครดิต') return false
        if ((filter === 'ขายลูกค้า' || filter === 'โรงหล่อ') && c.type !== filter) return false
        if (query) {
          const q = query.toLowerCase()
          if (!`${c.name} ${c.legalName} ${c.taxId} ${c.phone ?? ''}`.toLowerCase().includes(q)) return false
        }
        return true
      }).sort((a, b) => (aggOf(b.name)?.sales ?? 0) - (aggOf(a.name)?.sales ?? 0)),
    [filter, query, list],
  )

  const registered = list.filter((c) => c.taxId && c.taxId !== '—').length
  const creditCount = list.filter((c) => c.terms === 'เครดิต').length
  const withPhone = list.filter((c) => c.phone).length

  const columns: Column<Customer>[] = [
    { key: 'id', header: 'รหัส', cell: (r) => r.id, className: 'docno' },
    {
      key: 'name',
      header: 'ลูกค้า / หน่วยงาน',
      cell: (r) => (
        <div className="stack" style={{ gap: 2 }}>
          <span style={{ color: 'var(--kpc-text-strong)' }}>{r.name}</span>
          {r.legalName && <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{r.legalName}</span>}
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'เบอร์ติดต่อ',
      cell: (r) => (r.phone
        ? <a href={`tel:${r.phone.replace(/\D/g, '')}`} className="mono" style={{ fontSize: 13, color: 'var(--kpc-primary-ink)', textDecoration: 'none' }}>{r.phone}</a>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    { key: 'type', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={TYPE_TONE[r.type] ?? 'neutral'} square pip={false}>{r.type}</Badge> },
    {
      key: 'terms',
      header: 'เงื่อนไขชำระ',
      align: 'center',
      cell: (r) => {
        if (r.terms !== 'เครดิต') return <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.terms}</span>
        const days = r.creditDays ?? DEFAULT_CREDIT_DAYS
        return (
          <div className="stack" style={{ gap: 0, alignItems: 'center' }}>
            <Badge tone="warning" pip={false} square>เครดิต {days} วัน</Badge>
            {r.creditLimit ? (
              <span className="mono" style={{ fontSize: 11, color: 'var(--kpc-text-muted)', marginTop: 2 }}>วงเงิน {baht(r.creditLimit)}</span>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 2 }}>ไม่ได้ระบุวงเงิน</span>
            )}
          </div>
        )
      },
    },
    { key: 'tax', header: 'เลขภาษี', cell: (r) => (r.taxId && r.taxId !== '—' ? <span className="mono" style={{ fontSize: 13 }}>{r.taxId}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>ยังไม่ระบุ</span>) },
    { key: 'sales', header: 'ยอดซื้อสะสม', align: 'right', cell: (r) => <span className="amt mono">{baht(aggOf(r.name)?.sales ?? 0)}</span> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>รายละเอียด</Button> },
  ]

  return (
    <>
      <PageHeader
        title="ทะเบียนลูกค้า"
        sub="Customer Master · ข้อมูลลูกค้า / เบอร์ติดต่อ / เครดิต"
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['รหัส', 'ชื่อลูกค้า', 'ชื่อนิติบุคคล', 'เบอร์ติดต่อ', 'ประเภท', 'เงื่อนไข', 'เครดิต (วัน)', 'วงเงินเครดิต', 'เลขผู้เสียภาษี', 'ที่อยู่']
              const body = rows.map((c) => [
                c.id, c.name, c.legalName ?? '', c.phone ?? '', c.type, c.terms,
                c.creditDays ?? '', c.creditLimit ?? '', c.taxId ?? '', c.address ?? '',
              ])
              downloadCsv('customer-master', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="primary">
              <IconPlus /> เพิ่มลูกค้า
            </Button>
          </>
        }
      />
      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ลูกค้าทั้งหมด · Customers" value={list.length.toString()} note="ราย" />
        <KpiCard label="มีเบอร์ติดต่อ · With Phone" value={withPhone.toString()} note={`${list.length - withPhone} รายยังไม่กรอก`} />
        <KpiCard label="ลูกค้าเครดิต · Credit" value={creditCount.toString()} note="ราย" invert />
        <KpiCard label="มีเลขผู้เสียภาษี · Registered" value={registered.toString()} note="พร้อมออกใบกำกับ" />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {list.length}</Pill>
          <Pill active={filter === 'credit'} onClick={() => setFilter('credit')}>เครดิต {creditCount}</Pill>
          <Pill active={filter === 'registered'} onClick={() => setFilter('registered')}>มีเลขภาษี {registered}</Pill>
          <Pill active={filter === 'ขายลูกค้า'} onClick={() => setFilter('ขายลูกค้า')}>ขายลูกค้า</Pill>
          <Pill active={filter === 'โรงหล่อ'} onClick={() => setFilter('โรงหล่อ')}>โรงหล่อ/ภายใน</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อ / นิติบุคคล / เลขภาษี / เบอร์" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ลูกค้า`} />

      <CustomerDetail customer={active} onClose={() => setActive(null)} onEdit={(c) => { setActive(null); setEditing(c) }} />
      <CustomerEditForm customer={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function CustomerDetail({ customer, onClose, onEdit }: { customer: Customer | null; onClose: () => void; onEdit: (c: Customer) => void }) {
  if (!customer) return null
  const agg = aggOf(customer.name)
  const history = DELIVERY_TICKETS.filter((t) => t.customer === customer.name).slice(-8).reverse()
  const creditDays = customer.terms === 'เครดิต' ? (customer.creditDays ?? DEFAULT_CREDIT_DAYS) : 0
  return (
    <Modal open={!!customer} title={`ลูกค้า ${customer.id}`} onClose={onClose} maxWidth={640}
      footer={<><Button variant="secondary" onClick={onClose}>ปิด</Button><Button variant="primary" onClick={() => onEdit(customer)}>แก้ไขข้อมูล</Button></>}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{customer.legalName || customer.name}</span>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>หน่วยงาน: {customer.name}</span>
        </div>
        <div className="grid g-2" style={{ gap: 12 }}>
          <Info k="ประเภท" v={customer.type} />
          <Info k="เบอร์ติดต่อ" v={customer.phone || 'ยังไม่ระบุ'} mono={!!customer.phone} />
          <Info k="เลขผู้เสียภาษี" v={customer.taxId && customer.taxId !== '—' ? customer.taxId : 'ยังไม่ระบุ'} mono />
          <Info k="ที่อยู่" v={customer.address && customer.address !== '—' ? customer.address : 'ยังไม่ระบุ'} />
        </div>

        <div className="card" style={{ padding: 14, background: customer.terms === 'เครดิต' ? 'var(--kpc-primary-50)' : 'var(--kpc-surface-alt)', border: '1px solid var(--kpc-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 6 }}>เงื่อนไขชำระ</div>
          {customer.terms === 'เครดิต' ? (
            <div className="row wrap" style={{ gap: 18, alignItems: 'baseline' }}>
              <div><Badge tone="warning" pip={false} square>เครดิต {creditDays} วัน</Badge></div>
              <div>
                <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>วงเงิน: </span>
                <strong className="mono" style={{ color: 'var(--kpc-text-strong)' }}>
                  {customer.creditLimit ? baht(customer.creditLimit) : <span style={{ color: 'var(--kpc-text-faint)', fontWeight: 400 }}>ยังไม่ระบุ</span>}
                </strong>
              </div>
            </div>
          ) : (
            <Badge tone="success" pip={false} square>{customer.terms || 'เงินสด'}</Badge>
          )}
        </div>

        <div className="grid g-3" style={{ gap: 12 }}>
          <Stat k="ใบจ่ายสะสม" v={`${agg?.tickets ?? 0}`} />
          <Stat k="ปริมาณรวม" v={`${qm(agg?.m3 ?? 0)} m³`} />
          <Stat k="ยอดซื้อสะสม" v={baht(agg?.sales ?? 0)} />
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text)' }}>รายการล่าสุด</span>
          <div className="card flush">
            <table className="data">
              <thead><tr><th>เลขที่ใบจ่าย</th><th>วันที่</th><th>สินค้า</th><th className="num">คิว</th><th className="num">จำนวนเงิน</th></tr></thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.dtNo}>
                    <td className="docno">{t.dtNo}</td>
                    <td className="date">{t.date}</td>
                    <td className="th">{prodShort(t.prod)}</td>
                    <td className="num mono">{qm(t.m3)}</td>
                    <td className="amt mono">{t.amount ? baht(t.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function CustomerEditForm({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [creditDays, setCreditDays] = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [taxId, setTaxId] = useState('')
  const [address, setAddress] = useState('')
  const [legalName, setLegalName] = useState('')

  useEffect(() => {
    if (!customer) return
    setPhone(customer.phone ?? '')
    setCreditDays(customer.creditDays != null ? String(customer.creditDays) : '')
    setCreditLimit(customer.creditLimit != null ? String(customer.creditLimit) : '')
    setTaxId(customer.taxId && customer.taxId !== '—' ? customer.taxId : '')
    setAddress(customer.address && customer.address !== '—' ? customer.address : '')
    setLegalName(customer.legalName ?? '')
  }, [customer])

  if (!customer) return null

  const save = () => {
    const edit: CustomerEdit = {
      phone: phone.trim() || undefined,
      creditDays: creditDays.trim() ? Number(creditDays) : undefined,
      creditLimit: creditLimit.trim() ? Number(creditLimit) : undefined,
      taxId: taxId.trim() || undefined,
      address: address.trim() || undefined,
      legalName: legalName.trim() || undefined,
    }
    updateCustomer(customer.id, edit)
    onClose()
  }

  return (
    <Modal
      open={!!customer}
      title={`แก้ไขข้อมูลลูกค้า · ${customer.id}`}
      onClose={onClose}
      maxWidth={620}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={save}>บันทึก</Button></>}
    >
      <div className="stack" style={{ gap: 4, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{customer.name}</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ประเภท {customer.type} · เงื่อนไขฐาน {customer.terms}</span>
      </div>

      <div className="grid g-2" style={{ gap: 12, marginBottom: 12 }}>
        <Field label="เบอร์ติดต่อ" hint="เช่น 077-800-100 หรือ 081-234-5678">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
        </Field>
        <Field label="ชื่อนิติบุคคล" hint="ใช้ออกใบกำกับภาษีในนามบริษัท">
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="บจก. / หจก. ..." />
        </Field>
        <Field label="เลขผู้เสียภาษี (13 หลัก)">
          <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="—" />
        </Field>
        <Field label="ที่อยู่">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="—" />
        </Field>
      </div>

      {customer.terms === 'เครดิต' ? (
        <div className="card" style={{ padding: 12, background: 'var(--kpc-primary-50)', border: '1px solid var(--kpc-primary-100)', borderRadius: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--kpc-text-strong)' }}><strong>เงื่อนไขเครดิต</strong></div>
          <div className="grid g-2" style={{ gap: 12 }}>
            <Field label="จำนวนวันเครดิต" hint={`ปล่อยว่างเพื่อใช้ค่าเริ่มต้น ${DEFAULT_CREDIT_DAYS} วัน`}>
              <Input type="number" min={1} max={120} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} placeholder={String(DEFAULT_CREDIT_DAYS)} />
            </Field>
            <Field label="วงเงินเครดิต (บาท)" hint="ปล่อยว่าง = ไม่จำกัด/ยังไม่กำหนด">
              <Input type="number" min={0} step={1000} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="เช่น 100000" />
            </Field>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 8 }}>
          * ลูกค้า "{customer.terms}" ไม่มีเครดิต — ถ้าต้องการเปลี่ยนเป็นลูกค้าเครดิต กรุณาแก้เงื่อนไขฐานก่อน
        </div>
      )}
    </Modal>
  )
}

function Info({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="stack" style={{ gap: 3 }}>
      <span style={{ fontSize: 12, color: 'var(--kpc-text-faint)' }}>{k}</span>
      <span className={mono ? 'mono' : 'th'} style={{ fontSize: 14, color: 'var(--kpc-text-strong)' }}>{v}</span>
    </div>
  )
}
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{k}</span>
      <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{v}</span>
    </div>
  )
}
