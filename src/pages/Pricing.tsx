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

export function Pricing() {
  const [cat, setCat] = useState<'all' | Product['category']>('all')
  const rows = PRODUCTS.filter((p) => cat === 'all' || p.category === cat)

  const columns: Column<Product>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'รายการสินค้า', cell: (r) => <span className="th">{r.name}</span> },
    { key: 'str', header: 'กำลังอัด', align: 'right', cell: (r) => (r.strengthKsc ? <span className="mono">{r.strengthKsc} ksc</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'unit', header: 'หน่วย', align: 'center', cell: (r) => <span className="th" style={{ color: 'var(--kpc-text-muted)' }}>{r.unit}</span> },
    { key: 'cat', header: 'ประเภท', align: 'center', cell: (r) => <Badge tone={CAT[r.category].tone} pip={false} square>{CAT[r.category].th}</Badge> },
    { key: 'price', header: 'ราคา/หน่วย', align: 'right', cell: (r) => (r.price ? baht(r.price) : <span style={{ color: 'var(--kpc-text-faint)' }}>ภายใน</span>), className: 'amt' },
  ]

  return (
    <>
      <PageHeader
        title="ราคาสินค้า"
        sub="Price List · ราคาขายต่อคิว (อ้างอิงจริงจากใบจ่ายคอนกรีต)"
        actions={<Button variant="secondary">ปรับราคา</Button>}
      />
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="pills">
          <Pill active={cat === 'all'} onClick={() => setCat('all')}>ทั้งหมด {PRODUCTS.length}</Pill>
          <Pill active={cat === 'concrete'} onClick={() => setCat('concrete')}>คอนกรีต</Pill>
          <Pill active={cat === 'precast'} onClick={() => setCat('precast')}>พรีคาสท์</Pill>
          <Pill active={cat === 'lean'} onClick={() => setCat('lean')}>Lean</Pill>
        </div>
      </div>
      <DataTable columns={columns} rows={rows} pageSize={12} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      <p className="page-sub" style={{ marginTop: 14 }}>
        * ราคาเป็นราคาขายเฉลี่ยที่พบบ่อยที่สุดจากใบจ่ายคอนกรีตจริงประจำเดือน · ราคาจริงอาจปรับตามระยะทางและปริมาณสั่งซื้อ
      </p>
    </>
  )
}
