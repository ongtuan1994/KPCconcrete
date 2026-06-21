import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react'
import { IconChevron, IconCheck, IconSearch } from './icons'

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}
export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: BtnProps) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', className].filter(Boolean).join(' ')
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  )
}

/* ---------------- Card ---------------- */
export function Card({ children, className = '', flush = false }: { children: ReactNode; className?: string; flush?: boolean }) {
  return <div className={['card', flush ? 'flush' : '', className].filter(Boolean).join(' ')}>{children}</div>
}
export function CardHead({ title, meta, right }: { title?: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="row" style={{ gap: 10 }}>
        {title && <h3 className="card-title">{title}</h3>}
        {meta && <span className="card-meta">{meta}</span>}
      </div>
      {right}
    </div>
  )
}

/* ---------------- Badge ---------------- */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'
export function Badge({ tone, children, pip = true, square = false }: { tone: Tone; children: ReactNode; pip?: boolean; square?: boolean }) {
  return (
    <span className={['badge', `badge-${tone}`, square ? 'sq' : ''].filter(Boolean).join(' ')}>
      {pip && <span className="pip" />}
      {children}
    </span>
  )
}

/* ---------------- Filter pills ---------------- */
export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button className={['pill', active ? 'active' : ''].filter(Boolean).join(' ')} onClick={onClick}>
      {children}
    </button>
  )
}

/* ---------------- Form controls ---------------- */
interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  required?: boolean
  error?: boolean
  children: ReactNode
  style?: React.CSSProperties
}
export function Field({ label, hint, required, error, children, style }: FieldProps) {
  return (
    <div className={['field', error ? 'error' : ''].filter(Boolean).join(' ')} style={style}>
      {label && (
        <label>
          {label} {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="input-icon">
      <IconSearch />
      <input className="input" {...props} />
    </div>
  )
}

import { MONTHS } from '../data/real'
/** Month picker (มกราคม–มิถุนายน 2569) plus an optional "ทั้งปี" option. */
export function MonthSelect({ value, onChange, allowAll = true }: { value: number | 'all'; onChange: (v: number | 'all') => void; allowAll?: boolean }) {
  return (
    <div className="select-wrap" style={{ width: 168 }}>
      <select className="select" value={String(value)} onChange={(e) => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
        {allowAll && <option value="all">ทั้งปี 2569</option>}
        {MONTHS.map((m) => (
          <option key={m.num} value={m.num}>{m.label}</option>
        ))}
      </select>
      <span className="chev"><IconChevron /></span>
    </div>
  )
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select className="select" {...rest}>
        {children}
      </select>
      <span className="chev">
        <IconChevron />
      </span>
    </div>
  )
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange?: () => void; children: ReactNode }) {
  return (
    <label className={['check', checked ? 'on' : ''].filter(Boolean).join(' ')} onClick={onChange}>
      <span className="box">
        <IconCheck />
      </span>
      {children}
    </label>
  )
}

export function Radio({ checked, onChange, children }: { checked: boolean; onChange?: () => void; children: ReactNode }) {
  return (
    <label className={['radio', checked ? 'on' : ''].filter(Boolean).join(' ')} onClick={onChange}>
      <span className="dot" />
      {children}
    </label>
  )
}

export function Toggle({ on, onChange }: { on: boolean; onChange?: () => void }) {
  return (
    <span className={['toggle', on ? 'on' : ''].filter(Boolean).join(' ')} onClick={onChange} role="switch" aria-checked={on}>
      <span className="knob" />
    </span>
  )
}
