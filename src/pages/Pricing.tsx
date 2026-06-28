import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, Field, Input, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { DataTable, type Column } from '../components/DataTable'
import { PRODUCTS, type Product, type ProductSite, type FoundryKind } from '../data/real'
import { baht, cleanProductName as cleanName } from '../data/selectors'
import { addPriceAdjustment, addGeneralReport, useCreatedDocs, type PriceAdjustment, type PriceListReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

/** Today as DD/MM/พ.ศ. for report labels. */
function todayThai(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear() + 543}`
}
import { TransportPricing } from './TransportPricing'

/** Combined ราคาสินค้า / ค่าขนส่ง view — a toggle switches between the product
    price list and the transport-surcharge schedule. Defaults to products. */
export function Pricing() {
  const [view, setView] = useState<'products' | 'transport'>('products')
  return (
    <>
      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'products'} onClick={() => setView('products')}>ราคาสินค้า</Pill>
        <Pill active={view === 'transport'} onClick={() => setView('transport')}>ค่าขนส่ง</Pill>
      </div>
      {view === 'products' ? <ProductPricing /> : <TransportPricing />}
    </>
  )
}

const CAT: Record<Product['category'], { th: string; tone: Tone }> = {
  concrete: { th: 'คอนกรีตผสมเสร็จ', tone: 'info' },
  precast: { th: 'พรีคาสท์', tone: 'warning' },
  lean: { th: 'Lean', tone: 'neutral' },
}

/* Work site (SITE) — แพล้นปูน / โรงหล่อ. Products with no `site` count as plant. */
const SITES: { id: ProductSite; label: string }[] = [
  { id: 'plant', label: 'แพล้นปูน' },
  { id: 'foundry', label: 'โรงหล่อ' },
]
const productSite = (p: Product): ProductSite => p.site ?? 'plant'

/* Foundry product types — drive the ประเภท column for โรงหล่อ items. */
const FOUNDRY_KIND: Record<FoundryKind, { th: string; tone: Tone }> = {
  plank: { th: 'แผ่นพื้น', tone: 'info' },
  ipole: { th: 'เสาไอ', tone: 'warning' },
  wallpanel: { th: 'แผ่นผนัง', tone: 'success' },
}
/** ประเภท shown per row: foundry kind when set, otherwise the concrete category. */
const prodType = (p: Product): { th: string; tone: Tone } => (p.kind ? FOUNDRY_KIND[p.kind] : CAT[p.category])

/* Delivery zone is encoded in the product code (positions 6-9):
   OS00 = On Site (≤20 km), OV21 / OV31 / OV41 = the next 10-km bands. */
type ZoneId = 'OS' | 'OV21' | 'OV31' | 'OV41'
interface Zone { id: ZoneId; label: string; range: string; tone: Tone }
const ZONES: Zone[] = [
  { id: 'OS',   label: 'On Site',      range: '≤20 km',  tone: 'success' },
  { id: 'OV21', label: 'Over 21–30',   range: '21–30 km', tone: 'info' },
  { id: 'OV31', label: 'Over 31–40',   range: '31–40 km', tone: 'warning' },
  { id: 'OV41', label: 'Over 41–50',   range: '41–50 km', tone: 'danger' },
]
const ZONE_MAP: Record<ZoneId, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, Zone>

function deliveryZone(code: string): Zone | null {
  if (code.includes('OV41')) return ZONE_MAP.OV41
  if (code.includes('OV31')) return ZONE_MAP.OV31
  if (code.includes('OV21')) return ZONE_MAP.OV21
  if (code.includes('OS00')) return ZONE_MAP.OS
  return null
}

/* Cement brand is encoded in positions 4–5 of the code:
   R2 / P2 → ปูน ดอกบัว ; RO / PO (no "2") → ปูนปอร์ตแลนด์ SCG. */
type BrandId = 'DOKBUA' | 'SCG'
interface Brand { id: BrandId; label: string; tone: Tone }
const BRANDS: Brand[] = [
  { id: 'DOKBUA', label: 'ดอกบัว',           tone: 'success' },
  { id: 'SCG',    label: 'ปูนปอร์ตแลนด์ SCG', tone: 'danger' },
]
/** Filled cell background per cement brand — ดอกบัว เขียว · SCG แดง. */
const BRAND_BG: Record<BrandId, string> = { DOKBUA: '#16a34a', SCG: '#dc2626' }
const BRAND_MAP: Record<BrandId, Brand> = Object.fromEntries(BRANDS.map((b) => [b.id, b])) as Record<BrandId, Brand>

function cementBrand(code: string): Brand | null {
  const tail = code.slice(3) /* strip "KPC" */
  if (tail.startsWith('R2') || tail.startsWith('P2')) return BRAND_MAP.DOKBUA
  if (tail.startsWith('RO') || tail.startsWith('PO')) return BRAND_MAP.SCG
  return null
}

function ProductPricing() {
  const [site, setSite] = useState<'all' | ProductSite>('all')
  const [type, setType] = useState<'all' | string>('all')
  const [zone, setZone] = useState<'all' | ZoneId>('all')
  const [brand, setBrand] = useState<'all' | BrandId>('all')
  const [open, setOpen] = useState(false)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* Current effective price overrides = latest adjustment snapshot. */
  const currentOverrides: Record<string, number> = created.priceAdjustments[0]?.prices ?? {}

  /* Merge overrides on top of the seed products list. */
  const products = useMemo(
    () => PRODUCTS.map((p) => currentOverrides[p.code] !== undefined ? { ...p, price: currentOverrides[p.code] } : p),
    [currentOverrides],
  )

  const rows = products.filter((p) => {
    if (site !== 'all' && productSite(p) !== site) return false
    if (type !== 'all' && prodType(p).th !== type) return false
    if (zone !== 'all') {
      const z = deliveryZone(p.code)
      if (!z || z.id !== zone) return false
    }
    if (brand !== 'all') {
      const b = cementBrand(p.code)
      if (!b || b.id !== brand) return false
    }
    return true
  })

  const zoneCount = (id: ZoneId) => PRODUCTS.filter((p) => deliveryZone(p.code)?.id === id).length
  const brandCount = (id: BrandId) => PRODUCTS.filter((p) => cementBrand(p.code)?.id === id).length
  const siteCount = (id: ProductSite) => PRODUCTS.filter((p) => productSite(p) === id).length

  /* ประเภท options — distinct prodType labels within the selected SITE, in first-
     seen order, each with its product count. Resets to "all" when SITE changes. */
  const typeOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of PRODUCTS) {
      if (site !== 'all' && productSite(p) !== site) continue
      const th = prodType(p).th
      m.set(th, (m.get(th) ?? 0) + 1)
    }
    return [...m.entries()].map(([label, count]) => ({ label, count }))
  }, [site])
  const selectSite = (s: 'all' | ProductSite) => { setSite(s); setType('all') }

  const columns: Column<Product>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'รายการสินค้า', cell: (r) => <span className="th">{cleanName(r.name)}</span> },
    {
      key: 'brand',
      header: 'ปูนซีเมนต์',
      align: 'center',
      cell: (r) => {
        const b = cementBrand(r.code)
        if (!b) return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
        return (
          <span style={{ display: 'inline-block', minWidth: 96, background: BRAND_BG[b.id], color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}>
            {b.label}
          </span>
        )
      },
    },
    { key: 'str', header: 'กำลังอัด', align: 'right', cell: (r) => (r.strengthKsc ? <span className="mono">{r.strengthKsc} ksc</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    {
      key: 'zone',
      header: 'ระยะส่ง',
      align: 'center',
      cell: (r) => {
        const z = deliveryZone(r.code)
        return z
          ? (
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Badge tone={z.tone} pip={false} square>{z.label}</Badge>
              <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>{z.range}</span>
            </span>
          )
          : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
      },
    },
    { key: 'unit', header: 'หน่วย', align: 'center', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
    { key: 'cat', header: 'ประเภท', align: 'center', cell: (r) => { const t = prodType(r); return <Badge tone={t.tone} pip={false} square>{t.th}</Badge> } },
    {
      key: 'pickup', header: 'การรับของ', align: 'center',
      cell: (r) => r.pickup
        ? <Badge tone={r.pickup === 'จัดส่ง' ? 'info' : 'neutral'} pip={false} square>{r.pickup}</Badge>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>,
    },
    { key: 'price', header: 'ราคา/หน่วย (รวม VAT)', align: 'right', cell: (r) => (r.price ? baht(r.price) : <span style={{ color: 'var(--kpc-text-faint)' }}>ภายใน</span>), className: 'amt' },
  ]

  /** Build a price-list report from the rows currently shown (respects the SITE /
      ปูนซีเมนต์ / ระยะส่ง filters), grouped by ประเภท, and save it to รายงานทั่วไป. */
  const createReport = () => {
    if (rows.length === 0) { alert('ไม่มีรายการสินค้าให้สร้างรายงาน'); return }
    const groupsMap = new Map<string, PriceListReport['groups'][number]['rows']>()
    for (const p of rows) {
      const label = prodType(p).th
      const arr = groupsMap.get(label) ?? []
      const z = deliveryZone(p.code)
      arr.push({
        code: p.code,
        name: cleanName(p.name),
        brand: cementBrand(p.code)?.label,
        zone: z ? `${z.label} (${z.range})` : undefined,
        unit: p.unit,
        pickup: p.pickup,
        price: p.price,
      })
      groupsMap.set(label, arr)
    }
    const groups = [...groupsMap.entries()].map(([label, rows]) => ({ label, rows }))
    const scopeLabel = site === 'all' ? 'ทุก SITE' : SITES.find((s) => s.id === site)!.label
    const today = todayThai()
    const report: PriceListReport = {
      id: `gr_${Date.now()}`,
      kind: 'price-list',
      title: `ราคาสินค้า (${scopeLabel}) ณ ${today}`,
      fromLabel: today,
      toLabel: today,
      scopeLabel,
      groups,
      totalItems: rows.length,
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  return (
    <>
      <PageHeader
        title="ราคาสินค้า"
        sub="Price List · ราคาขายต่อคิว (อ้างอิงจริงจากใบจ่ายคอนกรีต)"
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['รหัสสินค้า', 'รายการ', 'ปูนซีเมนต์', 'กำลังอัด (ksc)', 'ระยะส่ง', 'หน่วย', 'ประเภท', 'การรับของ', 'ราคา/หน่วย (รวม VAT)']
              const body = rows.map((p) => [
                p.code, cleanName(p.name),
                cementBrand(p.code)?.label ?? '',
                p.strengthKsc || '',
                deliveryZone(p.code) ? `${deliveryZone(p.code)!.label} (${deliveryZone(p.code)!.range})` : '',
                p.unit, prodType(p).th, p.pickup ?? '', p.price || '',
              ])
              downloadCsv('pricing', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
            <Button variant="primary" onClick={() => setOpen(true)}>ปรับราคา</Button>
          </>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', minWidth: 72 }}>SITE</span>
          <div className="pills">
            <Pill active={site === 'all'} onClick={() => selectSite('all')}>ทั้งหมด {PRODUCTS.length}</Pill>
            {SITES.map((s) => (
              <Pill key={s.id} active={site === s.id} onClick={() => selectSite(s.id)}>
                {s.label} {siteCount(s.id)}
              </Pill>
            ))}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', minWidth: 72 }}>ปูนซีเมนต์</span>
          <div className="pills">
            <Pill active={brand === 'all'} onClick={() => setBrand('all')}>ทั้งหมด</Pill>
            {BRANDS.map((b) => (
              <Pill key={b.id} active={brand === b.id} onClick={() => setBrand(b.id)}>
                {b.label} {brandCount(b.id)}
              </Pill>
            ))}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', minWidth: 72 }}>ประเภท</span>
          <div className="pills">
            <Pill active={type === 'all'} onClick={() => setType('all')}>ทั้งหมด</Pill>
            {typeOptions.map((t) => (
              <Pill key={t.label} active={type === t.label} onClick={() => setType(t.label)}>
                {t.label} {t.count}
              </Pill>
            ))}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', minWidth: 72 }}>ระยะส่ง</span>
          <div className="pills">
            <Pill active={zone === 'all'} onClick={() => setZone('all')}>ทั้งหมด</Pill>
            {ZONES.map((z) => (
              <Pill key={z.id} active={zone === z.id} onClick={() => setZone(z.id)}>
                {z.label} ({z.range}) {zoneCount(z.id)}
              </Pill>
            ))}
          </div>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      <p className="page-sub" style={{ marginTop: 14 }}>
        * ราคา/หน่วยทุกรายการเป็น <strong>ราคารวม VAT 7% แล้ว</strong> · ปูนซีเมนต์/ระยะส่งอ่านจากรหัสสินค้า (R2/P2 = ดอกบัว, RO/PO = SCG · OS00 / OV21 / OV31 / OV41)
      </p>

      <div style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>ประวัติการปรับราคา</span>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{created.priceAdjustments.length} ครั้ง</span>
        </div>
        {created.priceAdjustments.length === 0 ? (
          <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--kpc-text-faint)', fontSize: 13 }}>
            ยังไม่มีประวัติการปรับ — ใช้ราคาเริ่มต้นจากระบบ
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {created.priceAdjustments.map((a, i) => (
              <PriceHistoryCard key={a.at + i} adj={a} />
            ))}
          </div>
        )}
      </div>

      <PriceAdjustModal open={open} products={products} onClose={() => setOpen(false)} />
    </>
  )
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function PriceHistoryCard({ adj }: { adj: PriceAdjustment }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{formatTimestamp(adj.at)}</span>
          {adj.by && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--kpc-text-muted)' }}>โดย {adj.by}</span>}
        </div>
        <Badge tone="warning" pip={false} square>เปลี่ยน {adj.changes.length} รายการ</Badge>
      </div>
      {adj.note && (
        <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginBottom: 10, fontStyle: 'italic' }}>“{adj.note}”</div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--kpc-text-muted)', fontWeight: 600 }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>รหัสสินค้า</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>รายการ</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>จากเดิม</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>ปรับเป็น</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid var(--kpc-border)' }}>ส่วนต่าง</th>
            </tr>
          </thead>
          <tbody>
            {adj.changes.map((c) => {
              const name = cleanName(PRODUCTS.find((p) => p.code === c.code)?.name ?? c.code)
              const d = c.to - c.from
              const tone = d > 0 ? 'var(--kpc-danger-ink, #b91c1c)' : d < 0 ? '#15803d' : 'var(--kpc-text-muted)'
              return (
                <tr key={c.code}>
                  <td className="mono" style={{ padding: '4px 8px' }}>{c.code}</td>
                  <td style={{ padding: '4px 8px' }}>{name}</td>
                  <td className="mono" style={{ textAlign: 'right', padding: '4px 8px' }}>{baht(c.from)}</td>
                  <td className="mono" style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>{baht(c.to)}</td>
                  <td className="mono" style={{ textAlign: 'right', padding: '4px 8px', color: tone }}>{d > 0 ? '+' : ''}{baht(d)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PriceAdjustModal({
  open,
  products,
  onClose,
}: {
  open: boolean
  products: Product[]
  onClose: () => void
}) {
  /* Editable list — exclude precast (internal-use, price=0). */
  const editable = useMemo(() => products.filter((p) => p.price > 0), [products])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const [customPct, setCustomPct] = useState('')
  const [err, setErr] = useState('')
  const [filterCat, setFilterCat] = useState<'all' | Product['category']>('all')

  useEffect(() => {
    if (!open) return
    const init: Record<string, string> = {}
    for (const p of editable) init[p.code] = String(p.price)
    setDrafts(init)
    setBy(''); setNote(''); setCustomPct(''); setErr(''); setFilterCat('all')
  }, [open, editable])

  const visible = editable.filter((p) => filterCat === 'all' || p.category === filterCat)

  const diff = useMemo(() => {
    const changes: { code: string; from: number; to: number }[] = []
    let invalid = false
    for (const p of editable) {
      const v = drafts[p.code]
      const n = Number(v)
      if (v === undefined || v === '' || !Number.isFinite(n) || n < 0) {
        invalid = true; continue
      }
      const rounded = Math.round(n * 100) / 100
      if (rounded !== p.price) changes.push({ code: p.code, from: p.price, to: rounded })
    }
    return { changes, invalid }
  }, [drafts, editable])

  const applyScale = (pct: number) => {
    const next: Record<string, string> = { ...drafts }
    /* Only scale rows currently visible (after the category filter). */
    for (const p of visible) {
      next[p.code] = String(Math.round(p.price * (1 + pct / 100)))
    }
    setDrafts(next)
  }
  const resetDrafts = () => {
    const init: Record<string, string> = {}
    for (const p of editable) init[p.code] = String(p.price)
    setDrafts(init)
  }

  const submit = () => {
    setErr('')
    if (diff.invalid) return setErr('กรุณาตรวจสอบราคาทุกช่อง — ต้องเป็นจำนวนไม่ติดลบ')
    if (diff.changes.length === 0) return setErr('ยังไม่มีรายการที่เปลี่ยนแปลง')
    /* Build the new cumulative override map: prior overrides + this round's changes. */
    const prevOverrides = drafts /* current modal state encodes the new world */
    const nextPrices: Record<string, number> = {}
    for (const p of editable) {
      const n = Math.round(Number(prevOverrides[p.code]) * 100) / 100
      /* Only persist when different from the seed PRODUCTS price so we don't
         bloat the snapshot with every default value. */
      const seed = PRODUCTS.find((sp) => sp.code === p.code)?.price ?? p.price
      if (n !== seed) nextPrices[p.code] = n
    }
    addPriceAdjustment({
      at: new Date().toISOString(),
      by: by.trim() || undefined,
      note: note.trim() || undefined,
      prices: nextPrices,
      changes: diff.changes,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      title="ปรับราคาสินค้า (ราคารวม VAT)"
      onClose={onClose}
      maxWidth={820}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>
            บันทึก {diff.changes.length > 0 && `(${diff.changes.length} รายการ)`}
          </Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="row wrap" style={{ gap: 10, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ประเภท:</span>
        <Pill active={filterCat === 'all'} onClick={() => setFilterCat('all')}>ทั้งหมด</Pill>
        <Pill active={filterCat === 'concrete'} onClick={() => setFilterCat('concrete')}>คอนกรีต</Pill>
        <Pill active={filterCat === 'lean'} onClick={() => setFilterCat('lean')}>Lean</Pill>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ปรับแบบเร็ว (เฉพาะรายการที่เห็น):</span>
        <Button size="sm" variant="secondary" onClick={() => applyScale(5)}>+5%</Button>
        <Button size="sm" variant="secondary" onClick={() => applyScale(10)}>+10%</Button>
        <Button size="sm" variant="secondary" onClick={() => applyScale(-5)}>−5%</Button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <input
            type="number"
            step={0.5}
            value={customPct}
            onChange={(e) => setCustomPct(e.target.value)}
            placeholder="เช่น 7.5 หรือ -3"
            className="input mono"
            style={{ width: 110, padding: '4px 8px', fontSize: 13 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const n = Number(customPct)
                if (Number.isFinite(n) && n !== 0) applyScale(n)
              }
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>%</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const n = Number(customPct)
              if (Number.isFinite(n) && n !== 0) applyScale(n)
            }}
            disabled={!Number.isFinite(Number(customPct)) || Number(customPct) === 0 || customPct === ''}
          >ปรับ</Button>
        </span>
        <Button size="sm" variant="secondary" onClick={resetDrafts}>คืนค่าเดิม</Button>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--kpc-border)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--kpc-bg-soft, #f8fafc)', zIndex: 1 }}>
            <tr style={{ color: 'var(--kpc-text-muted)', fontWeight: 600, fontSize: 12 }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>รหัส / รายการ</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ราคาปัจจุบัน</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ราคาใหม่ (รวม VAT)</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid var(--kpc-border)' }}>ส่วนต่าง</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const key = p.code
              const draft = drafts[key] ?? ''
              const n = Number(draft)
              const valid = draft !== '' && Number.isFinite(n) && n >= 0
              const rounded = valid ? Math.round(n * 100) / 100 : p.price
              const delta = valid ? rounded - p.price : 0
              const tone = delta > 0 ? 'var(--kpc-danger-ink, #b91c1c)' : delta < 0 ? '#15803d' : 'var(--kpc-text-muted)'
              return (
                <tr key={key}>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }}>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--kpc-text-muted)' }}>{p.code}</div>
                    <div style={{ fontSize: 13 }}>{cleanName(p.name)}</div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)', color: 'var(--kpc-text-muted)' }}>{baht(p.price)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)' }}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={draft}
                      onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })}
                      className="input mono"
                      style={{ width: 110, textAlign: 'right', padding: '4px 8px', fontSize: 13 }}
                    />
                  </td>
                  <td className="mono" style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--kpc-border-soft, #f1f5f9)', color: tone, fontWeight: delta !== 0 ? 600 : 400 }}>
                    {valid ? `${delta > 0 ? '+' : ''}${baht(delta)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid g-2" style={{ gap: 12, marginTop: 12 }}>
        <Field label="ผู้ปรับ">
          <Input value={by} onChange={(e) => setBy(e.target.value)} placeholder="ชื่อผู้บันทึก" />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ปูนซีเมนต์ขึ้นราคา Q3" />
        </Field>
      </div>
    </Modal>
  )
}
