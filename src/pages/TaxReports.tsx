import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Button, Pill } from '../components/ui'
import { AuditButton } from '../components/AuditButton'
import { KpiCard } from '../components/charts'
import { DataTable, type Column } from '../components/DataTable'
import { DocModal } from '../components/documents/DocModal'
import { baht } from '../data/selectors'
import { COMPANY } from '../data/real'
import { TAX_SALE, TAX_PURCHASE, type TaxMonthData, type TaxRow } from '../data/taxReports'
import { downloadCsv } from '../utils/csv'

type Kind = 'sale' | 'purchase'

const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const money2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Normalise the messy source date to dd/mm/69 where possible. */
function fmtTaxDate(s: string): string {
  const m = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/)
  if (!m) return s
  const pad = (x: string) => x.padStart(2, '0')
  return `${pad(m[1])}/${pad(m[2])}/69`
}

export function TaxReports() {
  const [kind, setKind] = useState<Kind>('sale')
  const [month, setMonth] = useState<number>(1)
  const [showPrint, setShowPrint] = useState(false)

  const data = kind === 'sale' ? TAX_SALE : TAX_PURCHASE
  const available = data.map((d) => d.month)
  const current: TaxMonthData | undefined = useMemo(() => data.find((d) => d.month === month), [data, month])
  const rows = current?.rows ?? []

  const title = kind === 'sale' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ'
  const nameHeader = kind === 'sale' ? 'ชื่อผู้ซื้อสินค้า / ผู้รับบริการ' : 'ชื่อผู้ขายสินค้า / ผู้ให้บริการ'

  const exportExcel = () => {
    const head = ['ลำดับ', 'วันที่', 'เลขที่', nameHeader, 'เลขประจำตัวผู้เสียภาษี', 'สถานประกอบการ', 'มูลค่าสินค้า', 'ภาษีมูลค่าเพิ่ม']
    const body = rows.map((r) => [r.seq, fmtTaxDate(r.date), r.docNo, r.name, r.taxId, r.branch, r.value, r.vat])
    body.push(['', '', '', 'รวม', '', '', current?.totalValue ?? 0, current?.totalVat ?? 0])
    downloadCsv(`tax-${kind}-${THAI_MONTHS_SHORT[month - 1]}`, [head, ...body])
  }

  const columns: Column<TaxRow>[] = [
    { key: 'seq', header: 'ลำดับ', align: 'center', cell: (r) => <span className="mono" style={{ fontSize: 12 }}>{r.seq}</span> },
    { key: 'date', header: 'วันที่', cell: (r) => fmtTaxDate(r.date), className: 'date' },
    { key: 'doc', header: 'เลขที่ใบกำกับ', cell: (r) => <span className="mono" style={{ fontSize: 12 }}>{r.docNo}</span>, className: 'docno' },
    { key: 'name', header: nameHeader, cell: (r) => r.name },
    { key: 'tax', header: 'เลขผู้เสียภาษี', cell: (r) => (r.taxId ? <span className="mono" style={{ fontSize: 12 }}>{r.taxId}</span> : <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'branch', header: 'สถานประกอบการ', align: 'center', cell: (r) => (r.branch || <span style={{ color: 'var(--kpc-text-faint)' }}>—</span>) },
    { key: 'value', header: 'มูลค่าสินค้า', align: 'right', cell: (r) => <span className="amt mono">{money2(r.value)}</span> },
    { key: 'vat', header: 'ภาษีมูลค่าเพิ่ม', align: 'right', cell: (r) => <span className="mono">{r.vat ? money2(r.vat) : '—'}</span> },
    {
      key: 'audit',
      header: '',
      align: 'center',
      cell: (r) => (
        <AuditButton
          item={{
            category: kind === 'sale' ? 'sales' : 'purchasing',
            group: kind === 'sale' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ',
            ref: r.docNo,
            label: r.docNo,
            sub: `${r.name} · ${money2(r.value)}`,
            route: '/tax-reports',
          }}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="รายงานภาษีซื้อ / ขาย"
        sub={`Tax Reports · ${title} · ${THAI_MONTHS_FULL[month - 1]} 2569`}
        actions={
          <>
            <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>ส่งออก Excel</Button>
            <Button variant="primary" onClick={() => setShowPrint(true)} disabled={rows.length === 0}>พิมพ์รายงาน</Button>
          </>
        }
      />

      <div className="pills" style={{ marginBottom: 16 }}>
        <Pill active={kind === 'sale'} onClick={() => setKind('sale')}>รายงานภาษีขาย</Pill>
        <Pill active={kind === 'purchase'} onClick={() => setKind('purchase')}>รายงานภาษีซื้อ</Pill>
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--kpc-text-muted)' }}>เดือนภาษี:</span>
        {available.map((mn) => (
          <Pill key={mn} active={month === mn} onClick={() => setMonth(mn)}>{THAI_MONTHS_FULL[mn - 1]} 2569</Pill>
        ))}
      </div>

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <KpiCard label="จำนวนรายการ · Items" value={rows.length.toString()} note="ใบกำกับ" />
        <KpiCard label="มูลค่าสินค้ารวม · Value" value={baht(current?.totalValue ?? 0)} note="ก่อน VAT" invert />
        <KpiCard label="ภาษีมูลค่าเพิ่มรวม · VAT" value={baht(current?.totalVat ?? 0)} note={kind === 'sale' ? 'ภาษีขาย' : 'ภาษีซื้อ'} />
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--kpc-text-muted)' }}>
          ไม่มีข้อมูลสำหรับเดือนนี้
        </div>
      ) : (
        <DataTable columns={columns} rows={rows} pageSize={20} totalLabel={(f, t, total) => `แสดง ${f}–${t} จาก ${total} รายการ`} />
      )}

      <DocModal open={showPrint} title={`${title} · ${THAI_MONTHS_FULL[month - 1]} 2569`} onClose={() => setShowPrint(false)}>
        {current && <TaxReportSheet kind={kind} month={month} data={current} />}
      </DocModal>
    </>
  )
}

/* Rows per printed page. Conservative so a page never overflows onto a second
   physical page (which would drop the header / carry rows). */
const ROWS_PER_PAGE = 25

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function TaxReportSheet({ kind, month, data }: { kind: Kind; month: number; data: TaxMonthData }) {
  const title = kind === 'sale' ? 'รายงานภาษีขาย' : 'รายงานภาษีซื้อ'
  const nameHeader = kind === 'sale' ? 'ชื่อผู้ซื้อสินค้า / ผู้รับบริการ' : 'ชื่อผู้ขายสินค้า / ผู้ให้บริการ'
  const taxHeader = kind === 'sale' ? 'เลขประจำตัวผู้เสียภาษีของผู้ซื้อ' : 'เลขประจำตัวผู้เสียภาษีของผู้ขาย'
  const digits = COMPANY.taxId.replace(/\D/g, '').padEnd(13, ' ').slice(0, 13).split('')

  /* Paginate and accumulate running totals for ยอดยกมา / ยอดยกไป per page. */
  const pages = chunk(data.rows, ROWS_PER_PAGE)
  let runValue = 0, runVat = 0
  const pageData = pages.map((pr, idx) => {
    const broughtValue = runValue, broughtVat = runVat
    for (const r of pr) { runValue += r.value; runVat += r.vat }
    return { rows: pr, idx, broughtValue, broughtVat, carriedValue: runValue, carriedVat: runVat }
  })
  const totalPages = pageData.length

  return (
    <div className="tax-report-sheet">
      {pageData.map((pg) => {
        const isLast = pg.idx === totalPages - 1
        return (
          <div className="tax-page" key={pg.idx}>
            <div className="tr-pageno">หน้า {pg.idx + 1}/{totalPages}</div>
            <div className="tr-title">{title}</div>
            <div className="tr-sub">เดือนภาษี {THAI_MONTHS_FULL[month - 1]} 2569</div>

            <div className="tr-head">
              <div className="tr-co">
                <div>ชื่อผู้ประกอบการ : <strong>{COMPANY.name}</strong></div>
                <div>ชื่อสถานประกอบการ : <strong>{COMPANY.name}</strong> ({COMPANY.branch})</div>
                <div>{COMPANY.address}</div>
              </div>
              <div className="tr-taxid">
                <div>เลขประจำตัวผู้เสียภาษีอากร</div>
                <div className="tr-boxes">{digits.map((d, i) => <span key={i}>{d.trim()}</span>)}</div>
                <div style={{ marginTop: 4 }}>☑ สำนักงานใหญ่&nbsp;&nbsp;☐ สาขา</div>
              </div>
            </div>

            <table className="tr-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>ลำดับ</th>
                  <th style={{ width: '9%' }}>วันเดือนปี</th>
                  <th style={{ width: '12%' }}>เล่มที่/เลขที่</th>
                  <th>{nameHeader}</th>
                  <th style={{ width: '15%' }}>{taxHeader}</th>
                  <th style={{ width: '10%' }}>สถานประกอบการ</th>
                  <th style={{ width: '11%' }}>มูลค่าสินค้า<br />หรือบริการ</th>
                  <th style={{ width: '11%' }}>จำนวนเงินภาษี<br />มูลค่าเพิ่ม</th>
                </tr>
              </thead>
              <tbody>
                {pg.idx > 0 && (
                  <tr>
                    <td colSpan={6} className="carry">ยอดยกมา</td>
                    <td className="num carry">{money2(pg.broughtValue)}</td>
                    <td className="num carry">{money2(pg.broughtVat)}</td>
                  </tr>
                )}
                {pg.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="ctr">{r.seq}</td>
                    <td className="ctr">{fmtTaxDate(r.date)}</td>
                    <td>{r.docNo}</td>
                    <td>{r.name}</td>
                    <td className="ctr">{r.taxId || '-'}</td>
                    <td className="ctr">{r.branch || '-'}</td>
                    <td className="num">{money2(r.value)}</td>
                    <td className="num">{r.vat ? money2(r.vat) : '-'}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} className="carry">{isLast ? 'รวมทั้งสิ้น' : 'ยอดยกไป'}</td>
                  <td className="num carry">{money2(isLast ? data.totalValue : pg.carriedValue)}</td>
                  <td className="num carry">{money2(isLast ? data.totalVat : pg.carriedVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
