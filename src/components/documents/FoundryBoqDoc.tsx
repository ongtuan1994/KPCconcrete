import { DocShell, MetaRow, Signatures } from './DocShell'
import { COMPANY } from '../../data/real'
import { BOQ_MATERIALS, BOQ_MATERIAL_MAP, boqOutput } from '../../data/foundryBoq'
import type { FoundryBoq, FoundryMaterialKey } from '../../data/createdDocs'

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
  /* Aggregate every material across all products: per-unit output × product qty. */
  const summary = new Map<FoundryMaterialKey, number>()
  for (const p of boq.products) {
    for (const m of p.materials) {
      const total = boqOutput(m) * p.qty
      if (total > 0) summary.set(m.key, (summary.get(m.key) ?? 0) + total)
    }
  }
  const summaryRows = BOQ_MATERIALS.filter((d) => summary.has(d.key))

  return (
    <DocShell docType="ประเมินราคาสินค้าโรงหล่อ (BOQ)" copyLabel="FOUNDRY BOQ / MATERIAL TAKEOFF">
      <div className="doc-meta-grid">
        <MetaRow k="โครงการ / ลูกค้า :" v={boq.project} />
        <MetaRow k="เลขที่ :" v={boq.no} mono />
        <MetaRow k="จำนวนสินค้า :" v={`${boq.products.length} รายการ`} />
        <MetaRow k="วันที่ :" v={fmtDate(boq.date)} mono />
      </div>

      {boq.products.map((p, pi) => {
        const used = p.materials.filter((m) => boqOutput(m) > 0)
        return (
          <div key={p.id} style={{ marginTop: pi === 0 ? 4 : 14 }}>
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
                </tr>
              </thead>
              <tbody>
                {used.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--kpc-text-faint)' }}>— ยังไม่ได้ถอดวัตถุดิบ —</td></tr>
                ) : used.map((m, i) => {
                  const def = BOQ_MATERIAL_MAP[m.key]
                  const per = boqOutput(m)
                  return (
                    <tr key={m.key}>
                      <td className="ctr">{i + 1}</td>
                      <td className="th">{def.label}</td>
                      <td className="ctr">{def.unit}</td>
                      <td className="num mono">{nq(per)}</td>
                      <td className="num mono">{nq(per * p.qty)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      {summaryRows.length > 0 && (
        <div style={{ marginTop: 18 }}>
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
              {summaryRows.map((d, i) => (
                <tr key={d.key}>
                  <td className="ctr">{i + 1}</td>
                  <td className="th">{d.label}</td>
                  <td className="ctr">{d.unit}</td>
                  <td className="num mono" style={{ fontWeight: 600 }}>{nq(summary.get(d.key) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
