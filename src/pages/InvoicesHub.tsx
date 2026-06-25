import { useState } from 'react'
import { Pill } from '../components/ui'
import { Invoices } from './Invoices'
import { BillingNotes } from './BillingNotes'
import { BillingSummary } from './BillingSummary'

/** Combined ใบกำกับภาษี / ใบวางบิล view — a toggle switches between tax invoices,
    billing notes, and a billing summary. Defaults to tax invoices. */
export function InvoicesHub() {
  const [view, setView] = useState<'invoices' | 'billing' | 'summary'>('invoices')
  return (
    <>
      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'invoices'} onClick={() => setView('invoices')}>ใบกำกับภาษี</Pill>
        <Pill active={view === 'billing'} onClick={() => setView('billing')}>ใบวางบิล</Pill>
        <Pill active={view === 'summary'} onClick={() => setView('summary')}>สรุปการวางบิล</Pill>
      </div>
      {view === 'invoices' ? <Invoices /> : view === 'billing' ? <BillingNotes /> : <BillingSummary />}
    </>
  )
}
