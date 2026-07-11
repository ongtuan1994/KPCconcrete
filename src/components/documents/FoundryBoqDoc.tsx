import { DocShell, MetaRow, Signatures } from './DocShell'
import { COMPANY } from '../../data/real'
import { baht } from '../../data/selectors'
import { boqOutput, boqMaterialDefs, foundryCostResolver, type BoqMaterialDef } from '../../data/foundryBoq'
import { useCreatedDocs, useProducts, type FoundryBoq, type FoundryMaterialKey } from '../../data/createdDocs'

const nq = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 })

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** Printable foundry BOQ takeoff (ประเมินราคาสินค้าโรงหล่อ) — per-product material
    takeoff plus a project-wide material summary. */
export function FoundryBoqDoc({ boq }: { boq: FoundryBoq }) {
  const created = useCreatedDocs()
  const products = useProducts()
  /* Seed materials + user-added foundry materials, so added/deleted ones still
     resolve to a label/unit here. Unknown keys fall back to a direct-mode stub. */
  const allDefs = boqMaterialDefs(created.foundryMaterialsAdded)
  const matMap = Object.fromEntries(allDefs.map((d) => [d.key, d])) as Record<string, BoqMaterialDef>
  const defOf = (key: FoundryMaterialKey): BoqMaterialDef => matMap[key] ?? { key, label: String(key), unit: '', mode: 'direct' }

  /* Aggregate every material across all products: per-unit output × product qty. */
  const summary = new Map<FoundryMaterialKey, number>()
  for (const p of boq.products) {
    for (const m of p.materials) {
      const total = boqOutput(m) * p.qty
      if (total > 0) summary.set(m.key, (summary.get(m.key) ?? 0) + total)
    }
  }
  /* Ordered by the material catalog, then any leftover (deleted) keys. */
  const summaryKeys: FoundryMaterialKey[] = [
    ...allDefs.map((d) => d.key).filter((k) => summary.has(k)),
    ...[...summary.keys()].filter((k) => !matMap[k]),
  ]

  /* Material unit costs (ต้นทุน/หน่วย): steel/wire from the คลังวัตถุดิบโรงหล่อ stock,
     คอนกรีต pinned to คอนกรีต 400 ksc ปูนดอกบัว. Only shown in the printed doc —
     never in the create/edit form. */
  const costOf = foundryCostResolver(created.stockCosts, created.foundryMaterialsAdded, products)
  /* Per-product material cost = Σ (total output × unit cost). */
  const productCosts = boq.products.map((p) => p.materials.reduce((s, m) => s + boqOutput(m) * p.qty * costOf(m.key), 0))
  const grandCost = productCosts.reduce((a, b) => a + b, 0)
  const hasCost = grandCost > 0

  return (
    <DocShell docType="ประเมินราคาสินค้าโรงหล่อ (BOQ)" copyLabel="FOUNDRY BOQ / MATERIAL TAKEOFF" sheetClass="boq">
      <div className="doc-meta-grid">
        <MetaRow k="โครงการ / ลูกค้า :" v={boq.project} />
        <MetaRow k="เลขที่ :" v={boq.no} mono />
        <MetaRow k="จำนวนสินค้า :" v={`${boq.products.length} รายการ`} />
        <MetaRow k="วันที่ :" v={fmtDate(boq.date)} mono />
      </div>

      {boq.products.map((p, pi) => {
        const used = p.materials.filter((m) => boqOutput(m) > 0)
        const pCost = productCosts[pi]
        return (
          <div key={p.id} className="boq-product" style={{ marginTop: pi === 0 ? 4 : 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 4 }}>
              {pi + 1}. {p.type}{p.detail ? ` · ${p.detail}` : ''} · รหัส {p.code || '—'} · จำนวน {nq(p.qty)} ตัว
            </div>
            <table className="doc-lines">
              <thead>
                <tr>
                  <th className="ctr" style={{ width: 32 }}>ลำดับ</th>
                  <th>รายการวัตถุดิบ</th>
                  <th className="ctr" style={{ width: 48 }}>หน่วย</th>
                  <th className="num" style={{ width: 92 }}>ต่อ 1 ตัว</th>
                  <th className="num" style={{ width: 104 }}>รวม ({nq(p.qty)} ตัว)</th>
                  {hasCost && <th className="num" style={{ width: 110 }}>ต้นทุนรวม (บาท)</th>}
                </tr>
              </thead>
              <tbody>
                {used.length === 0 ? (
                  <tr><td colSpan={hasCost ? 6 : 5} style={{ textAlign: 'center', color: 'var(--kpc-text-faint)' }}>— ยังไม่ได้ถอดวัตถุดิบ —</td></tr>
                ) : used.map((m, i) => {
                  const def = defOf(m.key)
                  const per = boqOutput(m)
                  const unitCost = costOf(m.key)
                  return (
                    <tr key={m.key}>
                      <td className="ctr">{i + 1}</td>
                      <td className="th">{def.label}</td>
                      <td className="ctr">{def.unit}</td>
                      <td className="num mono">{nq(per)}</td>
                      <td className="num mono">{nq(per * p.qty)}</td>
                      {hasCost && <td className="num mono">{unitCost > 0 ? baht(per * p.qty * unitCost) : '—'}</td>}
                    </tr>
                  )
                })}
                {hasCost && used.length > 0 && (
                  <tr>
                    <td className="th" colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
                      ต้นทุนวัตถุดิบรวม ({baht(pCost / p.qty)} / ตัว × {nq(p.qty)} ตัว)
                    </td>
                    <td className="num mono" style={{ fontWeight: 700 }}>{baht(pCost)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      })}

      {summaryKeys.length > 0 && (
        <div className="boq-summary" style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--kpc-text-strong)', marginBottom: 4 }}>
            สรุปวัตถุดิบรวมทั้งโครงการ
          </div>
          <table className="doc-lines">
            <thead>
              <tr>
                <th className="ctr" style={{ width: 32 }}>ลำดับ</th>
                <th>รายการวัตถุดิบ</th>
                <th className="ctr" style={{ width: 56 }}>หน่วย</th>
                <th className="num" style={{ width: 120 }}>ปริมาณรวม</th>
              </tr>
            </thead>
            <tbody>
              {summaryKeys.map((k, i) => {
                const def = defOf(k)
                return (
                  <tr key={k}>
                    <td className="ctr">{i + 1}</td>
                    <td className="th">{def.label}</td>
                    <td className="ctr">{def.unit}</td>
                    <td className="num mono" style={{ fontWeight: 600 }}>{nq(summary.get(k) ?? 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasCost && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--kpc-text-strong)' }}>
            ต้นทุนวัตถุดิบรวมทั้งโครงการ: {baht(grandCost)}
          </span>
          <div style={{ fontSize: 11, color: 'var(--kpc-text-faint)', marginTop: 2 }}>
            * ประมาณจากราคาต้นทุนวัตถุดิบที่ตั้งไว้ในคลังวัตถุดิบโรงหล่อ
          </div>
        </div>
      )}

      {boq.note && (
        <div style={{ marginTop: 12, fontSize: 12 }}><strong>หมายเหตุ:</strong> {boq.note}</div>
      )}

      <Signatures slots={[
        { cap: 'ผู้ถอดแบบ / ประเมิน' },
        { cap: 'ผู้ตรวจสอบ' },
        { cap: 'ผู้อนุมัติ', topCap: COMPANY.name },
      ]} />
    </DocShell>
  )
}
