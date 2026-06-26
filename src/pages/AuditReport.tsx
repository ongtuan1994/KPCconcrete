import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Card, CardHead, Button, Badge, SearchInput, Field, Input, Select, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import {
  useAuditItems, setAuditVerified, removeAuditItem, clearVerifiedAuditItems, sendAuditRequest, addAuditNote,
  AUDIT_CATEGORY_LABEL, type AuditItem, type AuditCategory,
} from '../data/audit'
import { fmtThaiDateTime } from '../utils/datetime'
import { downloadCsv } from '../utils/csv'

const CAT_TONE: Record<AuditCategory, Tone> = { sales: 'info', purchasing: 'warning', customers: 'success' }

export function AuditReport() {
  const items = useAuditItems()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [showNote, setShowNote] = useState(false)

  const match = (i: AuditItem) =>
    !query || `${i.ref} ${i.label} ${i.sub} ${i.group}`.toLowerCase().includes(query.toLowerCase())

  /* Pending (รอตรวจสอบ) on top; verified history (ตรวจสอบแล้ว) below. */
  const pending = useMemo(() => items.filter((i) => !i.verified && match(i)), [items, query])
  const verified = useMemo(() => items.filter((i) => i.verified && match(i)), [items, query])
  const pendingCount = items.filter((i) => !i.verified).length
  const verifiedCount = items.length - pendingCount

  const exportExcel = () => {
    const head = ['หมวด', 'ประเภทเอกสาร', 'เลขที่ / รหัส', 'รายละเอียด', 'ผู้ขอตรวจ', 'วันที่ขอตรวจ', 'สถานะ', 'ผู้ตรวจสอบ', 'วันที่ตรวจสอบ']
    const body = items.map((i) => [
      AUDIT_CATEGORY_LABEL[i.category].split(' · ')[0],
      i.group, i.ref, i.sub, i.addedBy, fmtThaiDateTime(i.addedAt),
      i.verified ? 'ตรวจสอบแล้ว' : 'รอตรวจสอบ',
      i.verifiedBy ?? '', i.verified ? fmtThaiDateTime(i.verifiedAt) : '',
    ])
    downloadCsv('audit-report', [head, ...body])
  }

  /* Columns shared by both tables. */
  const baseColumns: Column<AuditItem>[] = [
    { key: 'cat', header: 'หมวด', cell: (r) => <Badge tone={CAT_TONE[r.category]} pip={false} square>{AUDIT_CATEGORY_LABEL[r.category].split(' · ')[0]}</Badge> },
    { key: 'group', header: 'ประเภท', cell: (r) => <span style={{ fontSize: 13 }}>{r.group}</span> },
    { key: 'ref', header: 'เลขที่ / รหัส', cell: (r) => <span className="mono" style={{ fontWeight: 600 }}>{r.ref}</span>, className: 'docno' },
    { key: 'sub', header: 'รายละเอียด', cell: (r) => <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.sub}</span> },
    {
      key: 'req',
      header: 'ผู้ขอตรวจ',
      cell: (r) => (
        <div className="stack" style={{ gap: 1 }}>
          <span style={{ fontSize: 13 }}>{r.addedBy || '—'}</span>
          <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)', fontFamily: 'var(--kpc-font-mono)' }}>{fmtThaiDateTime(r.addedAt)}</span>
        </div>
      ),
    },
  ]

  const openCol: Column<AuditItem> = { key: 'open', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => navigate(r.route)}>เปิดดู</Button> }
  const delCol: Column<AuditItem> = {
    key: 'del', header: '', align: 'center',
    cell: (r) => <Button variant="ghost" size="sm" onClick={() => { if (confirm(`นำ ${r.ref} ออกจากรายการตรวจสอบ?`)) removeAuditItem(r.key) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>,
  }

  /* Pending table — has the Verified action that moves the row to history. */
  const pendingColumns: Column<AuditItem>[] = [
    ...baseColumns,
    {
      key: 'reqstatus',
      header: 'คำขอ',
      align: 'center',
      cell: (r) => (r.requested
        ? <Badge tone="info" pip={false} square>ส่งคำขอแล้ว</Badge>
        : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>),
    },
    { key: 'verify', header: '', align: 'center', cell: (r) => <Button variant="primary" size="sm" onClick={() => setAuditVerified(r.key, true)}>Verified</Button> },
    openCol,
    delCol,
  ]

  /* Verified history table — shows who verified + when, with a revert action. */
  const verifiedColumns: Column<AuditItem>[] = [
    ...baseColumns,
    {
      key: 'verified',
      header: 'ผู้ตรวจสอบ',
      cell: (r) => (
        <div className="stack" style={{ gap: 1 }}>
          <span style={{ fontSize: 13, color: 'var(--kpc-success-ink)', fontWeight: 600 }}>{r.verifiedBy || '—'}</span>
          <span style={{ fontSize: 11, color: 'var(--kpc-text-muted)', fontFamily: 'var(--kpc-font-mono)' }}>{fmtThaiDateTime(r.verifiedAt)}</span>
        </div>
      ),
    },
    { key: 'revert', header: '', align: 'center', cell: (r) => <Button variant="ghost" size="sm" onClick={() => setAuditVerified(r.key, false)} title="นำกลับไปรอตรวจสอบ">ยกเลิก</Button> },
    openCol,
    delCol,
  ]

  return (
    <>
      <PageHeader
        title="รายงาน Audit"
        sub={`Audit Requests · ${items.length} รายการ`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={items.length === 0}>ส่งออก Excel</Button>
            <Button variant="tonal" onClick={() => setShowNote(true)}>+ บันทึก Free text</Button>
            <Button
              variant="primary"
              disabled={pendingCount === 0}
              onClick={() => {
                const n = sendAuditRequest()
                alert(n > 0 ? `ส่งคำขอตรวจสอบ ${n} รายการ ไปยังฝ่ายบัญชี (Accountant) แล้ว` : 'ไม่มีรายการรอตรวจสอบให้ส่งคำขอ')
              }}
            >
              ส่งคำขอไปฝ่ายบัญชี
            </Button>
          </>
        }
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="รายการขอตรวจสอบ · Requests" value={items.length.toString()} note="ทั้งหมด" />
        <KpiCard label="รอตรวจสอบ · Pending" value={pendingCount.toString()} note="ยังไม่ยืนยัน" invert />
        <KpiCard label="ตรวจสอบแล้ว · Verified" value={verifiedCount.toString()} note="ยืนยันแล้ว" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
        <div style={{ width: 300 }}>
          <SearchInput placeholder="เลขที่ / รายละเอียด / ประเภท" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {/* ───── รอตรวจสอบ ───── */}
      <div style={{ marginBottom: 24 }}>
        <Card flush className="settings-card">
          <CardHead title="รอตรวจสอบ · Pending" meta={`${pendingCount} รายการ`} />
          {pending.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--kpc-text-muted)', fontSize: 14 }}>
              {pendingCount === 0
                ? 'ไม่มีรายการรอตรวจสอบ — กดแว่นขยาย 🔍 ท้ายรายการในเมนูการขาย / การซื้อ / ลูกค้า เพื่อเพิ่มเข้ามา'
                : 'ไม่พบรายการที่ตรงกับการค้นหา'}
            </div>
          ) : (
            <DataTable columns={pendingColumns} rows={pending} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
          )}
        </Card>
      </div>

      {/* ───── ตรวจสอบแล้ว (History) ───── */}
      <Card flush className="settings-card">
        <CardHead
          title="ตรวจสอบแล้ว · Verified (History)"
          meta={`${verifiedCount} รายการ`}
          right={verifiedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { if (confirm('ล้างประวัติรายการที่ตรวจสอบแล้วทั้งหมด?')) clearVerifiedAuditItems() }} style={{ color: 'var(--kpc-danger)' }}>
              ล้างประวัติ
            </Button>
          )}
        />
        {verified.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--kpc-text-muted)', fontSize: 14 }}>
            ยังไม่มีรายการที่ตรวจสอบแล้ว — กด <strong>Verified</strong> ที่รายการด้านบนเพื่อย้ายมาเก็บเป็นประวัติ
          </div>
        ) : (
          <DataTable columns={verifiedColumns} rows={verified} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
        )}
      </Card>

      <FreeTextNoteModal open={showNote} onClose={() => setShowNote(false)} />
    </>
  )
}

/** Add a free-text item to the audit list (a manual note, not tied to a document). */
function FreeTextNoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<AuditCategory>('sales')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (open) { setCategory('sales'); setTitle(''); setText(''); setErr('') }
  }, [open])

  const submit = () => {
    if (!text.trim()) { setErr('กรุณากรอกรายละเอียด'); return }
    addAuditNote({ category, title, text })
    onClose()
  }

  return (
    <Modal
      open={open}
      title="บันทึกรายการตรวจสอบ (Free text)"
      onClose={onClose}
      maxWidth={520}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>บันทึก</Button></>}
    >
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="หมวด · Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as AuditCategory)}>
            {(Object.keys(AUDIT_CATEGORY_LABEL) as AuditCategory[]).map((c) => (
              <option key={c} value={c}>{AUDIT_CATEGORY_LABEL[c].split(' · ')[0]}</option>
            ))}
          </Select>
        </Field>
        <Field label="หัวข้อ (ไม่บังคับ)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ขอตรวจเอกสารเพิ่มเติม" />
        </Field>
        <Field label="รายละเอียด" required style={{ gridColumn: '1 / -1' }}>
          <textarea
            className="input"
            rows={4}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="พิมพ์รายละเอียดที่ต้องการบันทึกลงในรายการตรวจสอบ…"
          />
        </Field>
      </div>
    </Modal>
  )
}
