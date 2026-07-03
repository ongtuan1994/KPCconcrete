import type { ImportedTaxRow } from './taxReports'
import raw from './taxSeed.json'

/** Baked-in tax-report rows (รายงานภาษีซื้อ/ขาย, พ.ศ. 2565–2569) — the company's
    real data, snapshotted from the imported records so it ships as production
    seed. Merged (deduped) with runtime imports; see TaxReports. Regenerate by
    exporting the current taxImports (dev "ส่งออก seed" button) into taxSeed.json. */
export const SEED_TAX_IMPORTS = raw as ImportedTaxRow[]
