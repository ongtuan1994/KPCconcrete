import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from 'react'
import { IconChevron, IconCheck, IconSearch } from './icons'
import { fmtThaiDateTime } from '../utils/datetime'

/* ---------------- Audit stamp (ผู้บันทึก / เวลาบันทึก) ---------------- */
/** Compact "saved by + timestamp" cell shown on user-created records.
    Renders an em-dash for seed/derived rows that carry no audit stamp. */
export function SavedBy({ by, at, align = 'left' }: { by?: string; at?: string; align?: 'left' | 'right' | 'center' }) {
  if (!by && !at) return <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>
  return (
    <div className="stack" style={{ gap: 1, textAlign: align, alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
      <span style={{ fontSize: 13, color: 'var(--kpc-text-strong)' }}>{by || '—'}</span>
      {at && <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)', fontFamily: 'var(--kpc-font-mono)' }}>{fmtThaiDateTime(at)}</span>}
    </div>
  )
}

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
/** Microsoft Excel brand green — applied to every "ส่งออก Excel" button label
    so the export action is recognisable in the same shade across all menus. */
const EXCEL_GREEN = '#217346'
/** "สร้างรายงาน" buttons render as solid black with white text across all menus. */
const REPORT_BLACK = '#111'
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}
export function Button({ variant = 'primary', size = 'md', className = '', children, style, ...rest }: BtnProps) {
  const cls = ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', className].filter(Boolean).join(' ')
  /* App-wide label conventions (a call-site `style` still wins — spread last):
     - "ส่งออก Excel"  → Excel-green label
     - "สร้างรายงาน"   → solid black button with white text */
  const label = typeof children === 'string' ? children.trim() : ''
  const btnStyle =
    label === 'ส่งออก Excel' ? { color: EXCEL_GREEN, ...style }
      : label === 'สร้างรายงาน' ? { background: REPORT_BLACK, borderColor: REPORT_BLACK, color: '#fff', ...style }
        : style
  return (
    <button className={cls} style={btnStyle} {...rest}>
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

/** Toggle a document list's sort direction by date. 'asc' = ต้นเดือน→สิ้นเดือน
    (วันที่ 1 ก่อน), 'desc' = สิ้นเดือน→ต้นเดือน. Shared across the document pages so
    the control looks and reads the same everywhere. */
export function SortDateToggle({ dir, onToggle }: { dir: 'asc' | 'desc'; onToggle: () => void }) {
  return (
    <Button variant="secondary" onClick={onToggle} title="สลับการเรียงตามวันที่">
      เรียง: {dir === 'asc' ? 'ต้นเดือน → สิ้นเดือน' : 'สิ้นเดือน → ต้นเดือน'}
    </Button>
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
import { currentBuddhistYear, currentMonth } from '../utils/datetime'
/** Month picker plus an optional "ทั้งปี" option. Options = the seed months
    (ม.ค.–มิ.ย. 2569) extended through the current calendar month while we're still
    in พ.ศ. 2569, so the picker keeps covering the present month (ก.ค. เป็นต้นไป)
    as time passes without hand-editing the seed. */
export function MonthSelect({ value, onChange, allowAll = true }: { value: number | 'all'; onChange: (v: number | 'all') => void; allowAll?: boolean }) {
  return (
    <div className="select-wrap" style={{ width: 168 }}>
      <select className="select" value={String(value)} onChange={(e) => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
        {allowAll && <option value="all">ทั้งปี 2569</option>}
        {pickerMonths().map((m) => (
          <option key={m.num} value={m.num}>{m.label}</option>
        ))}
      </select>
      <span className="chev"><IconChevron /></span>
    </div>
  )
}

const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** Month options for MonthSelect: the seed MONTHS, extended forward through the
    current calendar month while the Buddhist year is 2569 (so ก.ค. and later are
    offered as time passes). Months beyond the seed get a generated Thai label. */
export function pickerMonths(): { num: number; label: string }[] {
  const base = MONTHS.map((m) => ({ num: m.num, label: m.label }))
  const maxSeed = base.length ? base[base.length - 1].num : 0
  const upTo = currentBuddhistYear() === 2569 ? currentMonth() : maxSeed
  for (let m = maxSeed + 1; m <= upTo && m <= 12; m++) {
    base.push({ num: m, label: `${THAI_MONTHS_FULL[m - 1]} 2569` })
  }
  return base
}

/** First & last day (ISO yyyy-mm-dd) of a "YYYY-MM" month. */
export function monthBoundsIso(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}

/** งวดเดือน (Thai พ.ศ.) dropdown that fills a date range. `from` (ISO) determines
    the shown month; onPick returns the [from, to] bounds of the chosen month. */
export function MonthPeriodSelect({ from, onPick, width = 168 }: { from: string; onPick: (from: string, to: string) => void; width?: number }) {
  const opts: string[] = []
  const now = new Date()
  let y = now.getFullYear(), m = now.getMonth() + 1
  for (let i = 0; i < 24; i++) { opts.push(`${y}-${String(m).padStart(2, '0')}`); m--; if (m === 0) { m = 12; y-- } }
  const ym = from.slice(0, 7)
  const list = ym && !opts.includes(ym) ? [ym, ...opts] : opts
  return (
    <div className="select-wrap" style={{ width }}>
      <select className="select" value={ym} onChange={(e) => { const [f, t] = monthBoundsIso(e.target.value); onPick(f, t) }} aria-label="งวดเดือน">
        {list.map((mm) => <option key={mm} value={mm}>{THAI_MONTHS_FULL[Number(mm.slice(5, 7)) - 1]} {Number(mm.slice(0, 4)) + 543}</option>)}
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
