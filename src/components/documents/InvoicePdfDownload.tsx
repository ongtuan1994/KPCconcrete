import { useEffect, useRef } from 'react'
import html2pdf from 'html2pdf.js'
import { TaxInvoiceDoc } from './TaxInvoiceDoc'
import type { Invoice } from '../../data/selectors'

/** Mounts a hidden, A4-sized render of the tax invoice and triggers
    html2pdf to capture it and download as a PDF. Self-destructs via
    `onDone` once the save completes (or fails). */
export function InvoicePdfDownload({
  inv,
  onDone,
}: {
  inv: Invoice
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* A small render delay lets fonts settle before html2canvas snapshots. */
    const t = setTimeout(async () => {
      const node = ref.current
      if (!node) { onDone(); return }
      try {
        /* `pagebreak` is a real runtime option but missing from the bundled
           type definition — cast to bypass the strict shape check. */
        const opts = {
          margin: 12, /* mm — matches @page margin used for printing */
          filename: `${inv.no}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowHeight: 1080 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all'] },
        }
        await html2pdf().set(opts as never).from(node).save()
      } catch (err) {
        console.error('PDF download failed', err)
      } finally {
        onDone()
      }
    }, 150)
    return () => clearTimeout(t)
  }, [inv, onDone])

  /* Render the doc-sheet off-screen at exact A4 dimensions, with the
     .doc-sheet-pdf class applying the same layout used for printing. */
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: '-9999px',
        top: 0,
        background: '#fff',
        pointerEvents: 'none',
      }}
    >
      <div ref={ref} className="doc-sheet-pdf">
        <TaxInvoiceDoc inv={inv} />
      </div>
    </div>
  )
}
