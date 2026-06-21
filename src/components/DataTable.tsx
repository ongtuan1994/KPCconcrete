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

  const pageButtons = Array.from({ length: pages }).map((_, i) => i + 1).filter((p) => p <= 4 || p === pages)

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
          {pageButtons.map((p, idx) => {
            const gap = idx > 0 && p - pageButtons[idx - 1] > 1
            return (
              <span key={p} style={{ display: 'inline-flex', gap: 6 }}>
                {gap && <button disabled style={{ cursor: 'default' }}>…</button>}
                <button className={p === cur ? 'active' : ''} onClick={() => setPage(p)}>
                  {p}
                </button>
              </span>
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
