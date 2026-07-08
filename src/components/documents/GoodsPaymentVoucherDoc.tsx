import type { ReactNode } from 'react'
import { DocShell, MetaRow, Signatures } from './DocShell'
import { baht } from '../../data/selectors'
import { bahtText } from '../../data/bahtText'
import type { GoodsPayment } from '../../data/createdDocs'

/** dd/mm/พ.ศ. from an ISO "YYYY-MM-DD". */
function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${Number(y) + 543}`
}

/** A ruled blank the payer can fill in by hand on the printed voucher. */
function Blank({ w, children }: { w: number; children?: ReactNode }) {
  return (
    <span style={{ display: 'inline-block', minWidth: w, borderBottom: '1px solid #9aa3af', textAlign: 'center', padding: '0 6px', lineHeight: 1.7 }}>
      {children || ' '}
    </span>
  )
}

const box = (on: boolean) => (on ? '☑' : '☐')

/** ใบสำคัญจ่าย (Payment Voucher) — printable, styled after the company's paper
    form but populated from a GoodsPayment record. Uses the shared DocShell so the
    KPC logo + header + A4 print sizing match every other document. */
export function GoodsPaymentVoucherDoc({ gp }: { gp: GoodsPayment }) {
  const items = gp.items ?? []
  const docNo = gp.taxInvoiceNo || gp.ref || ''
  const total = gp.amount
  const wht = 0 /* หัก ณ ที่จ่าย — not tracked on a voucher; kept for the paper layout */
  const net = total - wht

  const isCash = gp.method === 'เงินสดย่อย'
  const isTransfer = gp.method === 'โอน'
  const isCheque = gp.method === 'เช็ค'

  /* Table rows — one per product line, else a single row from the voucher itself.
     The doc date / doc no. sit on the first row only (voucher-level references). */
  const rows = items.length > 0
    ? items.map((it, i) => ({
        date: i === 0 ? fmtDate(gp.payDate) : '',
        no: i === 0 ? docNo : '',
        desc: it.name,
        detail: it.qty ? `${it.qty} × ${baht(it.unitPrice)}` : '',
        amount: Math.round(it.qty * it.unitPrice * 100) / 100,
      }))
    : [{
        date: fmtDate(gp.payDate),
        no: docNo,
        desc: gp.note || gp.category || 'ตามใบสำคัญจ่าย',
        detail: '',
        amount: total,
      }]
  const padRows = Math.max(0, 5 - rows.length)

  return (
    <DocShell docType="ใบสำคัญจ่าย / Payment Voucher">
      {/* จ่ายให้แก่ · ประเภท | เลขที่ · วันที่ */}
      <div className="doc-meta-grid">
        <MetaRow k="จ่ายให้แก่ :" v={gp.supplier} />
        <MetaRow k="เลขที่ :" v={gp.gpNo} mono />
        <MetaRow k="ประเภทค่าใช้จ่าย :" v={gp.category ? `${gp.category}${gp.site ? ` · ${gp.site}` : ''}` : '—'} />
        <MetaRow k="วันที่ :" v={fmtDate(gp.payDate)} mono />
      </div>

      {/* วิธีการจ่าย — checkbox row mirroring the paper form. */}
      <div style={{ margin: '14px 0 4px', fontSize: 13 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px' }}>
          <span>{box(isCash)} เงินสด</span>
          <span>{box(isTransfer)} โอน</span>
          <span>{box(isCheque)} เช็คธนาคาร</span>
          <Blank w={110}>{isCheque ? '' : ''}</Blank>
          <span style={{ color: 'var(--kpc-text-muted)' }}>สาขา</span>
          <Blank w={90} />
          <span style={{ color: 'var(--kpc-text-muted)' }}>เลขที่เช็ค</span>
          <Blank w={100}>{gp.chequeNo || ''}</Blank>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px', marginTop: 8 }}>
          <span style={{ color: 'var(--kpc-text-muted)' }}>เช็คลงวันที่</span>
          <Blank w={110} />
          <span style={{ color: 'var(--kpc-text-muted)' }}>จำนวนเงิน</span>
          <span className="mono" style={{ fontWeight: 700 }}>{baht(total)}</span>
        </div>
      </div>

      {/* รายการ */}
      <table className="doc-lines">
        <thead>
          <tr>
            <th style={{ width: 92 }}>วันที่เอกสาร</th>
            <th style={{ width: 110 }}>เลขที่เอกสาร</th>
            <th>รายการ / Description</th>
            <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="mono">{r.date}</td>
              <td className="mono">{r.no}</td>
              <td>
                {r.desc}
                {r.detail && <span style={{ color: 'var(--kpc-text-muted)', fontSize: 12 }}> · {r.detail}</span>}
              </td>
              <td className="num mono">{baht(r.amount)}</td>
            </tr>
          ))}
          {Array.from({ length: padRows }).map((_, i) => (
            <tr className="spacer" key={`s${i}`}><td colSpan={4} /></tr>
          ))}
        </tbody>
      </table>

      {/* หมายเหตุ / จำนวนเงินเป็นตัวอักษร | ยอดรวม · WHT · คงเหลือสุทธิ */}
      <div className="doc-foot">
        <div className="doc-words">
          {gp.note && <div style={{ marginBottom: 6 }}>หมายเหตุ: {gp.note}</div>}
          <div>จำนวนเงิน <strong>({bahtText(net)})</strong></div>
        </div>
        <div className="doc-totals">
          <div className="trow"><span className="lab">จำนวนเงินรวม</span><span className="val">{baht(total)}</span></div>
          <div className="trow"><span className="lab">หัก ณ ที่จ่าย</span><span className="val">{baht(wht)}</span></div>
          <div className="trow grand"><span className="lab">คงเหลือสุทธิ</span><span className="val" style={{ color: '#c0392b' }}>{baht(net)}</span></div>
        </div>
      </div>

      <Signatures slots={[
        { cap: 'ผู้จ่าย', noDate: true },
        { cap: 'ผู้ตรวจสอบ', noDate: true },
        { cap: 'ผู้อนุมัติ', noDate: true },
        { cap: 'ผู้รับเงิน', noDate: true },
      ]} />
    </DocShell>
  )
}
