import { useEffect, useRef } from 'react'
import html2pdf from 'html2pdf.js'
import { ReceiptDoc } from './ReceiptDoc'
import type { Receipt } from '../../data/selectors'

/** Mounts a hidden, A4-sized render of a receipt and triggers html2pdf to
    capture and download it. Self-destructs via `onDone`. */
export function ReceiptPdfDownload({
  rc,
  onDone,
}: {
  rc: Receipt
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      const node = ref.current
      if (!node) { onDone(); return }
      try {
        const opts = {
          margin: 12,
          filename: `${rc.no}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowHeight: 1080 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all'] },
        }
        await html2pdf().set(opts as never).from(node).save()
      } catch (err) {
        console.error('Receipt PDF download failed', err)
      } finally {
        onDone()
      }
    }, 150)
    return () => clearTimeout(t)
  }, [rc, onDone])

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: '-9999px', top: 0, background: '#fff', pointerEvents: 'none' }}
    >
      <div ref={ref} className="doc-sheet-pdf">
        <ReceiptDoc rc={rc} />
      </div>
    </div>
  )
}
