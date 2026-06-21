import { useEffect, useRef, useState } from 'react'
import html2pdf from 'html2pdf.js'
import JSZip from 'jszip'
import { TaxInvoiceDoc } from './TaxInvoiceDoc'
import type { Invoice } from '../../data/selectors'

/** Sequentially snapshots each invoice's printable doc-sheet to a PDF blob,
    bundles them into a single ZIP, then triggers a browser download. */
export function InvoiceZipDownload({
  invoices,
  onProgress,
  onDone,
}: {
  invoices: Invoice[]
  onProgress?: (done: number, total: number) => void
  onDone: () => void
}) {
  const [idx, setIdx] = useState(0)
  const blobsRef = useRef<{ name: string; blob: Blob }[]>([])
  const captureRef = useRef<HTMLDivElement>(null)
  const finishedRef = useRef(false)

  /* Capture the currently-rendered invoice. Advancing `idx` re-renders the
     next invoice into the same hidden container, which triggers the next
     capture on the following tick. */
  useEffect(() => {
    if (idx >= invoices.length) return
    const current = invoices[idx]
    const t = setTimeout(async () => {
      const node = captureRef.current
      if (!node) { setIdx((i) => i + 1); return }
      try {
        const opts = {
          margin: 12,
          filename: `${current.no}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowHeight: 1080 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all'] },
        }
        const blob = (await html2pdf().set(opts as never).from(node).output('blob')) as Blob
        blobsRef.current.push({ name: `${current.no}.pdf`, blob })
        onProgress?.(blobsRef.current.length, invoices.length)
      } catch (err) {
        console.error(`PDF capture failed for ${current.no}`, err)
      }
      setIdx((i) => i + 1)
    }, 200)
    return () => clearTimeout(t)
  }, [idx, invoices, onProgress])

  /* Once every invoice has been captured, zip and trigger the download once. */
  useEffect(() => {
    if (idx < invoices.length || finishedRef.current) return
    finishedRef.current = true
    ;(async () => {
      try {
        const zip = new JSZip()
        for (const f of blobsRef.current) zip.file(f.name, f.blob)
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const today = new Date().toISOString().slice(0, 10)
        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `tax-invoices-${today}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1500)
      } catch (err) {
        console.error('ZIP build failed', err)
      } finally {
        onDone()
      }
    })()
  }, [idx, invoices.length, onDone])

  const current = invoices[idx]
  if (!current) return null

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', left: '-9999px', top: 0, background: '#fff', pointerEvents: 'none' }}
    >
      <div ref={captureRef} className="doc-sheet-pdf">
        <TaxInvoiceDoc inv={current} />
      </div>
    </div>
  )
}
