import { useState } from 'react'
import { Pill } from '../components/ui'
import { TransportPricing } from './TransportPricing'
import { TruckFleet } from './TruckFleet'

/** Combined ราคาค่าขนส่ง / รถขนส่งปูน view — a toggle switches between the
    transport surcharge schedule and the truck fleet. Defaults to pricing. */
export function TransportHub() {
  const [view, setView] = useState<'pricing' | 'fleet'>('pricing')
  return (
    <>
      <div className="pills" style={{ marginBottom: 20 }}>
        <Pill active={view === 'pricing'} onClick={() => setView('pricing')}>ราคาค่าขนส่ง</Pill>
        <Pill active={view === 'fleet'} onClick={() => setView('fleet')}>รถขนส่งปูน</Pill>
      </div>
      {view === 'pricing' ? <TransportPricing /> : <TruckFleet />}
    </>
  )
}
