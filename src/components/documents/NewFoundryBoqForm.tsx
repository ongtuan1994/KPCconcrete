import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { BOQ_MATERIALS, boqOutput, toBoqDef, type BoqMaterialDef } from '../../data/foundryBoq'
import {
  addFoundryBoq, updateFoundryBoq, useCreatedDocs,
  type FoundryBoq, type FoundryBoqProduct, type FoundryBoqMaterial, type FoundryMaterialKey, type FoundryProductType,
} from '../../data/createdDocs'

const PRODUCT_TYPES: FoundryProductType[] = ['คาน', 'เสาเข็ม', 'เสาอาคาร']
const nq = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 })

/* Monotonic ids for React row keys (form-local; resets are harmless). */
let _uid = 0
const rowUid = () => `m${++_uid}`

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Next BOQ number: BOQ + 5-digit running, scanning existing so re-runs don't clash. */
function nextBoqNo(existing: FoundryBoq[]): string {
  let max = 0
  for (const b of existing) {
    const n = parseInt(b.no.replace(/^BOQ/, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return `BOQ${String(max + 1).padStart(5, '0')}`
}

/** One editable material row — a chosen material plus its raw string inputs (only
    the mode-relevant ones are used). Rows are a list, so a material may repeat. */
interface DraftMatRow {
  rowId: string
  key: FoundryMaterialKey
  value?: string; length?: string; count?: string; beamLength?: string; spacing?: string
}
interface DraftProduct { id: string; type: FoundryProductType; detail: string; code: string; qty: string; materials: DraftMatRow[] }

const emptyRow = (key: FoundryMaterialKey = 'concrete'): DraftMatRow => ({ rowId: rowUid(), key })
const emptyProduct = (id: string): DraftProduct => ({ id, type: 'คาน', detail: '', code: '', qty: '1', materials: [emptyRow()] })

const parse = (s?: string): number | undefined => {
  if (s == null || s.trim() === '') return undefined
  const n = Number(s)
  return Number.isNaN(n) ? undefined : n
}

/** Build a stored material line from a draft row (the def's mode picks the inputs). */
function toMaterial(r: DraftMatRow, def: BoqMaterialDef): FoundryBoqMaterial {
  switch (def.mode) {
    case 'direct': return { key: r.key, value: parse(r.value) }
    case 'lengthCount': return { key: r.key, length: parse(r.length), count: parse(r.count) }
    case 'lengthSpacing': return { key: r.key, beamLength: parse(r.beamLength), spacing: parse(r.spacing) }
    case 'countFixed': return { key: r.key, count: parse(r.count) }
  }
}

export function NewFoundryBoqForm({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: (b: FoundryBoq) => void
  editing?: FoundryBoq | null
}) {
  const created = useCreatedDocs()
  const isEdit = !!editing
  /* Seed BOQ materials + user-added foundry materials (from the stock page), so
     newly added materials are selectable here too. */
  const boqMaterials = useMemo(
    () => [...BOQ_MATERIALS, ...created.foundryMaterialsAdded.map(toBoqDef)],
    [created.foundryMaterialsAdded],
  )
  const matMap = useMemo(
    () => Object.fromEntries(boqMaterials.map((d) => [d.key, d])) as Record<string, BoqMaterialDef>,
    [boqMaterials],
  )
  /* Resolve a row's material def; unknown (since-deleted) keys fall back to a
     direct-mode stub so old BOQs still render. */
  const defOf = (key: FoundryMaterialKey): BoqMaterialDef => matMap[key] ?? { key, label: String(key), unit: '', mode: 'direct' }
  const [project, setProject] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [products, setProducts] = useState<DraftProduct[]>([emptyProduct('p1')])
  const [err, setErr] = useState('')

  const newNo = useMemo(() => nextBoqNo(created.foundryBoqs), [created.foundryBoqs, open])
  const no = editing?.no ?? newNo

  useEffect(() => {
    if (!open) return
    if (editing) {
      setProject(editing.project)
      setDate(editing.date)
      setNote(editing.note ?? '')
      setProducts(editing.products.map((p, i) => ({
        id: p.id || `p${i + 1}`,
        type: p.type,
        detail: p.detail ?? '',
        code: p.code,
        qty: String(p.qty),
        materials: (p.materials.length ? p.materials : [{ key: 'concrete' as FoundryMaterialKey }]).map((m) => ({
          rowId: rowUid(),
          key: m.key,
          value: m.value != null ? String(m.value) : undefined,
          length: m.length != null ? String(m.length) : undefined,
          count: m.count != null ? String(m.count) : undefined,
          beamLength: m.beamLength != null ? String(m.beamLength) : undefined,
          spacing: m.spacing != null ? String(m.spacing) : undefined,
        })),
      })))
    } else {
      setProject(''); setDate(todayIso()); setNote(''); setProducts([emptyProduct('p1')])
    }
    setErr('')
  }, [open, editing])

  const addProduct = () => setProducts((ps) => [...ps, emptyProduct(`p${ps.length + 1}_${_uid}`)])
  const removeProduct = (i: number) => setProducts((ps) => (ps.length === 1 ? ps : ps.filter((_, idx) => idx !== i)))
  const setProduct = (i: number, patch: Partial<DraftProduct>) =>
    setProducts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  /* ── material-row ops (per product) ── */
  const mutRows = (pi: number, fn: (rows: DraftMatRow[]) => DraftMatRow[]) =>
    setProducts((ps) => ps.map((p, idx) => (idx === pi ? { ...p, materials: fn(p.materials) } : p)))
  const addMatRow = (pi: number) => mutRows(pi, (rows) => [...rows, emptyRow()])
  const removeMatRow = (pi: number, rowId: string) => mutRows(pi, (rows) => (rows.length === 1 ? rows : rows.filter((r) => r.rowId !== rowId)))
  const duplicateMatRow = (pi: number, rowId: string) => mutRows(pi, (rows) => {
    const at = rows.findIndex((r) => r.rowId === rowId)
    if (at < 0) return rows
    const copy = { ...rows[at], rowId: rowUid() }
    return [...rows.slice(0, at + 1), copy, ...rows.slice(at + 1)]
  })
  const setMatRow = (pi: number, rowId: string, patch: Partial<DraftMatRow>) =>
    mutRows(pi, (rows) => rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  /* Changing the material clears the inputs (fields differ per mode). */
  const changeMatKey = (pi: number, rowId: string, key: FoundryMaterialKey) =>
    mutRows(pi, (rows) => rows.map((r) => (r.rowId === rowId ? { rowId: r.rowId, key } : r)))

  const submit = () => {
    setErr('')
    if (!project.trim()) return setErr('กรุณาระบุชื่อโครงการ / ลูกค้า')
    if (!date) return setErr('กรุณาระบุวันที่')

    const cleaned: FoundryBoqProduct[] = []
    for (const p of products) {
      const qty = Number(p.qty)
      if (!qty || qty <= 0) return setErr(`กรุณาระบุจำนวน (ตัว) ของสินค้า "${p.type}" ให้มากกว่า 0`)
      const materials: FoundryBoqMaterial[] = []
      for (const r of p.materials) {
        const m = toMaterial(r, defOf(r.key))
        if (boqOutput(m) > 0) materials.push(m)
      }
      if (materials.length === 0) continue /* skip products with no takeoff */
      cleaned.push({ id: p.id, type: p.type, detail: p.detail.trim() || undefined, code: p.code.trim(), qty, materials })
    }
    if (cleaned.length === 0) return setErr('กรุณาถอดวัตถุดิบอย่างน้อย 1 รายการในสินค้าอย่างน้อย 1 ตัว')

    const b: FoundryBoq = {
      id: no,
      no,
      project: project.trim(),
      date,
      products: cleaned,
      note: note.trim() || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }
    if (isEdit) updateFoundryBoq(b)
    else addFoundryBoq(b)
    onSaved(b)
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `แก้ไขประเมินราคา ${no}` : 'สร้างประเมินราคาสินค้าโรงหล่อ'}
      onClose={onClose}
      maxWidth={960}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>บันทึก</Button>
        </>
      }
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-3" style={{ marginBottom: 16 }}>
        <Field label="เลขที่" hint={isEdit ? 'เลขที่เดิม (แก้ไขไม่ได้)' : 'ระบบออกเลขให้อัตโนมัติ'}>
          <div className="input" style={{ background: 'var(--kpc-surface-alt)', display: 'flex', alignItems: 'center', fontFamily: 'var(--kpc-font-mono)', fontWeight: 600 }}>
            {no}
          </div>
        </Field>
        <Field label="ชื่อโครงการ / ลูกค้า" required>
          <Input placeholder="เช่น โครงการบ้านเดี่ยว คุณสมชาย" value={project} onChange={(e) => setProject(e.target.value)} />
        </Field>
        <Field label="วันที่" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        {products.map((p, i) => {
          const qty = Number(p.qty) || 0
          return (
            <div key={p.id} className="card" style={{ padding: 14 }}>
              <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
                <Field label="ประเภทสินค้า" style={{ width: 140 }}>
                  <Select value={p.type} onChange={(e) => setProduct(i, { type: e.target.value as FoundryProductType })}>
                    {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="รายละเอียด" style={{ minWidth: 200, flex: 1 }}>
                  <Input placeholder="เช่น คานรับพื้น ยาว 4 ม." value={p.detail} onChange={(e) => setProduct(i, { detail: e.target.value })} />
                </Field>
                <Field label="เลขที่/รหัสสินค้า" style={{ width: 150 }}>
                  <Input placeholder="เช่น B-01" value={p.code} onChange={(e) => setProduct(i, { code: e.target.value })} />
                </Field>
                <Field label="จำนวน (ตัว)" style={{ width: 110 }}>
                  <Input type="number" min={1} step="1" value={p.qty} onChange={(e) => setProduct(i, { qty: e.target.value })} />
                </Field>
                <Button
                  variant="ghost" size="sm" onClick={() => removeProduct(i)} disabled={products.length === 1}
                  style={{ color: products.length === 1 ? 'var(--kpc-text-faint)' : 'var(--kpc-danger)' }}
                >
                  ลบสินค้า
                </Button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="doc-lines" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 210 }}>วัตถุดิบ</th>
                      <th style={{ minWidth: 320 }}>ข้อมูลที่ใช้ถอด</th>
                      <th className="num" style={{ width: 88 }}>ต่อ 1 ตัว</th>
                      <th className="num" style={{ width: 96 }}>รวม (×{qty || 0})</th>
                      <th className="ctr" style={{ width: 78 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.materials.map((r) => {
                      const def = defOf(r.key)
                      const per = boqOutput(toMaterial(r, def))
                      return (
                        <tr key={r.rowId}>
                          <td>
                            <Select value={r.key} onChange={(e) => changeMatKey(i, r.rowId, e.target.value as FoundryMaterialKey)}>
                              {boqMaterials.map((d) => <option key={d.key} value={d.key}>{d.label} ({d.unit})</option>)}
                            </Select>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              {def.mode === 'direct' && (
                                <SmallNum ph={`จำนวน (${def.unit})`} value={r.value} onChange={(v) => setMatRow(i, r.rowId, { value: v })} w={150} />
                              )}
                              {def.mode === 'lengthCount' && (
                                <>
                                  <SmallNum ph={def.lengthLabel ?? 'ความยาว (m)'} value={r.length} onChange={(v) => setMatRow(i, r.rowId, { length: v })} w={150} />
                                  <SmallNum ph="จำนวนเส้น" value={r.count} onChange={(v) => setMatRow(i, r.rowId, { count: v })} w={120} />
                                  {def.factor != null && <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)', alignSelf: 'center' }}>× {def.factor} kg/m</span>}
                                </>
                              )}
                              {def.mode === 'lengthSpacing' && (
                                <>
                                  <SmallNum ph="ความยาวคาน (m)" value={r.beamLength} onChange={(v) => setMatRow(i, r.rowId, { beamLength: v })} w={150} />
                                  <SmallNum ph="ระยะห่าง (m)" value={r.spacing} onChange={(v) => setMatRow(i, r.rowId, { spacing: v })} w={130} />
                                </>
                              )}
                              {def.mode === 'countFixed' && (
                                <>
                                  <SmallNum ph="จำนวนเส้น" value={r.count} onChange={(v) => setMatRow(i, r.rowId, { count: v })} w={120} />
                                  <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)', alignSelf: 'center' }}>× {def.factor} m/เส้น</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="num mono" style={{ color: per > 0 ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>{per > 0 ? nq(per) : '—'}</td>
                          <td className="num mono" style={{ fontWeight: 600, color: per > 0 ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>{per > 0 ? nq(per * qty) : '—'}</td>
                          <td className="ctr">
                            <div className="row" style={{ gap: 2, justifyContent: 'center' }}>
                              <button type="button" title="ทำซ้ำรายการนี้" onClick={() => duplicateMatRow(i, r.rowId)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kpc-text-muted)', fontSize: 14, padding: '2px 4px' }}>⧉</button>
                              <button type="button" title="ลบรายการนี้" onClick={() => removeMatRow(i, r.rowId)} disabled={p.materials.length === 1}
                                style={{ background: 'none', border: 'none', cursor: p.materials.length === 1 ? 'default' : 'pointer', color: p.materials.length === 1 ? 'var(--kpc-text-faint)' : 'var(--kpc-danger)', fontSize: 14, padding: '2px 4px' }}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 8 }}>
                <Button variant="tonal" size="sm" onClick={() => addMatRow(i)}>+ เพิ่มวัตถุดิบ</Button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <Button variant="tonal" size="sm" onClick={addProduct}>+ เพิ่มสินค้า</Button>
      </div>
    </Modal>
  )
}

/** Compact numeric input used inside the takeoff table. */
function SmallNum({ ph, value, onChange, w = 104 }: { ph: string; value?: string; onChange: (v: string) => void; w?: number }) {
  return (
    <div style={{ width: w }}>
      <Input type="number" step="0.01" min={0} placeholder={ph} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
