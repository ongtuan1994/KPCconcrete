import type { CSSProperties } from 'react'

interface IconProps { size?: number; style?: CSSProperties; stroke?: string }

/** KPC brand mark — concrete cube (3 polygons). */
export function Logo({ size = 30, mono = false }: { size?: number; mono?: boolean }) {
  const h = (size / 48) * 56
  return (
    <svg width={size} height={h} viewBox="0 0 48 56" aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <polygon points="24,2 45,14 24,26 3,14" fill="#B7BDC6" />
      <polygon points="3,14 24,26 24,52 3,40" fill="var(--kpc-primary, #0E0EE6)" />
      <polygon points="24,26 45,14 45,40 24,52" fill={mono ? '#8B919B' : '#5B616B'} />
    </svg>
  )
}

export const IconGrid = ({ size = 18, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18" style={style}>
    <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
  </svg>
)
export const IconOrder = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <rect x="3" y="2" width="12" height="14" rx="1.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <line x1="6" y1="6" x2="12" y2="6" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6" y1="9" x2="12" y2="9" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
export const IconInvoice = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <rect x="3" y="2" width="12" height="14" rx="1.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <line x1="6" y1="6" x2="12" y2="6" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6" y1="9" x2="12" y2="9" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6" y1="12" x2="10" y2="12" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
export const IconReceipt = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <path d="M4 2h10v14l-2-1.4-1.6 1.4L9 14.6 7.6 16 6 14.6 4 16z" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    <line x1="6.5" y1="6" x2="11.5" y2="6" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
export const IconBars = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <rect x="3" y="9" width="3" height="6" rx="0.8" fill="#969CA6" />
    <rect x="7.5" y="5" width="3" height="10" rx="0.8" fill="#969CA6" />
    <rect x="12" y="2" width="3" height="13" rx="0.8" fill="#969CA6" />
  </svg>
)
export const IconPie = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <circle cx="9" cy="9" r="6.5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <path d="M9 9V3.5A5.5 5.5 0 0 1 14 9z" fill="#969CA6" />
  </svg>
)
export const IconStock = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <path d="M3 15V7l5-3 5 3v8" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    <rect x="6" y="10" width="4" height="5" stroke="#969CA6" strokeWidth="1.5" fill="none" />
  </svg>
)
export const IconPlant = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <rect x="2.5" y="6" width="13" height="9" rx="1" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <path d="M6 6V3.5h3V6" stroke="#969CA6" strokeWidth="1.5" fill="none" />
  </svg>
)
export const IconBill = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <path d="M4 2h10v13l-2-1.2L10 15l-2-1.2L6 15l-2-1.2z" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    <line x1="6.5" y1="6" x2="11.5" y2="6" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6.5" y1="9" x2="11.5" y2="9" stroke="#969CA6" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)
export const IconTag = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <path d="M9 2H3v6l7 7 6-6-7-7z" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    <circle cx="6" cy="5.5" r="1.1" fill="#969CA6" />
  </svg>
)
export const IconTruck = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <rect x="1.5" y="5" width="9" height="7" stroke="#969CA6" strokeWidth="1.5" fill="none" rx="0.6" />
    <path d="M10.5 7.5h3.2l1.8 2.3V12h-5z" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    <circle cx="5" cy="13.5" r="1.4" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <circle cx="12.5" cy="13.5" r="1.4" stroke="#969CA6" strokeWidth="1.5" fill="none" />
  </svg>
)
export const IconUsers = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <circle cx="7" cy="6" r="2.6" stroke="#969CA6" strokeWidth="1.5" fill="none" />
    <path d="M2.5 15c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M12.5 5.2a2.4 2.4 0 0 1 0 4.6M13 15c0-2.2-1-3.4-2.2-3.9" stroke="#969CA6" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
)
export const IconSearch = ({ size = 16, stroke = '#969CA6' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <circle cx="7" cy="7" r="4.5" stroke={stroke} strokeWidth="1.6" fill="none" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
export const IconChevron = ({ size = 14, stroke = '#6B7280' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <path d="M4 6l4 4 4-4" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const IconPlus = ({ size = 15, stroke = '#fff' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <line x1="8" y1="3" x2="8" y2="13" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
    <line x1="3" y1="8" x2="13" y2="8" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
export const IconDownload = ({ size = 16, stroke = '#6B7280' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 2v8m0 0l-3-3m3 3l3-3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 12v1.5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5V12" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
export const IconCheck = ({ size = 12, stroke = '#fff' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 12 12">
    <path d="M2.5 6.2l2.2 2.3 4.8-5" stroke={stroke} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const IconBell = ({ size = 17 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <path d="M5 7a4 4 0 0 1 8 0c0 3 1.2 4 1.2 4H3.8S5 10 5 7z" stroke="#6B7280" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
    <path d="M7.5 14a1.5 1.5 0 0 0 3 0" stroke="#6B7280" strokeWidth="1.4" fill="none" />
  </svg>
)
export const IconClose = ({ size = 16, stroke = '#6B7280' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <line x1="4" y1="4" x2="12" y2="12" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="12" y1="4" x2="4" y2="12" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)
export const IconSliders = ({ size = 16, stroke = '#6B7280' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 18">
    <line x1="3" y1="6" x2="15" y2="6" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="3" y1="12" x2="15" y2="12" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="7" cy="6" r="2.2" fill="#fff" stroke={stroke} strokeWidth="1.5" />
    <circle cx="11" cy="12" r="2.2" fill="#fff" stroke={stroke} strokeWidth="1.5" />
  </svg>
)
