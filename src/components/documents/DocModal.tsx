import { useRef, useState, type ReactNode } from 'react'
import html2pdf from 'html2pdf.js'
import { Modal } from '../Modal'
import { Button } from '../ui'
import { canSharePdf, deliverPdf } from '../../utils/sharePdf'

/** Wraps a printable document in a modal with Print + (on phones) Share PDF.
    `extraActions` slots additional buttons between Close and Print (e.g. an
    "ออกใบเสร็จรับเงิน" shortcut on the tax-invoice viewer). `shareName` overrides
    the shared/downloaded file's base name (defaults to the modal title). */
export function DocModal({
  open,
  title,
  onClose,
  children,
  extraActions,
  maxWidth = 820,
  shareName,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  extraActions?: ReactNode
  maxWidth?: number
  shareName?: string
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  /* Only offer the native "แชร์ PDF" where the device can actually share a file
     (phones). Desktop keeps just Print / Save PDF. */
  const showShare = canSharePdf()

  const share = async () => {
    if (!sheetRef.current || sharing) return
    setSharing(true)
    try {
      const name = shareName || (typeof title === 'string' ? title : 'document')
      const opts = {
        margin: 12, /* mm — matches the @page margin used for printing */
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'] },
      }
      const blob: Blob = await html2pdf().set(opts as never).from(sheetRef.current).outputPdf('blob')
      await deliverPdf(blob, name)
    } catch (err) {
      console.error('Share PDF failed', err)
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      maxWidth={maxWidth}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
          {extraActions}
          {showShare && (
            <Button variant="secondary" onClick={share} disabled={sharing}>
              {sharing ? 'กำลังสร้าง...' : 'แชร์ PDF'}
            </Button>
          )}
          <Button variant="primary" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</Button>
        </>
      }
    >
      <div ref={sheetRef}>{children}</div>
    </Modal>
  )
}
