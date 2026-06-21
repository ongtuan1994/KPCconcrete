/* Convert a number to Thai baht text (อ่านจำนวนเงินเป็นภาษาไทย). */
const NUM = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

function readInt(nStr: string): string {
  let out = ''
  const len = nStr.length
  for (let i = 0; i < len; i++) {
    const d = parseInt(nStr[i], 10)
    const pos = (len - i - 1) % 6
    if (d !== 0) {
      if (pos === 1 && d === 1) out += 'สิบ'
      else if (pos === 1 && d === 2) out += 'ยี่สิบ'
      else if (pos === 0 && d === 1 && len > 1 && i !== 0) out += 'เอ็ด'
      else out += NUM[d] + POS[pos]
    }
    if (pos === 0 && (len - i - 1) >= 6) out += 'ล้าน'
  }
  return out
}

export function bahtText(amount: number): string {
  if (amount === 0) return 'ศูนย์บาทถ้วน'
  const neg = amount < 0
  const fixed = Math.abs(amount).toFixed(2)
  const [intPart, satangPart] = fixed.split('.')
  let txt = readInt(intPart) + 'บาท'
  if (satangPart === '00') txt += 'ถ้วน'
  else txt += readInt(satangPart) + 'สตางค์'
  return (neg ? 'ลบ' : '') + txt
}
