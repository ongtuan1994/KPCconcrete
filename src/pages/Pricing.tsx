import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, Field, Input, Select, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { DataTable, type Column } from '../components/DataTable'
import { PRODUCTS, type Product, type ProductSite, type FoundryKind } from '../data/real'
import { MIX_DESIGNS, DEFAULT_WATER_L, mixWater, type MixDesign } from '../data/mixDesign'
import { baht, cleanProductName as cleanName } from '../data/selectors'
import { addPriceAdjustment, addGeneralReport, addProduct, updateProduct, removeProduct, renameProduct, isAddedProduct, addMixDesign, updateMixDesign, useCreatedDocs, useProducts, type PriceAdjustment, type PriceListReport } from '../data/createdDocs'
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
  const [view, setView] = useState<'products' | 'transport' | 'foundry'>('products')
  return (
    /* โรงหล่อ tab → orange scope (recolours the active pill + the whole view). */
    <div className={view === 'foundry' ? 'foundry-theme' : undefined}>
      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'products'} onClick={() => setView('products')}>ราคาสินค้าแพล้นปูน</Pill>
        <Pill active={view === 'transport'} onClick={() => setView('transport')}>ค่าขนส่ง</Pill>
        <Pill active={view === 'foundry'} onClick={() => setView('foundry')}>ราคาสินค้าโรงหล่อ</Pill>
      </div>
      {view === 'products' ? <ProductPricing scope="plant" />
        : view === 'foundry' ? <ProductPricing scope="foundry" />
        : <TransportPricing />}
    </div>
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
/** ประเภท shown per row: a custom foundry type label wins, then the built-in
    foundry kind, otherwise the concrete category. */
const prodType = (p: Product): { th: string; tone: Tone } =>
  p.typeLabel ? { th: p.typeLabel, tone: 'neutral' } : p.kind ? FOUNDRY_KIND[p.kind] : CAT[p.category]

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
  /* On Site = any "OS" that isn't an "OV.." over-band. The seed uses the OS00
     marker, but hand-typed codes (KPCPOS.., KPCROSPP-..) only carry a bare "OS"
     — still On Site. OV bands are ruled out above, so this can't mis-match them. */
  if (code.includes('OS')) return ZONE_MAP.OS
  return null
}
/** A product's ระยะส่ง: the explicitly-chosen zone (stored at creation) wins;
    otherwise fall back to guessing from the code. Mirrors cementBrandOf so a
    hand-typed code that lacks the OS00/OV.. marker still classifies correctly. */
function deliveryZoneOf(p: Product): Zone | null {
  if (p.zone) return ZONE_MAP[p.zone]
  return deliveryZone(p.code)
}

/* Cement brand is encoded in positions 4–5 of the code:
   R2 / P2 → ปูน ดอกบัว ; RO / PO (no "2") → ปูนปอร์ตแลนด์ SCG. */
type BrandId = 'DOKBUA' | 'SCG'
interface Brand { id: BrandId; label: string; short: string; tone: Tone }
const BRANDS: Brand[] = [
  { id: 'DOKBUA', label: 'ดอกบัว',           short: 'ดอกบัว', tone: 'success' },
  { id: 'SCG',    label: 'ปูนปอร์ตแลนด์ SCG', short: 'SCG',    tone: 'danger' },
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
/** A product's cement brand: the explicitly-chosen ยี่ห้อ (stored at creation)
    wins; otherwise fall back to guessing from the code. Lets a hand-typed code
    keep the brand the user selected. */
function cementBrandOf(p: Product): Brand | null {
  if (p.cementBrand) return BRAND_MAP[p.cementBrand]
  return cementBrand(p.code)
}

/* Build a plant product code from its parts, matching the seed encoding:
   KPC + R (SCG) / R2 (ดอกบัว) + zone marker (OS00 / OV21 / OV31 / OV41) + 3-digit ksc.
   Lean uses ksc 000. cementBrand() + deliveryZone() read these back consistently. */
function genPlantCode(brand: BrandId, zone: ZoneId, category: 'concrete' | 'lean', strength: string): string {
  const zoneMarker = zone === 'OS' ? 'OS00' : zone
  const str = category === 'lean' ? '000' : String(Number(strength) || 0).padStart(3, '0')
  return `KPC${brand === 'SCG' ? 'R' : 'R2'}${zoneMarker}${str}`
}
function genPlantName(brand: BrandId, category: 'concrete' | 'lean', strength: string): string {
  const bt = brand === 'SCG' ? '(ปูน SCG)' : '(ปูน ดอกบัว)'
  return category === 'lean'
    ? `คอนกรีต Lean ${bt}`
    : `คอนกรีตกำลังอัด ${Number(strength) || 0} กก./ตร.ซม. ${bt}`
}
/** Auto-generate a unique foundry product code (KPCF0001, …) for when the user
    leaves the รหัสสินค้า field blank. */
function genFoundryCode(existing: Set<string>): string {
  let n = 1
  let code = `KPCF${String(n).padStart(4, '0')}`
  while (existing.has(code)) { n++; code = `KPCF${String(n).padStart(4, '0')}` }
  return code
}

function ProductPricing({ scope }: { scope: ProductSite }) {
  const isFoundry = scope === 'foundry'
  const [type, setType] = useState<'all' | string>('all')
  const [zone, setZone] = useState<'all' | ZoneId>('all')
  const [brand, setBrand] = useState<'all' | BrandId>('all')
  /* Free-text search across รหัส / ชื่อรายการ. */
  const [search, setSearch] = useState('')
  /* Sort order for the product list. */
  const [sortBy, setSortBy] = useState<'default' | 'strength-asc' | 'strength-desc' | 'code' | 'price-asc' | 'price-desc'>('default')
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* Merged product list (added + seed + edits + latest price override, minus
     hidden) — shared with the product pickers via useProducts. */
  const products = useProducts()

  /* Every code in use — for the เพิ่มสินค้า uniqueness check. */
  const existingCodes = useMemo(() => new Set(products.map((p) => p.code)), [products])

  /* Mix design for a product code (its own, or a legacy formulaCode link) — for
     the inline สูตรวัตถุดิบ in the product form and the price-list report materials. */
  const mixList = useMemo(() => {
    const added = created.mixDesignsAdded.slice().reverse()
    return [...MIX_DESIGNS, ...added].map((m) => (created.mixDesignEdits[m.code] ? { ...m, ...created.mixDesignEdits[m.code] } : m))
  }, [created.mixDesignsAdded, created.mixDesignEdits])
  const mixByCode = useMemo(() => new Map(mixList.map((m) => [m.code, m])), [mixList])
  const mixForProduct = (p: Product): MixDesign | undefined => mixByCode.get(p.formulaCode || p.code)

  const rows = products.filter((p) => {
    if (productSite(p) !== scope) return false
    if (type !== 'all' && prodType(p).th !== type) return false
    if (!isFoundry && zone !== 'all') {
      const z = deliveryZoneOf(p)
      if (!z || z.id !== zone) return false
    }
    if (!isFoundry && brand !== 'all') {
      const b = cementBrandOf(p)
      if (!b || b.id !== brand) return false
    }
    const q = search.trim().toLowerCase()
    if (q) {
      const hay = `${p.code} ${cleanName(p.name)}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  /* Apply the chosen sort (default keeps the natural added-then-seed order), then
     always sink งดจำหน่าย to the very bottom. The final sort is stable, so the
     chosen order is preserved within the จำหน่าย and งดจำหน่าย groups. */
  const sortedRows = useMemo(() => {
    const rs = rows.slice()
    switch (sortBy) {
      case 'strength-asc': rs.sort((a, b) => (a.strengthKsc || 0) - (b.strengthKsc || 0)); break
      case 'strength-desc': rs.sort((a, b) => (b.strengthKsc || 0) - (a.strengthKsc || 0)); break
      case 'code': rs.sort((a, b) => a.code.localeCompare(b.code)); break
      case 'price-asc': rs.sort((a, b) => (a.price || 0) - (b.price || 0)); break
      case 'price-desc': rs.sort((a, b) => (b.price || 0) - (a.price || 0)); break
      default: break /* keep natural order */
    }
    rs.sort((a, b) => Number(!!a.discontinued) - Number(!!b.discontinued))
    return rs
  }, [rows, sortBy])

  const zoneCount = (id: ZoneId) => products.filter((p) => productSite(p) === scope && deliveryZoneOf(p)?.id === id).length
  const brandCount = (id: BrandId) => products.filter((p) => productSite(p) === scope && cementBrandOf(p)?.id === id).length

  /* ประเภท options — distinct prodType labels within this SITE scope, in first-seen
     order, each with its product count (includes user-added products). */
  const typeOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) {
      if (productSite(p) !== scope) continue
      const th = prodType(p).th
      m.set(th, (m.get(th) ?? 0) + 1)
    }
    return [...m.entries()].map(([label, count]) => ({ label, count }))
  }, [products, scope])

  const columns: Column<Product>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    {
      key: 'name', header: 'รายการสินค้า',
      cell: (r) => (
        <span className="th" style={r.discontinued ? { color: 'var(--kpc-text-faint)' } : undefined}>
          {cleanName(r.name)}
          {r.discontinued && (
            <span style={{ marginLeft: 8, display: 'inline-block', verticalAlign: 'middle' }}>
              <Badge tone="danger" pip={false} square>งดจำหน่าย</Badge>
            </span>
          )}
        </span>
      ),
    },
    /* ปูนซีเมนต์ / กำลังอัด / ระยะส่ง are plant-only concepts — hidden on the โรงหล่อ page. */
    ...(isFoundry ? [] : [
      {
        key: 'brand',
        header: 'ปูนซีเมนต์',
        align: 'center',
        cell: (r: Product) => {
          const b = cementBrandOf(r)
          if (!b) return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
          return (
            <span style={{ display: 'inline-block', minWidth: 96, background: BRAND_BG[b.id], color: '#fff', padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}>
              {b.short}
            </span>
          )
        },
      },
      { key: 'str', header: 'กำลังอัด', align: 'right', cell: (r: Product) => (r.strengthKsc ? <span className="mono">{r.strengthKsc} ksc</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
      {
        key: 'zone',
        header: 'ระยะส่ง',
        align: 'center',
        cell: (r: Product) => {
          const z = deliveryZoneOf(r)
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
    ] as Column<Product>[]),
    { key: 'unit', header: 'หน่วย', align: 'center', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
    { key: 'cat', header: 'ประเภท', align: 'center', cell: (r) => { const t = prodType(r); return <Badge tone={t.tone} pip={false} square>{t.th}</Badge> } },
    {
      key: 'price', header: 'ราคา/หน่วย (รวม VAT)', align: 'right', className: 'amt',
      cell: (r) => r.pickupPrices
        ? (
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontSize: 12 }}>
            <span>รับเอง <strong className="mono">{baht(r.pickupPrices['รับเอง'])}</strong></span>
            <span>จัดส่ง <strong className="mono">{baht(r.pickupPrices['จัดส่ง'])}</strong></span>
          </span>
        )
        : (r.price ? baht(r.price) : <span style={{ color: 'var(--kpc-text-faint)' }}>ภายใน</span>),
    },
    {
      key: 'edit', header: '', align: 'center',
      cell: (r) => (
        <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>แก้ไข</Button>
      ),
    },
  ]

  /** Build a price-list report from the rows currently shown (respects the SITE /
      ปูนซีเมนต์ / ระยะส่ง filters), grouped by ประเภท, and save it to รายงานทั่วไป. */
  const createReport = () => {
    if (rows.length === 0) { alert('ไม่มีรายการสินค้าให้สร้างรายงาน'); return }
    const groupsMap = new Map<string, PriceListReport['groups'][number]['rows']>()
    for (const p of rows) {
      /* Lean joins the คอนกรีตผสมเสร็จ group so it lands in the distance/brand
         sub-tables (sorted first as the lowest strength), not its own category. */
      const label = p.category === 'lean' ? CAT.concrete.th : prodType(p).th
      const arr = groupsMap.get(label) ?? []
      const z = deliveryZoneOf(p)
      const m = productSite(p) !== 'foundry' ? mixForProduct(p) : undefined
      arr.push({
        code: p.code,
        name: cleanName(p.name),
        brand: cementBrandOf(p)?.label,
        zone: z ? `${z.label} (${z.range})` : undefined,
        strengthKsc: p.strengthKsc,
        unit: p.unit,
        pickup: p.pickup,
        pickupPrices: p.pickupPrices,
        price: p.price,
        ...(p.discontinued ? { discontinued: true } : {}),
        ...(m ? { mix: { cement: m.cement, sand: m.sand, aggregate: m.aggregate, water: m.water ?? DEFAULT_WATER_L, plastomix: m.plastomix, sikament: m.sikament, pce: m.pce, accelerator: m.accelerator, waterproof: m.waterproof } } : {}),
      })
      groupsMap.set(label, arr)
    }
    const groups = [...groupsMap.entries()].map(([label, rows]) => ({ label, rows }))
    const scopeLabel = SITES.find((s) => s.id === scope)!.label
    const today = todayThai()
    const report: PriceListReport = {
      id: `gr_${Date.now()}`,
      kind: 'price-list',
      title: `ราคาสินค้า${isFoundry ? 'โรงหล่อ' : ''} (${scopeLabel}) ณ ${today}`,
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
        title={isFoundry ? 'ราคาสินค้าโรงหล่อ' : 'ราคาสินค้าแพล้นปูน'}
        sub={isFoundry ? 'Price List · โรงหล่อ (แผ่นพื้น / เสาไอ / แผ่นผนัง)' : 'Price List · ราคาขายต่อคิว (อ้างอิงจริงจากใบจ่ายคอนกรีต)'}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              if (isFoundry) {
                /* โรงหล่อ — no cement brand / strength / zone / mix; เสาไอ carries รับเอง+จัดส่ง. */
                const head = ['รหัสสินค้า', 'รายการ', 'ประเภท', 'หน่วย', 'การรับของ', 'ราคารับเอง', 'ราคาจัดส่ง', 'ราคา/หน่วย (รวม VAT)']
                const body = sortedRows.map((p) => [
                  p.code, cleanName(p.name), prodType(p).th, p.unit, p.pickup ?? '',
                  p.pickupPrices?.['รับเอง'] ?? '', p.pickupPrices?.['จัดส่ง'] ?? '',
                  p.pickupPrices ? '' : (p.price || ''),
                ])
                downloadCsv('pricing-foundry', [head, ...body])
                return
              }
              const head = [
                'รหัสสินค้า', 'รายการ', 'ปูนซีเมนต์', 'กำลังอัด (ksc)', 'ระยะส่ง', 'หน่วย', 'ประเภท', 'ราคา/หน่วย (รวม VAT)',
                'ปูน (กก.)', 'ทราย (กก.)', 'หิน 3/4" (กก.)', 'น้ำ (ล.)', 'น้ำยาหน่วง (ล.)', 'น้ำยาเร่ง (ล.)', 'กันซึม (ล.)',
              ]
              const mv = (n?: number) => (n && n > 0 ? n : '')
              const body = sortedRows.map((p) => {
                const m = mixForProduct(p)
                /* 3 น้ำยา: หน่วง = Plastomix-704 (plastomix) · เร่ง = PCE-1 Gold 500 SF
                   (pce/accelerator) · กันซึม = SikaPlastocrete N (sikament/waterproof). */
                return [
                  p.code, cleanName(p.name),
                  cementBrandOf(p)?.label ?? '',
                  p.strengthKsc || '',
                  deliveryZoneOf(p) ? `${deliveryZoneOf(p)!.label} (${deliveryZoneOf(p)!.range})` : '',
                  p.unit, prodType(p).th, p.price || '',
                  mv(m?.cement), mv(m?.sand), mv(m?.aggregate), m ? mixWater(m) : '',
                  mv(m?.plastomix), mv(m?.pce || m?.accelerator), mv(m?.sikament || m?.waterproof),
                ]
              })
              downloadCsv('pricing', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
            <Button variant="secondary" onClick={() => setOpen(true)}>ปรับราคา</Button>
            <Button variant="primary" onClick={() => setAdding(true)}>เพิ่มสินค้า</Button>
          </>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', minWidth: 72 }}>ค้นหา</span>
          <Input
            placeholder="ค้นหา รหัสสินค้า / ชื่อรายการ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
          {search && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>ล้าง</Button>}
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginLeft: 8 }}>เรียงตาม</span>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={{ maxWidth: 220 }}>
            <option value="default">ค่าเริ่มต้น</option>
            <option value="strength-asc">กำลังอัด (น้อย → มาก)</option>
            <option value="strength-desc">กำลังอัด (มาก → น้อย)</option>
            <option value="code">รหัสสินค้า (A → Z)</option>
            <option value="price-asc">ราคา (น้อย → มาก)</option>
            <option value="price-desc">ราคา (มาก → น้อย)</option>
          </Select>
        </div>
        {!isFoundry && (
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
        )}
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
        {!isFoundry && (
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
        )}
      </div>
      <DataTable columns={columns} rows={sortedRows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      <p className="page-sub" style={{ marginTop: 14 }}>
        {isFoundry
          ? <>* ราคา/หน่วยทุกรายการเป็น <strong>ราคารวม VAT 7% แล้ว</strong> · เสาไอแยกราคา รับเอง / จัดส่ง</>
          : <>* ราคา/หน่วยทุกรายการเป็น <strong>ราคารวม VAT 7% แล้ว</strong> · ปูนซีเมนต์/ระยะส่งอ่านจากรหัสสินค้า (R2/P2 = ดอกบัว, RO/PO = SCG · OS00 / OV21 / OV31 / OV41)</>}
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

      <PriceAdjustModal open={open} scope={scope} products={products.filter((p) => productSite(p) === scope)} onClose={() => setOpen(false)} />
      <ProductFormModal open={adding} mode="add" forceSite={scope} existingCodes={existingCodes} onClose={() => setAdding(false)} />
      <ProductFormModal
        key={editing?.code ?? 'edit'}
        open={!!editing}
        mode="edit"
        initial={editing ?? undefined}
        initialMix={editing ? mixByCode.get(editing.code) : undefined}
        existingCodes={existingCodes}
        onClose={() => setEditing(null)}
      />
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
  scope,
  onClose,
}: {
  open: boolean
  products: Product[]
  scope: ProductSite
  onClose: () => void
}) {
  const isFoundry = scope === 'foundry'
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

      {!isFoundry && (
        <div className="row wrap" style={{ gap: 10, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>ประเภท:</span>
          <Pill active={filterCat === 'all'} onClick={() => setFilterCat('all')}>ทั้งหมด</Pill>
          <Pill active={filterCat === 'concrete'} onClick={() => setFilterCat('concrete')}>คอนกรีต</Pill>
          <Pill active={filterCat === 'lean'} onClick={() => setFilterCat('lean')}>Lean</Pill>
        </div>
      )}

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

/** Foundry kind labels for the เพิ่ม/แก้ไขสินค้า form. */
const FOUNDRY_KIND_OPTS: { id: FoundryKind; label: string; unit: string }[] = [
  { id: 'plank', label: 'แผ่นพื้น', unit: 'แผ่น' },
  { id: 'ipole', label: 'เสาไอ', unit: 'ต้น' },
  { id: 'wallpanel', label: 'แผ่นผนัง', unit: 'แผ่น' },
]
/** Sentinel value in the ประเภทสินค้า dropdown for "add a brand-new type". */
const CUSTOM_KIND = '__new__' as const
/** Prefix marking a dropdown option that re-selects an existing custom type
    (typeLabel) — e.g. "type:ท่อระบายน้ำ". */
const TYPE_PREFIX = 'type:'
type KindSel = FoundryKind | typeof CUSTOM_KIND

/** เพิ่ม / แก้ไขสินค้า. Add mode forces a SITE choice (แพล้นปูน / โรงหล่อ) first, then
    shows the fields for that site; plant products can also link a สูตรการผลิต. */
function ProductFormModal({
  open,
  mode,
  initial,
  initialMix,
  forceSite,
  existingCodes,
  onClose,
}: {
  open: boolean
  mode: 'add' | 'edit'
  initial?: Product
  initialMix?: MixDesign
  /** When adding, pin the SITE to this value and skip the SITE chooser step. */
  forceSite?: ProductSite
  existingCodes: Set<string>
  onClose: () => void
}) {
  const [site, setSite] = useState<ProductSite | null>(null)
  const [brand, setBrand] = useState<BrandId>('SCG')
  const [category, setCategory] = useState<'concrete' | 'lean'>('concrete')
  const [zone, setZone] = useState<ZoneId>('OS')
  const [kind, setKind] = useState<KindSel>('plank')
  const [customType, setCustomType] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('คิว')
  const [strength, setStrength] = useState('')
  const [price, setPrice] = useState('')
  const [priceSelf, setPriceSelf] = useState('')
  const [priceDeliver, setPriceDeliver] = useState('')
  const [pickup, setPickup] = useState<'รับเอง' | 'จัดส่ง'>('รับเอง')
  /* สถานะการขาย — false = จำหน่าย (default), true = งดจำหน่าย. */
  const [discontinued, setDiscontinued] = useState(false)
  const [codeDirty, setCodeDirty] = useState(false)
  const [nameDirty, setNameDirty] = useState(false)
  const [err, setErr] = useState('')
  /* Inline Mix Design (ส่วนผสมวัตถุดิบ ต่อ 1 คิว) for plant products — น้ำ ตั้งต้น 165 ล. */
  const [mixCement, setMixCement] = useState('')
  const [mixSand, setMixSand] = useState('')
  const [mixAggregate, setMixAggregate] = useState('')
  const [mixWater, setMixWater] = useState(String(DEFAULT_WATER_L))
  const [mixPlastomix, setMixPlastomix] = useState('')
  const [mixSikament, setMixSikament] = useState('')
  const [mixPce, setMixPce] = useState('')
  const [mixAccelerator, setMixAccelerator] = useState('')
  const [mixWaterproof, setMixWaterproof] = useState('')

  const readOnlyStructure = mode === 'edit' /* site/zone/category are fixed once created */
  /* The code may be renamed while adding, or while editing a USER-ADDED product
     (references get updated). Seed products keep their code. */
  const codeLocked = mode === 'edit' && !isAddedProduct(initial?.code ?? '')
  const isCustom = kind === CUSTOM_KIND /* custom foundry type — single price, manual unit */

  /* Existing custom foundry types (typeLabel) across all products — so a type
     added earlier shows up in the ประเภทสินค้า dropdown next time instead of only
     "+ เพิ่มประเภทใหม่…". */
  const allProducts = useProducts()
  const foundryTypes = useMemo(() => {
    const set = new Set<string>()
    for (const p of allProducts) if (p.site === 'foundry' && p.typeLabel) set.add(p.typeLabel)
    return [...set].sort()
  }, [allProducts])
  /* The ประเภทสินค้า <select> value: a fixed kind, an existing custom type
     (type:<label>), or the "+ เพิ่มประเภทใหม่…" sentinel. */
  const kindSelectValue = isCustom
    ? (customType && foundryTypes.includes(customType) ? TYPE_PREFIX + customType : CUSTOM_KIND)
    : kind
  const onKindSelect = (v: string) => {
    if (v.startsWith(TYPE_PREFIX)) {
      const label = v.slice(TYPE_PREFIX.length)
      setKind(CUSTOM_KIND)
      setCustomType(label)
      /* Pre-fill the unit from an existing product of that type (still editable). */
      const sample = allProducts.find((p) => p.site === 'foundry' && p.typeLabel === label)
      if (sample?.unit) setUnit(sample.unit)
    } else {
      if (v === CUSTOM_KIND) setCustomType('')
      changeKind(v as KindSel)
    }
  }

  /* Reset the form whenever it opens (edit → prefill from the row, add → blank). */
  useEffect(() => {
    if (!open) return
    setErr('')
    if (mode === 'edit' && initial) {
      setSite(productSite(initial))
      setBrand(cementBrandOf(initial)?.id ?? 'SCG')
      setCategory(initial.category === 'lean' ? 'lean' : 'concrete')
      setZone(deliveryZoneOf(initial)?.id ?? 'OS')
      setKind(initial.typeLabel ? CUSTOM_KIND : (initial.kind ?? 'plank'))
      setCustomType(initial.typeLabel ?? '')
      setCode(initial.code)
      setName(initial.name)
      setUnit(initial.unit)
      setStrength(initial.strengthKsc ? String(initial.strengthKsc) : '')
      setPrice(initial.price ? String(initial.price) : '')
      setPriceSelf(initial.pickupPrices ? String(initial.pickupPrices['รับเอง']) : '')
      setPriceDeliver(initial.pickupPrices ? String(initial.pickupPrices['จัดส่ง']) : '')
      setPickup(initial.pickup ?? 'รับเอง')
      const s = (n?: number) => (n ? String(n) : '')
      setMixCement(s(initialMix?.cement)); setMixSand(s(initialMix?.sand)); setMixAggregate(s(initialMix?.aggregate))
      setMixWater(String(initialMix?.water ?? DEFAULT_WATER_L))
      setMixPlastomix(s(initialMix?.plastomix)); setMixSikament(s(initialMix?.sikament)); setMixPce(s(initialMix?.pce))
      setMixAccelerator(s(initialMix?.accelerator)); setMixWaterproof(s(initialMix?.waterproof))
      setDiscontinued(!!initial.discontinued)
      setCodeDirty(true); setNameDirty(true)
    } else {
      setSite(forceSite ?? null)
      setBrand('SCG'); setCategory('concrete'); setZone('OS'); setKind('plank'); setCustomType('')
      setCode(''); setName(''); setUnit(forceSite === 'foundry' ? 'แผ่น' : 'คิว'); setStrength(''); setPrice('')
      setPriceSelf(''); setPriceDeliver(''); setPickup('รับเอง')
      setMixCement(''); setMixSand(''); setMixAggregate(''); setMixWater(String(DEFAULT_WATER_L))
      setMixPlastomix(''); setMixSikament(''); setMixPce(''); setMixAccelerator(''); setMixWaterproof('')
      setDiscontinued(false) /* new products default to จำหน่าย */
      setCodeDirty(false); setNameDirty(false)
    }
  }, [open, mode, initial, initialMix, forceSite])

  /* Auto-fill code + name from the plant drivers while adding, until the user
     types their own value in either field. */
  useEffect(() => {
    if (mode !== 'add' || site !== 'plant') return
    setCode((c) => (codeDirty ? c : genPlantCode(brand, zone, category, strength)))
    setName((n) => (nameDirty ? n : genPlantName(brand, category, strength)))
  }, [mode, site, brand, zone, category, strength, codeDirty, nameDirty])

  const chooseSite = (s: ProductSite) => {
    setSite(s)
    setUnit(s === 'plant' ? 'คิว' : kind === 'ipole' ? 'ต้น' : 'แผ่น')
  }
  const changeKind = (k: KindSel) => {
    setKind(k)
    if (k === CUSTOM_KIND) {
      /* New type — clear the unit so the user must enter their own. */
      setUnit((u) => (u === 'แผ่น' || u === 'ต้น' ? '' : u))
      return
    }
    /* Snap the unit to the kind's default unless the user set a custom one. */
    setUnit((u) => (u === '' || u === 'แผ่น' || u === 'ต้น' ? (k === 'ipole' ? 'ต้น' : 'แผ่น') : u))
  }

  const submit = () => {
    setErr('')
    if (!site) return setErr('กรุณาเลือก SITE ก่อน (แพล้นปูน หรือ โรงหล่อ)')
    /* The code is taken as-is (auto-filled but hand-editable). The cement brand
       no longer relies on it — it is stored explicitly from the ยี่ห้อปูน
       selection below (see cementBrand on addProduct/updateProduct). */
    let c = code.trim()
    const nm = name.trim()
    /* รหัสสินค้า is required for plant products but optional for foundry — when a
       foundry product is added without one, auto-generate a unique code. */
    if (!c && site === 'plant') return setErr('กรุณากรอกรหัสสินค้า')
    if (!c && mode === 'add') c = genFoundryCode(existingCodes)
    if (!c && mode === 'edit') c = initial!.code
    if (!nm) return setErr('กรุณากรอกชื่อรายการสินค้า')
    if (mode === 'add' && existingCodes.has(c)) return setErr(`รหัสสินค้า ${c} มีอยู่แล้ว`)
    /* Renaming the code in edit mode — only user-added products; references are
       updated by renameProduct. Run it first, then updateProduct on the new code. */
    if (mode === 'edit' && c !== initial!.code) {
      if (!isAddedProduct(initial!.code)) return setErr('เปลี่ยนรหัสได้เฉพาะสินค้าที่เพิ่มเอง — สินค้าตั้งต้นให้ลบแล้วสร้างใหม่')
      if (existingCodes.has(c)) return setErr(`รหัสสินค้า ${c} มีอยู่แล้ว`)
      renameProduct(initial!.code, c)
    }
    const u = unit.trim()
    /* ราคา/หน่วย is optional for foundry products: blank ⇒ 0. A non-empty but
       invalid (negative / non-numeric) value still errors. Returns null on error. */
    const priceOpt = (v: string): number | null => {
      const t = v.trim()
      if (t === '') return 0
      const n = Number(t)
      if (!Number.isFinite(n) || n < 0) return null
      return Math.round(n * 100) / 100
    }

    if (site === 'plant') {
      if (category === 'concrete') {
        const s = Number(strength)
        if (!Number.isFinite(s) || s <= 0) return setErr('กรุณากรอกกำลังอัด (ksc) ให้ถูกต้อง')
      }
      const pr = Number(price)
      if (!Number.isFinite(pr) || pr <= 0) return setErr('กรุณากรอกราคา/หน่วยให้ถูกต้อง')
      const strengthKsc = category === 'lean' ? 0 : Number(strength)
      /* Own สูตรวัตถุดิบ (Mix Design). Required when ADDING; optional when editing
         so a seed product with no seed mix can still have its ชื่อ/รหัส/ราคา saved
         (a partially-filled mix is still rejected). */
      const mc = Number(mixCement), ms = Number(mixSand), ma = Number(mixAggregate)
      const hasMix = mc > 0 && ms > 0 && ma > 0
      const anyMixFilled = [mixCement, mixSand, mixAggregate].some((v) => v.trim() !== '')
      if (mode === 'add' && !hasMix) return setErr('กรุณากรอกส่วนผสมวัตถุดิบ (ปูน / ทราย / หิน) ให้ครบ')
      if (anyMixFilled && !hasMix) return setErr('กรุณากรอกส่วนผสมวัตถุดิบ (ปูน / ทราย / หิน) ให้ครบ')
      const r2n = (n: number) => Math.round(n * 100) / 100
      const optN = (v: string) => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) && n > 0 ? r2n(n) : undefined }
      const w = Number(mixWater)
      const mix: MixDesign | null = hasMix ? {
        code: c, cement: r2n(mc), sand: r2n(ms), aggregate: r2n(ma),
        water: Number.isFinite(w) && w > 0 ? r2n(w) : DEFAULT_WATER_L,
        plastomix: optN(mixPlastomix), sikament: optN(mixSikament), pce: optN(mixPce), accelerator: optN(mixAccelerator), waterproof: optN(mixWaterproof),
      } : null
      if (mode === 'add') {
        addProduct({ code: c, name: nm, strengthKsc, unit: u || 'คิว', category, price: pr, cementBrand: brand, zone, ...(discontinued ? { discontinued: true } : {}) })
      } else {
        /* Clear any legacy formula link — the product uses its own mix now. */
        updateProduct(c, { name: nm, unit: u || 'คิว', strengthKsc, price: pr, formulaCode: '', cementBrand: brand, zone, discontinued })
      }
      if (mix) { if (initialMix) updateMixDesign(c, mix); else addMixDesign(mix) }
    } else if (isCustom) {
      /* Brand-new foundry type — user supplies the type name, unit and a single price. */
      const t = customType.trim()
      if (!t) return setErr('กรุณากรอกชื่อประเภทสินค้าใหม่')
      if (!u) return setErr('กรุณากรอกหน่วยของสินค้า')
      const pr = priceOpt(price)
      if (pr === null) return setErr('กรุณากรอกราคา/หน่วยให้ถูกต้อง')
      if (mode === 'add') {
        addProduct({ code: c, name: nm, strengthKsc: 0, unit: u, category: 'precast', site: 'foundry', typeLabel: t, price: pr, ...(discontinued ? { discontinued: true } : {}) })
      } else {
        updateProduct(c, { name: nm, unit: u, price: pr, discontinued })
      }
    } else if (kind === 'ipole') {
      const ps = priceOpt(priceSelf), pd = priceOpt(priceDeliver)
      if (ps === null || pd === null) return setErr('กรุณากรอกราคารับเอง / จัดส่งให้ถูกต้อง')
      if (mode === 'add') {
        addProduct({ code: c, name: nm, strengthKsc: 0, unit: u || 'ต้น', category: 'precast', site: 'foundry', kind, pickupPrices: { 'รับเอง': ps, 'จัดส่ง': pd }, price: ps, ...(discontinued ? { discontinued: true } : {}) })
      } else {
        updateProduct(c, { name: nm, unit: u || 'ต้น', pickupPrices: { 'รับเอง': ps, 'จัดส่ง': pd }, price: ps, discontinued })
      }
    } else {
      const pr = priceOpt(price)
      if (pr === null) return setErr('กรุณากรอกราคา/หน่วยให้ถูกต้อง')
      const isWall = kind === 'wallpanel'
      if (mode === 'add') {
        addProduct({ code: c, name: nm, strengthKsc: 0, unit: u || 'แผ่น', category: 'precast', site: 'foundry', kind: kind as FoundryKind, price: pr, ...(isWall ? { pickup } : {}), ...(discontinued ? { discontinued: true } : {}) })
      } else {
        updateProduct(c, { name: nm, unit: u || 'แผ่น', price: pr, ...(isWall ? { pickup } : {}), discontinued })
      }
    }
    onClose()
  }

  const canDelete = mode === 'edit' && !!initial
  const del = () => {
    if (!initial) return
    const seed = !isAddedProduct(initial.code)
    const warn = seed
      ? `ลบสินค้า ${initial.code} — ${cleanName(initial.name)} ?\n\n(สินค้าตั้งต้นจะถูกซ่อนจากรายการ — กู้คืนได้ที่ ตั้งค่า → กู้คืนรายการที่ซ่อน)`
      : `ลบสินค้า ${initial.code} — ${cleanName(initial.name)} ?`
    if (confirm(warn)) {
      removeProduct(initial.code)
      onClose()
    }
  }


  const title = mode === 'edit'
    ? `แก้ไขสินค้า ${initial?.code ?? ''}`
    : site
      ? `เพิ่มสินค้า · ${site === 'plant' ? 'แพล้นปูน' : 'โรงหล่อ'}`
      : 'เพิ่มสินค้า — เลือก SITE'

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      maxWidth={640}
      footer={
        <>
          {canDelete && <Button variant="secondary" onClick={del} style={{ color: 'var(--kpc-danger, #dc2626)', marginRight: 'auto' }}>ลบสินค้า</Button>}
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit} disabled={mode === 'add' && !site}>{mode === 'add' ? 'เพิ่มสินค้า' : 'บันทึก'}</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {/* Step 1 (add only): force a SITE choice before showing any detail fields. */}
      {mode === 'add' && !site ? (
        <div className="stack" style={{ gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--kpc-text-muted)', margin: 0 }}>เลือกกลุ่มสินค้า (SITE) ที่ต้องการเพิ่ม</p>
          <div className="grid g-2" style={{ gap: 12 }}>
            {SITES.map((s) => (
              <button key={s.id} className="card" onClick={() => chooseSite(s.id)}
                style={{ padding: '22px 16px', textAlign: 'center', cursor: 'pointer', fontSize: 15, fontWeight: 700, border: '1px solid var(--kpc-border)' }}>
                {s.label}
                <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--kpc-text-muted)', marginTop: 4 }}>
                  {s.id === 'plant' ? 'คอนกรีตผสมเสร็จ / Lean' : 'แผ่นพื้น / เสาไอ / แผ่นผนัง'}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {mode === 'add' && !forceSite && (
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge tone="info" pip={false} square>SITE: {site === 'plant' ? 'แพล้นปูน' : 'โรงหล่อ'}</Badge>
              <Button size="sm" variant="secondary" onClick={() => setSite(null)}>เปลี่ยน SITE</Button>
            </div>
          )}

          <Field label="สถานะการขาย" hint="งดจำหน่าย = ซ่อนจากตัวเลือกในใบจ่ายคอนกรีต และย้ายไปท้ายตารางราคาสินค้า">
            <Select value={discontinued ? 'off' : 'on'} onChange={(e) => setDiscontinued(e.target.value === 'off')}>
              <option value="on">จำหน่าย</option>
              <option value="off">งดจำหน่าย</option>
            </Select>
          </Field>

          {site === 'plant' ? (
            <>
              <div className="grid g-2" style={{ gap: 12 }}>
                <Field label="ยี่ห้อปูนซีเมนต์" required hint={readOnlyStructure ? 'แก้ไขยี่ห้อปูนได้ (ไม่กระทบรหัสสินค้า)' : undefined}>
                  <Select value={brand} onChange={(e) => setBrand(e.target.value as BrandId)}>
                    {BRANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </Select>
                </Field>
                <Field label="ประเภท" required>
                  <Select value={category} disabled={readOnlyStructure} onChange={(e) => setCategory(e.target.value as 'concrete' | 'lean')}>
                    <option value="concrete">คอนกรีตผสมเสร็จ</option>
                    <option value="lean">Lean</option>
                  </Select>
                </Field>
                <Field label="ระยะส่ง" required>
                  <Select value={zone} disabled={readOnlyStructure} onChange={(e) => setZone(e.target.value as ZoneId)}>
                    {ZONES.map((z) => <option key={z.id} value={z.id}>{z.label} ({z.range})</option>)}
                  </Select>
                </Field>
                {category === 'concrete' && (
                  <Field label="กำลังอัด (ksc)" required>
                    <Input type="number" min={0} value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="เช่น 240" />
                  </Field>
                )}
              </div>
              <div className="grid g-2" style={{ gap: 12 }}>
                <Field label="รหัสสินค้า" required hint={mode === 'add' ? 'สร้างอัตโนมัติจากตัวเลือกด้านบน — แก้ไขเองได้ (ยี่ห้อปูนยึดตามที่เลือกไว้ ไม่ใช่จากรหัส)' : (codeLocked ? undefined : 'แก้ไขรหัสได้ — ระบบจะอัปเดตการอ้างอิงในเอกสาร/สูตรให้')}>
                  <Input className="input mono" value={code} readOnly={codeLocked}
                    onChange={(e) => { setCode(e.target.value); setCodeDirty(true) }} />
                </Field>
                <Field label="หน่วย" required>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="คิว" />
                </Field>
              </div>
              <Field label="รายการสินค้า" required>
                <Input value={name} onChange={(e) => { setName(e.target.value); setNameDirty(true) }} placeholder="เช่น คอนกรีตกำลังอัด 240 กก./ตร.ซม. (ปูน SCG)" />
              </Field>
              <Field label="ราคา/หน่วย (รวม VAT)" required>
                <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="เช่น 2400" />
              </Field>

              {/* สูตรวัตถุดิบ (Mix Design) ต่อ 1 คิว — เก็บในตัวสินค้าเอง (ไม่มีการผูกสูตรร่วมแล้ว). */}
              <div style={{ border: '1px solid var(--kpc-border)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--kpc-primary-ink)' }}>ส่วนผสมวัตถุดิบ (Mix Design) ต่อ 1 คิว</div>
                <div className="grid g-2" style={{ gap: 12 }}>
                  <Field label="ปูน (กก.)" required><Input type="number" min={0} value={mixCement} onChange={(e) => setMixCement(e.target.value)} placeholder="เช่น 280" /></Field>
                  <Field label="น้ำ (ล.)" required hint="ค่าเริ่มต้น 165 ล./คิว"><Input type="number" min={0} value={mixWater} onChange={(e) => setMixWater(e.target.value)} /></Field>
                  <Field label="ทราย (กก.)" required><Input type="number" min={0} value={mixSand} onChange={(e) => setMixSand(e.target.value)} placeholder="เช่น 830" /></Field>
                  <Field label={'หิน 3/4" (กก.)'} required><Input type="number" min={0} value={mixAggregate} onChange={(e) => setMixAggregate(e.target.value)} placeholder="เช่น 1140" /></Field>
                </div>
                <div className="grid g-3" style={{ gap: 12, marginTop: 12 }}>
                  <Field label="น้ำยาหน่วง (ล.)" hint="Plastomix-704 · ไม่บังคับ"><Input type="number" min={0} step={0.01} value={mixPlastomix} onChange={(e) => setMixPlastomix(e.target.value)} placeholder="เช่น 1.38" /></Field>
                  <Field label="น้ำยาเร่ง (ล.)" hint="PCE-1 Gold 500 SF · ไม่บังคับ"><Input type="number" min={0} step={0.01} value={mixAccelerator} onChange={(e) => setMixAccelerator(e.target.value)} placeholder="—" /></Field>
                  <Field label="กันซึม (ล.)" hint="SikaPlastocrete N · ไม่บังคับ"><Input type="number" min={0} step={0.01} value={mixWaterproof} onChange={(e) => setMixWaterproof(e.target.value)} placeholder="—" /></Field>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid g-2" style={{ gap: 12 }}>
                <Field label="ประเภทสินค้า" required>
                  <Select value={kindSelectValue} disabled={readOnlyStructure} onChange={(e) => onKindSelect(e.target.value)}>
                    {FOUNDRY_KIND_OPTS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                    {foundryTypes.map((t) => <option key={TYPE_PREFIX + t} value={TYPE_PREFIX + t}>{t}</option>)}
                    <option value={CUSTOM_KIND}>+ เพิ่มประเภทใหม่…</option>
                  </Select>
                </Field>
                {isCustom && (
                  <Field label="ชื่อประเภทสินค้าใหม่" required>
                    <Input value={customType} readOnly={readOnlyStructure} onChange={(e) => setCustomType(e.target.value)} placeholder="เช่น รั้วสำเร็จรูป / ท่อระบายน้ำ" />
                  </Field>
                )}
                <Field label="หน่วย" required hint={isCustom ? 'สินค้าประเภทใหม่ต้องระบุหน่วยเอง' : undefined}>
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={isCustom ? 'เช่น ต้น / อัน / ชุด' : 'แผ่น / ต้น'} />
                </Field>
                <Field label="รหัสสินค้า" hint={mode === 'edit' ? (!codeLocked ? 'แก้ไขรหัสได้ — ระบบจะอัปเดตการอ้างอิงให้' : undefined) : 'ไม่บังคับ — เว้นว่างระบบออกรหัสให้'}>
                  <Input className="input mono" value={code} readOnly={codeLocked}
                    onChange={(e) => { setCode(e.target.value); setCodeDirty(true) }} placeholder="เช่น KPCFDPL200 (เว้นว่างได้)" />
                </Field>
                {!isCustom && kind === 'wallpanel' && (
                  <Field label="การรับของ" required>
                    <Select value={pickup} onChange={(e) => setPickup(e.target.value as 'รับเอง' | 'จัดส่ง')}>
                      <option value="รับเอง">รับเอง</option>
                      <option value="จัดส่ง">จัดส่ง</option>
                    </Select>
                  </Field>
                )}
              </div>
              <Field label="รายการสินค้า" required>
                <Input value={name} onChange={(e) => { setName(e.target.value); setNameDirty(true) }} placeholder="เช่น แผ่นพื้น 0.05x0.35x2.00 ม." />
              </Field>
              {!isCustom && kind === 'ipole' ? (
                <div className="grid g-2" style={{ gap: 12 }}>
                  <Field label="ราคา · รับเอง (รวม VAT)" hint="ไม่บังคับ">
                    <Input type="number" min={0} value={priceSelf} onChange={(e) => setPriceSelf(e.target.value)} placeholder="เช่น 325 (เว้นว่างได้)" />
                  </Field>
                  <Field label="ราคา · จัดส่ง (รวม VAT)" hint="ไม่บังคับ">
                    <Input type="number" min={0} value={priceDeliver} onChange={(e) => setPriceDeliver(e.target.value)} placeholder="เช่น 400 (เว้นว่างได้)" />
                  </Field>
                </div>
              ) : (
                <Field label="ราคา/หน่วย (รวม VAT)" hint="ไม่บังคับ">
                  <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="เช่น 154 (เว้นว่างได้)" />
                </Field>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
