import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../Modal'
import { Button } from '../ui'
import { DELIVERY_TICKETS, type DeliveryTicket } from '../../data/real'
import { baht, qm, ticketYear } from '../../data/selectors'

const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
import { useCreatedDocs, addTickets } from '../../data/createdDocs'
import { parseTicketGrid } from '../../data/ticketImport'
import { parseSpreadsheet } from '../../utils/spreadsheet'
import { downloadCsv } from '../../utils/csv'

/** Import ใบจ่ายคอนกรีต from Excel/CSV — every sheet of every file, deduped by
    เลขที่ใบจ่าย against existing tickets, previewed by month before saving. */
export function ImportDeliveryTicketsModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported?: (t: DeliveryTicket) => void }) {
  const created = useCreatedDocs()
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<DeliveryTicket[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    if (open) return
    setFileName(''); setParsed(null); setBusy(false); setErr(''); setDone('')
  }, [open])

  /* dtNo already in the system (user tickets + seed). */
  const existingKeys = useMemo(
    () => new Set([...created.tickets, ...DELIVERY_TICKETS].map((t) => t.dtNo)),
    [created.tickets],
  )
  /* Split parsed rows into genuinely new vs already-present (incl. batch dups). */
  const split = useMemo(() => {
    if (!parsed) return null
    const seen = new Set(existingKeys)
    const fresh: DeliveryTicket[] = []
    for (const t of parsed) { if (!seen.has(t.dtNo)) { seen.add(t.dtNo); fresh.push(t) } }
    return { fresh, dupCount: parsed.length - fresh.length }
  }, [parsed, existingKeys])

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setErr(''); setDone(''); setParsed(null)
    setFileName(list.length === 1 ? list[0].name : `${list.length} ไฟล์: ${list.map((f) => f.name).join(', ')}`)
    setBusy(true)
    try {
      const rows: DeliveryTicket[] = []
      const failed: string[] = []
      for (const file of list) {
        try {
          const sheets = await parseSpreadsheet(file)
          for (const sh of sheets) rows.push(...parseTicketGrid(sh.grid))
        } catch (e) {
          failed.push(`${file.name} (${e instanceof Error ? e.message : 'อ่านไม่สำเร็จ'})`)
        }
      }
      if (rows.length === 0) setErr(failed.length ? `อ่านไฟล์ไม่สำเร็จ: ${failed.join(' · ')}` : 'ไม่พบใบจ่ายในไฟล์ — ตรวจสอบว่ามีคอลัมน์ วันที่ และ เลขที่ใบจ่าย และวันที่อยู่ในรูปแบบ วว/ดด/ปป')
      else { setParsed(rows); if (failed.length) setErr(`ข้ามไฟล์ที่อ่านไม่สำเร็จ: ${failed.join(' · ')}`) }
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    if (!split || split.fresh.length === 0) return
    const first = split.fresh[0]
    const added = addTickets(split.fresh)
    if (added === 0) { setErr('ทุกใบจ่ายในไฟล์มีอยู่ในระบบแล้ว ไม่มีข้อมูลใหม่'); return }
    setDone(`นำเข้าใบจ่ายใหม่ ${added} ใบเรียบร้อยแล้ว${split.dupCount > 0 ? ` — ข้ามใบที่มีอยู่แล้ว ${split.dupCount} ใบ` : ''}`)
    setParsed(null); setFileName('')
    if (first) onImported?.(first)
  }

  const downloadTemplate = () => {
    const head = ['วันที่', 'เลขที่ใบจ่าย', 'ประเภท', 'ลูกค้า', 'คอนกรีต', 'จำนวนคิว', 'ราคา', 'จำนวนเงิน', 'ใบกำกับ', 'ใบวางบิล', 'ชำระโดย', 'หมายเหตุ']
    const ex = ['03/01/69', 'DT26010311739', 'ขายลูกค้า', 'พี่แหม่ม ระวิ', 'KPCR2OS00240', '3', '2200', '6600', '690103-0001', '', 'เงินสด', '']
    downloadCsv('delivery-tickets-import-template', [head, ex])
  }

  /* Preview: new tickets grouped by เดือน/ปี, with per-period คิว + ยอดเงิน. */
  const summary = useMemo(() => {
    if (!split) return null
    const byKey = new Map<string, { y: number; m: number; count: number; m3: number; amount: number }>()
    for (const t of split.fresh) {
      const y = ticketYear(t)
      const k = `${y}-${t.month}`
      const g = byKey.get(k) ?? { y, m: t.month, count: 0, m3: 0, amount: 0 }
      g.count++; g.m3 += t.m3; g.amount += t.amount
      byKey.set(k, g)
    }
    return [...byKey.values()].sort((a, b) => a.y - b.y || a.m - b.m)
  }, [split])

  return (
    <Modal
      open={open}
      title="นำเข้าใบจ่ายคอนกรีตจาก Excel"
      onClose={onClose}
      maxWidth={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="primary" onClick={confirm} disabled={!split || split.fresh.length === 0 || busy}>{split && split.fresh.length > 0 ? `นำเข้าใบจ่ายใหม่ ${split.fresh.length} ใบ` : 'นำเข้า'}</Button>
        </>
      }
    >
      <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
        เลือกไฟล์ <strong>.xlsx</strong> หรือ <strong>.csv</strong> (<strong>เลือกได้หลายไฟล์พร้อมกัน · อ่านทุกชีทในไฟล์</strong>) คอลัมน์: วันที่ · เลขที่ใบจ่าย · ประเภท · ลูกค้า · คอนกรีต · จำนวนคิว · ราคา · จำนวนเงิน · ใบกำกับ · ใบวางบิล · ชำระโดย · หมายเหตุ
        <br />ระบบแยกเดือนจากคอลัมน์วันที่ให้อัตโนมัติ และข้ามใบจ่ายที่มีอยู่แล้ว (เทียบจากเลขที่ใบจ่าย)
        <button type="button" onClick={downloadTemplate} style={{ marginLeft: 6, color: 'var(--kpc-primary-ink)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 }}>ดาวน์โหลดเทมเพลต</button>
      </div>

      <input className="input" type="file" accept=".xlsx,.csv,text/csv" multiple onChange={(e) => onPick(e.target.files)} disabled={busy} />
      {fileName && <div style={{ fontSize: 12, color: 'var(--kpc-text-muted)', marginTop: 6 }}>ไฟล์: <strong>{fileName}</strong>{busy && ' · กำลังอ่าน…'}</div>}

      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginTop: 12 }}>{err}</div>}
      {done && <div style={{ color: 'var(--kpc-primary-ink)', fontSize: 13, marginTop: 12 }}>✓ {done}</div>}

      {split && (
        <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--kpc-surface-alt)', borderRadius: 8 }}>
          {split.dupCount > 0 && (
            <div style={{ fontSize: 13, color: 'var(--kpc-text-muted)', marginBottom: 8 }}>
              พบใบจ่ายที่มีอยู่แล้ว <strong>{split.dupCount}</strong> ใบ — ระบบจะข้ามไม่นำเข้าซ้ำ
            </div>
          )}
          {split.fresh.length === 0 ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--kpc-text-strong)' }}>ทุกใบจ่ายในไฟล์มีอยู่ในระบบแล้ว — ไม่มีข้อมูลใหม่</div>
          ) : summary && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--kpc-text-strong)' }}>ใบจ่ายใหม่ที่จะนำเข้า {split.fresh.length} ใบ</div>
              <table className="table" style={{ width: '100%', fontSize: 13 }}>
                <thead><tr><th style={{ textAlign: 'left' }}>เดือน/ปี</th><th style={{ textAlign: 'right' }}>ใบจ่าย</th><th style={{ textAlign: 'right' }}>คิว</th><th style={{ textAlign: 'right' }}>ยอดเงิน</th></tr></thead>
                <tbody>
                  {summary.map((g) => (
                    <tr key={`${g.y}-${g.m}`}>
                      <td>{THAI_MONTHS_FULL[g.m - 1]} {g.y}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{g.count}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{qm(g.m3)}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{baht(g.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td style={{ fontWeight: 600 }}>รวม</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{split.fresh.length}</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{qm(split.fresh.reduce((s, t) => s + t.m3, 0))}</td><td style={{ textAlign: 'right', fontWeight: 600 }} className="mono">{baht(split.fresh.reduce((s, t) => s + t.amount, 0))}</td></tr></tfoot>
              </table>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
