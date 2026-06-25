import { useState } from 'react'
import { Pill } from '../components/ui'
import { Invoices } from './Invoices'
import { BillingNotes } from './BillingNotes'

/** Combined ใบกำกับภาษี / ใบวางบิล view — a toggle switches between tax invoices
    and billing notes. Defaults to tax invoices. */
export function InvoicesHub() {
  const [view, setView] = useState<'invoices' | 'billing'>('invoices')
  return (
    <>
      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'invoices'} onClick={() => setView('invoices')}>ใบกำกับภาษี</Pill>
        <Pill active={view === 'billing'} onClick={() => setView('billing')}>ใบวางบิล</Pill>
      </div>
      {view === 'invoices' ? <Invoices /> : <BillingNotes />}
    </>
  )
}
