# CS2 Match Tracker

เว็บบันทึกสถิติ CS2 รายแมตช์ — HTML + CSS + JavaScript ล้วน ไม่มี framework ไม่มี backend

## สถานะตอนนี้: Milestone 1 ✅ (ฟอร์ม + ตรวจข้อมูล)

กรอกฟอร์ม → กด **บันทึกแมตช์** → ข้อมูลถูกอ่านมาเป็น object แล้ว `console.log` ออกทาง DevTools
พร้อมโชว์ JSON ให้ดูใต้ฟอร์มด้วย **ยังไม่มีการเซฟข้อมูล** (นั่นคือ Milestone 2)

## วิธีเปิด

ดับเบิลคลิก `index.html` ได้เลย หรือถ้าอยากเปิดผ่าน local server:

```bash
cd cs2-stats
python3 -m http.server 8000
# แล้วเปิด http://localhost:8000
```

เปิด DevTools (F12) แท็บ Console เพื่อดูผลลัพธ์ของ `console.log` / `console.table`

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงหน้าเว็บ + ฟอร์ม (แต่ละช่องมี `name` ไว้ให้ `FormData` ดึงค่า) |
| `style.css` | ธีมมืด, layout แบบ grid 2 คอลัมน์ (จอเล็กยุบเหลือคอลัมน์เดียว) |
| `app.js` | อ่านค่าจากฟอร์ม → ตรวจข้อมูล → สร้าง object → `console.log` |

## ข้อมูลที่เก็บต่อ 1 แมตช์

```js
{
  id: 1755000000000,   // Date.now() ไว้อ้างอิงตอน Milestone 2–3
  date: "2026-08-26",  // YYYY-MM-DD
  map: "Mirage",
  kills: 24,
  deaths: 16,
  kd: 1.5,             // คำนวณจาก kills / deaths ให้อัตโนมัติ
  adr: 92.4,
  hs: 58.3,            // เปอร์เซ็นต์ 0–100
  result: "win"        // "win" | "loss" | "draw"
}
```

## จุดที่ตั้งใจทำในขั้นนี้

- `event.preventDefault()` กันหน้า reload ตอน submit
- ใช้ `FormData` ดึงค่าทุกช่องทีเดียว แทนการ `getElementById` ทีละอัน
- ค่าจากฟอร์มเป็น **string เสมอ** → แปลงด้วย `Number()` ก่อนใช้คำนวณ
- ตรวจข้อมูลเอง (`novalidate`) เพื่อคุมข้อความ error ภาษาไทยได้
- `deaths = 0` ไม่ทำให้ K/D กลายเป็น `Infinity` — ใช้จำนวน kills แทน
- วันที่ default เป็นวันนี้ และเลือกวันในอนาคตไม่ได้

## ขั้นถัดไป

- **Milestone 2** — เซฟลง `localStorage` (เก็บเป็น array ของ object, refresh แล้วข้อมูลไม่หาย)
- **Milestone 3** — แสดงเป็นตารางใต้ฟอร์ม เรียงล่าสุดขึ้นก่อน
- **Milestone 4** — กราฟเทรนด์ ADR / K/D ด้วย Chart.js ผ่าน CDN
- **Milestone 5** — filter ตาม map, สรุป win rate, checklist ซ้อมรายสัปดาห์
