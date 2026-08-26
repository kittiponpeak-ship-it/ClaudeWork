// CS2 Match Tracker — ขั้น 12: Export / Import ข้อมูลเป็นไฟล์ JSON
//
// ทำไมต้องมี: localStorage ผูกกับ "เบราว์เซอร์ + โดเมน" ที่เครื่องนั้น
// เผลอกด clear browsing data, เปลี่ยนเบราว์เซอร์, ย้ายเครื่อง = ข้อมูลหายหมด
// ไฟล์ JSON คือทางเดียวที่จะย้ายหรือสำรองข้อมูลออกมาได้

const BACKUP_VERSION = 1;
const RESULT_VALUES = ['win', 'loss', 'draw'];

const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');

// --- Export -------------------------------------------------------------------

// รวมทุก key ที่หน้านี้ใช้ไว้ในไฟล์เดียว (แมตช์ + เป้าหมาย + เช็กลิสต์ + ธีม)
function collectBackup() {
  return {
    app: 'cs2-match-tracker',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    matches: loadMatches(),
    goals: readKey(GOALS_KEY),
    practice: readKey(PRACTICE_KEY),
    theme: loadTheme(),
  };
}

function readKey(key) {
  try {
    return JSON.parse(localStorage.getItem(key));   // ไม่มี key -> null
  } catch (err) {
    return null;
  }
}

exportBtn.addEventListener('click', () => {
  const data = collectBackup();

  // เบราว์เซอร์ดาวน์โหลดได้เฉพาะ "ไฟล์ที่มี URL" เลยต้องห่อข้อความเป็น Blob
  // แล้วขอ URL ชั่วคราวให้มัน (blob:...) ก่อนสั่งกดลิงก์ให้เอง
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `cs2-stats-${toDateString(new Date())}.json`;
  link.click();

  URL.revokeObjectURL(url);   // คืนหน่วยความจำ ไม่งั้น blob ค้างอยู่จนกว่าจะปิดแท็บ
  console.log(`export ${data.matches.length} แมตช์เป็นไฟล์ ${link.download}`);
});

// --- Import -------------------------------------------------------------------

importBtn.addEventListener('click', () => importInput.click());   // ปุ่มสวย ๆ กดแทน input file

importInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    applyBackup(JSON.parse(text), file.name);
  } catch (err) {
    console.error('อ่านไฟล์ไม่สำเร็จ:', err);
    alert(`เปิดไฟล์ "${file.name}" ไม่ได้ — ต้องเป็นไฟล์ JSON ที่ export ออกไปจากหน้านี้`);
  } finally {
    // ต้องเคลียร์ ไม่งั้นเลือกไฟล์ "เดิม" ซ้ำอีกครั้ง event change จะไม่ยิง (ค่าไม่เปลี่ยน)
    importInput.value = '';
  }
});

function applyBackup(data, fileName) {
  // รับได้ 2 แบบ: ไฟล์เต็มจากปุ่ม Export หรือ array แมตช์ล้วน ๆ (เผื่อก๊อปมาจาก console)
  const rawMatches = Array.isArray(data) ? data : data?.matches;
  if (!Array.isArray(rawMatches)) {
    alert(`ไฟล์ "${fileName}" ไม่มีข้อมูลแมตช์ (ต้องมี key ชื่อ matches เป็น array)`);
    return;
  }

  // ข้อมูลจากไฟล์ = ข้อมูลจากข้างนอก ต้องตรวจทุกแถวก่อนเอาลง localStorage
  const usedIds = new Set();
  const matches = [];
  let skipped = 0;

  rawMatches.forEach((row) => {
    const match = cleanMatch(row, usedIds);
    if (match) matches.push(match);
    else skipped += 1;
  });

  if (matches.length === 0) {
    alert(`ไฟล์ "${fileName}" ไม่มีแมตช์ที่ใช้ได้เลย (ข้ามไป ${skipped} แถวเพราะข้อมูลไม่ครบ)`);
    return;
  }

  const current = loadMatches().length;
  const note = skipped > 0 ? `\n(ข้าม ${skipped} แถวที่ข้อมูลไม่ครบ)` : '';
  if (!confirm(`นำเข้า ${matches.length} แมตช์จาก "${fileName}"?${note}\n\nข้อมูลเดิม ${current} แมตช์ในเครื่องนี้จะถูกแทนที่ทั้งหมด`)) return;

  if (!saveMatches(matches)) return;

  // เป้าหมาย / เช็กลิสต์ / ธีม มีในไฟล์ก็เอากลับมาด้วย ไม่มีก็ปล่อยของเดิมไว้
  if (data?.goals && typeof data.goals === 'object') writeKey(GOALS_KEY, data.goals);
  if (data?.practice && typeof data.practice === 'object') writeKey(PRACTICE_KEY, data.practice);
  if (data?.theme === 'dark' || data?.theme === 'light') {
    writeKey(THEME_KEY, data.theme, { raw: true });
    applyTheme(data.theme);
  }

  // วาดใหม่ทุกส่วน เพราะข้อมูลเปลี่ยนไปหมดแล้ว
  exitEdit({ redraw: false });
  fillGoalInputs();
  render(loadMatches());
  renderPractice();

  console.log(`import สำเร็จ ${matches.length} แมตช์ (ข้าม ${skipped})`);
  alert(`นำเข้าเรียบร้อย ${matches.length} แมตช์`);
}

function writeKey(key, value, { raw = false } = {}) {
  try {
    localStorage.setItem(key, raw ? value : JSON.stringify(value));
  } catch (err) {
    console.error(`เซฟ ${key} จากไฟล์ไม่สำเร็จ:`, err);
  }
}

// ตรวจแถวเดียวจากไฟล์ คืน object ที่สะอาดแล้ว หรือ null ถ้าใช้ไม่ได้
function cleanMatch(row, usedIds) {
  if (!row || typeof row !== 'object') return null;

  // วันที่ต้องเป็น 'YYYY-MM-DD' เท่านั้น เพราะทั้งหน้าใช้รูปแบบนี้เรียง/ตัดสตริงตรง ๆ
  if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  if (typeof row.map !== 'string' || row.map.trim() === '') return null;
  if (!RESULT_VALUES.includes(row.result)) return null;

  const kills = toNumberInRange(row.kills, 0, 100);
  const deaths = toNumberInRange(row.deaths, 0, 100);
  const adr = toNumberInRange(row.adr, 0, 300);
  const hs = toNumberInRange(row.hs, 0, 100);
  if ([kills, deaths, adr, hs].some((value) => value === null)) return null;

  // ไอดีต้องไม่ซ้ำ ไม่งั้นปุ่มแก้ไข/ลบจะไปโดนแถวผิด
  let id = Number(row.id);
  if (!Number.isFinite(id) || usedIds.has(id)) id = nextFreeId(usedIds);
  usedIds.add(id);

  return {
    id,
    date: row.date,
    map: row.map.trim(),
    kills,
    deaths,
    kd: calcKD(kills, deaths),      // คำนวณใหม่เสมอ ไม่เชื่อค่า kd ที่มากับไฟล์
    adr,
    hs,
    result: row.result,
    savedAt: typeof row.savedAt === 'string' ? row.savedAt : new Date().toISOString(),
    ...(typeof row.editedAt === 'string' ? { editedAt: row.editedAt } : {}),
  };
}

function toNumberInRange(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

function nextFreeId(usedIds) {
  let id = Date.now();
  while (usedIds.has(id)) id += 1;
  return id;
}
