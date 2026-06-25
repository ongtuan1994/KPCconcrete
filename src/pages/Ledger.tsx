import { useState } from 'react'
import { Pill } from '../components/ui'
import { CustomerSummary } from './CustomerSummary'
import { Creditors } from './Creditors'

/** Combined ลูกหนี้ / เจ้าหนี้ view — a toggle switches between the debtors
    (receivables) and creditors (payables) pages. Defaults to debtors. */
export function Ledger() {
  const [view, setView] = useState<'debtors' | 'creditors'>('debtors')
  return (
    <>
      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'debtors'} onClick={() => setView('debtors')}>ลูกหนี้</Pill>
        <Pill active={view === 'creditors'} onClick={() => setView('creditors')}>เจ้าหนี้</Pill>
      </div>
      {view === 'debtors' ? <CustomerSummary /> : <Creditors />}
    </>
  )
}
