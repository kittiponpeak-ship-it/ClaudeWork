# CS2 Match Tracker

เว็บบันทึกสถิติ CS2 รายแมตช์ — HTML + CSS + JavaScript ล้วน ไม่มี framework ไม่มี backend

## สถานะตอนนี้: Milestone 2 ✅ (เซฟลง localStorage)

- Milestone 1 ✅ ฟอร์ม + ตรวจข้อมูล + `console.log`
- Milestone 2 ✅ เซฟเป็น array ของ object ลง `localStorage` — **refresh แล้วข้อมูลไม่หาย**

แถบด้านบนบอกว่ามีกี่แมตช์ในเครื่องและแมตช์ล่าสุดคืออะไร (อ่านจาก localStorage ตอนหน้าโหลด)
พร้อมปุ่มล้างข้อมูลทั้งหมด

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
| `app.js` | อ่านค่าจากฟอร์ม → ตรวจข้อมูล → สร้าง object → เซฟลง localStorage |

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
  result: "win",       // "win" | "loss" | "draw"
  savedAt: "2026-08-26T03:54:03.050Z"  // เวลาที่กดบันทึก
}
```

ทั้งหมดถูกเก็บเป็น **array** ใต้ key `cs2-matches` ใน localStorage:

```js
[ { …แมตช์ที่ 1… }, { …แมตช์ที่ 2… } ]
```

ดูของจริงได้ที่ DevTools → แท็บ **Application** → Local Storage → เลือก origin ของหน้าเว็บ
หรือพิมพ์ในแท็บ Console:

```js
JSON.parse(localStorage.getItem('cs2-matches'))
```

## จุดที่ตั้งใจทำในขั้นนี้

- `event.preventDefault()` กันหน้า reload ตอน submit
- ใช้ `FormData` ดึงค่าทุกช่องทีเดียว แทนการ `getElementById` ทีละอัน
- ค่าจากฟอร์มเป็น **string เสมอ** → แปลงด้วย `Number()` ก่อนใช้คำนวณ
- ตรวจข้อมูลเอง (`novalidate`) เพื่อคุมข้อความ error ภาษาไทยได้
- `deaths = 0` ไม่ทำให้ K/D กลายเป็น `Infinity` — ใช้จำนวน kills แทน
- วันที่ default เป็นวันนี้ และเลือกวันในอนาคตไม่ได้

## จุดที่ตั้งใจทำใน Milestone 2

- localStorage เก็บได้แต่ **ข้อความ** → เซฟด้วย `JSON.stringify`, อ่านด้วย `JSON.parse`
- ไม่มีคำสั่ง "เพิ่มทีละตัว" → ต้อง **อ่าน array เดิม → `push` → เขียนกลับทั้งก้อน**
- `getItem` คืน `null` ถ้ายังไม่เคยเซฟ — ต้องเผื่อกรณีนี้ ไม่งั้น `JSON.parse(null)` พัง
- ครอบ `try/catch` ทั้งตอนอ่านและตอนเขียน: ข้อมูลใน storage พังก็ยังเปิดหน้าเว็บได้
  (คืน array ว่างแทนการ crash) และเซฟไม่ได้ก็ขึ้นคำเตือนแทนที่จะเงียบ
- เช็คก่อนว่าเบราว์เซอร์ให้ใช้ localStorage ไหม (โหมดส่วนตัวบางตัวห้าม)
- `id` กันซ้ำ เผื่อกด submit สองครั้งในมิลลิวินาทีเดียวกัน — จะได้ใช้อ้างอิงตอนลบใน Milestone 3

### ข้อควรรู้เรื่อง localStorage

- ผูกกับ **origin** — เปิดด้วย `file://` กับ `http://localhost:8000` จะเห็นคนละชุด
- อยู่แค่ **เครื่องนี้ เบราว์เซอร์นี้** ไม่ sync ข้ามเครื่อง และหายถ้าล้าง browsing data
- เก็บได้ราว 5 MB ต่อ origin — สถิติ CS2 แบบนี้เก็บได้เป็นหมื่นแมตช์ สบาย ๆ

## ขั้นถัดไป

- **Milestone 3** — แสดงเป็นตารางใต้ฟอร์ม เรียงล่าสุดขึ้นก่อน
- **Milestone 4** — กราฟเทรนด์ ADR / K/D ด้วย Chart.js ผ่าน CDN
- **Milestone 5** — filter ตาม map, สรุป win rate, checklist ซ้อมรายสัปดาห์
