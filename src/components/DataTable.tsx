import { useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  cell: (row: T) => ReactNode
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  pageSize = 8,
  totalLabel,
}: {
  columns: Column<T>[]
  rows: T[]
  pageSize?: number
  totalLabel?: (shownFrom: number, shownTo: number, total: number) => string
}) {
  const [page, setPage] = useState(1)
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const cur = Math.min(page, pages)
  const start = (cur - 1) * pageSize
  const slice = rows.slice(start, start + pageSize)
  const from = total === 0 ? 0 : start + 1
  const to = Math.min(start + pageSize, total)

  /* Sliding window of page numbers (4 at a time) that follows the current page,
     so navigating forward keeps revealing new pages. First/last pages are always
     reachable, and the "…" buttons jump the window forward/back. */
  const WINDOW = 4
  let winHi = Math.min(pages, Math.max(cur + 1, WINDOW))
  let winLo = Math.max(1, winHi - WINDOW + 1)
  winHi = Math.min(pages, winLo + WINDOW - 1)
  winLo = Math.max(1, winHi - WINDOW + 1)
  const pageItems: (number | 'L' | 'R')[] = []
  if (winLo > 1) { pageItems.push(1); if (winLo > 2) pageItems.push('L') }
  for (let p = winLo; p <= winHi; p++) pageItems.push(p)
  if (winHi < pages) { if (winHi < pages - 1) pageItems.push('R'); pageItems.push(pages) }

  return (
    <div className="card flush">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'num' : c.align === 'center' ? 'ctr' : ''}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="empty-state">
                    <span className="et">ไม่พบรายการ</span>
                    <span className="es">No records match the current filter.</span>
                  </div>
                </td>
              </tr>
            ) : (
              slice.map((row, ri) => (
                <tr key={ri}>
                  {columns.map((c) => (
                    <td key={c.key} className={[c.align === 'right' ? 'num' : c.align === 'center' ? 'ctr' : '', c.className ?? ''].filter(Boolean).join(' ')}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="count">
          {totalLabel ? totalLabel(from, to, total) : `แสดง ${from}–${to} จาก ${total} รายการ`}
        </span>
        <div className="pager">
          <button disabled={cur === 1} onClick={() => setPage(cur - 1)}>
            ก่อนหน้า
          </button>
          {pageItems.map((it, idx) => {
            if (it === 'L') return <button key={`L${idx}`} onClick={() => setPage(Math.max(1, winLo - 1))} title="ย้อนกลับ">…</button>
            if (it === 'R') return <button key={`R${idx}`} onClick={() => setPage(Math.min(pages, winHi + 1))} title="หน้าถัดไป">…</button>
            return (
              <button key={it} className={it === cur ? 'active' : ''} onClick={() => setPage(it)}>
                {it}
              </button>
            )
          })}
          <button disabled={cur === pages} onClick={() => setPage(cur + 1)}>
            ถัดไป
          </button>
        </div>
      </div>
    </div>
  )
}
