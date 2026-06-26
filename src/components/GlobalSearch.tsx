import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconSearch } from './icons'
import { useCreatedDocs } from '../data/createdDocs'
import { useCurrentUser, usePerms } from '../data/auth'
import { searchTransactions, CATEGORY_LABEL, type SearchHit } from '../data/search'

/** Topbar global search across all Sales / Purchasing / Customers transactions. */
export function GlobalSearch() {
  const navigate = useNavigate()
  const created = useCreatedDocs()
  const user = useCurrentUser()
  const perms = usePerms()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const canView = useMemo(() => {
    return (resource: string) => {
      if (!user) return false
      const lvl = perms[user.role]?.[resource] ?? 'none'
      return lvl === 'view' || lvl === 'edit'
    }
  }, [user, perms])

  const groups = useMemo(
    () => searchTransactions(query, created, canView),
    [query, created, canView],
  )

  /* Flatten for keyboard navigation. */
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups])
  const total = flat.length

  /* Reset highlight whenever the result set changes. */
  useEffect(() => { setActive(0) }, [query])

  /* Close the dropdown on outside click. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (hit: SearchHit) => {
    navigate(hit.route)
    setOpen(false)
    setQuery('')
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!total) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % total) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + total) % total) }
    else if (e.key === 'Enter') { e.preventDefault(); const hit = flat[active]; if (hit) go(hit) }
  }

  const showPop = open && query.trim().length > 0
  let runningIndex = -1

  return (
    <div className="topbar-search" ref={boxRef} style={{ position: 'relative' }}>
      <IconSearch size={15} />
      <input
        placeholder="ค้นหารายการ ขาย / ซื้อ / ลูกค้า…"
        aria-label="ค้นหารายการ"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {showPop && (
        <div className="search-pop">
          {total === 0 ? (
            <div className="search-empty">ไม่พบรายการที่ตรงกับ “{query}”</div>
          ) : (
            groups.map((g) => (
              <div className="search-group" key={g.category}>
                <div className="search-group-head">{CATEGORY_LABEL[g.category]}</div>
                {g.hits.map((hit) => {
                  runningIndex += 1
                  const idx = runningIndex
                  return (
                    <button
                      key={hit.key}
                      className={['search-item', idx === active ? 'active' : ''].filter(Boolean).join(' ')}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(hit)}
                    >
                      <span className="search-item-main">
                        <span className="search-item-label">{hit.label}</span>
                        <span className="search-item-group">{hit.group}</span>
                      </span>
                      <span className="search-item-sub">{hit.sub}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
