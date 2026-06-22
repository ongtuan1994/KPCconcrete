import type { ReactNode } from 'react'
import { Badge, type Tone } from './ui'

/* ---------------- KPI card ---------------- */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaDir,
  note,
  invert,
}: {
  label: string
  /* Accept ReactNode so callers can colourize the value (e.g. red for AR/overdue). */
  value: ReactNode
  unit?: string
  delta?: string
  deltaDir?: 'up' | 'down'
  note?: ReactNode
  invert?: boolean
}) {
  return (
    <div className={['card', 'kpi', invert ? 'invert' : ''].filter(Boolean).join(' ')}>
      <span className="label">{label}</span>
      <span className="value">
        {value} {unit && <span className="unit">{unit}</span>}
      </span>
      {(delta || note) && (
        <div className="delta-row">
          {delta && <span className={['delta', deltaDir === 'down' ? 'down' : 'up'].join(' ')}>{delta}</span>}
          {note && <span className="delta-note">{note}</span>}
        </div>
      )}
    </div>
  )
}

/* ---------------- Radial gauge ---------------- */
const CIRC = (r: number) => 2 * Math.PI * r
export function Gauge({
  pct,
  size = 170,
  stroke = 'var(--kpc-primary, #0E0EE6)',
  label,
  sublabel,
  thickness = 14,
}: {
  pct: number
  size?: number
  stroke?: string
  label?: string
  sublabel?: string
  thickness?: number
}) {
  const r = 50
  const c = CIRC(r)
  const dash = (pct / 100) * c
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#ECEEF1" strokeWidth={thickness} />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 60 60)"
      />
      {label !== undefined && (
        <text x="60" y={sublabel ? 58 : 66} textAnchor="middle" style={{ fontFamily: 'var(--kpc-font-mono)', fontSize: 24, fontWeight: 600, fill: '#14171B' }}>
          {label}
        </text>
      )}
      {sublabel && (
        <text x="60" y="76" textAnchor="middle" style={{ fontFamily: 'var(--kpc-font-th)', fontSize: 9, fill: '#969CA6' }}>
          {sublabel}
        </text>
      )}
    </svg>
  )
}

/* ---------------- Bar chart ---------------- */
export interface Bar { label: string; cap: string; value: number; highlight?: boolean }
export function BarChart({ data, max }: { data: Bar[]; max: number }) {
  return (
    <div className="bars">
      {data.map((b) => {
        const h = Math.round((b.value / max) * 130)
        const color = b.highlight ? 'var(--kpc-primary, #0E0EE6)' : b.value / max > 0.85 ? '#8585F8' : '#D8D8FD'
        return (
          <div className="bar-col" key={b.label}>
            <span className="cap">{b.cap}</span>
            <div className="bar" style={{ height: h, background: color }} title={`${b.label}: ${b.cap}`} />
            <span className="lbl">{b.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- Donut (segmented) ---------------- */
export interface Seg { label: string; pct: number; color: string }
export function Donut({ segments, size = 130, thickness = 16 }: { segments: Seg[]; size?: number; thickness?: number }) {
  const r = 50
  const c = CIRC(r)
  let offset = 0
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ flex: 'none' }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#ECEEF1" strokeWidth={thickness} />
      {segments.map((s) => {
        const len = (s.pct / 100) * c
        const el = (
          <circle
            key={s.label}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${c}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        )
        offset += len
        return el
      })}
    </svg>
  )
}
export function Legend({ segments }: { segments: Seg[] }) {
  return (
    <div className="stack" style={{ gap: 11 }}>
      {segments.map((s) => (
        <div className="legend-row" key={s.label}>
          <span className="sw" style={{ background: s.color }} />
          {s.label}
          <span className="pct">{s.pct}%</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Area / line ---------------- */
export function AreaLine({ points, height = 130 }: { points: number[]; height?: number }) {
  // points are 0..100 (percentage of height, higher = bigger value)
  const w = 320
  const n = points.length
  const step = w / (n - 1)
  const toY = (p: number) => 118 - (p / 100) * 92
  const coords = points.map((p, i) => `${Math.round(i * step)},${Math.round(toY(p))}`)
  const last = points[n - 1]
  return (
    <svg width="100%" height={height} viewBox="0 0 320 130" preserveAspectRatio="none">
      <line x1="0" y1="30" x2="320" y2="30" stroke="#F0F2F5" strokeWidth="1" />
      <line x1="0" y1="70" x2="320" y2="70" stroke="#F0F2F5" strokeWidth="1" />
      <line x1="0" y1="110" x2="320" y2="110" stroke="#F0F2F5" strokeWidth="1" />
      <polygon points={`${coords.join(' ')} 320,118 0,118`} fill="var(--kpc-primary-50, #ECECFE)" />
      <polyline points={coords.join(' ')} fill="none" stroke="var(--kpc-primary, #0E0EE6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="320" cy={toY(last)} r="4" fill="var(--kpc-primary, #0E0EE6)" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

/* ---------------- Plant status card ---------------- */
export function PlantStatusCard({
  pct,
  ring,
  name,
  en,
  tone,
  statusText,
}: {
  pct?: number
  ring: string
  name: string
  en: string
  tone: Tone
  statusText: string
}) {
  return (
    <div className="card plant-card">
      <Gauge pct={pct ?? 18} size={84} stroke={ring} label={pct !== undefined ? `${pct}%` : '—'} thickness={12} />
      <div className="stack" style={{ gap: 7 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>{name}</span>
        <span style={{ fontSize: 12, color: 'var(--kpc-text-muted)' }}>{en}</span>
        <Badge tone={tone} square>
          {statusText}
        </Badge>
      </div>
    </div>
  )
}

export function ChartCard({ title, meta, right, children }: { title: ReactNode; meta?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card stack" style={{ gap: 18 }}>
      <div className="card-head" style={{ margin: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <h3 className="card-title">{title}</h3>
          {meta && <span className="card-meta">{meta}</span>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}
