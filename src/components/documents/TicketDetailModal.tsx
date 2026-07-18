import { Modal } from '../Modal'
import { Button, Badge, type Tone } from '../ui'
import { type DeliveryTicket, PRODUCT_MAP, VEHICLE_MAP, pickupLabel, SELF_PICKUP_DISCOUNT_PER_M3 } from '../../data/real'
import { baht, qm, monthLabel } from '../../data/selectors'

const TYPE_TONE: Record<string, Tone> = { ขายลูกค้า: 'info', โรงหล่อ: 'neutral', ใช้เอง: 'warning' }
const PAY_TONE: Record<string, Tone> = { เครดิต: 'warning', เงินสด: 'success', โอน: 'info', เช็ค: 'warning' }

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, fontSize: 14, padding: '8px 0', borderBottom: '1px solid var(--kpc-border)' }}>
      <span style={{ color: 'var(--kpc-text-muted)' }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}

export function TicketDetailModal({
  open,
  ticket,
  onClose,
  onIssueInvoice,
}: {
  open: boolean
  ticket: DeliveryTicket | null
  onClose: () => void
  onIssueInvoice: (t: DeliveryTicket) => void
}) {
  if (!ticket) return null
  const prod = PRODUCT_MAP[ticket.prod]
  return (
    <Modal
      open={open}
      title={`ใบจ่ายคอนกรีต · ${ticket.dtNo}`}
      onClose={onClose}
      maxWidth={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="primary" onClick={() => onIssueInvoice(ticket)}>ออกใบกำกับภาษีจากใบจ่ายนี้</Button>
        </>
      }
    >
      <div>
        <Row k="เลขที่ใบจ่าย" v={<span className="mono">{ticket.dtNo}</span>} />
        <Row k="Ref" v={<span className="mono">{ticket.ref || '—'}</span>} />
        <Row k="วันที่" v={<span className="mono">{ticket.date}</span>} />
        <Row k="งวด" v={monthLabel(ticket.month)} />
        <Row k="ประเภท" v={<Badge tone={TYPE_TONE[ticket.type] ?? 'neutral'} square pip={false}>{ticket.type}</Badge>} />
        {ticket.type === 'ขายลูกค้า' && (
          <Row k="การรับของ" v={ticket.pickup === 'รับเอง'
            ? <Badge tone="warning" square pip={false}>ลูกค้ามารับเอง · หัก {SELF_PICKUP_DISCOUNT_PER_M3}/คิว</Badge>
            : ticket.pickup === 'จัดส่งละเว้นค่าขนส่ง'
              ? <Badge tone="info" square pip={false}>{pickupLabel(ticket.pickup)}</Badge>
              : <Badge tone="neutral" square pip={false}>{pickupLabel(ticket.pickup)}</Badge>} />
        )}
        <Row k="ลูกค้า / หน่วยงาน" v={ticket.customer} />
        <Row k="สินค้า" v={<>
          <span className="mono">{ticket.prod}</span>{prod && <span style={{ color: 'var(--kpc-text-muted)', marginLeft: 8 }}>— {prod.name}</span>}
        </>} />
        <Row k="ปริมาณ" v={<span className="mono">{qm(ticket.m3)} {prod?.unit ?? 'คิว'}</span>} />
        <Row k="หมายเลขรถ" v={(() => {
          if (!ticket.vehicle) return <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>
          const v = VEHICLE_MAP[ticket.vehicle]
          return (
            <span>
              <span className="mono">รถ {ticket.vehicle}</span>
              {v && <span style={{ color: 'var(--kpc-text-muted)', marginLeft: 8 }}>(สูงสุด {v.maxM3} คิว)</span>}
            </span>
          )
        })()} />
        <Row k="พนักงานจัดส่ง" v={(() => {
          /* Prefer the driver snapshot saved on the ticket; fall back to the
             current vehicle master when the ticket pre-dates the snapshot. */
          const driver = ticket.driver || (ticket.vehicle ? VEHICLE_MAP[ticket.vehicle]?.driver : '')
          return driver
            ? <span>{driver}</span>
            : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>
        })()} />
        <Row k="ราคา/หน่วย" v={ticket.price ? <span className="mono">{ticket.price.toLocaleString()}</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>— (กำหนดตอนออกใบกำกับ)</span>} />
        <Row k="จำนวนเงิน" v={ticket.amount ? <span className="mono">{baht(ticket.amount)}</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
        <Row k="วิธีชำระ" v={ticket.pay ? <Badge tone={PAY_TONE[ticket.pay] ?? 'neutral'} pip={false} square>{ticket.pay}</Badge> : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
        <Row k="ใบกำกับอ้างอิง" v={ticket.invoice ? <span className="mono">{ticket.invoice}</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>ยังไม่ออกใบกำกับ</span>} />
        <Row k="ใบวางบิลอ้างอิง" v={ticket.billing ? <span className="mono">{ticket.billing}</span> : <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
        <Row k="หมายเหตุ" v={ticket.note || <span style={{ color: 'var(--kpc-text-muted)' }}>—</span>} />
      </div>
    </Modal>
  )
}
