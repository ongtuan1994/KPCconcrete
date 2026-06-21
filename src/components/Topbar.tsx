import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ROUTE_META } from '../nav'
import { useTheme, type CornerStyle, type Density } from '../theme/ThemeContext'
import { IconSearch, IconChevron, IconBell, IconSliders } from './icons'

const SWATCHES = ['#0E0EE6', '#1E9E5A', '#C77700', '#D23B3B', '#4B515B']

export function Topbar() {
  const loc = useLocation()
  const meta = ROUTE_META[loc.pathname] ?? { label: 'ภาพรวม', en: 'Overview', section: 'ภาพรวม' }
  const [themeOpen, setThemeOpen] = useState(false)
  const { primary, corner, density, setPrimary, setCorner, setDensity } = useTheme()

  return (
    <div className="topbar">
      <div className="crumbs">
        <span className="muted">{meta.section}</span>
        <span className="sep">/</span>
        <span className="current">{meta.label}</span>
      </div>

      <div className="topbar-search">
        <IconSearch size={15} />
        <input placeholder="ค้นหา…" aria-label="ค้นหา" />
      </div>

      <button className="plant-switch">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1E9E5A' }} />
        โรงงานคอนกรีต
        <IconChevron size={13} />
      </button>

      <button className="bell" aria-label="การแจ้งเตือน">
        <IconBell />
        <span className="dot" />
      </button>

      <div style={{ position: 'relative' }}>
        <button className="bell" aria-label="ตั้งค่าธีม" onClick={() => setThemeOpen((o) => !o)}>
          <IconSliders />
        </button>
        {themeOpen && (
          <div className="theme-pop" onMouseLeave={() => setThemeOpen(false)}>
            <div className="grp">
              <span className="t">สีหลัก · Primary</span>
              <div className="swatches">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    className={['swatch', primary === c ? 'active' : ''].filter(Boolean).join(' ')}
                    style={{ background: c }}
                    onClick={() => setPrimary(c)}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div className="grp">
              <span className="t">มุม · Corner</span>
              <div className="seg">
                {(['Soft', 'Sharp'] as CornerStyle[]).map((c) => (
                  <button key={c} className={corner === c ? 'active' : ''} onClick={() => setCorner(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="grp">
              <span className="t">ความหนาแน่น · Density</span>
              <div className="seg">
                {(['Comfortable', 'Compact'] as Density[]).map((d) => (
                  <button key={d} className={density === d ? 'active' : ''} onClick={() => setDensity(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="avatar">นภ</div>
    </div>
  )
}
