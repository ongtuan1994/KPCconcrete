import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Badge, SearchInput, Field, Input, Select, SavedBy, type Tone } from '../components/ui'
import { Modal } from '../components/Modal'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { IconPlus } from '../components/icons'
import { useCreatedDocs, addAsset, updateAsset, removeAsset, type Asset, type GoodsPaymentSite } from '../data/createdDocs'
import { useCan } from '../data/auth'

/** SITE badge colour — แพล้นปูน = น้ำเงิน (info) · โรงหล่อ = เหลือง (warning). */
const SITE_TONE: Record<GoodsPaymentSite, Tone> = { แพล้นปูน: 'info', โรงหล่อ: 'warning' }
/** Common asset types offered in the ประเภท datalist. */
const ASSET_TYPES = ['รถโม่', 'รถกะบะ', 'รถโฟล์คลิฟท์', 'เครื่องจักร', 'อาคาร/สิ่งปลูกสร้าง', 'อุปกรณ์']

export function Assets() {
  const assets = useCreatedDocs().assets
  const canEdit = useCan('assets').edit

  const [query, setQuery] = useState('')
  const [siteFilter, setSiteFilter] = useState<'all' | GoodsPaymentSite>('all')
  const [showForm, setShowForm] = useState(false)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)

  const rows = useMemo(
    () => assets.filter((a) =>
      (siteFilter === 'all' || a.site === siteFilter) &&
      (!query || `${a.name} ${a.type ?? ''} ${a.plate ?? ''} ${a.note ?? ''}`.toLowerCase().includes(query.toLowerCase()))),
    [assets, siteFilter, query],
  )
  const plantCount = assets.filter((a) => a.site === 'แพล้นปูน').length
  const foundryCount = assets.filter((a) => a.site === 'โรงหล่อ').length

  const columns: Column<Asset>[] = [
    { key: 'type', header: 'ประเภท', cell: (r) => (r.type ? <span style={{ fontSize: 13 }}>{r.type}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'name', header: 'ชื่อสินทรัพย์', cell: (r) => <strong style={{ fontSize: 14 }}>{r.name}</strong> },
    { key: 'plate', header: 'ทะเบียน', cell: (r) => (r.plate ? <span className="mono">{r.plate}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'site', header: 'SITE', align: 'center', cell: (r) => <Badge tone={SITE_TONE[r.site]} pip={false} square>{r.site}</Badge> },
    { key: 'note', header: 'หมายเหตุ', cell: (r) => (r.note ? <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>{r.note}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'savedby', header: 'ผู้บันทึก', cell: (r) => <SavedBy by={r.createdBy} at={r.createdAt} /> },
    ...(canEdit ? [{
      key: 'actions', header: '', align: 'center' as const,
      cell: (r: Asset) => (
        <div className="row" style={{ gap: 4, justifyContent: 'center', flexWrap: 'nowrap' }}>
          <Button variant="ghost" size="sm" onClick={() => setEditAsset(r)}>แก้ไข</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (confirm(`ลบสินทรัพย์ "${r.name}" ?`)) removeAsset(r.id) }} style={{ color: 'var(--kpc-danger)' }} aria-label="ลบ">✕</Button>
        </div>
      ),
    }] : []),
  ]

  return (
    <>
      <PageHeader
        title="สินทรัพย์"
        sub={`Assets · ${assets.length} รายการ`}
        actions={canEdit ? <Button variant="primary" onClick={() => setShowForm(true)}><IconPlus /> เพิ่มสินทรัพย์</Button> : undefined}
      />

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="สินทรัพย์ทั้งหมด · Assets" value={assets.length.toString()} note="รายการ" />
        <KpiCard label="แพล้นปูน · Plant" value={plantCount.toString()} note="รายการ" invert />
        <KpiCard label="โรงหล่อ · Foundry" value={foundryCount.toString()} note="รายการ" />
      </div>

      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="select-wrap" style={{ width: 170 }}>
          <Select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value as 'all' | GoodsPaymentSite)}>
            <option value="all">ทุก SITE</option>
            <option value="แพล้นปูน">แพล้นปูน</option>
            <option value="โรงหล่อ">โรงหล่อ</option>
          </Select>
        </div>
        <div style={{ width: 320 }}>
          <SearchInput placeholder="ชื่อ / ประเภท / ทะเบียน" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ยังไม่มีสินทรัพย์ — กด <strong>“เพิ่มสินทรัพย์”</strong> เพื่อเริ่ม
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={15} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      )}

      <AssetForm
        open={showForm || !!editAsset}
        editAsset={editAsset}
        onClose={() => { setShowForm(false); setEditAsset(null) }}
        onSaved={() => { setShowForm(false); setEditAsset(null) }}
      />
    </>
  )
}

/* ───────── Add / edit asset ───────── */
function AssetForm({ open, editAsset, onClose, onSaved }: { open: boolean; editAsset: Asset | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editAsset
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [plate, setPlate] = useState('')
  const [site, setSite] = useState<GoodsPaymentSite>('แพล้นปูน')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    if (editAsset) {
      setName(editAsset.name)
      setType(editAsset.type ?? '')
      setPlate(editAsset.plate ?? '')
      setSite(editAsset.site)
      setNote(editAsset.note ?? '')
      return
    }
    setName(''); setType(''); setPlate(''); setSite('แพล้นปูน'); setNote('')
  }, [open, editAsset])

  const submit = () => {
    setErr('')
    if (!name.trim()) return setErr('กรุณาระบุชื่อสินทรัพย์')
    if (site !== 'แพล้นปูน' && site !== 'โรงหล่อ') return setErr('กรุณาเลือก SITE')
    const fields = {
      name: name.trim(),
      type: type.trim() || undefined,
      plate: plate.trim() || undefined,
      site,
      note: note.trim() || undefined,
    }
    if (isEdit) {
      updateAsset(editAsset!.id, fields)
    } else {
      addAsset({ id: `asset_${Date.now()}`, ...fields, createdAt: new Date().toISOString() })
    }
    onSaved()
  }

  return (
    <Modal open={open} title={isEdit ? 'แก้ไขสินทรัพย์' : 'เพิ่มสินทรัพย์'} onClose={onClose} maxWidth={560}
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button variant="primary" onClick={submit}>{isEdit ? 'บันทึกการแก้ไข' : 'บันทึก'}</Button></>}>
      {err && <div style={{ color: 'var(--kpc-danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>}

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="SITE" required hint="ต้องเลือกเสมอ · แพล้นปูน = น้ำเงิน · โรงหล่อ = เหลืองตามธีม" style={{ gridColumn: '1 / -1' }}>
          <div className={site === 'แพล้นปูน' ? 'month-primary' : 'select-foundry'}>
            <Select value={site} onChange={(e) => setSite(e.target.value as GoodsPaymentSite)}>
              <option value="แพล้นปูน">แพล้นปูน</option>
              <option value="โรงหล่อ">โรงหล่อ</option>
            </Select>
          </div>
        </Field>
        <Field label="ประเภท">
          <Input list="kpc-asset-types" placeholder="เช่น รถโม่ / รถกะบะ / รถโฟล์คลิฟท์" value={type} onChange={(e) => setType(e.target.value)} />
          <datalist id="kpc-asset-types">
            {ASSET_TYPES.map((t) => <option key={t} value={t} />)}
          </datalist>
        </Field>
        <Field label="ทะเบียน (ถ้ามี)">
          <Input placeholder="เช่น บง 6262" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </Field>
        <Field label="ชื่อสินทรัพย์" required style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="เช่น รถโม่ 001 / รถกะบะ / รถโฟล์คลิฟท์" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="หมายเหตุ" style={{ gridColumn: '1 / -1' }}>
          <Input placeholder="รายละเอียดเพิ่มเติม" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
