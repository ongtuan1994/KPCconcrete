import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, Pill, type Tone } from '../components/ui'
import { DataTable, type Column } from '../components/DataTable'
import { PRODUCTS, type Product } from '../data/real'
import { baht } from '../data/selectors'

const CAT: Record<Product['category'], { th: string; tone: Tone }> = {
  concrete: { th: 'คอนกรีตผสมเสร็จ', tone: 'info' },
  precast: { th: 'พรีคาสท์', tone: 'warning' },
  lean: { th: 'Lean', tone: 'neutral' },
}

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
  { id: 'DOKBUA', label: 'ดอกบัว',           tone: 'danger' },
  { id: 'SCG',    label: 'ปูนปอร์ตแลนด์ SCG', tone: 'success' },
]
const BRAND_MAP: Record<BrandId, Brand> = Object.fromEntries(BRANDS.map((b) => [b.id, b])) as Record<BrandId, Brand>

function cementBrand(code: string): Brand | null {
  const tail = code.slice(3) /* strip "KPC" */
  if (tail.startsWith('R2') || tail.startsWith('P2')) return BRAND_MAP.DOKBUA
  if (tail.startsWith('RO') || tail.startsWith('PO')) return BRAND_MAP.SCG
  return null
}

export function Pricing() {
  const [cat, setCat] = useState<'all' | Product['category']>('all')
  const [zone, setZone] = useState<'all' | ZoneId>('all')
  const [brand, setBrand] = useState<'all' | BrandId>('all')

  const rows = PRODUCTS.filter((p) => {
    if (cat !== 'all' && p.category !== cat) return false
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

  const columns: Column<Product>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'รายการสินค้า', cell: (r) => <span className="th">{r.name}</span> },
    {
      key: 'brand',
      header: 'ปูนซีเมนต์',
      align: 'center',
      cell: (r) => {
        const b = cementBrand(r.code)
        return b
          ? <Badge tone={b.tone} pip={false} square>{b.label}</Badge>
          : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
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
    { key: 'cat', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={CAT[r.category].tone} pip={false} square>{CAT[r.category].th}</Badge> },
    { key: 'price', header: 'ราคา/หน่วย (รวม VAT)', align: 'right', cell: (r) => (r.price ? baht(r.price) : <span style={{ color: 'var(--kpc-text-faint)' }}>ภายใน</span>), className: 'amt' },
  ]

  return (
    <>
      <PageHeader
        title="ราคาสินค้า"
        sub="Price List · ราคาขายต่อคิว (อ้างอิงจริงจากใบจ่ายคอนกรีต)"
        actions={<Button variant="secondary">ปรับราคา</Button>}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)', minWidth: 72 }}>ประเภท</span>
          <div className="pills">
            <Pill active={cat === 'all'} onClick={() => setCat('all')}>ทั้งหมด {PRODUCTS.length}</Pill>
            <Pill active={cat === 'concrete'} onClick={() => setCat('concrete')}>คอนกรีต</Pill>
            <Pill active={cat === 'precast'} onClick={() => setCat('precast')}>พรีคาสท์</Pill>
            <Pill active={cat === 'lean'} onClick={() => setCat('lean')}>Lean</Pill>
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
    </>
  )
}
