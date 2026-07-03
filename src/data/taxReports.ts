/* Tax reports (รายงานภาษีซื้อ/ขาย). The built-in seed (พ.ศ. 2569, Jan–Apr) was
   removed on request — tax report data is now brought in via the "นำเข้า Excel"
   feature and stored per year in createdDocs (taxImports). Seed arrays are kept
   empty so the pages render from imported + ใบสำคัญจ่าย data only. */

export interface TaxRow {
  seq: string; date: string; docNo: string; name: string;
  taxId: string; branch: string; value: number; vat: number;
}
export interface TaxMonthData { month: number; rows: TaxRow[]; totalValue: number; totalVat: number }

/** A historical tax row imported from an Excel/CSV file. Carries its own tax
    period (year in พ.ศ. + month, derived from the date/seq) and which report it
    belongs to; `seq` is reassigned when merged into the displayed report.
    Persisted via the createdDocs store. */
export interface ImportedTaxRow extends TaxRow { year: number; month: number; kind: 'sale' | 'purchase' }

export const TAX_SALE: TaxMonthData[] = []

export const TAX_PURCHASE: TaxMonthData[] = []
