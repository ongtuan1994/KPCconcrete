/* Full-system backup — gathers every KPC localStorage store into a single .zip.

   All app data persists under `kpc.*` keys in localStorage (created documents,
   users/permissions/activity, audit requests). This collects them into one JSON
   payload plus a readme, and downloads a timestamped zip. */

import JSZip from 'jszip'

/** Friendly labels for the known stores (for the readme manifest). Keep in sync
    with the `kpc.*` keys the app writes — unlabelled keys are still backed up. */
const STORE_LABELS: Record<string, string> = {
  'kpc.createdDocs.v1': 'เอกสาร/งานดำเนินการ (ใบส่งของ · ใบกำกับ · ใบเสร็จ · ใบวางบิล · ใบสั่งซื้อ · ใบสำคัญจ่าย · บันทึกรายจ่าย · ค่าน้ำมัน · เงินเดือน · สินทรัพย์ · รายงาน)',
  'kpc.auth.v1': 'ผู้ใช้ / สิทธิ์ / ประวัติการเข้าใช้งาน',
  'kpc.audit.v1': 'รายการขอตรวจสอบ (Audit)',
  'kpc.attendance.v1': 'บันทึกเวลาทำงานพนักงาน',
  'kpc.attendanceScan.v1': 'การจับคู่รหัสเครื่องสแกน กับพนักงาน',
  'kpc.notiSeen.v1': 'สถานะการอ่านการแจ้งเตือน',
}

/** Every kpc.* key currently in localStorage. Snapshotted into an array first so
    callers can safely mutate localStorage while iterating. */
function currentStoreKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('kpc.')) keys.push(key)
  }
  return keys
}

/** Collect every kpc.* localStorage entry as parsed JSON (falls back to raw). */
function collectStores(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of currentStoreKeys()) {
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
    version: 2,
    exportedAt: iso,
    stores,
  }

  const readme = [
    'KPC — ไฟล์สำรองข้อมูลระบบ (Backup)',
    `วันที่สำรอง: ${stamp.toLocaleString('th-TH')}`,
    `จำนวนชุดข้อมูล: ${keys.length}`,
    '',
    'ไฟล์ backup.json บรรจุข้อมูลทั้งหมดของระบบ ณ เวลาที่สำรอง:',
    ...keys.map((k) => `  • ${k}${STORE_LABELS[k] ? ` — ${STORE_LABELS[k]}` : ''}`),
    '',
    'การกู้คืน: ใช้ปุ่ม "กู้คืนข้อมูล" ในหน้าตั้งค่าระบบ แล้วเลือกไฟล์ .zip นี้',
    '(หรือจะเลือกไฟล์ backup.json ข้างในโดยตรงก็ได้)',
    '',
    'หมายเหตุ: การกู้คืนจะแทนที่ข้อมูลในเครื่องให้ตรงกับไฟล์สำรองนี้ทั้งหมด',
    'ข้อมูลที่สร้างขึ้นหลังวันที่สำรองจะถูกลบออก จึงควรสำรองข้อมูลปัจจุบันไว้ก่อนกู้คืน',
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

/** Read a backup produced by `downloadBackup` (either the .zip or the inner
    backup.json) and restore it as an exact snapshot: every kpc.* store in the file
    is written back, and any kpc.* store that the file does NOT contain is removed,
    so data created after the backup does not linger and mix with it. Returns how
    many stores were written/removed. The caller should reload the app afterwards
    so React re-reads localStorage. */
export async function restoreBackup(file: File): Promise<{ stores: number; removed: number; exportedAt?: string }> {
  let text: string
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file)
    const entry = zip.file('backup.json')
    if (!entry) throw new Error('ไม่พบไฟล์ backup.json ในไฟล์ zip')
    text = await entry.async('string')
  } else {
    text = await file.text()
  }

  const payload = JSON.parse(text) as { type?: string; exportedAt?: string; stores?: Record<string, unknown> }
  if (payload?.type !== 'kpc-backup' || !payload.stores) {
    throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ KPC (kpc-backup)')
  }

  const incoming = Object.entries(payload.stores).filter(([k]) => k.startsWith('kpc.'))
  if (incoming.length === 0) throw new Error('ไฟล์สำรองนี้ไม่มีข้อมูลของระบบ (kpc.*)')
  const incomingKeys = new Set(incoming.map(([k]) => k))

  /* Clear stores the snapshot doesn't have, so the result matches the backup
     exactly instead of merging with data created after it was taken. */
  let removed = 0
  for (const key of currentStoreKeys()) {
    if (incomingKeys.has(key)) continue
    localStorage.removeItem(key)
    removed++
  }

  let count = 0
  for (const [key, value] of incoming) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    count++
  }
  return { stores: count, removed, exportedAt: payload.exportedAt }
}
