import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, SearchInput, type Tone } from '../components/ui'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { IconPlus } from '../components/icons'
import { CUSTOMER_MASTER, DELIVERY_TICKETS, type Customer } from '../data/real'
import { baht, qm, prodShort, customerAgg } from '../data/selectors'

type Filter = 'all' | 'registered' | 'ขายลูกค้า' | 'โรงหล่อ'

const TYPE_TONE: Record<string, Tone> = { ขายลูกค้า: 'info', โรงหล่อ: 'neutral', ใช้เอง: 'warning' }

const AGG_ALL = customerAgg('all')
const aggOf = (name: string) => AGG_ALL.find((a) => a.name === name)

export function CustomerMaster() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Customer | null>(null)

  const rows = useMemo(
    () =>
      CUSTOMER_MASTER.filter((c) => {
        if (filter === 'registered' && (!c.taxId || c.taxId === '—')) return false
        if ((filter === 'ขายลูกค้า' || filter === 'โรงหล่อ') && c.type !== filter) return false
        if (query && !`${c.name} ${c.legalName} ${c.taxId}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }).sort((a, b) => (aggOf(b.name)?.sales ?? 0) - (aggOf(a.name)?.sales ?? 0)),
    [filter, query],
  )

  const registered = CUSTOMER_MASTER.filter((c) => c.taxId && c.taxId !== '—').length

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
    { key: 'type', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={TYPE_TONE[r.type] ?? 'neutral'} square pip={false}>{r.type}</Badge> },
    { key: 'terms', header: 'เงื่อนไข', align: 'center', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.terms}</span> },
    { key: 'tax', header: 'เลขภาษี', cell: (r) => (r.taxId && r.taxId !== '—' ? <span className="mono" style={{ fontSize: 13 }}>{r.taxId}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>ยังไม่ระบุ</span>) },
    { key: 'sales', header: 'ยอดซื้อสะสม', align: 'right', cell: (r) => <span className="amt mono">{baht(aggOf(r.name)?.sales ?? 0)}</span> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>รายละเอียด</Button> },
  ]

  return (
    <>
      <PageHeader
        title="ทะเบียนลูกค้า"
        sub="Customer Master · ข้อมูลลูกค้าและผู้เสียภาษี"
        actions={
          <Button variant="primary">
            <IconPlus /> เพิ่มลูกค้า
          </Button>
        }
      />
      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="ลูกค้าทั้งหมด · Customers" value={CUSTOMER_MASTER.length.toString()} note="ราย" />
        <KpiCard label="มีเลขผู้เสียภาษี · Registered" value={registered.toString()} note="พร้อมออกใบกำกับ" />
        <KpiCard label="รอเพิ่มข้อมูล · Incomplete" value={(CUSTOMER_MASTER.length - registered).toString()} note="ยังไม่ระบุเลขภาษี" invert />
      </div>
      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>ทั้งหมด {CUSTOMER_MASTER.length}</Pill>
          <Pill active={filter === 'registered'} onClick={() => setFilter('registered')}>มีเลขภาษี {registered}</Pill>
          <Pill active={filter === 'ขายลูกค้า'} onClick={() => setFilter('ขายลูกค้า')}>ขายลูกค้า</Pill>
          <Pill active={filter === 'โรงหล่อ'} onClick={() => setFilter('โรงหล่อ')}>โรงหล่อ/ภายใน</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="ชื่อ / นิติบุคคล / เลขภาษี" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={10} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ลูกค้า`} />

      <CustomerDetail customer={active} onClose={() => setActive(null)} />
    </>
  )
}

function CustomerDetail({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  if (!customer) return null
  const agg = aggOf(customer.name)
  const history = DELIVERY_TICKETS.filter((t) => t.customer === customer.name).slice(-8).reverse()
  return (
    <Modal open={!!customer} title={`ลูกค้า ${customer.id}`} onClose={onClose} maxWidth={640}
      footer={<><Button variant="secondary" onClick={onClose}>ปิด</Button><Button variant="primary">แก้ไขข้อมูล</Button></>}>
      <div className="stack" style={{ gap: 18 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{customer.legalName || customer.name}</span>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>หน่วยงาน: {customer.name}</span>
        </div>
        <div className="grid g-2" style={{ gap: 12 }}>
          <Info k="ประเภท" v={customer.type} />
          <Info k="เงื่อนไขชำระ" v={customer.terms} />
          <Info k="เลขผู้เสียภาษี" v={customer.taxId && customer.taxId !== '—' ? customer.taxId : 'ยังไม่ระบุ'} mono />
          <Info k="ที่อยู่" v={customer.address && customer.address !== '—' ? customer.address : 'ยังไม่ระบุ'} />
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
