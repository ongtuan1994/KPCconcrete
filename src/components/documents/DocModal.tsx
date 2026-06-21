import type { ReactNode } from 'react'
import { Modal } from '../Modal'
import { Button } from '../ui'

/** Wraps a printable document in a modal with a Print action.
    `extraActions` slots additional buttons between Close and Print (e.g. an
    "ออกใบเสร็จรับเงิน" shortcut on the tax-invoice viewer). */
export function DocModal({
  open,
  title,
  onClose,
  children,
  extraActions,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  extraActions?: ReactNode
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      maxWidth={820}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          {extraActions}
          <Button variant="primary" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
