import type { ReactNode } from 'react'
import { COMPANY } from '../../data/real'

/** Shared header/wrapper for printable KPC documents. */
export function DocShell({
  docType,
  copyLabel = 'ต้นฉบับ / Original',
  children,
}: {
  docType: string
  copyLabel?: string
  children: ReactNode
}) {
  return (
    <div className="doc-sheet">
      <div className="doc-top">
        <div className="co">
          <img src="/logo.jpg" alt="KPC กิจไพศาลคอนกรีต" className="doc-logo" />
          <div>
            <div className="co-name">{COMPANY.name}</div>
            <div className="co-line">({COMPANY.branch}) {COMPANY.address}</div>
            <div className="co-line">เลขประจำตัวผู้เสียภาษี {COMPANY.taxId} · โทร. {COMPANY.tel}</div>
          </div>
        </div>
        <div className="doc-type">
          <div className="tt">{docType}</div>
          <div className="copy">{copyLabel}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

export function MetaRow({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="mrow">
      <span className="k">{k}</span>
      <span className={['v', mono ? 'mono' : ''].filter(Boolean).join(' ')}>{v}</span>
    </div>
  )
}

export interface SignatureSlot {
  cap: string
  subCap?: string
  /** Hide the "วันที่ ../../.." placeholder for slots that only need a signature
      (e.g. ผู้อนุมัติ — approver signs without a separate date field). */
  noDate?: boolean
  /** Optional caption rendered ABOVE the dotted signature line — used for
      acknowledgements ("ได้รับสินค้าแล้ว...") or company name above the
      approver's signature. */
  topCap?: string
}

/** Signature block — accepts either:
    - `slots` (preferred): an array of 2-4 slots with per-column labels
    - `left`/`right` (legacy): a quick 2-column shorthand */
export function Signatures({
  slots,
  left,
  right,
}: {
  slots?: SignatureSlot[]
  left?: string
  right?: string
}) {
  const resolved: SignatureSlot[] = slots ?? [
    { cap: left ?? 'ผู้รับสินค้า / ผู้รับเงิน' },
    { cap: right ?? 'ผู้มีอำนาจลงนาม', subCap: `ในนาม ${COMPANY.name}` },
  ]
  return (
    <div className="doc-sign" style={{
      gridTemplateColumns: `repeat(${resolved.length}, 1fr)`,
      /* Tighter gap when there are more columns so signature lines stay usable. */
      gap: resolved.length >= 4 ? 16 : resolved.length === 3 ? 24 : 40,
    }}>
      {resolved.map((s, i) => (
        <div className="s" key={i}>
          {/* Always render the top-cap slot — even when empty — so the dotted
              line below it sits at the same Y across every column. */}
          <div className="cap-top-slot">
            {s.topCap && <div className="cap cap-top">{s.topCap}</div>}
          </div>
          <div className="line" />
          <div className="cap">{s.cap}</div>
          {!s.noDate && <div className="cap">วันที่ ......./......./.......</div>}
          {s.subCap && <div className="cap">{s.subCap}</div>}
        </div>
      ))}
    </div>
  )
}
