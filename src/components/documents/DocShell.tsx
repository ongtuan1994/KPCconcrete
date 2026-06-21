import type { ReactNode } from 'react'
import { Logo } from '../icons'
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
          <Logo size={42} />
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

export function Signatures({ left = 'ผู้รับสินค้า / ผู้รับเงิน', right = 'ผู้มีอำนาจลงนาม' }: { left?: string; right?: string }) {
  return (
    <div className="doc-sign">
      <div className="s">
        <div className="line" />
        <div className="cap">{left}</div>
        <div className="cap">วันที่ ......./......./.......</div>
      </div>
      <div className="s">
        <div className="line" />
        <div className="cap">{right}</div>
        <div className="cap">ในนาม {COMPANY.name}</div>
      </div>
    </div>
  )
}
