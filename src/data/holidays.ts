/* Thai public holidays (วันหยุดนักขัตฤกษ์) for the My-Work calendar.

   FIXED holidays fall on the same month/day every year, so they are keyed by
   "MM-DD" and apply to whatever year the calendar shows.

   Lunar / substitution holidays (มาฆบูชา, วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา, and
   any วันหยุดชดเชย) move each year — add those to EXTRA keyed by the full ISO
   date once the official dates are announced. */

const FIXED: Record<string, string> = {
  '01-01': 'วันขึ้นปีใหม่',
  '04-06': 'วันจักรี',
  '04-13': 'วันสงกรานต์',
  '04-14': 'วันสงกรานต์',
  '04-15': 'วันสงกรานต์',
  '05-01': 'วันแรงงานแห่งชาติ',
  '05-04': 'วันฉัตรมงคล',
  '06-03': 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี',
  '07-28': 'วันเฉลิมพระชนมพรรษา ร.10',
  '08-12': 'วันแม่แห่งชาติ',
  '10-13': 'วันคล้ายวันสวรรคต ร.9',
  '10-23': 'วันปิยมหาราช',
  '12-05': 'วันชาติ / วันพ่อแห่งชาติ',
  '12-10': 'วันรัฐธรรมนูญ',
  '12-31': 'วันสิ้นปี',
}

/** Lunar / observed holidays keyed by full ISO date. Extend per year as the
    cabinet announces them (dates below are placeholders to be confirmed). */
const EXTRA: Record<string, string> = {
  // ── 2569 / 2026 (โปรดยืนยันกับประกาศราชการ) ──
  // '2026-03-03': 'วันมาฆบูชา',
  // '2026-05-31': 'วันวิสาขบูชา',
  // '2026-07-29': 'วันอาสาฬหบูชา',
  // '2026-07-30': 'วันเข้าพรรษา',
}

/** Returns the holiday name for an ISO date (yyyy-mm-dd), or null if not a
    public holiday. */
export function holidayName(iso: string): string | null {
  if (EXTRA[iso]) return EXTRA[iso]
  return FIXED[iso.slice(5)] ?? null
}
