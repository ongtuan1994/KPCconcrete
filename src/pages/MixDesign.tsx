import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Badge, Pill, SearchInput, Button, Field, Input } from '../components/ui'
import { Modal } from '../components/Modal'
import { DataTable, type Column } from '../components/DataTable'
import { KpiCard } from '../components/charts'
import { MIX_DESIGNS, buildMixFormulaNos, type MixDesign } from '../data/mixDesign'
import { PRODUCTS, type Product } from '../data/real'
import { prodName, cleanProductName as cleanName } from '../data/selectors'
import { addGeneralReport, addMixDesign, updateMixDesign, removeMixDesign, isAddedMixDesign, updateProduct, useCreatedDocs, type MixDesignReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type BrandFilter = 'all' | 'scg' | 'dokbua'
/** R2/P2 codes = ปูนดอกบัว ; otherwise ปูน SCG. */
const isDokbua = (code: string) => /^KPC[RP]2/.test(code)
const isPlant = (p: Product) => (p.site ?? 'plant') === 'plant'

export function MixDesign() {
  const [params] = useSearchParams()
  const [brand, setBrand] = useState<BrandFilter>('all')
  /* Deep-link from the price list: ?code=<product> pre-fills the search so the
     linked formula is the only row shown. */
  const [query, setQuery] = useState(() => params.get('code') ?? '')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MixDesign | null>(null)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* Merged formula list (seed + user-added), edits applied. Seed first in file
     order, then added oldest-first, so formula numbers stay stable as they grow. */
  const mixList = useMemo(() => {
    const added = created.mixDesignsAdded.slice().reverse()
    const ordered: MixDesign[] = [...MIX_DESIGNS, ...added]
    return ordered.map((m) => (created.mixDesignEdits[m.code] ? { ...m, ...created.mixDesignEdits[m.code] } : m))
  }, [created.mixDesignsAdded, created.mixDesignEdits])

  const formulaNos = useMemo(() => buildMixFormulaNos(mixList), [mixList])
  const formulaNo = (code: string) => formulaNos.get(code) ?? ''

  /* Product names — resolve user-added products too (prodName only knows seed). */
  const nameByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of created.productsAdded) m.set(p.code, cleanName(p.name))
    for (const [code, e] of Object.entries(created.productEdits)) if (e.name) m.set(code, cleanName(e.name))
    return m
  }, [created.productsAdded, created.productEdits])
  const nameOf = (code: string) => nameByCode.get(code) ?? prodName(code)

  /* เลขที่สูตร a plant product currently resolves to — its own สูตร, or the สูตร
     it is linked to via formulaCode — or '' when it has none yet. */
  const formulaOfProduct = (p: Product): string => {
    const own = formulaNo(p.code)
    if (own) return own
    const fc = created.productEdits[p.code]?.formulaCode || p.formulaCode
    return fc ? formulaNo(fc) : ''
  }

  const rows = useMemo(
    () => mixList.filter((m) => {
      if (brand === 'scg' && isDokbua(m.code)) return false
      if (brand === 'dokbua' && !isDokbua(m.code)) return false
      if (query && !`${m.code} ${nameOf(m.code)} ${formulaNo(m.code)}`.toLowerCase().includes(query.toLowerCase())) return false
      return true
    }),
    [mixList, brand, query, formulaNos],
  )

  const num = (n?: number) => (n ? <span className="mono">{n.toLocaleString()}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>)

  const scopeLabel = brand === 'scg' ? 'ปูน SCG' : brand === 'dokbua' ? 'ปูนดอกบัว' : 'ทุกยี่ห้อ'

  /* All plant products (seed + added) — for the KPI card and the เพิ่มสูตร picker. */
  const allPlantProducts = useMemo(
    () => [...PRODUCTS.filter(isPlant), ...created.productsAdded.filter(isPlant)],
    [created.productsAdded],
  )
  const plantInScope = allPlantProducts.filter((p) => {
    if (brand === 'scg' && isDokbua(p.code)) return false
    if (brand === 'dokbua' && !isDokbua(p.code)) return false
    return true
  })

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
        formulaNo: formulaNo(r.code),
        code: r.code, name: nameOf(r.code), brand: isDokbua(r.code) ? 'ดอกบัว' : 'SCG',
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
    { key: 'formulaNo', header: 'เลขที่สูตร', cell: (r) => formulaNo(r.code), className: 'docno' },
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'รายการ', cell: (r) => <span className="th">{nameOf(r.code)}</span> },
    { key: 'brand', header: 'ปูนซีเมนต์', align: 'center', cell: (r) => <Badge tone={isDokbua(r.code) ? 'success' : 'danger'} pip={false} square>{isDokbua(r.code) ? 'ดอกบัว' : 'SCG'}</Badge> },
    { key: 'cement', header: 'ปูน (กก.)', align: 'right', cell: (r) => num(r.cement) },
    { key: 'sand', header: 'ทราย (กก.)', align: 'right', cell: (r) => num(r.sand) },
    { key: 'agg', header: 'หิน 3/4" (กก.)', align: 'right', cell: (r) => num(r.aggregate) },
    { key: 'd', header: 'Plastomix-704 (D)', align: 'right', cell: (r) => num(r.plastomix) },
    { key: 'f', header: 'Sikament F2 (F)', align: 'right', cell: (r) => num(r.sikament) },
    { key: 'pce', header: 'PCE-1', align: 'right', cell: (r) => num(r.pce) },
    { key: 'edit', header: '', align: 'center', cell: (r) => <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>แก้ไข</Button> },
  ]

  return (
    <>
      <PageHeader
        title="Mix Design"
        sub={`สูตรส่วนผสมคอนกรีตต่อ 1 คิว · ${mixList.length} สูตร`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['เลขที่สูตร', 'รหัสสินค้า', 'รายการ', 'ปูนซีเมนต์', 'ปูน (กก./คิว)', 'ทราย (กก./คิว)', 'หิน (กก./คิว)', 'Plastomix-704 (ล./คิว)', 'Sikament F2 (ล./คิว)', 'PCE-1 (ล./คิว)']
              const body = rows.map((r) => [formulaNo(r.code), r.code, nameOf(r.code), isDokbua(r.code) ? 'ดอกบัว' : 'SCG', r.cement, r.sand, r.aggregate, r.plastomix ?? '', r.sikament ?? '', r.pce ?? ''])
              downloadCsv('mix-design', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
            <Button variant="primary" onClick={() => setAdding(true)}>เพิ่มสูตร</Button>
          </>
        }
      />

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <KpiCard label="จำนวนสูตร · Mix Design" value={rows.length.toString()} unit="สูตร" note={`ขอบเขต: ${scopeLabel}`} />
        <KpiCard label="สินค้าแพล้นปูน · Plant Products" value={plantInScope.length.toString()} unit="รายการ" note={`ขอบเขต: ${scopeLabel}`} />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={brand === 'all'} onClick={() => setBrand('all')}>ทั้งหมด {mixList.length}</Pill>
          <Pill active={brand === 'scg'} onClick={() => setBrand('scg')}>SCG</Pill>
          <Pill active={brand === 'dokbua'} onClick={() => setBrand('dokbua')}>ดอกบัว</Pill>
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่สูตร / รหัส / ชื่อสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} สูตร`} />
      <p className="page-sub" style={{ marginTop: 12, fontSize: 12 }}>
        * ปริมาณต่อ 1 คิว — ปูน/ทราย/หิน เป็นกิโลกรัม · น้ำยาเป็นลิตร · ใช้คำนวณการจ่ายออกวัตถุดิบเมื่อออกใบจ่ายคอนกรีต
      </p>

      <MixFormulaModal open={adding} mode="add" plantProducts={allPlantProducts} formulaOfProduct={formulaOfProduct} nameOf={nameOf} onClose={() => setAdding(false)} />
      <MixFormulaModal
        key={editing?.code ?? 'edit'}
        open={!!editing}
        mode="edit"
        initial={editing ?? undefined}
        plantProducts={allPlantProducts}
        formulaOfProduct={formulaOfProduct}
        nameOf={nameOf}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/** เพิ่ม / แก้ไขสูตร Mix Design. Add mode picks a plant product first (only those
    without a formula yet); edit mode keeps the product fixed and edits the mix. */
function MixFormulaModal({
  open,
  mode,
  initial,
  plantProducts,
  formulaOfProduct,
  nameOf,
  onClose,
}: {
  open: boolean
  mode: 'add' | 'edit'
  initial?: MixDesign
  plantProducts: Product[]
  formulaOfProduct: (p: Product) => string
  nameOf: (code: string) => string
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formulaNo, setFormulaNo] = useState('')
  const [cement, setCement] = useState('')
  const [sand, setSand] = useState('')
  const [aggregate, setAggregate] = useState('')
  const [plastomix, setPlastomix] = useState('')
  const [sikament, setSikament] = useState('')
  const [pce, setPce] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    const s = (n?: number) => (n ? String(n) : '')
    if (mode === 'edit' && initial) {
      setSelected(new Set([initial.code]))
      setFormulaNo(initial.formulaNo ?? '')
      setCement(s(initial.cement)); setSand(s(initial.sand)); setAggregate(s(initial.aggregate))
      setPlastomix(s(initial.plastomix)); setSikament(s(initial.sikament)); setPce(s(initial.pce))
    } else {
      setSelected(new Set()); setFormulaNo('')
      setCement(''); setSand(''); setAggregate(''); setPlastomix(''); setSikament(''); setPce('')
    }
  }, [open, mode, initial])

  const toggle = (c: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(c)) next.delete(c); else next.add(c)
    return next
  })

  /* Owner code = the สูตร owner (edit: fixed; add: first ticked in list order). */
  const ownerCode = mode === 'edit'
    ? (initial?.code ?? '')
    : (plantProducts.find((p) => selected.has(p.code))?.code ?? '')

  const submit = () => {
    setErr('')
    const codes = mode === 'edit'
      ? [initial!.code]
      : plantProducts.filter((p) => selected.has(p.code)).map((p) => p.code)
    if (codes.length === 0) return setErr('กรุณาเลือกสินค้าแพล้นปูนอย่างน้อย 1 รายการ')
    const req = (label: string, v: string): number | null => {
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) { setErr(`กรุณากรอก${label}ให้ถูกต้อง`); return null }
      return Math.round(n * 100) / 100
    }
    const c = req('ปูน (กก.)', cement); if (c === null) return
    const sd = req('ทราย (กก.)', sand); if (sd === null) return
    const ag = req('หิน (กก.)', aggregate); if (ag === null) return
    const opt = (v: string): number | undefined => {
      const n = Number(v)
      return v.trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined
    }
    const fno = formulaNo.trim() || undefined
    const owner = codes[0]
    const m: MixDesign = { code: owner, cement: c, sand: sd, aggregate: ag, plastomix: opt(plastomix), sikament: opt(sikament), pce: opt(pce), formulaNo: fno }
    if (mode === 'add') {
      addMixDesign(m)
      /* The remaining picks SHARE this สูตร via a formulaCode link to the owner. */
      for (const cc of codes.slice(1)) updateProduct(cc, { formulaCode: owner })
    } else {
      updateMixDesign(initial!.code, m)
    }
    onClose()
  }

  const canDelete = mode === 'edit' && !!initial && isAddedMixDesign(initial.code)
  const del = () => {
    if (initial && confirm(`ลบสูตร ${initial.code} — ${nameOf(initial.code)} ?`)) { removeMixDesign(initial.code); onClose() }
  }

  const selBrand = ownerCode ? (isDokbua(ownerCode) ? 'ดอกบัว (CF2-xxx)' : 'SCG (CF0-xxx)') : ''

  return (
    <Modal
      open={open}
      title={mode === 'add' ? 'เพิ่มสูตร Mix Design' : `แก้ไขสูตร ${initial?.code ?? ''}`}
      onClose={onClose}
      maxWidth={640}
      footer={
        <>
          {canDelete && <Button variant="secondary" onClick={del} style={{ color: 'var(--kpc-danger, #dc2626)', marginRight: 'auto' }}>ลบสูตร</Button>}
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>{mode === 'add' ? 'เพิ่มสูตร' : 'บันทึก'}</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="stack" style={{ gap: 12 }}>
        <Field label="สินค้าแพล้นปูน" required hint={mode === 'edit' ? undefined : 'ติ๊กเลือกได้หลายรายการ — ทุกตัวจะใช้สูตรนี้ร่วมกัน · รายการที่มีสูตรแล้วจะแสดงเลขที่สูตรและเลือกไม่ได้'}>
          {mode === 'edit' ? (
            <Input value={`${initial?.code ?? ''} · ${nameOf(initial?.code ?? '')}`} readOnly className="input mono" />
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--kpc-border)', borderRadius: 8, padding: 6 }}>
              {plantProducts.map((p) => {
                const fno = formulaOfProduct(p)
                const has = fno !== ''
                return (
                  <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, cursor: has ? 'not-allowed' : 'pointer', opacity: has ? 0.55 : 1 }}>
                    <input type="checkbox" checked={selected.has(p.code)} disabled={has} onChange={() => toggle(p.code)} />
                    <span className="mono" style={{ fontSize: 12.5 }}>{p.code}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--kpc-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanName(p.name)}</span>
                    {has && <Badge tone="neutral" pip={false} square>{fno}</Badge>}
                  </label>
                )
              })}
            </div>
          )}
        </Field>

        <Field label="เลขที่สูตร" hint={`เว้นว่าง = ออกเลขอัตโนมัติ${selBrand ? ` · ${selBrand}` : ''}`}>
          <Input className="input mono" value={formulaNo} onChange={(e) => setFormulaNo(e.target.value)} placeholder="เช่น CF0-012 (เว้นว่าง = อัตโนมัติ)" />
        </Field>

        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--kpc-text)', marginTop: 4 }}>ส่วนผสมต่อ 1 คิว</div>
        <div className="grid g-3" style={{ gap: 12 }}>
          <Field label="ปูน (กก.)" required>
            <Input type="number" min={0} value={cement} onChange={(e) => setCement(e.target.value)} placeholder="เช่น 280" />
          </Field>
          <Field label="ทราย (กก.)" required>
            <Input type="number" min={0} value={sand} onChange={(e) => setSand(e.target.value)} placeholder="เช่น 830" />
          </Field>
          <Field label="หิน 3/4&quot; (กก.)" required>
            <Input type="number" min={0} value={aggregate} onChange={(e) => setAggregate(e.target.value)} placeholder="เช่น 1140" />
          </Field>
        </div>
        <div className="grid g-3" style={{ gap: 12 }}>
          <Field label="Plastomix-704 (ล.)" hint="ไม่บังคับ">
            <Input type="number" min={0} step={0.01} value={plastomix} onChange={(e) => setPlastomix(e.target.value)} placeholder="เช่น 1.38" />
          </Field>
          <Field label="Sikament F2 (ล.)" hint="ไม่บังคับ">
            <Input type="number" min={0} step={0.01} value={sikament} onChange={(e) => setSikament(e.target.value)} placeholder="—" />
          </Field>
          <Field label="PCE-1 (ล.)" hint="ไม่บังคับ">
            <Input type="number" min={0} step={0.01} value={pce} onChange={(e) => setPce(e.target.value)} placeholder="—" />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
