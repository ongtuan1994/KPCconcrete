/* Read a spreadsheet the user uploads into plain 2-D grids of strings — one per
   worksheet. Supports .csv (what the app's own "ส่งออก Excel" produces, a single
   sheet) and .xlsx (real Excel, all sheets — parsed with jszip + DOMParser).
   .xls (old binary) is not supported; ask the user to re-save as .xlsx or .csv. */

import JSZip from 'jszip'

/** One worksheet: its name and its rows × columns of raw cell strings. */
export interface Sheet { name: string; grid: string[][] }

/** Parse an uploaded file into its worksheets. A .csv yields a single sheet. */
export async function parseSpreadsheet(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return parseXlsx(await file.arrayBuffer())
  if (name.endsWith('.xls')) throw new Error('ไฟล์ .xls รุ่นเก่าไม่รองรับ — กรุณาบันทึกเป็น .xlsx หรือ .csv ก่อน')
  return [{ name: file.name.replace(/\.[^.]+$/, ''), grid: parseCsv(await file.text()) }]
}

/** Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes ("")
    and CRLF/LF line endings. Strips a leading UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\r') { /* swallow — handled on \n */ }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += ch
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

/** Convert a cell reference's column letters (e.g. "AB12") to a 0-based index. */
function colToIdx(ref: string): number {
  const m = ref.match(/^([A-Z]+)/)
  if (!m) return -1
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Parse one worksheet's XML into a string grid, given the shared-string table. */
function parseSheetXml(xml: string, parser: DOMParser, shared: string[]): string[][] {
  const doc = parser.parseFromString(xml, 'application/xml')
  const rowEls = doc.getElementsByTagName('row')
  const grid: string[][] = []
  for (let r = 0; r < rowEls.length; r++) {
    const cells = rowEls[r].getElementsByTagName('c')
    const out: string[] = []
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c]
      const colIdx = colToIdx(cell.getAttribute('r') || '')
      if (colIdx < 0) continue
      const t = cell.getAttribute('t')
      let val = ''
      if (t === 'inlineStr') {
        const tNodes = cell.getElementsByTagName('t')
        for (let j = 0; j < tNodes.length; j++) val += tNodes[j].textContent ?? ''
      } else {
        const vEl = cell.getElementsByTagName('v')[0]
        const raw = vEl ? vEl.textContent ?? '' : ''
        val = t === 's' ? shared[Number(raw)] ?? '' : raw
      }
      out[colIdx] = val
    }
    for (let k = 0; k < out.length; k++) if (out[k] === undefined) out[k] = ''
    grid.push(out)
  }
  return grid
}

/** Read every worksheet of an .xlsx workbook, in the workbook's sheet order. */
async function parseXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(buf)
  const parser = new DOMParser()

  /* Shared-string table — string cells reference these by index (t="s"). */
  const shared: string[] = []
  const ssFile = zip.file('xl/sharedStrings.xml')
  if (ssFile) {
    const ssDoc = parser.parseFromString(await ssFile.async('string'), 'application/xml')
    const siList = ssDoc.getElementsByTagName('si')
    for (let k = 0; k < siList.length; k++) {
      const tNodes = siList[k].getElementsByTagName('t')
      let s = ''
      for (let j = 0; j < tNodes.length; j++) s += tNodes[j].textContent ?? ''
      shared.push(s)
    }
  }

  /* Best-effort sheet names: workbook.xml <sheet r:id> → rels target file → name.
     Only used for display; routing is by sheet content, so a failed lookup here
     never drops or misroutes a sheet. */
  const nameByFile: Record<string, string> = {}
  const wbFile = zip.file('xl/workbook.xml')
  const relFile = zip.file('xl/_rels/workbook.xml.rels')
  if (wbFile && relFile) {
    const rels = parser.parseFromString(await relFile.async('string'), 'application/xml')
    const relMap: Record<string, string> = {}
    const relEls = rels.getElementsByTagName('Relationship')
    for (let i = 0; i < relEls.length; i++) {
      const id = relEls[i].getAttribute('Id')
      let tgt = relEls[i].getAttribute('Target') || ''
      if (!id || !tgt) continue
      tgt = tgt.startsWith('/') ? tgt.slice(1) : 'xl/' + tgt.replace(/^\.\//, '')
      relMap[id] = tgt
    }
    const wb = parser.parseFromString(await wbFile.async('string'), 'application/xml')
    const sheetEls = wb.getElementsByTagName('sheet')
    for (let i = 0; i < sheetEls.length; i++) {
      const nm = sheetEls[i].getAttribute('name')
      const rid = sheetEls[i].getAttribute('r:id') || sheetEls[i].getAttribute('id') || ''
      if (nm && relMap[rid]) nameByFile[relMap[rid]] = nm
    }
  }

  /* Read EVERY worksheet file (numeric order), so no sheet is ever missed. */
  const wsFiles = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
  if (wsFiles.length === 0) throw new Error('ไม่พบชีทข้อมูลในไฟล์ Excel')

  const out: Sheet[] = []
  for (const file of wsFiles) {
    const grid = parseSheetXml(await zip.file(file)!.async('string'), parser, shared)
    out.push({ name: nameByFile[file] || file.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, ''), grid })
  }
  return out
}
