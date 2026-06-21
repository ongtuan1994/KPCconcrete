import type { ReactNode } from 'react'
import { Modal } from '../Modal'
import { Button } from '../ui'

/** Wraps a printable document in a modal with a Print action. */
export function DocModal({ open, title, onClose, children }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      maxWidth={820}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          <Button variant="primary" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
