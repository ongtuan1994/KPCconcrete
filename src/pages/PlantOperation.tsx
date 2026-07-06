import { useMemo } from 'react'
import { PageHeader } from '../components/Layout'
import { Badge } from '../components/ui'
import { KpiCard } from '../components/charts'
import { qm, baht } from '../data/selectors'
import { useCreatedDocs } from '../data/createdDocs'
import { plantLiveBalances, stockStatus } from '../data/plantStock'
import { ticketISO } from '../data/truckTripFee'
import { DELIVERY_TICKETS, VEHICLES, type StockMaterial } from '../data/real'

/** Today's date as ISO "YYYY-MM-DD" (local). */
function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* ─────────────────────────────────────────────────────────────────────────────
   Plant Operation — a schematic overview of the concrete batching plant. Each
   vessel shows its live remaining quantity from คลังวัตถุดิบแพล้นปูน, coloured by
   status: เขียว = พอเพียง · เหลือง = ใกล้หมด · แดง = ติดลบ / หมด.
   ───────────────────────────────────────────────────────────────────────────── */

type Tone = 'success' | 'warning' | 'danger' | 'neutral'
const SV: Record<Tone, { bg: string; stroke: string; text: string; solid: string }> = {
  success: { bg: '#dcfce7', stroke: '#16a34a', text: '#15803d', solid: '#22c55e' },
  warning: { bg: '#fef9c3', stroke: '#d97706', text: '#b45309', solid: '#f59e0b' },
  danger: { bg: '#fee2e2', stroke: '#dc2626', text: '#b91c1c', solid: '#ef4444' },
  neutral: { bg: '#eef2f7', stroke: '#94a3b8', text: '#475569', solid: '#cbd5e1' },
}

/** A rounded status pill (SVG) showing the remaining quantity. */
function Chip({ x, y, text, tone }: { x: number; y: number; text: string; tone: Tone }) {
  const c = SV[tone]
  const w = Math.max(52, text.length * 7 + 14)
  return (
    <g>
      <rect x={x - w / 2} y={y - 13} width={w} height={26} rx={13} fill={c.bg} stroke={c.stroke} strokeWidth={1.6} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13.5} fontWeight={800} fill={c.text} style={{ fontFamily: 'var(--kpc-mono, ui-monospace, monospace)' }}>{text}</text>
    </g>
  )
}

/** Equipment name + optional English sub-label, centred. */
function EqLabel({ x, y, top, sub }: { x: number; y: number; top: string; sub?: string }) {
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="var(--kpc-text-strong)">{top}</text>
      {sub && <text x={x} y={y + 14} textAnchor="middle" fontSize={10} fill="var(--kpc-text-faint)">{sub}</text>}
    </g>
  )
}

/** A vertical cement silo (cylinder + discharge cone + legs). Always grey — the
    status colour lives on the quantity chip, not the vessel. */
function Silo({ x, topY, w, bodyH }: { x: number; topY: number; w: number; bodyH: number }) {
  const c = SV.neutral
  const left = x - w / 2, right = x + w / 2
  const bodyBottom = topY + bodyH
  const coneH = 30
  const coneBottom = bodyBottom + coneH
  return (
    <g>
      {/* support legs */}
      <line x1={left + 8} y1={bodyBottom} x2={left - 6} y2={coneBottom + 18} stroke="#9aa3af" strokeWidth={3} />
      <line x1={right - 8} y1={bodyBottom} x2={right + 6} y2={coneBottom + 18} stroke="#9aa3af" strokeWidth={3} />
      {/* body */}
      <rect x={left} y={topY} width={w} height={bodyH} rx={4} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
      {/* top cap */}
      <ellipse cx={x} cy={topY} rx={w / 2} ry={10} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
      {/* discharge cone */}
      <polygon points={`${left},${bodyBottom} ${right},${bodyBottom} ${x + 13},${coneBottom} ${x - 13},${coneBottom}`} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
      <rect x={x - 9} y={coneBottom} width={18} height={11} fill={c.solid} stroke={c.stroke} strokeWidth={1.5} />
    </g>
  )
}

/** An aggregate storage bin (trapezoid hopper with discharge gate). Always grey. */
function Bin({ x, topY, topW, botW, bodyH }: { x: number; topY: number; topW: number; botW: number; bodyH: number }) {
  const c = SV.neutral
  const tl = x - topW / 2, tr = x + topW / 2
  const bl = x - botW / 2, br = x + botW / 2
  const by = topY + bodyH
  return (
    <g>
      <line x1={tl + 6} y1={by} x2={tl + 6} y2={by + 30} stroke="#9aa3af" strokeWidth={3} />
      <line x1={tr - 6} y1={by} x2={tr - 6} y2={by + 30} stroke="#9aa3af" strokeWidth={3} />
      <polygon points={`${tl},${topY} ${tr},${topY} ${br},${by} ${bl},${by}`} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
      <rect x={x - 10} y={by} width={20} height={12} fill={c.solid} stroke={c.stroke} strokeWidth={1.5} />
    </g>
  )
}

/** A small dosing/liquid tank (cylinder). Always grey. */
function Tank({ x, topY, w, h }: { x: number; topY: number; w: number; h: number }) {
  const c = SV.neutral
  return (
    <g>
      <rect x={x - w / 2} y={topY} width={w} height={h} rx={6} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
      <ellipse cx={x} cy={topY} rx={w / 2} ry={7} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
      <ellipse cx={x} cy={topY + h} rx={w / 2} ry={7} fill={c.bg} stroke={c.stroke} strokeWidth={2} />
    </g>
  )
}

/** Side-view concrete mixer truck illustration (drum + cab + wheels). White-bodied;
    `big` trucks (10-ล้อ 6-คิว) render larger than the smaller 6-ล้อ ones. */
function MixerTruck({ big }: { big?: boolean }) {
  const body = '#ffffff'
  const edge = '#94a3b8'
  return (
    <svg viewBox="0 0 168 86" width={big ? '98%' : '66%'} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', margin: '0 auto' }} role="img" aria-label="รถโม่คอนกรีต">
      {/* chassis */}
      <rect x={14} y={58} width={140} height={6} rx={2} fill="#64748b" />
      {/* mixing drum (tilted barrel) — white */}
      <g transform="rotate(-6 82 42)">
        <rect x={40} y={24} width={82} height={34} rx={17} fill={body} stroke={edge} strokeWidth={2} />
        <ellipse cx={122} cy={41} rx={9} ry={17} fill="#f1f5f9" stroke={edge} strokeWidth={2} />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={52 + i * 18} y1={25} x2={44 + i * 18} y2={57} stroke={edge} strokeWidth={2} opacity={0.5} />
        ))}
      </g>
      {/* discharge chute (back-left) */}
      <polygon points="20,44 40,48 34,62 20,58" fill="#cbd5e1" stroke={edge} strokeWidth={1} />
      {/* cab (front-right) — white */}
      <rect x={128} y={34} width={28} height={26} rx={4} fill={body} stroke={edge} strokeWidth={2} />
      <rect x={132} y={38} width={16} height={12} rx={2} fill="#dbeafe" />
      {/* wheels */}
      {[40, 112, 140].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={68} r={11} fill="#1f2937" />
          <circle cx={cx} cy={68} r={4.5} fill="#9aa3af" />
        </g>
      ))}
    </svg>
  )
}

/** One mixer-truck number card — shows จำนวนรอบการขนส่ง for the truck. */
function TruckCard({ id, plate, driver, maxM3, trips }: { id: string; plate: string; driver: string; maxM3: number; trips: number }) {
  return (
    <div className="card stack" style={{ gap: 8, padding: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>รถ {id}</span>
        <Badge tone="neutral" square>{maxM3} คิว</Badge>
      </div>
      <MixerTruck big={maxM3 >= 6} />
      <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
        <span className="mono" style={{ fontSize: 30, fontWeight: 800, color: 'var(--kpc-primary-ink, #3730a3)', lineHeight: 1 }}>{qm(trips)}</span>
        <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>รอบ</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>จำนวนรอบการขนส่งวันนี้</span>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, color: 'var(--kpc-text-faint)', borderTop: '1px solid var(--kpc-border-soft, #f1f5f9)', paddingTop: 8 }}>
        <span className="mono">{plate}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{driver}</span>
      </div>
    </div>
  )
}

export function PlantOperation() {
  const created = useCreatedDocs()
  const materials = plantLiveBalances(created)
  const byCode = useMemo(() => Object.fromEntries(materials.map((m) => [m.code, m])) as Record<string, StockMaterial>, [materials])

  /** Live figure + tone for a material code. */
  const info = (code: string) => {
    const m = byCode[code]
    if (!m) return { tone: 'neutral' as Tone, text: '—', name: code, th: '' }
    const s = stockStatus(m)
    return { tone: s.tone as Tone, text: `${qm(m.balance)} ${m.unit}`, name: m.name, th: s.th }
  }

  const low = materials.filter((m) => stockStatus(m).tone === 'warning').length
  const out = materials.filter((m) => stockStatus(m).tone === 'danger').length
  const updated = new Date().toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const cemD = info('CEM-2')   // ปูนดอกบัว
  const cemS = info('CEM-1')   // ปูน SCG
  const san = info('SAN')      // ทรายหยาบ
  const agg = info('AGG')      // หิน 3/4"
  const admD = info('ADM-D')   // Plastomix-704
  const admF = info('ADM-F')   // PCE-1 Gold 500 SF

  /* จำนวนรอบการขนส่งวันนี้ per mixer truck — TODAY's customer (ขายลูกค้า) delivery
     tickets attributed to each vehicle (seed + created, excluding hidden). Same
     truck attribution as the บันทึกเที่ยวรถโม่ page. */
  const today = todayIso()
  const todayLabel = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })

  /* Today's concrete delivered, split by channel: ขายลูกค้า (customer) vs
     โรงหล่อ (foundry). Sums คิว, ใบจ่าย count and ฿ from today's tickets. */
  const todaySales = useMemo(() => {
    const hidden = new Set(created.hidden.tickets)
    const acc = { cust: { m3: 0, tickets: 0, amount: 0 }, foundry: { m3: 0, tickets: 0, amount: 0 } }
    for (const t of [...created.tickets, ...DELIVERY_TICKETS]) {
      if (hidden.has(t.dtNo) || ticketISO(t.date) !== today) continue
      const b = t.type === 'ขายลูกค้า' ? acc.cust : t.type === 'โรงหล่อ' ? acc.foundry : null
      if (!b) continue
      b.m3 += t.m3 || 0
      b.tickets += 1
      b.amount += t.amount || 0
    }
    return acc
  }, [created.tickets, created.hidden.tickets, today])
  const r2 = (n: number) => Math.round(n * 100) / 100

  const tripsByTruck = useMemo(() => {
    const m: Record<string, number> = { '001': 0, '002': 0, '003': 0, '004': 0 }
    const hidden = new Set(created.hidden.tickets)
    for (const t of [...created.tickets, ...DELIVERY_TICKETS]) {
      if (hidden.has(t.dtNo) || t.type !== 'ขายลูกค้า') continue
      if (ticketISO(t.date) !== today) continue
      if (t.vehicle && m[t.vehicle] != null) m[t.vehicle] += 1
    }
    return m
  }, [created.tickets, created.hidden.tickets, today])
  const totalTrips = VEHICLES.reduce((s, v) => s + (tripsByTruck[v.id] ?? 0), 0)

  return (
    <>
      <PageHeader
        title="Today Operation"
        sub="การดำเนินงานวันนี้ · ยอดขายคอนกรีตวันนี้ · ผังโรงงาน — ปริมาณคงเหลือจากคลังวัตถุดิบแพล้นปูน"
        actions={
          <>
            <Badge tone={out > 0 ? 'danger' : low > 0 ? 'warning' : 'success'}>
              {out > 0 ? `ติดลบ/หมด ${out} รายการ` : low > 0 ? `ใกล้หมด ${low} รายการ` : 'วัตถุดิบพอเพียง'}
            </Badge>
          </>
        }
      />

      {/* Legend */}
      <div className="row wrap" style={{ gap: 18, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12.5, color: 'var(--kpc-text-muted)', fontWeight: 600 }}>สถานะวัตถุดิบ :</span>
        {([['success', 'พอเพียง'], ['warning', 'ใกล้หมด'], ['danger', 'ติดลบ / หมด']] as [Tone, string][]).map(([t, label]) => (
          <span key={t} className="row" style={{ gap: 7, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: SV[t].solid, border: `1.5px solid ${SV[t].stroke}` }} />
            <span style={{ color: 'var(--kpc-text)' }}>{label}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--kpc-text-faint)' }}>อ้างอิงยอด ณ {updated}</span>
      </div>

      {/* Today's concrete sold — customer vs foundry */}
      <div className="grid g-2" style={{ marginBottom: 20 }}>
        <KpiCard
          label="ขายลูกค้าวันนี้ · Sold to customer"
          value={qm(r2(todaySales.cust.m3))}
          unit="คิว"
          note={`${todaySales.cust.tickets} ใบจ่าย · ${baht(todaySales.cust.amount)}`}
        />
        <KpiCard
          label="โรงหล่อวันนี้ · Sold to foundry"
          value={qm(r2(todaySales.foundry.m3))}
          unit="คิว"
          note={`${todaySales.foundry.tickets} ใบจ่าย · ${baht(todaySales.foundry.amount)}`}
          invert
        />
      </div>

      <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
        <svg viewBox="0 0 1180 272" width="100%" style={{ minWidth: 980, display: 'block' }} role="img" aria-label="ผังการทำงานแพล้นปูน">
          <defs>
            <marker id="po-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L7,3 L0,6 Z" fill="#9aa3af" />
            </marker>
          </defs>

          {/* ── Flow: each vessel drops into the collection manifold, which
                 discharges to the mixer trucks (drawn behind equipment) ── */}
          {/* cement silos (screw conveyors) */}
          <path d="M82,167 L82,210" fill="none" stroke="#9aa3af" strokeWidth={7} strokeLinecap="round" opacity={0.5} />
          <path d="M228,167 L228,210" fill="none" stroke="#9aa3af" strokeWidth={7} strokeLinecap="round" opacity={0.5} />
          {/* aggregate bins */}
          <path d="M868,144 L868,210" fill="none" stroke="#9aa3af" strokeWidth={6} />
          <path d="M1070,144 L1070,210" fill="none" stroke="#9aa3af" strokeWidth={6} />
          {/* admixture + water dosing */}
          <path d="M386,114 L386,210" fill="none" stroke="#9aa3af" strokeWidth={3} strokeDasharray="5 4" />
          <path d="M556,114 L556,210" fill="none" stroke="#9aa3af" strokeWidth={3} strokeDasharray="5 4" />
          <path d="M704,114 L704,210" fill="none" stroke="#60a5fa" strokeWidth={3} strokeDasharray="5 4" />
          {/* collection manifold + central discharge to trucks */}
          <path d="M82,210 L1070,210" fill="none" stroke="#9aa3af" strokeWidth={6} strokeLinecap="round" />
          <path d="M576,210 L576,244" fill="none" stroke="#9aa3af" strokeWidth={7} markerEnd="url(#po-arrow)" />
          <text x={576} y={262} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--kpc-text-muted)">จ่ายลงรถโม่ · Discharge</text>

          {/* ── Cement Silos ── */}
          <Silo x={82} topY={56} w={84} bodyH={70} />
          <Chip x={82} y={32} text={cemD.text} tone={cemD.tone} />
          <EqLabel x={82} y={88} top="ปูนดอกบัว" sub="Silo · CEM-2" />

          <Silo x={228} topY={56} w={84} bodyH={70} />
          <Chip x={228} y={32} text={cemS.text} tone={cemS.tone} />
          <EqLabel x={228} y={88} top="ปูน SCG" sub="Silo · CEM-1" />

          {/* ── Admixture tanks (wide enough to contain the chemical name) ── */}
          <Tank x={386} topY={56} w={108} h={58} />
          <Chip x={386} y={35} text={admD.text} tone={admD.tone} />
          <EqLabel x={386} y={82} top="Plastomix-704" sub="น้ำยาหน่วง" />

          <Tank x={556} topY={56} w={108} h={58} />
          <Chip x={556} y={35} text={admF.text} tone={admF.tone} />
          <EqLabel x={556} y={82} top="PCE-1 Gold" sub="500 SF · เร่ง" />

          {/* ── Water tank (not stock-tracked) ── */}
          <g>
            <Tank x={704} topY={56} w={64} h={58} />
            <rect x={672} y={56} width={64} height={58} fill="#dbeafe" opacity={0.5} />
            <ellipse cx={704} cy={56} rx={32} ry={6} fill="#dbeafe" stroke="#60a5fa" strokeWidth={2} />
            <EqLabel x={704} y={82} top="ถังน้ำ" sub="Water Tank" />
          </g>

          {/* ── Aggregate bins (Materials Tank) ── */}
          <Bin x={868} topY={56} topW={140} botW={50} bodyH={76} />
          <Chip x={868} y={40} text={san.text} tone={san.tone} />
          <EqLabel x={868} y={92} top="ทรายหยาบ" sub="River sand" />

          <Bin x={1070} topY={56} topW={140} botW={50} bodyH={76} />
          <Chip x={1070} y={40} text={agg.text} tone={agg.tone} />
          <EqLabel x={1070} y={92} top={'หิน 3/4"'} sub="Aggregate" />
        </svg>
      </div>

      {/* ── Concrete mixer trucks — จำนวนรอบการขนส่งวันนี้ ── */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', margin: '22px 0 12px' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>รถโม่คอนกรีต · Concrete Mixer Trucks</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>วันนี้ {todayLabel} · รวม {qm(totalTrips)} รอบ</span>
      </div>
      <div className="grid g-4" style={{ gap: 16 }}>
        {VEHICLES.map((v) => (
          <TruckCard key={v.id} id={v.id} plate={v.plate} driver={v.driver} maxM3={v.maxM3} trips={tripsByTruck[v.id] ?? 0} />
        ))}
      </div>

      <p className="page-sub" style={{ marginTop: 12, fontSize: 12 }}>
        * ตัวเลขบนถัง/ไซโลแต่ละจุดคือ<strong>ปริมาณคงเหลือจริง</strong>จากเมนู “คลังวัตถุดิบแพล้นปูน” (ยอดตั้งต้น + รับเข้า + กระทบยอดที่อนุมัติ − จ่ายออกอัตโนมัติตามใบจ่ายคอนกรีต) —
        สี<span style={{ color: SV.success.text, fontWeight: 700 }}> เขียว</span> = พอเพียง,
        <span style={{ color: SV.warning.text, fontWeight: 700 }}> เหลือง</span> = ใกล้หมด (ต่ำกว่าจุดสั่งซื้อ),
        <span style={{ color: SV.danger.text, fontWeight: 700 }}> แดง</span> = ติดลบ / หมด · ถังน้ำไม่ได้ตัดสต๊อกในระบบ
      </p>
      <p className="page-sub" style={{ marginTop: 4, fontSize: 12 }}>
        * <strong>จำนวนรอบการขนส่งวันนี้</strong>ของรถโม่แต่ละคัน นับเฉพาะใบจ่ายคอนกรีต (ขายลูกค้า) ของวันนี้ ({todayLabel}) ที่ระบุรถทะเบียนนั้น — ตรงกับเมนู “บันทึกเที่ยวรถโม่”
      </p>
    </>
  )
}
