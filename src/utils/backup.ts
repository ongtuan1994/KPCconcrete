/* Full-system backup — gathers every KPC localStorage store into a single .zip.

   All app data persists under `kpc.*` keys in localStorage (created documents,
   users/permissions/activity, audit requests). This collects them into one JSON
   payload plus a readme, and downloads a timestamped zip. */

import JSZip from 'jszip'

/** Friendly labels for the known stores (for the readme manifest). */
const STORE_LABELS: Record<string, string> = {
  'kpc.createdDocs.v1': 'เอกสารที่สร้าง (ใบกำกับ/ใบเสร็จ/ใบสั่ง/จ่าย ฯลฯ)',
  'kpc.auth.v1': 'ผู้ใช้ / สิทธิ์ / ประวัติการเข้าใช้งาน',
  'kpc.audit.v1': 'รายการขอตรวจสอบ (Audit)',
}

/** Collect every kpc.* localStorage entry as parsed JSON (falls back to raw). */
function collectStores(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('kpc.')) continue
    const raw = localStorage.getItem(key)
    if (raw == null) continue
    try { out[key] = JSON.parse(raw) } catch { out[key] = raw }
  }
  return out
}

/** Build and download a full backup zip. Returns a short summary for the UI. */
export async function downloadBackup(): Promise<{ filename: string; stores: number }> {
  const stamp = new Date()
  const iso = stamp.toISOString()
  const slug = iso.slice(0, 19).replace(/[:T]/g, '-') /* yyyy-mm-dd-HH-MM-SS */

  const stores = collectStores()
  const keys = Object.keys(stores)

  const payload = {
    app: 'KPC — กิจไพศาลคอนกรีต',
    type: 'kpc-backup',
    version: 1,
    exportedAt: iso,
    stores,
  }

  const readme = [
    'KPC — ไฟล์สำรองข้อมูลระบบ (Backup)',
    `วันที่สำรอง: ${stamp.toLocaleString('th-TH')}`,
    '',
    'ไฟล์ backup.json บรรจุข้อมูลทั้งหมดของระบบ:',
    ...keys.map((k) => `  • ${k}${STORE_LABELS[k] ? ` — ${STORE_LABELS[k]}` : ''}`),
    '',
    'การกู้คืน: ใช้ปุ่ม "กู้คืนข้อมูล" ในหน้าตั้งค่าระบบ แล้วเลือกไฟล์ backup.json นี้',
  ].join('\n')

  const zip = new JSZip()
  zip.file('backup.json', JSON.stringify(payload, null, 2))
  zip.file('README.txt', readme)
  const blob = await zip.generateAsync({ type: 'blob' })

  const filename = `kpc-backup-${slug}.zip`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)

  return { filename, stores: keys.length }
}
