import { Button } from './ui'
import { IconSearch } from './icons'
import { useCanAudit } from '../data/auth'
import { useAuditItems, addAuditItem, removeAuditItem, setAuditVerified, auditKey, type AuditItemInput } from '../data/audit'

/** Per-row magnifier shown only to Admin / Auditor.
    - Not flagged → grey; click to add an audit request (turns red).
    - Pending (flagged, not yet verified) → red; click to remove the request.
    - Verified → clears back to grey (history kept on the รายงาน Audit page);
      click re-opens it as a pending request. */
export function AuditButton({ item }: { item: AuditItemInput }) {
  const canAudit = useCanAudit()
  const items = useAuditItems()
  if (!canAudit) return null

  const key = auditKey(item)
  const existing = items.find((i) => i.key === key)
  const pending = !!existing && !existing.verified

  const onClick = () => {
    if (!existing) addAuditItem(item)
    else if (existing.verified) setAuditVerified(key, false) /* re-open for audit */
    else removeAuditItem(key)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-pressed={pending}
      title={pending ? 'อยู่ในรายการขอตรวจสอบแล้ว — กดเพื่อนำออก' : 'ขอตรวจสอบ (เพิ่มเข้ารายงาน Audit)'}
      style={{ color: pending ? 'var(--kpc-danger)' : 'var(--kpc-text-muted)' }}
    >
      <IconSearch size={15} stroke={pending ? 'var(--kpc-danger)' : '#969CA6'} />
    </Button>
  )
}
