import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type CornerStyle = 'Soft' | 'Sharp'
export type Density = 'Comfortable' | 'Compact'

interface ThemeState {
  primary: string
  corner: CornerStyle
  density: Density
  setPrimary: (c: string) => void
  setCorner: (c: CornerStyle) => void
  setDensity: (d: Density) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

/** Derive a darker "ink" shade for the chosen primary (used for text on tints). */
function deriveInk(hex: string): string {
  const m = hex.replace('#', '')
  if (m.length !== 6) return '#0B0BB0'
  const n = parseInt(m, 16)
  const r = Math.round(((n >> 16) & 255) * 0.72)
  const g = Math.round(((n >> 8) & 255) * 0.72)
  const b = Math.round((n & 255) * 0.72)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [primary, setPrimary] = useState('#0E0EE6')
  const [corner, setCorner] = useState<CornerStyle>('Soft')
  const [density, setDensity] = useState<Density>('Comfortable')

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--kpc-primary', primary)
    root.style.setProperty('--kpc-primary-ink', primary === '#0E0EE6' ? '#0B0BB0' : deriveInk(primary))
    root.style.setProperty('--kpc-radius', corner === 'Sharp' ? '2px' : '8px')
    root.style.setProperty('--kpc-pad', density === 'Compact' ? '14px' : '20px')
    root.style.setProperty('--kpc-cellpad', density === 'Compact' ? '8px 14px' : '13px 16px')
  }, [primary, corner, density])

  const value = useMemo(
    () => ({ primary, corner, density, setPrimary, setCorner, setDensity }),
    [primary, corner, density],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
