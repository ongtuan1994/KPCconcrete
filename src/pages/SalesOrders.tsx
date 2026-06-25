import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Select, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard, ChartCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { qm } from '../data/selectors'
import { PRODUCTS } from '../data/real'
import { useCreatedDocs, removeSalesOrder, CAN_DELETE, type SalesOrder, type SalesOrderStatus } from '../data/createdDocs'
import { NewSalesOrderForm } from '../components/documents/NewSalesOrderForm'
import { type DeliveryTicketInitial } from '../components/documents/NewDeliveryTicketForm'
import { downloadCsv } from '../utils/csv'

/** Render an ISO yyyy-mm-dd as Thai-style dd/mm/yyyy (Buddhist year). */
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

const STATUS_TONE: Record<SalesOrderStatus, Tone> = { รอผลิต: 'warning', ผลิต: 'success' }

const itemsSummary = (so: SalesOrder) =>
  so.items.map((it) => `${it.code} × ${qm(it.qty)} ${it.unit}`).join(', ')

const orderVolume = (so: SalesOrder) => so.items.reduce((s, it) => s + it.qty, 0)

export function SalesOrders() {
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SalesOrder | null>(null)
  const [active, setActive] = useState<SalesOrder | null>(null)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* Issue a delivery ticket from a sales order: jump to the delivery-tickets
     page with the create form pre-filled. Delivery tickets are one product
     each, so we seed the first concrete (non-precast) line; the user can
     adjust the product/quantity and confirm. */
  const issueTicket = (so: SalesOrder) => {
    const firstConcrete = so.items.find((it) => {
      const p = PRODUCTS.find((x) => x.code === it.code)
      return p && p.category !== 'precast'
    }) ?? so.items[0]
    const initial: DeliveryTicketInitial = {
      type: 'ขายลูกค้า',
      customer: so.customer,
      prodCode: firstConcrete?.code,
      m3: firstConcrete ? String(firstConcrete.qty) : undefined,
      note: `อ้างอิงใบสั่งขาย ${so.soNo} · ลูกค้าใช้ ${fmtDate(so.useDate)}${so.note ? ` · ${so.note}` : ''}`,
    }
    navigate('/delivery-tickets', { state: { issueFromSalesOrder: initial, salesOrderNo: so.soNo } })
  }

  const all = created.salesOrders

  const rows = useMemo(
    () =>
      all.filter((so) => {
        if (!query) return true
        const hay = `${so.soNo} ${so.customer} ${so.items.map((i) => `${i.code} ${i.name}`).join(' ')} ${so.note ?? ''}`.toLowerCase()
        return hay.includes(query.toLowerCase())
      }),
    [all, query],
  )

  const totalOrders = all.length
  const totalVolume = all.reduce((s, so) => s + orderVolume(so), 0)
  const withAttachment = all.filter((so) => so.attachment).length

  const exportExcel = () => {
    const head = ['เลขที่ใบสั่งขาย', 'วันที่สั่ง', 'วันที่ลูกค้าใช้', 'ลูกค้า', 'รายการสินค้า', 'ปริมาณรวม', 'สถานะ', 'มีไฟล์แนบ', 'หมายเหตุ']
    const body = rows.map((so) => [
      so.soNo, fmtDate(so.orderDate), fmtDate(so.useDate), so.customer,
      itemsSummary(so), orderVolume(so), so.status, so.attachment ? 'มี' : '', so.note ?? '',
    ])
    downloadCsv('sales-orders', [head, ...body])
  }

  const columns: Column<SalesOrder>[] = [
    { key: 'so', header: 'เลขที่ใบสั่งขาย', cell: (r) => <span className="mono">{r.soNo}</span>, className: 'docno' },
    { key: 'odate', header: 'วันที่สั่ง', cell: (r) => fmtDate(r.orderDate), className: 'date' },
    { key: 'udate', header: 'วันที่ลูกค้าใช้', cell: (r) => (r.useDate ? fmtDate(r.useDate) : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>), className: 'date' },
    { key: 'cust', header: 'ลูกค้า / หน่วยงาน', cell: (r) => r.customer },
    {
      key: 'items',
      header: 'รายการสินค้า',
      cell: (r) => (
        <span>
          <Badge tone="info" pip={false} square>{r.items.length} รายการ</Badge>{' '}
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{qm(orderVolume(r))} คิว</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      align: 'center',
      cell: (r) => <Badge tone={STATUS_TONE[r.status]} pip={false} square>{r.status}</Badge>,
    },
    {
      key: 'att',
      header: 'ไฟล์แนบ',
      align: 'center',
      cell: (r) => (r.attachment ? <Badge tone="success" pip={false} square>มี</Badge> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    { key: 'edit', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>แก้ไข</Button> },
    ...(CAN_DELETE ? [{
      key: 'del',
      header: '',
      align: 'center' as const,
      cell: (r: SalesOrder) => (
        <Button variant="ghost" size="sm" onClick={() => {
          if (confirm(`ลบใบสั่งขาย ${r.soNo} ?`)) removeSalesOrder(r.soNo)
        }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ใบสั่งขาย"
        sub={`Sales Orders · ${totalOrders} ใบ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <IconPlus /> บันทึกใบสั่งขาย
            </Button>
          </>
        }
      />

      <div className="grid g-4" style={{ marginBottom: 24 }}>
        <KpiCard label="ใบสั่งขาย · Orders" value={totalOrders.toString()} note="ใบ" />
        <KpiCard label="ปริมาณรวม · Volume" value={qm(Math.round(totalVolume))} unit="m³" note="ที่ลูกค้าสั่งล่วงหน้า" />
        <KpiCard label="มีใบสั่งซื้อแนบ" value={`${withAttachment}/${totalOrders}`} note="หลักฐานจากลูกค้า" invert />
      </div>

      {totalOrders > 0 && (
        <div style={{ marginBottom: 24 }}>
          <MonthlyStatusChart orders={all} />
        </div>
      )}

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="เลขที่ใบสั่งขาย / ลูกค้า / สินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {all.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีใบสั่งขาย — กด <strong>“บันทึกใบสั่งขาย”</strong> เพื่อสร้างรายการแรก
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ใบ`} />
      )}

      <NewSalesOrderForm
        open={showForm || !!editing}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSaved={(so) => {
          setShowForm(false)
          setEditing(null)
          setQuery(so.soNo)
        }}
      />

      <SalesOrderDetail
        order={active}
        onClose={() => setActive(null)}
        onEdit={(so) => { setActive(null); setEditing(so) }}
        onIssueTicket={issueTicket}
      />
    </>
  )
}

function SalesOrderDetail({ order, onClose, onEdit, onIssueTicket }: { order: SalesOrder | null; onClose: () => void; onEdit: (so: SalesOrder) => void; onIssueTicket: (so: SalesOrder) => void }) {
  if (!order) return null
  const isImage = order.attachment?.type.startsWith('image/')
  return (
    <Modal
      open={!!order}
      title={`ใบสั่งขาย ${order.soNo}`}
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="tonal" onClick={() => onEdit(order)}>แก้ไขรายการ</Button>
          <Button variant="primary" onClick={() => onIssueTicket(order)}>ออกใบจ่ายคอนกรีต</Button>
        </>
      }
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge tone={STATUS_TONE[order.status]} pip={false} square>{order.status}</Badge>
      </div>
      <div className="grid g-2" style={{ gap: 12, marginBottom: 16 }}>
        <Field label="ลูกค้า / หน่วยงาน" value={order.customer} full />
        <Field label="วันที่สั่ง" value={fmtDate(order.orderDate)} />
        <Field label="วันที่ลูกค้าใช้" value={order.useDate ? fmtDate(order.useDate) : '—'} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)', marginBottom: 8 }}>รายการสินค้า</div>
        <table className="table" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>รหัส</th>
              <th style={{ textAlign: 'left' }}>ชื่อสินค้า</th>
              <th style={{ textAlign: 'right' }}>จำนวน</th>
              <th style={{ textAlign: 'left' }}>หน่วย</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i}>
                <td className="mono">{it.code}</td>
                <td>{it.name}</td>
                <td style={{ textAlign: 'right' }} className="mono">{qm(it.qty)}</td>
                <td>{it.unit}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ fontWeight: 600 }}>ปริมาณรวม</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{qm(orderVolume(order))}</td>
              <td>คิว</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.note && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)', marginBottom: 4 }}>หมายเหตุ</div>
          <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{order.note}</div>
        </div>
      )}

      {order.attachment && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)', marginBottom: 8 }}>
            ใบสั่งซื้อของลูกค้า (หลักฐาน)
          </div>
          {isImage ? (
            <img src={order.attachment.dataUrl} alt={order.attachment.name} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--kpc-border)' }} />
          ) : (
            <a href={order.attachment.dataUrl} download={order.attachment.name} target="_blank" rel="noreferrer">
              <Button variant="tonal" size="sm">เปิด / ดาวน์โหลด {order.attachment.name}</Button>
            </a>
          )}
        </div>
      )}
    </Modal>
  )
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WAITING_COLOR = '#F59E0B' /* amber — matches the 'รอผลิต' badge */
const PRODUCED_COLOR = '#16A34A' /* green — matches the 'ผลิต' badge */

/** Grouped vertical bar chart: orders per month split by status (รอผลิต vs ผลิต),
    with a Buddhist-year dropdown. X-axis = Jan…Dec. */
function MonthlyStatusChart({ orders }: { orders: SalesOrder[] }) {
  /* Buddhist years present in the data (by customer-use date), plus the current
     year, newest first. */
  const years = useMemo(() => {
    const set = new Set<number>()
    for (const o of orders) {
      const g = parseInt(o.useDate.slice(0, 4), 10)
      if (g) set.add(g + 543)
    }
    set.add(new Date().getFullYear() + 543)
    return [...set].sort((a, b) => b - a)
  }, [orders])

  const [year, setYear] = useState<number>(years[0])
  /* Fall back to the newest year if the selected one drops out of the data. */
  const activeYear = years.includes(year) ? year : years[0]
  const gregYear = activeYear - 543

  /* Y-axis = total ordered concrete volume (คิว) per month, split by status.
     Grouped by the customer-use date (วันที่ลูกค้าใช้). */
  const monthly = useMemo(
    () =>
      MONTH_LABELS.map((_, i) => {
        const inMonth = orders.filter((o) => {
          const g = parseInt(o.useDate.slice(0, 4), 10)
          const m = parseInt(o.useDate.slice(5, 7), 10)
          return g === gregYear && m === i + 1
        })
        const sumVol = (status: SalesOrderStatus) =>
          inMonth.filter((o) => o.status === status).reduce((s, o) => s + orderVolume(o), 0)
        return { waiting: sumVol('รอผลิต'), produced: sumVol('ผลิต') }
      }),
    [orders, gregYear],
  )

  const max = Math.max(1, ...monthly.map((m) => Math.max(m.waiting, m.produced)))
  const H = 150 /* px height of the tallest bar */

  return (
    <ChartCard
      title="ปริมาณคอนกรีตที่สั่งรายเดือน"
      meta="ตามวันที่ลูกค้าใช้ · หน่วย: คิว (m³)"
      right={
        <div style={{ width: 150 }}>
          <Select value={String(activeYear)} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
          </Select>
        </div>
      }
    >
      {/* Legend */}
      <div className="row" style={{ gap: 18, fontSize: 12, color: 'var(--kpc-text-muted)' }}>
        <span className="row" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: WAITING_COLOR, display: 'inline-block' }} /> รอผลิต
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: PRODUCED_COLOR, display: 'inline-block' }} /> ผลิต
        </span>
      </div>

      {/* Y-axis (คิว) + bars */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: H, fontSize: 10, color: 'var(--kpc-text-faint)', textAlign: 'right', minWidth: 32 }}>
          <span>{qm(Math.round(max))}</span>
          <span>{qm(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 4, height: H + 4, borderLeft: '1px solid var(--kpc-border)', borderBottom: '1px solid var(--kpc-border)' }}>
          {monthly.map((m, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: H }}>
                <div
                  style={{ width: 9, height: Math.round((m.waiting / max) * H), minHeight: m.waiting ? 2 : 0, background: WAITING_COLOR, borderRadius: '2px 2px 0 0' }}
                  title={`${MONTH_LABELS[i]} · รอผลิต ${qm(m.waiting)} คิว`}
                />
                <div
                  style={{ width: 9, height: Math.round((m.produced / max) * H), minHeight: m.produced ? 2 : 0, background: PRODUCED_COLOR, borderRadius: '2px 2px 0 0' }}
                  title={`${MONTH_LABELS[i]} · ผลิต ${qm(m.produced)} คิว`}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>{MONTH_LABELS[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}

/** Compact read-only field used inside the detail modal. */
function Field({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className="field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center' }}>{value}</div>
    </div>
  )
}
