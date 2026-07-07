/* Concrete mix designs (สูตรส่วนผสมต่อ 1 คิว) — transcribed from the plant's
   "สูตรที่ใช้ปัจจุบัน" sheet. Quantities are PER 1 m³:
     cement / sand / aggregate = กิโลกรัม (kg)
     plastomix / sikament / pce = ลิตร (admixture)
   Cement charges to ปูน SCG (codes KPCRO*) or ปูนดอกบัว (codes KPCR2*).
   NOTE: values transcribed from a screenshot — verify against the master sheet. */

export interface MixDesign {
  code: string
  cement: number       /* ปูนผง (kg/m³) */
  sand: number         /* ทรายหยาบ (kg/m³) */
  aggregate: number    /* หิน 3/4" (kg/m³) */
  plastomix?: number   /* Plastomix 704 (Type D) ลิตร/m³ */
  sikament?: number    /* Sikament F2 (Type F) ลิตร/m³ */
  pce?: number         /* PCE-1 ลิตร/m³ */
  /** Manual เลขที่สูตร override. Blank/undefined → the auto CF0-xxx / CF2-xxx
      number (by brand + list order) is used instead. */
  formulaNo?: string
}

export const MIX_DESIGNS: MixDesign[] = [
  /* ── ปูน SCG · On Site (KPCROS) ── */
  { code: 'KPCROS00000', cement: 180, sand: 950, aggregate: 1120, plastomix: 0.88 },
  { code: 'KPCROS00180', cement: 240, sand: 870, aggregate: 1135, plastomix: 1.18 },
  { code: 'KPCROS00210', cement: 255, sand: 850, aggregate: 1140, plastomix: 1.25 },
  { code: 'KPCROS00240', cement: 280, sand: 830, aggregate: 1140, plastomix: 1.38 },
  { code: 'KPCROS00280', cement: 315, sand: 810, aggregate: 1135, plastomix: 1.55 },
  { code: 'KPCROS00300', cement: 345, sand: 795, aggregate: 1135, plastomix: 1.70 },
  { code: 'KPCROS00320', cement: 350, sand: 740, aggregate: 1135, plastomix: 1.50 },
  { code: 'KPCROS00400', cement: 415, sand: 800, aggregate: 1075, plastomix: 2.30 },
  { code: 'KPCPOSPP-1', cement: 400, sand: 800, aggregate: 1190, pce: 3.80 },

  /* ── ปูน ดอกบัว · On Site (KPCR2OS) ── */
  { code: 'KPCR2OS00000', cement: 180, sand: 950, aggregate: 1120, plastomix: 0.88 },
  { code: 'KPCR2OS00180', cement: 240, sand: 870, aggregate: 1135, plastomix: 1.18 },
  { code: 'KPCR2OS00210', cement: 255, sand: 850, aggregate: 1140, plastomix: 1.25 },
  { code: 'KPCR2OS00240', cement: 280, sand: 830, aggregate: 1140, plastomix: 1.38 },
  { code: 'KPCR2OS00280', cement: 315, sand: 810, aggregate: 1135, plastomix: 1.55 },
  { code: 'KPCR2OS00300', cement: 345, sand: 795, aggregate: 1135, plastomix: 1.70 },
  { code: 'KPCR2OS00320', cement: 350, sand: 740, aggregate: 1135, plastomix: 1.50 },
  { code: 'KPCR2OS00350', cement: 355, sand: 855, aggregate: 1075, plastomix: 1.95 },

  /* ── ปูน SCG · Over 21–30 km (KPCROV21) ── */
  { code: 'KPCROV21000', cement: 190, sand: 945, aggregate: 1120, plastomix: 0.90 },
  { code: 'KPCROV21180', cement: 250, sand: 865, aggregate: 1135, plastomix: 1.20 },
  { code: 'KPCROV21210', cement: 265, sand: 845, aggregate: 1140, plastomix: 1.28 },
  { code: 'KPCROV21240', cement: 290, sand: 825, aggregate: 1140, plastomix: 1.40 },
  { code: 'KPCROV21280', cement: 325, sand: 805, aggregate: 1135, plastomix: 1.58 },
  { code: 'KPCROV21300', cement: 355, sand: 790, aggregate: 1135, plastomix: 1.70 },

  /* ── ปูน SCG · Over 31–40 km (KPCROV31) ── */
  { code: 'KPCROV31000', cement: 195, sand: 940, aggregate: 1120, plastomix: 0.93 },
  { code: 'KPCROV31180', cement: 255, sand: 860, aggregate: 1135, plastomix: 1.23 },
  { code: 'KPCROV31210', cement: 270, sand: 840, aggregate: 1140, plastomix: 1.30 },
  { code: 'KPCROV31240', cement: 295, sand: 820, aggregate: 1140, plastomix: 1.43 },
  { code: 'KPCROV31280', cement: 330, sand: 800, aggregate: 1135, plastomix: 1.60 },
  { code: 'KPCROV31300', cement: 360, sand: 785, aggregate: 1135, plastomix: 1.75 },

  /* ── ปูน SCG · Over 41–50 km (KPCROV41) ── */
  { code: 'KPCROV41000', cement: 200, sand: 935, aggregate: 1120, plastomix: 0.95 },
  { code: 'KPCROV41180', cement: 260, sand: 855, aggregate: 1135, plastomix: 1.25 },
  { code: 'KPCROV41210', cement: 275, sand: 835, aggregate: 1140, plastomix: 1.33 },
  { code: 'KPCROV41240', cement: 300, sand: 815, aggregate: 1140, plastomix: 1.45 },
  { code: 'KPCROV41280', cement: 335, sand: 795, aggregate: 1135, plastomix: 1.63 },
  { code: 'KPCROV41300', cement: 365, sand: 780, aggregate: 1135, plastomix: 1.78 },
]

export const MIX_BY_CODE: Record<string, MixDesign> = Object.fromEntries(MIX_DESIGNS.map((m) => [m.code, m]))

/** R2/P2 codes = ปูนดอกบัว ; otherwise ปูน SCG (ปอร์ตแลนด์). */
const isDokbuaCode = (code: string) => /^KPC[RP]2/.test(code)

/** เลขที่สูตรการผลิต (Concrete Formula) for a list of mix designs: CF0-xxx = SCG
    (ปอร์ตแลนด์), CF2-xxx = ดอกบัว. Numbered per brand in list order, so pass the
    seed list first (then any added formulas) to keep existing numbers stable. */
export function buildMixFormulaNos(list: MixDesign[]): Map<string, string> {
  const seq = { scg: 0, dokbua: 0 }
  const map = new Map<string, string>()
  for (const m of list) {
    const db = isDokbuaCode(m.code)
    /* Always advance the auto sequence (so a manual override on one formula
       doesn't shift everyone else's numbers), then prefer the manual override. */
    const n = db ? (seq.dokbua += 1) : (seq.scg += 1)
    const auto = `CF${db ? '2' : '0'}-${String(n).padStart(3, '0')}`
    map.set(m.code, m.formulaNo?.trim() ? m.formulaNo.trim() : auto)
  }
  return map
}
/** Static numbering over the seed master sheet (order = MIX_DESIGNS file order). */
export const MIX_FORMULA_NO: Map<string, string> = buildMixFormulaNos(MIX_DESIGNS)
/** Formula number for a product code, or undefined if it has no mix design. */
export const mixFormulaNo = (code: string): string | undefined => MIX_FORMULA_NO.get(code)
