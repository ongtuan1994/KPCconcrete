# ตั้งค่า Supabase ให้ข้อมูลใช้ร่วมกันทุกเบราว์เซอร์/ทุกเครื่อง

เดิมแอปเก็บข้อมูลใน **localStorage ของเบราว์เซอร์** (แยกกันคนละถัง) — ทำให้ข้อมูลที่กรอกใน
Chrome ไม่ขึ้นใน Edge. หลังตั้งค่า Supabase ข้อมูล (ใบจ่าย/ใบกำกับ/ใบเสร็จ/ฯลฯ และการลงเวลา)
จะถูกซิงค์ขึ้น **ฐานข้อมูลกลาง** และเห็นเหมือนกันทุกที่ (พร้อม realtime).

> ถ้ายังไม่ตั้งค่า env — แอปทำงานแบบเดิม (localStorage) ปกติทุกอย่าง.

---

## 1) สร้างโปรเจกต์ Supabase (ฟรี)
1. ไปที่ https://supabase.com → **New project** (เลือก Region ใกล้ไทย เช่น Singapore).
2. ตั้งรหัสผ่าน database (เก็บไว้ก็ได้ ไม่ได้ใช้ในแอป).
3. รอสร้างเสร็จ ~1–2 นาที.

## 2) สร้างตารางเก็บข้อมูล
Supabase → **SQL Editor** → วางแล้วกด **Run**:

```sql
create table if not exists public.app_state (
  id text primary key,
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- เปิด Row Level Security แล้วอนุญาตให้ anon key อ่าน/เขียนได้ (ตามโมเดลปัจจุบันที่
-- ยังไม่มีระบบล็อกอินจริง). ต้องการความปลอดภัยขึ้น ค่อยเพิ่ม Supabase Auth ภายหลัง.
alter table public.app_state enable row level security;

create policy "app_state read"   on public.app_state for select using (true);
create policy "app_state insert" on public.app_state for insert with check (true);
create policy "app_state update" on public.app_state for update using (true) with check (true);
```

## 3) เปิด Realtime ให้ตาราง
Supabase → **Database → Replication** (หรือ Realtime) → เพิ่มตาราง `app_state` เข้า
publication `supabase_realtime`. หรือรันใน SQL Editor:

```sql
alter publication supabase_realtime add table public.app_state;
```

## 4) เอาคีย์มาใส่แอป
Supabase → **Project Settings → API** จะเห็น:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

### ตอนพัฒนา (local)
คัดลอก `.env.example` เป็น `.env.local` แล้วเติมค่า:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```
รีสตาร์ต `npm run dev`.

### ตอน production (Vercel)
Vercel → โปรเจกต์ → **Settings → Environment Variables** → เพิ่ม 2 ตัวข้างบน
(Environment: Production + Preview) → **Redeploy**.

---

## เริ่มใช้งาน
- เบราว์เซอร์**แรก**ที่เปิดหลังตั้งค่า Supabase (และมีข้อมูลใน localStorage อยู่) จะ
  **อัปโหลดข้อมูลตั้งต้น**ขึ้นฐานข้อมูลกลางให้อัตโนมัติ.
- เบราว์เซอร์/เครื่องอื่นที่เปิดทีหลังจะ **ดึงข้อมูลชุดเดียวกัน**มาแสดง และซิงค์กันสองทาง.

## ข้อควรทราบ
- **เลือกเบราว์เซอร์ที่ข้อมูลถูกต้องเปิดก่อน** ครั้งแรก เพราะชุดข้อมูลของเครื่องแรกจะกลายเป็น
  ข้อมูลกลาง (เครื่องที่เปิดทีหลังจะยึดข้อมูลกลางแทนของเดิมในเครื่องนั้น).
- โมเดลนี้เป็น **shared blob (last-write-wins)** — เหมาะกับทีมเล็กที่ไม่ค่อยแก้พร้อมกัน.
  ถ้าต้องการหลายผู้ใช้แก้พร้อมกันแบบ row-level + สิทธิ์จริง แนะนำต่อยอดเป็น schema เชิงตาราง
  + Supabase Auth (เป็นงานเพิ่ม บอกได้ถ้าต้องการ).
- ความปลอดภัย: ตอนนี้ใช้ anon key + policy เปิด (ใครมีลิงก์แอปก็เข้าถึงข้อมูลได้ เท่ากับ
  พฤติกรรมเดิมที่ไม่มีระบบล็อกอินจริง). ถ้าต้องการล็อกด้วยบัญชีจริง ให้เพิ่ม Supabase Auth.
