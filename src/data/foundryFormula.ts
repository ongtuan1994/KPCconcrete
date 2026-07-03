/* Foundry (โรงหล่อ) production-formula numbering + material recipe — the precast
   counterpart to mixDesign.ts. Foundry products are precast: แผ่นพื้น / เสาไอ /
   แผ่นผนัง. The formula number encodes the kind:
     FFGS-xxx — แผ่นพื้น · Ground Slab
     FFIP-xxx — เสาไอ · I-shape Pile
     FFCW-xxx — แผ่นผนัง · Concrete Wall
   (FF = Foundry Formula). Numbered per kind in creation order.

   Unlike concrete Mix Design (cement/sand/aggregate), a foundry formula is a
   reinforcement recipe that differs by product kind:
     แผ่นพื้น  → ตะแกรงเหล็กไวร์เมช (wire mesh)
     เสาไอ     → เหล็กปลอก (tie steel) + ลวดอัดแรง (PC wire)
     แผ่นผนัง  → ตะแกรงเหล็กไวร์เมช (wire mesh)
   Each product uses its own quantities. */

import type { Product, FoundryKind } from './real'

/** Two-letter formula code per foundry kind (the FF___ suffix). */
export const FOUNDRY_KIND_CODE: Record<FoundryKind, string> = {
  plank: 'GS', // แผ่นพื้น · Ground Slab
  ipole: 'IP', // เสาไอ · I-shape Pile
  wallpanel: 'CW', // แผ่นผนัง · Concrete Wall
}

/** One foundry production formula — reinforcement quantities for a product code.
    Each field is per finished piece; only the fields relevant to the kind are set. */
export interface FoundryFormula {
  code: string        /* foundry product code */
  wireMesh?: number   /* ตะแกรงเหล็กไวร์เมช (ผืน) — แผ่นพื้น / แผ่นผนัง */
  tieSteel?: number   /* เหล็กปลอก (ตัว) — เสาไอ */
  pcWire?: number     /* ลวดอัดแรง (เส้น) — เสาไอ */
  concrete?: number   /* คอนกรีต (ลบ.ม.) — ทุกประเภท (ไม่บังคับ) */
  note?: string
}

export type FoundryMaterialKey = 'wireMesh' | 'tieSteel' | 'pcWire' | 'concrete'
export interface FoundryMaterialMeta { key: FoundryMaterialKey; label: string; unit: string; step: number }
/** Display metadata for every foundry recipe material (label + unit for columns/inputs). */
export const FOUNDRY_MATERIALS: FoundryMaterialMeta[] = [
  { key: 'wireMesh', label: 'ตะแกรงไวร์เมช', unit: 'ผืน', step: 1 },
  { key: 'tieSteel', label: 'เหล็กปลอก', unit: 'ตัว', step: 1 },
  { key: 'pcWire', label: 'ลวดอัดแรง', unit: 'เส้น', step: 1 },
  { key: 'concrete', label: 'คอนกรีต', unit: 'ลบ.ม.', step: 0.001 },
]
export const FOUNDRY_MATERIAL_MAP: Record<FoundryMaterialKey, FoundryMaterialMeta> =
  Object.fromEntries(FOUNDRY_MATERIALS.map((m) => [m.key, m])) as Record<FoundryMaterialKey, FoundryMaterialMeta>

/** Materials shown/edited for each kind — reinforcement first, concrete last. */
export const KIND_MATERIALS: Record<FoundryKind, FoundryMaterialKey[]> = {
  plank: ['wireMesh', 'concrete'],
  ipole: ['tieSteel', 'pcWire', 'concrete'],
  wallpanel: ['wireMesh', 'concrete'],
}
/** Required reinforcement per kind (concrete stays optional). */
export const KIND_REQUIRED: Record<FoundryKind, FoundryMaterialKey[]> = {
  plank: ['wireMesh'],
  ipole: ['tieSteel', 'pcWire'],
  wallpanel: ['wireMesh'],
}

/** True for products that belong to the โรงหล่อ (foundry) site. */
export const isFoundry = (p: Product): boolean => p.site === 'foundry'

/** เลขที่สูตรผลิตโรงหล่อ for an ordered list of formulas (with their kind), numbered
    per kind: FF + kind code + running 3-digit sequence. Returns code → number.
    Pass the list oldest-first so existing numbers stay stable as formulas grow. */
export function buildFoundryFormulaNos(items: { code: string; kind?: FoundryKind }[]): Map<string, string> {
  const seq: Record<string, number> = {}
  const map = new Map<string, string>()
  for (const it of items) {
    if (!it.kind) continue
    const kc = FOUNDRY_KIND_CODE[it.kind]
    seq[kc] = (seq[kc] ?? 0) + 1
    map.set(it.code, `FF${kc}-${String(seq[kc]).padStart(3, '0')}`)
  }
  return map
}

/** Parse the "aXbXc" dimension triple (metres) out of a foundry product name.
    e.g. "แผ่นพื้น 0.05x0.35x2.00 ม." → { a: 0.05, b: 0.35, c: 2.00 }. */
export function parseDims(name: string): { a: number; b: number; c: number } | null {
  const m = name.match(/([\d.]+)\s*[xX×]\s*([\d.]+)\s*[xX×]\s*([\d.]+)/)
  if (!m) return null
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (![a, b, c].every(Number.isFinite)) return null
  return { a, b, c }
}
