import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button, Field, Input, Select } from '../ui'
import { BOQ_MATERIALS, BOQ_MATERIAL_MAP, boqOutput } from '../../data/foundryBoq'
import {
  addFoundryBoq, updateFoundryBoq, useCreatedDocs,
  type FoundryBoq, type FoundryBoqProduct, type FoundryBoqMaterial, type FoundryMaterialKey, type FoundryProductType,
} from '../../data/createdDocs'

const PRODUCT_TYPES: FoundryProductType[] = ['คาน', 'เสาเข็ม', 'เสาอาคาร']
const nq = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 })

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

/** Raw string inputs for one material row (only the mode-relevant ones are used). */
interface DraftMat { value?: string; length?: string; count?: string; beamLength?: string; spacing?: string }
interface DraftProduct { id: string; type: FoundryProductType; code: string; qty: string; mats: Record<string, DraftMat> }

const emptyProduct = (id: string): DraftProduct => ({ id, type: 'คาน', code: '', qty: '1', mats: {} })

const parse = (s?: string): number | undefined => {
  if (s == null || s.trim() === '') return undefined
  const n = Number(s)
  return Number.isNaN(n) ? undefined : n
}

/** Build a stored material line from its draft; null when it has no usable input. */
function buildMat(key: FoundryMaterialKey, d: DraftMat): FoundryBoqMaterial | null {
  const def = BOQ_MATERIAL_MAP[key]
  let m: FoundryBoqMaterial
  switch (def.mode) {
    case 'direct': m = { key, value: parse(d.value) }; break
    case 'lengthCount': m = { key, length: parse(d.length), count: parse(d.count) }; break
    case 'lengthSpacing': m = { key, beamLength: parse(d.beamLength), spacing: parse(d.spacing) }; break
    case 'countFixed': m = { key, count: parse(d.count) }; break
  }
  return boqOutput(m) > 0 ? m : null
}

/** Live per-unit output for a draft material row. */
function draftOutput(key: FoundryMaterialKey, d: DraftMat): number {
  const def = BOQ_MATERIAL_MAP[key]
  const m: FoundryBoqMaterial =
    def.mode === 'direct' ? { key, value: parse(d.value) }
      : def.mode === 'lengthCount' ? { key, length: parse(d.length), count: parse(d.count) }
        : def.mode === 'lengthSpacing' ? { key, beamLength: parse(d.beamLength), spacing: parse(d.spacing) }
          : { key, count: parse(d.count) }
  return boqOutput(m)
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
      setProducts(editing.products.map((p, i) => {
        const mats: Record<string, DraftMat> = {}
        for (const m of p.materials) {
          mats[m.key] = {
            value: m.value != null ? String(m.value) : undefined,
            length: m.length != null ? String(m.length) : undefined,
            count: m.count != null ? String(m.count) : undefined,
            beamLength: m.beamLength != null ? String(m.beamLength) : undefined,
            spacing: m.spacing != null ? String(m.spacing) : undefined,
          }
        }
        return { id: p.id || `p${i + 1}`, type: p.type, code: p.code, qty: String(p.qty), mats }
      }))
    } else {
      setProject(''); setDate(todayIso()); setNote(''); setProducts([emptyProduct('p1')])
    }
    setErr('')
  }, [open, editing])

  const addProduct = () => setProducts((ps) => [...ps, emptyProduct(`p${ps.length + 1}_${ps.length}`)])
  const removeProduct = (i: number) => setProducts((ps) => (ps.length === 1 ? ps : ps.filter((_, idx) => idx !== i)))
  const setProduct = (i: number, patch: Partial<DraftProduct>) =>
    setProducts((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const setMat = (i: number, key: string, patch: Partial<DraftMat>) =>
    setProducts((ps) => ps.map((p, idx) => (idx === i ? { ...p, mats: { ...p.mats, [key]: { ...p.mats[key], ...patch } } } : p)))

  const submit = () => {
    setErr('')
    if (!project.trim()) return setErr('กรุณาระบุชื่อโครงการ / ลูกค้า')
    if (!date) return setErr('กรุณาระบุวันที่')

    const cleaned: FoundryBoqProduct[] = []
    for (const p of products) {
      const qty = Number(p.qty)
      if (!qty || qty <= 0) return setErr(`กรุณาระบุจำนวน (ตัว) ของสินค้า "${p.type}" ให้มากกว่า 0`)
      const materials: FoundryBoqMaterial[] = []
      for (const def of BOQ_MATERIALS) {
        const built = buildMat(def.key, p.mats[def.key] ?? {})
        if (built) materials.push(built)
      }
      if (materials.length === 0) continue /* skip products with no takeoff */
      cleaned.push({ id: p.id, type: p.type, code: p.code.trim(), qty, materials })
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
      maxWidth={920}
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
        <Field label="ชื่อโครงการ / ลูกค้า" required style={{ gridColumn: 'span 2' }}>
          <Input placeholder="เช่น โครงการบ้านเดี่ยว คุณสมชาย" value={project} onChange={(e) => setProject(e.target.value)} />
        </Field>
        <Field label="วันที่" required hint="ค่าเริ่มต้น = วันนี้">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: 'span 2' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        {products.map((p, i) => {
          const qty = Number(p.qty) || 0
          return (
            <div key={p.id} className="card" style={{ padding: 14 }}>
              <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
                <Field label="ประเภทสินค้า" style={{ width: 150 }}>
                  <Select value={p.type} onChange={(e) => setProduct(i, { type: e.target.value as FoundryProductType })}>
                    {PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="เลขที่/รหัสสินค้า" style={{ width: 160 }}>
                  <Input placeholder="เช่น B-01" value={p.code} onChange={(e) => setProduct(i, { code: e.target.value })} />
                </Field>
                <Field label="จำนวน (ตัว)" style={{ width: 120 }}>
                  <Input type="number" min={1} step="1" value={p.qty} onChange={(e) => setProduct(i, { qty: e.target.value })} />
                </Field>
                <div style={{ flex: 1 }} />
                <Button
                  variant="ghost" size="sm" onClick={() => removeProduct(i)} disabled={products.length === 1}
                  style={{ color: products.length === 1 ? 'var(--kpc-text-faint)' : 'var(--kpc-danger)' }}
                >
                  ลบสินค้า
                </Button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="doc-lines" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>วัตถุดิบ</th>
                      <th style={{ minWidth: 240 }}>ข้อมูลที่ใช้ถอด</th>
                      <th className="num" style={{ width: 96 }}>ต่อ 1 ตัว</th>
                      <th className="num" style={{ width: 104 }}>รวม (×{qty || 0})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BOQ_MATERIALS.map((def) => {
                      const d = p.mats[def.key] ?? {}
                      const per = draftOutput(def.key, d)
                      return (
                        <tr key={def.key}>
                          <td className="th" style={{ fontSize: 12 }}>{def.label}<span style={{ color: 'var(--kpc-text-faint)' }}> ({def.unit})</span></td>
                          <td>
                            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              {def.mode === 'direct' && (
                                <SmallNum ph={`จำนวน (${def.unit})`} value={d.value} onChange={(v) => setMat(i, def.key, { value: v })} w={120} />
                              )}
                              {def.mode === 'lengthCount' && (
                                <>
                                  <SmallNum ph={def.lengthLabel ?? 'ความยาว (m)'} value={d.length} onChange={(v) => setMat(i, def.key, { length: v })} />
                                  <SmallNum ph="จำนวนเส้น" value={d.count} onChange={(v) => setMat(i, def.key, { count: v })} />
                                  {def.factor != null && <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)', alignSelf: 'center' }}>× {def.factor} kg/m</span>}
                                </>
                              )}
                              {def.mode === 'lengthSpacing' && (
                                <>
                                  <SmallNum ph="ความยาวคาน (m)" value={d.beamLength} onChange={(v) => setMat(i, def.key, { beamLength: v })} />
                                  <SmallNum ph="ระยะห่าง (m)" value={d.spacing} onChange={(v) => setMat(i, def.key, { spacing: v })} />
                                </>
                              )}
                              {def.mode === 'countFixed' && (
                                <>
                                  <SmallNum ph="จำนวนเส้น" value={d.count} onChange={(v) => setMat(i, def.key, { count: v })} />
                                  <span style={{ fontSize: 11, color: 'var(--kpc-text-faint)', alignSelf: 'center' }}>× {def.factor} m/เส้น</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="num mono" style={{ color: per > 0 ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>{per > 0 ? nq(per) : '—'}</td>
                          <td className="num mono" style={{ fontWeight: 600, color: per > 0 ? 'var(--kpc-text-strong)' : 'var(--kpc-text-faint)' }}>{per > 0 ? nq(per * qty) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
