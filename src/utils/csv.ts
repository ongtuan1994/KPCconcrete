/* CSV export helper shared across all "ส่งออก Excel" buttons. Produces a
   UTF-8 BOM + CRLF-delimited file so Excel for Thai locale opens it correctly
   without garbled text. */

export type Cell = string | number | null | undefined

/** Serialize a 2D array of cells to a CSV file and trigger a browser download. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const csvLines = rows.map((r) =>
    r.map((cell) => {
      const s = String(cell ?? '')
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  )
  const csv = '﻿' + csvLines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Strip "฿" prefix and thousands separators so a baht string becomes a raw
    number suitable for an Excel numeric cell. */
export function stripBaht(b: string): string {
  return b.replace(/^฿/, '').replace(/,/g, '')
}
