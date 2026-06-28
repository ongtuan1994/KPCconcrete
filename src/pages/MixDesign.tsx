import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Badge, Pill, SearchInput, Button } from '../components/ui'
import { DataTable, type Column } from '../components/DataTable'
import { MIX_DESIGNS, type MixDesign } from '../data/mixDesign'
import { prodName } from '../data/selectors'
import { addGeneralReport, type MixDesignReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type BrandFilter = 'all' | 'scg' | 'dokbua'
/** R2/P2 codes = ปูนดอกบัว ; otherwise ปูน SCG. */
const isDokbua = (code: string) => /^KPC[RP]2/.test(code)

export function MixDesign() {
  const [brand, setBrand] = useState<BrandFilter>('all')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const rows = useMemo(
    () => MIX_DESIGNS.filter((m) => {
      if (brand === 'scg' && isDokbua(m.code)) return false
      if (brand === 'dokbua' && !isDokbua(m.code)) return false
      if (query && !`${m.code} ${prodName(m.code)}`.toLowerCase().includes(query.toLowerCase())) return false
      return true
    }),
    [brand, query],
  )

  const num = (n?: number) => (n ? <span className="mono">{n.toLocaleString()}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>)

  const scopeLabel = brand === 'scg' ? 'ปูน SCG' : brand === 'dokbua' ? 'ปูนดอกบัว' : 'ทุกยี่ห้อ'
  const createReport = () => {
    if (rows.length === 0) { alert('ไม่มีสูตรให้สร้างรายงาน'); return }
    const report: MixDesignReport = {
      id: `gr_${Date.now()}`,
      kind: 'mix-design',
      title: `สูตรส่วนผสมคอนกรีต (${scopeLabel})`,
      fromLabel: scopeLabel,
      toLabel: `${rows.length} สูตร`,
      scopeLabel,
      rows: rows.map((r) => ({
        code: r.code, name: prodName(r.code), brand: isDokbua(r.code) ? 'ดอกบัว' : 'SCG',
        cement: r.cement, sand: r.sand, aggregate: r.aggregate,
        plastomix: r.plastomix, sikament: r.sikament, pce: r.pce,
      })),
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  const columns: Column<MixDesign>[] = [
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'รายการ', cell: (r) => <span className="th">{prodName(r.code)}</span> },
    { key: 'brand', header: 'ปูนซีเมนต์', align: 'center', cell: (r) => <Badge tone={isDokbua(r.code) ? 'success' : 'danger'} pip={false} square>{isDokbua(r.code) ? 'ดอกบัว' : 'SCG'}</Badge> },
    { key: 'cement', header: 'ปูน (กก.)', align: 'right', cell: (r) => num(r.cement) },
    { key: 'sand', header: 'ทราย (กก.)', align: 'right', cell: (r) => num(r.sand) },
    { key: 'agg', header: 'หิน 3/4" (กก.)', align: 'right', cell: (r) => num(r.aggregate) },
    { key: 'd', header: 'Plastomix-704 (D)', align: 'right', cell: (r) => num(r.plastomix) },
    { key: 'f', header: 'Sikament F2 (F)', align: 'right', cell: (r) => num(r.sikament) },
    { key: 'pce', header: 'PCE-1', align: 'right', cell: (r) => num(r.pce) },
  ]

  return (
    <>
      <PageHeader
        title="Mix Design"
        sub={`สูตรส่วนผสมคอนกรีตต่อ 1 คิว · ${MIX_DESIGNS.length} สูตร`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['รหัสสินค้า', 'รายการ', 'ปูนซีเมนต์', 'ปูน (กก./คิว)', 'ทราย (กก./คิว)', 'หิน (กก./คิว)', 'Plastomix-704 (ล./คิว)', 'Sikament F2 (ล./คิว)', 'PCE-1 (ล./คิว)']
              const body = rows.map((r) => [r.code, prodName(r.code), isDokbua(r.code) ? 'ดอกบัว' : 'SCG', r.cement, r.sand, r.aggregate, r.plastomix ?? '', r.sikament ?? '', r.pce ?? ''])
              downloadCsv('mix-design', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
          </>
        }
      />

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={brand === 'all'} onClick={() => setBrand('all')}>ทั้งหมด {MIX_DESIGNS.length}</Pill>
          <Pill active={brand === 'scg'} onClick={() => setBrand('scg')}>SCG</Pill>
          <Pill active={brand === 'dokbua'} onClick={() => setBrand('dokbua')}>ดอกบัว</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="รหัส / ชื่อสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} สูตร`} />
      <p className="page-sub" style={{ marginTop: 12, fontSize: 12 }}>
        * ปริมาณต่อ 1 คิว — ปูน/ทราย/หิน เป็นกิโลกรัม · น้ำยาเป็นลิตร · ใช้คำนวณการจ่ายออกวัตถุดิบเมื่อออกใบจ่ายคอนกรีต
      </p>
    </>
  )
}
