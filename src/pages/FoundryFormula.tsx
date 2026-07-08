import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Badge, Pill, SearchInput, Button, Field, Input, Select, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { DataTable, type Column } from '../components/DataTable'
import { KpiCard } from '../components/charts'
import { PRODUCTS, type Product, type FoundryKind } from '../data/real'
import {
  buildFoundryFormulaNos, isFoundry, parseDims,
  FOUNDRY_MATERIALS, FOUNDRY_MATERIAL_MAP, KIND_MATERIALS, KIND_REQUIRED,
  type FoundryFormula, type FoundryMaterialKey,
} from '../data/foundryFormula'
import { cleanProductName as cleanName } from '../data/selectors'
import { useCreatedDocs, addFoundryFormula, updateFoundryFormula, removeFoundryFormula, addGeneralReport, type FoundryFormulaReport } from '../data/createdDocs'
import { downloadCsv } from '../utils/csv'

type KindFilter = 'all' | FoundryKind
const KIND: Record<FoundryKind, { th: string; tone: Tone }> = {
  plank: { th: 'แผ่นพื้น', tone: 'info' },
  ipole: { th: 'เสาไอ', tone: 'warning' },
  wallpanel: { th: 'แผ่นผนัง', tone: 'success' },
}
const KIND_ORDER: FoundryKind[] = ['plank', 'ipole', 'wallpanel']

/** สูตรผลิตโรงหล่อ — the foundry (precast) counterpart to Mix Design. Each formula
    is a reinforcement recipe (wire mesh / tie steel / PC wire, by kind) attached
    to a โรงหล่อ product, numbered FFGS / FFIP / FFCW. */
export function FoundryFormula() {
  const [kind, setKind] = useState<KindFilter>('all')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<FoundryFormula | null>(null)
  const created = useCreatedDocs()
  const navigate = useNavigate()

  /* All foundry products (seed + user-added, edits applied) — for names/kinds and the picker. */
  const foundryProducts = useMemo(() => {
    const added = created.productsAdded.filter(isFoundry)
    const merged: Product[] = [...PRODUCTS.filter(isFoundry), ...added]
    return merged.map((p) => (created.productEdits[p.code] ? { ...p, ...created.productEdits[p.code] } : p))
  }, [created.productsAdded, created.productEdits])
  const productByCode = useMemo(() => new Map(foundryProducts.map((p) => [p.code, p])), [foundryProducts])

  const formulas = created.foundryFormulas /* newest first */

  /* Number per kind in creation order (oldest first) so numbers stay stable. */
  const formulaNos = useMemo(
    () => buildFoundryFormulaNos(formulas.slice().reverse().map((f) => ({ code: f.code, kind: productByCode.get(f.code)?.kind }))),
    [formulas, productByCode],
  )
  const formulaNo = (code: string) => formulaNos.get(code) ?? ''
  const kindOf = (code: string) => productByCode.get(code)?.kind
  const nameOf = (code: string) => { const p = productByCode.get(code); return p ? cleanName(p.name) : code }

  const rows = useMemo(
    () => formulas.filter((f) => {
      const k = kindOf(f.code)
      if (kind !== 'all' && k !== kind) return false
      if (query && !`${f.code} ${nameOf(f.code)} ${formulaNo(f.code)}`.toLowerCase().includes(query.toLowerCase())) return false
      return true
    }),
    [formulas, productByCode, kind, query, formulaNos],
  )

  const kindCount = (k: FoundryKind) => formulas.filter((f) => kindOf(f.code) === k).length

  /* Foundry products that don't have a formula yet — the pool for เพิ่มสูตร. */
  const usedCodes = useMemo(() => new Set(formulas.map((f) => f.code)), [formulas])
  const addableProducts = useMemo(() => foundryProducts.filter((p) => !usedCodes.has(p.code)), [foundryProducts, usedCodes])

  const num = (n?: number) => (n ? <span className="mono">{n.toLocaleString('en-US', { maximumFractionDigits: 3 })}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>)
  const dimText = (name: string) => { const d = parseDims(name); return d ? <span className="mono">{d.a}×{d.b}×{d.c}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span> }

  const columns: Column<FoundryFormula>[] = [
    { key: 'formulaNo', header: 'เลขที่สูตร', cell: (r) => formulaNo(r.code), className: 'docno' },
    { key: 'code', header: 'รหัสสินค้า', cell: (r) => r.code, className: 'docno' },
    { key: 'name', header: 'รายการ', cell: (r) => <span className="th">{nameOf(r.code)}</span> },
    { key: 'kind', header: 'ประเภท', align: 'center', cell: (r) => { const k = kindOf(r.code); return k ? <Badge tone={KIND[k].tone} pip={false} square>{KIND[k].th}</Badge> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span> } },
    { key: 'dims', header: 'ขนาด (ม.)', align: 'center', cell: (r) => dimText(productByCode.get(r.code)?.name ?? '') },
    ...FOUNDRY_MATERIALS.map((mat): Column<FoundryFormula> => ({
      key: mat.key, header: `${mat.label} (${mat.unit})`, align: 'right', cell: (r) => num(r[mat.key]),
    })),
    { key: 'edit', header: '', align: 'center', cell: (r) => <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>แก้ไข</Button> },
  ]

  const scopeLabel = kind === 'all' ? 'ทุกประเภท' : KIND[kind].th

  const createReport = () => {
    if (rows.length === 0) { alert('ไม่มีสูตรให้สร้างรายงาน'); return }
    const report: FoundryFormulaReport = {
      id: `gr_${Date.now()}`,
      kind: 'foundry-formula',
      title: `สูตรผลิตโรงหล่อ (${scopeLabel})`,
      fromLabel: scopeLabel,
      toLabel: `${rows.length} สูตร`,
      scopeLabel,
      rows: rows.map((f) => {
        const p = productByCode.get(f.code)
        const d = p ? parseDims(p.name) : null
        const k = kindOf(f.code)
        return {
          formulaNo: formulaNo(f.code), code: f.code, name: nameOf(f.code),
          kind: k ? KIND[k].th : '', dims: d ? `${d.a}×${d.b}×${d.c}` : undefined,
          wireMesh: f.wireMesh, tieSteel: f.tieSteel, pcWire: f.pcWire, concrete: f.concrete,
        }
      }),
      createdAt: new Date().toISOString(),
    }
    addGeneralReport(report)
    if (confirm(`สร้างรายงาน "${report.title}" เก็บไว้ในเมนูรายงานทั่วไปแล้ว\n\nไปที่หน้ารายงานทั่วไปเลยไหม?`)) {
      navigate('/general-reports')
    }
  }

  return (
    <div className="foundry-theme">
      <PageHeader
        title="สูตรผลิตโรงหล่อ"
        sub={`สูตรการผลิตสินค้าโรงหล่อ (พรีคาสท์) · ${formulas.length} สูตร`}
        actions={
          <>
            <Button variant="secondary" onClick={() => {
              const head = ['เลขที่สูตร', 'รหัสสินค้า', 'รายการ', 'ประเภท', 'ขนาด (ม.)', ...FOUNDRY_MATERIALS.map((m) => `${m.label} (${m.unit})`)]
              const body = rows.map((r) => {
                const p = productByCode.get(r.code)
                const d = p ? parseDims(p.name) : null
                const k = kindOf(r.code)
                return [
                  formulaNo(r.code), r.code, nameOf(r.code), k ? KIND[k].th : '',
                  d ? `${d.a}x${d.b}x${d.c}` : '',
                  ...FOUNDRY_MATERIALS.map((m) => r[m.key] ?? ''),
                ]
              })
              downloadCsv('foundry-formula', [head, ...body])
            }}>ส่งออก Excel</Button>
            <Button variant="secondary" onClick={createReport} disabled={rows.length === 0}>สร้างรายงาน</Button>
            <Button variant="primary" onClick={() => setAdding(true)} disabled={addableProducts.length === 0}>เพิ่มสูตร</Button>
          </>
        }
      />

      <div className="grid g-2" style={{ marginBottom: 16 }}>
        <KpiCard label="จำนวนสูตร · Foundry Formula" value={rows.length.toString()} unit="สูตร" note={`ขอบเขต: ${scopeLabel}`} />
        <KpiCard label="ยังไม่ได้ตั้งสูตร · Products without formula" value={addableProducts.length.toString()} unit="รายการ" note="สินค้าโรงหล่อที่ยังไม่มีสูตร" invert />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="pills">
          <Pill active={kind === 'all'} onClick={() => setKind('all')}>ทั้งหมด {formulas.length}</Pill>
          {KIND_ORDER.map((k) => (
            <Pill key={k} active={kind === k} onClick={() => setKind(k)}>{KIND[k].th} {kindCount(k)}</Pill>
          ))}
        </div>
        <div style={{ width: 280 }}>
          <SearchInput placeholder="เลขที่สูตร / รหัส / ชื่อสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {formulas.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--kpc-text-faint)', fontSize: 13.5 }}>
          ยังไม่มีสูตรผลิตโรงหล่อ — กด “เพิ่มสูตร” เพื่อเลือกสินค้าโรงหล่อและกรอกวัสดุที่ใช้ผลิต
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} สูตร`} />
      )}
      <p className="page-sub" style={{ marginTop: 12, fontSize: 12 }}>
        * เลขที่สูตร: <strong>FFGS</strong> = แผ่นพื้น · <strong>FFIP</strong> = เสาไอ · <strong>FFCW</strong> = แผ่นผนัง
        · แผ่นพื้น/แผ่นผนังใช้ตะแกรงไวร์เมช · เสาไอใช้เหล็กปลอก + ลวดอัดแรง · ปริมาณต่อ 1 ชิ้น
      </p>

      <FoundryFormulaModal open={adding} mode="add" addableProducts={addableProducts} kindOf={kindOf} nameOf={nameOf} onClose={() => setAdding(false)} />
      <FoundryFormulaModal
        key={editing?.code ?? 'edit'}
        open={!!editing}
        mode="edit"
        initial={editing ?? undefined}
        addableProducts={addableProducts}
        kindOf={kindOf}
        nameOf={nameOf}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

/** เพิ่ม / แก้ไขสูตรผลิตโรงหล่อ. Add mode picks a foundry product first (only those
    without a formula), then shows the reinforcement inputs for that product's kind. */
function FoundryFormulaModal({
  open,
  mode,
  initial,
  addableProducts,
  kindOf,
  nameOf,
  onClose,
}: {
  open: boolean
  mode: 'add' | 'edit'
  initial?: FoundryFormula
  addableProducts: Product[]
  kindOf: (code: string) => FoundryKind | undefined
  nameOf: (code: string) => string
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const blankVals = (): Record<FoundryMaterialKey, string> => ({ wireMesh: '', tieSteel: '', pcWire: '', concrete: '' })
  const [vals, setVals] = useState<Record<FoundryMaterialKey, string>>(blankVals())
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    if (mode === 'edit' && initial) {
      setCode(initial.code)
      setVals({
        wireMesh: initial.wireMesh ? String(initial.wireMesh) : '',
        tieSteel: initial.tieSteel ? String(initial.tieSteel) : '',
        pcWire: initial.pcWire ? String(initial.pcWire) : '',
        concrete: initial.concrete ? String(initial.concrete) : '',
      })
    } else {
      setCode(''); setVals(blankVals())
    }
  }, [open, mode, initial])

  const kind = code ? kindOf(code) : undefined
  const materialKeys = kind ? KIND_MATERIALS[kind] : []

  const submit = () => {
    setErr('')
    if (!code) return setErr('กรุณาเลือกสินค้าโรงหล่อก่อน')
    if (!kind) return setErr('ไม่พบประเภทของสินค้านี้')
    for (const key of KIND_REQUIRED[kind]) {
      const n = Number(vals[key])
      if (!(vals[key].trim() !== '' && Number.isFinite(n) && n > 0)) return setErr(`กรุณากรอก${FOUNDRY_MATERIAL_MAP[key].label}ให้ถูกต้อง`)
    }
    const f: FoundryFormula = { code }
    for (const key of materialKeys) {
      const n = Number(vals[key])
      f[key] = vals[key].trim() !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : undefined
    }
    if (mode === 'add') addFoundryFormula(f)
    else updateFoundryFormula(initial!.code, f)
    onClose()
  }

  const del = () => {
    if (initial && confirm(`ลบสูตร ${initial.code} — ${nameOf(initial.code)} ?`)) { removeFoundryFormula(initial.code); onClose() }
  }

  return (
    <Modal
      open={open}
      title={mode === 'add' ? 'เพิ่มสูตรผลิตโรงหล่อ' : `แก้ไขสูตร ${initial?.code ?? ''}`}
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          {mode === 'edit' && <Button variant="secondary" onClick={del} style={{ color: 'var(--kpc-danger, #dc2626)', marginRight: 'auto' }}>ลบสูตร</Button>}
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>{mode === 'add' ? 'เพิ่มสูตร' : 'บันทึก'}</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="stack" style={{ gap: 12 }}>
        <Field label="สินค้าโรงหล่อ" required hint={mode === 'edit' ? undefined : 'เลือกได้เฉพาะสินค้าที่ยังไม่มีสูตร'}>
          {mode === 'edit' ? (
            <Input value={`${code} · ${nameOf(code)}`} readOnly className="input mono" />
          ) : (
            <Select value={code} onChange={(e) => { setCode(e.target.value); setVals(blankVals()) }}>
              <option value="">— เลือกสินค้าโรงหล่อ —</option>
              {addableProducts.map((p) => (
                <option key={p.code} value={p.code}>{p.code} · {cleanName(p.name)}</option>
              ))}
            </Select>
          )}
        </Field>

        {kind && (
          <>
            <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: -4 }}>
              ประเภท: <strong>{KIND[kind].th}</strong> · วัสดุที่ใช้ผลิตต่อ 1 ชิ้น
            </div>
            <div className="grid g-2" style={{ gap: 12 }}>
              {materialKeys.map((key) => {
                const meta = FOUNDRY_MATERIAL_MAP[key]
                const required = KIND_REQUIRED[kind].includes(key)
                return (
                  <Field key={key} label={`${meta.label} (${meta.unit})`} required={required} hint={required ? undefined : 'ไม่บังคับ'}>
                    <Input
                      type="number" min={0} step={meta.step}
                      value={vals[key]}
                      onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
                      placeholder={required ? 'เช่น 1' : '—'}
                    />
                  </Field>
                )
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
