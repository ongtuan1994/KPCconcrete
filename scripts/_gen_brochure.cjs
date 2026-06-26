/* Generate a 1-page A4-landscape promo brochure (HTML) for KPCconcrete with
   inlined app screenshots, then it is rendered to PDF by headless Chrome. */
const fs = require('fs')
const path = require('path')
const dir = __dirname
const img = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'shots', n + '.png')).toString('base64')

const HERO = img('monthly-report')
const T1 = img('plant'), T2 = img('ledger'), T3 = img('fleet')

const features = [
  ['📊', 'แดชบอร์ด & รายงานเรียลไทม์', 'ยอดขาย กำไร ลูกหนี้ ภาษี — เห็นภาพรวมทันที พร้อมกราฟ พิมพ์ PDF / Excel'],
  ['🏭', 'ติดตามการผลิตหน้าโรงงาน', 'กำลังการผลิต รถโม่ ปริมาณคอนกรีตรายวัน อัปเดตสด'],
  ['🧾', 'เอกสารขายครบวงจร', 'ใบสั่งขาย → ใบจ่ายคอนกรีต → ใบกำกับภาษี → ใบเสร็จ/วางบิล ออกต่อเนื่องอัตโนมัติ'],
  ['💰', 'ลูกหนี้ / เจ้าหนี้ & ภาษี', 'ติดตามยอดค้าง เลยกำหนดชำระ ออกรายงานภาษีซื้อ–ขายได้ทันที'],
  ['👷', 'บริหารพนักงานครบ', 'เงินเดือน OT ลงเวลาสแกนนิ้ว บัญชีธนาคาร สลิป & ใบนำฝากธนาคาร'],
  ['🔒', 'ปลอดภัย ตรวจสอบได้', 'สิทธิ์ตามบทบาท (RBAC) · Audit log · สำรองข้อมูล'],
]

const benefits = [
  '⚡ ลดงานเอกสารซ้ำซ้อน ทำงานไวขึ้น',
  '🗂️ ข้อมูลรวมศูนย์ที่เดียว ไม่ตกหล่น',
  '📈 ตัดสินใจแม่นยำด้วยตัวเลขจริง',
  '📱 ใช้ได้ทั้งคอมและมือถือ ทุกที่ทุกเวลา',
]

const card = (f) => `<div class="feat"><div class="ic">${f[0]}</div><div><div class="ft">${f[1]}</div><div class="fd">${f[2]}</div></div></div>`

const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { width: 297mm; height: 210mm; font-family: 'Leelawadee UI','Sarabun',Tahoma,sans-serif; color: #14223a; background: #fff; overflow: hidden; }
  .wrap { width: 100%; height: 100%; display: flex; flex-direction: column; }

  header { background: linear-gradient(110deg,#0b1f4d 0%,#15348f 55%,#1d4ed8 100%); color: #fff; padding: 8mm 10mm 7mm; display: flex; justify-content: space-between; align-items: center; }
  .brand { display: flex; align-items: center; gap: 5mm; }
  .logo { width: 15mm; height: 15mm; border-radius: 4mm; background: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #15348f; font-size: 8mm; box-shadow: 0 2mm 5mm rgba(0,0,0,.25); }
  .brand h1 { font-size: 8.4mm; letter-spacing: -.3px; line-height: 1.05; }
  .brand .sub { font-size: 3.5mm; opacity: .85; margin-top: 1mm; font-weight: 500; }
  .htag { text-align: right; }
  .htag .big { font-size: 4.6mm; font-weight: 700; }
  .htag .url { margin-top: 2mm; display: inline-block; background: rgba(255,255,255,.16); border: .3mm solid rgba(255,255,255,.4); padding: 1.6mm 4mm; border-radius: 99px; font-size: 3.7mm; font-weight: 600; letter-spacing: .2px; }

  .body { flex: 1; display: grid; grid-template-columns: 1.5fr 1fr; gap: 6mm; padding: 6mm 10mm 0; min-height: 0; }
  .col-l { display: flex; flex-direction: column; gap: 4mm; min-height: 0; }
  .hero { border: .35mm solid #d8deea; border-radius: 3mm; overflow: hidden; box-shadow: 0 3mm 8mm rgba(20,34,58,.14); }
  .hero img { width: 100%; display: block; }
  .thumbs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
  .thumb { border: .35mm solid #d8deea; border-radius: 2.4mm; overflow: hidden; box-shadow: 0 1.5mm 5mm rgba(20,34,58,.12); background:#fff; }
  .thumb img { width: 100%; height: 30mm; object-fit: cover; object-position: top left; display: block; }
  .thumb .cap { font-size: 3mm; font-weight: 600; color: #41506a; padding: 1.6mm 2.4mm; text-align: center; }

  .col-r { display: flex; flex-direction: column; gap: 3.4mm; min-height: 0; }
  .col-r .eyebrow { font-size: 3.4mm; font-weight: 800; color: #1d4ed8; letter-spacing: .4px; text-transform: uppercase; }
  .feat { display: flex; gap: 3.5mm; align-items: flex-start; background: #f6f8fd; border: .3mm solid #e6ebf5; border-left: 1.4mm solid #1d4ed8; border-radius: 2.4mm; padding: 3mm 3.4mm; }
  .feat .ic { font-size: 6mm; line-height: 1; flex: none; }
  .feat .ft { font-size: 3.9mm; font-weight: 700; color: #0f2a5e; }
  .feat .fd { font-size: 3.2mm; color: #51607a; margin-top: .8mm; line-height: 1.3; }

  footer { margin-top: 5mm; background: #0f1a30; color: #fff; padding: 4.5mm 10mm; display: flex; justify-content: space-between; align-items: center; }
  .bens { display: flex; gap: 6mm; flex-wrap: wrap; font-size: 3.5mm; font-weight: 600; }
  .bens span { white-space: nowrap; }
  footer .co { text-align: right; font-size: 3.3mm; line-height: 1.5; opacity: .9; }
  footer .co b { font-size: 3.8mm; opacity: 1; }
</style></head><body><div class="wrap">

  <header>
    <div class="brand">
      <div class="logo">K</div>
      <div>
        <h1>KPC Concrete</h1>
        <div class="sub">ระบบบริหารโรงงานคอนกรีตครบวงจร · Concrete Batching Plant Management</div>
      </div>
    </div>
    <div class="htag">
      <div class="big">ระบบเดียว ครบทุกงานโรงงานคอนกรีต</div>
      <div class="url">🌐 kpcconcrete.vercel.app</div>
    </div>
  </header>

  <div class="body">
    <div class="col-l">
      <div class="hero"><img src="${HERO}" alt="dashboard"/></div>
      <div class="thumbs">
        <div class="thumb"><img src="${T1}"/><div class="cap">ติดตามการผลิตหน้าโรงงาน</div></div>
        <div class="thumb"><img src="${T2}"/><div class="cap">ลูกหนี้ / เจ้าหนี้</div></div>
        <div class="thumb"><img src="${T3}"/><div class="cap">ฟลีตรถโม่</div></div>
      </div>
    </div>
    <div class="col-r">
      <div class="eyebrow">ข้อดี & ประโยชน์ที่ได้รับ</div>
      ${features.map(card).join('')}
    </div>
  </div>

  <footer>
    <div class="bens">${benefits.map((b) => `<span>${b}</span>`).join('')}</div>
    <div class="co"><b>บริษัท กิจไพศาล คอนกรีต จำกัด</b><br/>โทร. 077-800-100 · จ.ระนอง</div>
  </footer>

</div></body></html>`

fs.writeFileSync(path.join(dir, '_brochure.html'), html)
console.log('brochure html written')
