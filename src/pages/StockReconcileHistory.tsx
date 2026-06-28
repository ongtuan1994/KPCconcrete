import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SavedBy, type Tone } from '../components/ui'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { StockReconcileDoc } from '../components/documents/StockReconcileDoc'
import { useCurrentUser } from '../data/auth'
import { useCreatedDocs, removeStockReconcile, requestStockReconcileApproval, approveStockReconcile, CAN_DELETE, type StockReconcile, type StockReconcileStatus } from '../data/createdDocs'

const money = (n: number) => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}
const STATUS_LABEL: Record<StockReconcileStatus, { th: string; tone: Tone }> = {
  draft: { th: 'ร่าง', tone: 'neutral' },
  pending: { th: 'รออนุมัติ', tone: 'warning' },
  approved: { th: 'อนุมัติแล้ว', tone: 'success' },
}
const statusOf = (r: StockReconcile): StockReconcileStatus => r.status ?? 'draft'

export function StockReconcileHistory() {
  const created = useCreatedDocs()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const isBoard = user?.role === 'Board'
  const [activeId, setActiveId] = useState<string | null>(null)
  const rows = created.stockReconciles
  /* Live record so the modal reflects status changes after request/approve. */
  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null
  const setActive = (r: StockReconcile | null) => setActiveId(r ? r.id : null)

  const columns: Column<StockReconcile>[] = [
    { key: 'date', header: 'วันที่กระทบยอด', cell: (r) => fmtDate(r.date), className: 'date' },
    { key: 'items', header: 'จำนวนรายการ', align: 'right', cell: (r) => <span className="mono">{r.lines.length}</span> },
    { key: 'mismatch', header: 'รายการไม่ตรง', align: 'right', cell: (r) => { const n = r.lines.filter((l) => l.diff !== 0).length; return n ? <span className="mono" style={{ color: 'var(--kpc-danger-ink)' }}>{n}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>0</span> } },
    { key: 'net', header: 'มูลค่าส่วนต่างสุทธิ', align: 'right', cell: (r) => <span className="amt mono">{r.totalDiffValue > 0 ? '+' : ''}{money(r.totalDiffValue)}</span> },
    { key: 'loss', header: 'ต้นทุนเสียหาย', align: 'right', cell: (r) => <span className="amt mono" style={{ color: 'var(--kpc-danger-ink)', fontWeight: 600 }}>{money(r.lossValue)}</span> },
    { key: 'status', header: 'สถานะ', align: 'center', cell: (r) => { const s = STATUS_LABEL[statusOf(r)]; return <Badge tone={s.tone} pip={false} square>{s.th}</Badge> } },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    { key: 'act', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setActive(r)}>เปิดดู</Button> },
    ...(CAN_DELETE ? [{
      key: 'del', header: '', align: 'center' as const,
      cell: (r: StockReconcile) => (
        <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบประวัติกระทบยอดวันที่ ${fmtDate(r.date)} ?`)) removeStockReconcile(r.id) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="ประวัติการกระทบยอดคงคลัง"
        sub={`Stock Reconciliation History · ${rows.length} ครั้ง`}
        actions={<Button variant="secondary" onClick={() => navigate('/stock')}>← กลับไปคลังวัตถุดิบ</Button>}
      />

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีประวัติการกระทบยอด — ทำได้จากหน้า <strong>คลังวัตถุดิบ</strong> → ปุ่ม “กระทบยอดคงคลัง”
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} ครั้ง`} />
      )}

      <DocModal
        open={!!active}
        title={active ? `ใบกระทบยอดคงคลัง · ${fmtDate(active.date)}` : ''}
        onClose={() => setActive(null)}
        extraActions={active ? (() => {
          const st = statusOf(active)
          if (st === 'draft') {
            return <Button variant="tonal" onClick={() => requestStockReconcileApproval(active.id)}>ขออนุมัติ</Button>
          }
          if (st === 'pending') {
            return isBoard
              ? <Button variant="primary" onClick={() => { if (confirm('อนุมัติการกระทบยอด และอัปเดตยอดนับจริงเข้าคลังวัตถุดิบ?')) approveStockReconcile(active.id) }} style={{ background: '#15803d', borderColor: '#15803d' }}>อนุมัติ</Button>
              : <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>รออนุมัติจากผู้บริหาร (Board)</span>
          }
          return <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>✓ อนุมัติแล้ว{active.approvedBy ? ` · โดย ${active.approvedBy}` : ''}</span>
        })() : undefined}
      >
        {active && <StockReconcileDoc rec={active} />}
      </DocModal>
    </>
  )
}
