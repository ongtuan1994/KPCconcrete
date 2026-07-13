/* Foundry BOQ (ถอดแบบ BOQ โรงหล่อ) — raw-material takeoff catalog.

   Each foundry product (คาน / เสาเข็ม / เสาอาคาร) is built from a fixed list of
   raw materials. A material's `mode` decides which inputs the takeoff form asks
   for and how the per-unit output quantity is derived:

     - direct        : the user types the output quantity directly.
     - lengthCount   : ความยาว × จำนวนเส้น  (× factor when the output is kg).
     - lengthSpacing : ความยาวคาน ÷ ระยะห่าง.
     - countFixed    : จำนวนเส้น × ความยาวต่อเส้น (factor).

   Wire kg/m factors were confirmed with the user (2026-07): PCW 4=0.100 /
   5=0.150 / 7=0.300; Stir 2.8=0.050 / 4=0.100 / 6=0.222. */

import { STOCK_MATERIALS, type Product } from './real'
import type { FoundryBoqMaterial, FoundryMaterialKey, FoundryMaterial } from './createdDocs'

/** Product the คอนกรีต material cost is pinned to: คอนกรีตกำลังอัด 400 กก./ตร.ซม.
    (รหัส KPCROSPP-2). Falls back to any other 400-ksc concrete if the code changes. */
export const CONCRETE_REF_CODE = 'KPCROSPP-2'

export type BoqMode = 'direct' | 'lengthCount' | 'lengthSpacing' | 'countFixed'

export interface BoqMaterialDef {
  key: FoundryMaterialKey
  label: string
  /** Output unit — คิว / m / kg / แผ่น. */
  unit: string
  mode: BoqMode
  /** kg-per-metre for wires (lengthCount → kg); metres-per-piece for countFixed. */
  factor?: number
  /** Label for the length input in lengthCount mode (ความยาวเหล็ก vs ความยาวคาน). */
  lengthLabel?: string
}

export const BOQ_MATERIALS: BoqMaterialDef[] = [
  { key: 'concrete', label: 'คอนกรีต', unit: 'คิว', mode: 'direct' },
  { key: 'db16', label: 'เหล็กข้ออ้อย DB 16 mm.', unit: 'm', mode: 'lengthCount', lengthLabel: 'ความยาวเหล็ก (m)' },
  { key: 'db12', label: 'เหล็กข้ออ้อย DB 12 mm.', unit: 'm', mode: 'lengthCount', lengthLabel: 'ความยาวเหล็ก (m)' },
  { key: 'rb9', label: 'เหล็กเส้นกลม RB 9 mm.', unit: 'm', mode: 'lengthSpacing' },
  { key: 'rb6', label: 'เหล็กเส้นกลม RB 6 mm.', unit: 'm', mode: 'lengthSpacing' },
  { key: 'pcw4', label: 'ลวด PCW 4 mm.', unit: 'kg', mode: 'lengthCount', factor: 0.1, lengthLabel: 'ความยาวคาน (m)' },
  { key: 'pcw5', label: 'ลวด PCW 5 mm.', unit: 'kg', mode: 'lengthCount', factor: 0.15, lengthLabel: 'ความยาวคาน (m)' },
  { key: 'pcw7', label: 'ลวด PCW 7 mm.', unit: 'kg', mode: 'lengthCount', factor: 0.3, lengthLabel: 'ความยาวคาน (m)' },
  { key: 'stir28', label: 'ลวดปลอก Stir RB 2.8 mm.', unit: 'kg', mode: 'lengthCount', factor: 0.05, lengthLabel: 'ความยาวคาน (m)' },
  { key: 'stir4', label: 'ลวดปลอก Stir RB 4 mm.', unit: 'kg', mode: 'lengthCount', factor: 0.1, lengthLabel: 'ความยาวคาน (m)' },
  { key: 'plate9', label: 'เหล็กเพลท 9 mm. (0.15 × 0.3 m)', unit: 'แผ่น', mode: 'direct' },
  { key: 'plate6', label: 'เหล็กเพลท 6 mm. (0.10 × 0.15 m)', unit: 'แผ่น', mode: 'direct' },
  { key: 'box24', label: 'เหล็กกล่อง 2"×4"', unit: 'm', mode: 'countFixed', factor: 0.35 },
]

export const BOQ_MATERIAL_MAP: Record<FoundryMaterialKey, BoqMaterialDef> =
  Object.fromEntries(BOQ_MATERIALS.map((m) => [m.key, m])) as Record<FoundryMaterialKey, BoqMaterialDef>

/** Turn a user-added foundry material (from the stock page) into a BOQ takeoff
    definition — always 'direct' mode (the quantity is typed straight in). */
export function toBoqDef(m: FoundryMaterial): BoqMaterialDef {
  return { key: m.code, label: m.name, unit: m.unit, mode: 'direct' }
}

/** Merged BOQ material catalog: seed materials + user-added foundry materials. */
export function boqMaterialDefs(added: FoundryMaterial[]): BoqMaterialDef[] {
  return [...BOQ_MATERIALS, ...added.map(toBoqDef)]
}

/** Build a unit-cost resolver (ต้นทุน/หน่วย) for BOQ materials, keyed by material
    key. Steel/wire costs come from the คลังวัตถุดิบโรงหล่อ stock (seed + added,
    with any ตั้งราคาต้นทุน override, matched case-insensitively so BOQ keys like
    "db16" resolve to stock codes like "DB16"). คอนกรีต is pinned to the price of
    CONCRETE_REF_CODE (คอนกรีต 400 ksc ปูนดอกบัว) from the merged product list. */
export function foundryCostResolver(
  stockCosts: Record<string, number>,
  added: FoundryMaterial[],
  products: Product[],
): (key: FoundryMaterialKey) => number {
  const costByCode: Record<string, number> = {}
  for (const m of STOCK_MATERIALS) {
    if (m.site !== 'foundry') continue
    const c = stockCosts[m.code] ?? m.cost
    if (c != null) costByCode[m.code.toUpperCase()] = c
  }
  for (const m of added) {
    const c = stockCosts[m.code] ?? m.cost
    if (c != null) costByCode[m.code.toUpperCase()] = c
  }
  const concreteRef = products.find((p) => p.code === CONCRETE_REF_CODE)
    ?? products.find((p) => p.category === 'concrete' && p.strengthKsc === 400)
  const concreteCost = concreteRef?.price ?? 0
  return (key) => (key === 'concrete' ? concreteCost : (costByCode[String(key).toUpperCase()] ?? 0))
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Per-unit output quantity for a material takeoff line, in the material's unit.
    Returns 0 when the required inputs are missing. */
export function boqOutput(m: FoundryBoqMaterial): number {
  const def = BOQ_MATERIAL_MAP[m.key]
  /* Unknown key = a user-added material (or one since deleted) → direct mode. */
  if (!def) return r3(m.value ?? 0)
  switch (def.mode) {
    case 'direct':
      return r3(m.value ?? 0)
    case 'lengthCount':
      return r3((m.length ?? 0) * (m.count ?? 0) * (def.factor ?? 1))
    case 'lengthSpacing':
      return m.spacing ? r3((m.beamLength ?? 0) / m.spacing) : 0
    case 'countFixed':
      return r3((m.count ?? 0) * (def.factor ?? 1))
  }
}

/** True when a takeoff line carries any usable input (so it counts in the BOQ). */
export function boqHasInput(m: FoundryBoqMaterial): boolean {
  return boqOutput(m) > 0
}
