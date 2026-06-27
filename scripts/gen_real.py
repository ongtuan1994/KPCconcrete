"""AUTO-GENERATE src/data/real.ts from KPC source spreadsheets (real business data).

Run:  python scripts/gen_real.py
Source: <Desktop>/KPC/สรุปตามใบจ่ายสินค้า/.../สรุปตามใบจ่ายสินค้าคอนกรีต69.xlsx
        sheets 1-69 .. 6-69 (Jan–Jun พ.ศ.2569)
Legal customer details transcribed from the monthly ใบเสร็จ/ใบกำกับ sheets.
Raw-material balances transcribed from 2.สต็อควัตถุดิบ 2569.xls.
"""
import openpyxl, os, re, warnings
from collections import Counter, defaultdict
warnings.filterwarnings("ignore")

BASE = r"C:\Users\pipat\OneDrive\Desktop\KPC"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "real.ts")

MONTHS = [
    (1, "1-69", "มกราคม 2569", "ม.ค."),
    (2, "2-69", "กุมภาพันธ์ 2569", "ก.พ."),
    (3, "3-69", "มีนาคม 2569", "มี.ค."),
    (4, "4-69", "เมษายน 2569", "เม.ย."),
    (5, "5-69", "พฤษภาคม 2569", "พ.ค."),
    (6, "6-69", "มิถุนายน 2569", "มิ.ย."),
]

# Real legal billing entities (name, address, taxId) + a match token found in delivery-ticket names.
LEGAL_ENTITIES = [
    ("บจก.วาสนาอดิศรเจริญดี", "41/4 ม.2 ต.คุระ อ.คุระบุรี จ.พังงา 82150", "0855566000307", "วาสนาอดิศร"),
    ("บจก.ตลาดใหม่ จุ๋มจิ๋ม พลาซ่า", "87/18 ม.2 ต.บางนอน อ.เมือง จ.ระนอง 85000", "0855568000878", "จุ๋มจิ๋ม"),
    ("หจก.เทวาพิทักษ์ชัย", "51/151 ม.5 ต.บางริ้น อ.เมือง จ.ระนอง 85000", "0853562000017", "เทวาพิทักษ์"),
    ("บจก.ล่ำซำโชคทวีคูณดี", "15/6 ม.3 ถ.เพชรเกษม ต.บางริ้น อ.เมือง จ.ระนอง 85000", "0855564000181", "ล่ำซำ"),
    ("บจก.รักเกียรติ อินเตอร์ฟู้ด", "7/2 ม.1 ต.ม่วงกลวง อ.กะเปอร์ จ.ระนอง 85120", "0855568000355", "รักเกียรติ"),
    ("หจก.โชคชนาระนอง", "236/10 ม.4 ต.บางริ้น อ.เมือง จ.ระนอง 85000", "0853558000211", "โชคชนา"),
    ("หจก.เอ.พี.พี.อิเลคทรอนิค แอนด์ คอนสตรัคชั่น", "149/61 ม.11 ต.บางหมาก อ.เมือง จ.ชุมพร 86000", "0863556000213", "เอ.พี.พี"),
    ("บจก.กิจไพศาลอันดามันซีฟู้ด", "6/138 ม.1 ต.บางนอน อ.เมือง จ.ระนอง 85000", "0855557000200", "อันดามันซีฟู้ด"),
    ("กิจการร่วมค้า CCCE", "—", "—", "CCCE"),
    ("บจก.กรีนรีไซเคิลระนอง", "—", "—", "กรีนรีไซเคิล"),
]

STOCK = [
    ("SAN", "ทรายหยาบ", "River sand", "ตัน", 189.36, 200),
    ("AGG", 'หิน 3/4"', 'Aggregate 3/4"', "ตัน", -149.75, 200),
    ("CEM-1", "ปูนซีเมนต์ผง SCG (ซีเมนต์ 1)", "Cement SCG", "ตัน", 13.23, 40),
    ("CEM-2", "ปูนซีเมนต์ผง ดอกบัว (ซีเมนต์ 2)", "Cement Dokbua", "ตัน", 33.84, 40),
    ("ADM-D", "น้ำยา Plastomix-704 (หน่วง)", "Retarder admixture", "ลิตร", 832.36, 300),
    ("ADM-F", "น้ำยา PCE-1 Gold 500 SF (เร่ง)", "Accelerator admixture", "ลิตร", 923.40, 300),
    ("ADM-W", "น้ำยา SikaPlastocrete N (กันซึม)", "Waterproof admixture", "ลิตร", 200.0, 150),
]


def num(v):
    try:
        return round(float(v), 2)
    except Exception:
        return 0


def tss(s):
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def load_dts():
    p = os.path.join(BASE, "สรุปตามใบจ่ายสินค้า", "สรุปตามใบจ่ายสินค้า", "สรุปตามใบจ่ายสินค้าคอนกรีต69.xlsx")
    wb = openpyxl.load_workbook(p, read_only=True, data_only=True)
    dts = []
    for mnum, sheet, _label, _short in MONTHS:
        ws = wb[sheet]
        rows = list(ws.iter_rows(values_only=True))
        # detect header row
        hi = 0
        for i, r in enumerate(rows[:6]):
            if r and any(str(c) == "เลขที่ใบจ่าย" for c in r if c):
                hi = i
                break
        lastdate = ""
        for r in rows[hi + 1:]:
            if not r or r[1] in (None, ""):
                continue
            date = r[0]
            if date in (None, "", '"'):
                date = lastdate
            else:
                lastdate = str(date)
            dts.append(dict(
                month=mnum, date=str(date), dtNo=str(r[1]), type=r[2] or "", customer=(r[3] or "").strip(),
                prod=str(r[4] or ""), m3=num(r[5]), price=num(r[6]), amount=num(r[7]),
                invoice=str(r[8] or ""), billing=str(r[9] or ""), pay=r[10] or "", note=(r[11] or ""),
            ))
    wb.close()
    return dts


def strength(code):
    m = re.search(r"(\d{3,5})$", code)
    return int(m.group(1)) if m else None


def build_products(dts):
    pp = defaultdict(Counter)
    for d in dts:
        if d["price"]:
            pp[d["prod"]][d["price"]] += 1
    out = []
    for code in sorted({d["prod"] for d in dts if d["prod"]}):
        price = pp[code].most_common(1)[0][0] if pp[code] else 0
        if code.startswith("KPCPOSPP") or code.startswith("KPCP2OS"):
            out.append((code, "เสาเข็ม / คานสำเร็จรูป", 400, "คิว", "precast", price))
            continue
        s = strength(code) or 0
        variant = "R2" if "R2" in code else ""
        if s == 0:
            nm, cat = "คอนกรีต Lean", "lean"
        else:
            nm, cat = f"คอนกรีตกำลังอัด {s} กก./ตร.ซม.", "concrete"
        if variant:
            nm += " (สูตร R2)"
        out.append((code, nm, s, "คิว", cat, price))
    return out


def build_customers(dts):
    """One record per distinct delivery-ticket customer, enriched with a legal entity when a token matches."""
    agg = {}
    for d in dts:
        c = agg.setdefault(d["customer"], dict(name=d["customer"], types=Counter(), pays=Counter()))
        if d["type"]:
            c["types"][d["type"]] += 1
        if d["pay"]:
            c["pays"][d["pay"]] += 1
    out = []
    for i, name in enumerate(sorted(agg.keys()), start=1):
        c = agg[name]
        ctype = c["types"].most_common(1)[0][0] if c["types"] else "ขายลูกค้า"
        terms = c["pays"].most_common(1)[0][0] if c["pays"] else "—"
        legal = ("", "", "")
        for lname, laddr, ltax, token in LEGAL_ENTITIES:
            if token and token in name:
                legal = (lname, laddr, ltax)
                break
        out.append((f"C{i:04d}", name, ctype, terms, legal[0], legal[1], legal[2]))
    return out


def main():
    dts = load_dts()
    prods = build_products(dts)
    customers = build_customers(dts)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED from KPC source spreadsheets — real business data.\n")
        f.write("   Source: สรุปตามใบจ่ายสินค้าคอนกรีต69.xlsx (sheets 1-69 .. 6-69), พ.ศ.2569.\n")
        f.write("   Regenerate via: python scripts/gen_real.py  — do not hand-edit. */\n\n")

        f.write("export const COMPANY = {\n")
        f.write('  name: "บริษัท กิจไพศาล คอนกรีต จำกัด",\n')
        f.write('  branch: "สำนักงานใหญ่",\n')
        f.write('  address: "6/138 หมู่ 1 ตำบลบางนอน อำเภอเมือง จังหวัดระนอง 85000",\n')
        f.write('  taxId: "0855557000138",\n')
        f.write('  tel: "093-582-6138",\n')
        f.write("} as const\n\n")

        f.write("export interface Month { num: number; key: string; label: string; short: string }\n")
        f.write("export const MONTHS: Month[] = [\n")
        for mnum, key, label, short in MONTHS:
            f.write(f"  {{ num: {mnum}, key: {tss(key)}, label: {tss(label)}, short: {tss(short)} }},\n")
        f.write("]\n\n")

        f.write("export type ProductCategory = 'concrete' | 'precast' | 'lean'\n")
        f.write("export interface Product { code: string; name: string; strengthKsc: number; unit: string; category: ProductCategory; price: number }\n")
        f.write("export const PRODUCTS: Product[] = [\n")
        for code, nm, s, unit, cat, price in prods:
            f.write(f"  {{ code: {tss(code)}, name: {tss(nm)}, strengthKsc: {s}, unit: {tss(unit)}, category: '{cat}', price: {price} }},\n")
        f.write("]\n")
        f.write("export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(PRODUCTS.map(p => [p.code, p]))\n\n")

        f.write("export interface Customer {\n")
        f.write("  id: string; name: string; type: string; terms: string\n")
        f.write("  legalName: string; address: string; taxId: string\n")
        f.write("}\n")
        f.write("export const CUSTOMER_MASTER: Customer[] = [\n")
        for cid, name, ctype, terms, lname, laddr, ltax in customers:
            f.write(f"  {{ id: {tss(cid)}, name: {tss(name)}, type: {tss(ctype)}, terms: {tss(terms)}, "
                    f"legalName: {tss(lname)}, address: {tss(laddr)}, taxId: {tss(ltax)} }},\n")
        f.write("]\n")
        f.write("export const CUSTOMER_MAP: Record<string, Customer> = Object.fromEntries(CUSTOMER_MASTER.map(c => [c.name, c]))\n\n")

        f.write("export type PayMethod = 'เครดิต' | 'เงินสด' | 'โอน' | ''\n")
        f.write("export interface DeliveryTicket {\n")
        f.write("  month: number; date: string; dtNo: string; ref: string; type: string; customer: string\n")
        f.write("  prod: string; m3: number; price: number; amount: number\n")
        f.write("  invoice: string; billing: string; pay: PayMethod; note: string\n")
        f.write("}\n")
        f.write("export const DELIVERY_TICKETS: DeliveryTicket[] = [\n")
        for d in dts:
            ref = d["dtNo"][-5:] if len(d["dtNo"]) >= 5 else d["dtNo"]
            f.write("  { "
                    f"month: {d['month']}, date: {tss(d['date'])}, dtNo: {tss(d['dtNo'])}, ref: {tss(ref)}, type: {tss(d['type'])}, "
                    f"customer: {tss(d['customer'])}, prod: {tss(d['prod'])}, m3: {d['m3']}, price: {d['price']}, "
                    f"amount: {d['amount']}, invoice: {tss(d['invoice'])}, billing: {tss(d['billing'])}, "
                    f"pay: {tss(d['pay'])} as PayMethod, note: {tss(d['note'])} }},\n")
        f.write("]\n\n")

        f.write("export interface StockMaterial { code: string; name: string; en: string; unit: string; balance: number; reorder: number }\n")
        f.write("export const STOCK_MATERIALS: StockMaterial[] = [\n")
        for code, nm, en, unit, bal, reorder in STOCK:
            f.write(f"  {{ code: {tss(code)}, name: {tss(nm)}, en: {tss(en)}, unit: {tss(unit)}, balance: {bal}, reorder: {reorder} }},\n")
        f.write("]\n")
    print("WROTE", os.path.abspath(OUT))
    print("DTs:", len(dts), "products:", len(prods), "customers:", len(customers))
    linked = sum(1 for c in customers if c[4])
    print("customers with legal entity linked:", linked)


if __name__ == "__main__":
    main()
