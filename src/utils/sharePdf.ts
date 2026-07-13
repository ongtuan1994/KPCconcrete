/* Share-or-download a generated PDF. On phones (where the Web Share API can
   share files) this opens the native share sheet so the report/document can go
   straight to LINE, email, Drive, etc.; on desktop — or if sharing fails — it
   falls back to a normal file download. */

/** Whether this device can share a PDF file through the native share sheet.
    True on most mobile browsers (Chrome/Android, Safari/iOS), false on desktop.
    Cached — the capability can't change within a session. */
let _canShare: boolean | undefined
export function canSharePdf(): boolean {
  if (_canShare !== undefined) return _canShare
  try {
    const probe = new File([new Blob(['%PDF'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' })
    _canShare = typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [probe] })
  } catch {
    _canShare = false
  }
  return _canShare
}

/** Strip characters that browsers/OSes reject in a download or share filename. */
function safeName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean || 'document'
}

/** Trigger a plain browser download of the blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Share the PDF via the native share sheet when possible, otherwise download it.
    `title` becomes the share title/text and the base filename. */
export async function deliverPdf(blob: Blob, title: string): Promise<void> {
  const filename = `${safeName(title)}.pdf`
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: title })
      return
    } catch (err) {
      /* User dismissed the share sheet — do nothing (don't also download). */
      if (err instanceof DOMException && err.name === 'AbortError') return
      /* Any other failure (permission, unsupported) → fall back to a download. */
    }
  }
  downloadBlob(blob, filename)
}
