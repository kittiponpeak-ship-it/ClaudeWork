// CS2 Match Tracker — Milestone 1
// เป้าหมายของขั้นนี้: อ่านค่าจากฟอร์มให้ถูกต้อง แล้ว console.log ออกมาดู
// (ยังไม่เซฟลง localStorage — อันนั้นคือ Milestone 2)

// --- 1) จับ element ที่ต้องใช้ ---------------------------------------------
const form = document.getElementById('match-form');
const dateInput = document.getElementById('date');
const preview = document.getElementById('preview');
const previewJson = document.getElementById('preview-json');

// ตั้งค่าเริ่มต้นเป็น "วันนี้" และห้ามเลือกวันในอนาคต
const today = toDateString(new Date());
dateInput.value = today;
dateInput.max = today;

// --- 2) ตอน submit -----------------------------------------------------------
form.addEventListener('submit', (event) => {
  // กันไม่ให้เบราว์เซอร์ reload หน้า (พฤติกรรมปกติของ form)
  event.preventDefault();

  clearErrors();

  // FormData ช่วยดึงค่าทุกช่องจาก name="" ได้ในทีเดียว
  const formData = new FormData(form);
  const raw = {
    date: formData.get('date'),
    map: formData.get('map'),
    kills: formData.get('kills'),
    deaths: formData.get('deaths'),
    adr: formData.get('adr'),
    hs: formData.get('hs'),
    result: formData.get('result'),
  };

  const errors = validate(raw);
  if (Object.keys(errors).length > 0) {
    showErrors(errors);
    console.warn('ข้อมูลยังไม่ครบ/ไม่ถูกต้อง:', errors);
    return;
  }

  // ค่าจากฟอร์มเป็น string เสมอ → แปลงเป็นตัวเลขก่อนเก็บ
  const kills = Number(raw.kills);
  const deaths = Number(raw.deaths);

  const match = {
    id: Date.now(),              // ไอดีง่าย ๆ ไว้ใช้ตอน Milestone 2–3
    date: raw.date,              // 'YYYY-MM-DD'
    map: raw.map,
    kills,
    deaths,
    kd: calcKD(kills, deaths),   // คำนวณให้ ไม่ต้องกรอกเอง
    adr: Number(raw.adr),
    hs: Number(raw.hs),
    result: raw.result,          // 'win' | 'loss' | 'draw'
  };

  // --- 3) ผลลัพธ์ของ Milestone 1: log ออกมาดูว่าอ่านค่าถูกไหม ---
  console.log('แมตช์ที่กรอก:', match);
  console.table([match]);

  showPreview(match);

  // เคลียร์เฉพาะช่องสถิติ (คงวันที่ไว้) เพื่อกรอกแมตช์ถัดไปต่อได้เลย
  clearStatFields();
});

// ล้าง error + ซ่อนพรีวิว เวลากดปุ่ม "ล้างฟอร์ม"
form.addEventListener('reset', () => {
  clearErrors();
  preview.hidden = true;
  // ต้องรอให้ reset ทำงานเสร็จก่อน ค่อยเซ็ตวันที่กลับเป็นวันนี้
  setTimeout(() => { dateInput.value = today; }, 0);
});

// --- ฟังก์ชันย่อย -------------------------------------------------------------

// ตรวจข้อมูล คืน object แบบ { ชื่อช่อง: 'ข้อความ error' }
function validate(raw) {
  const errors = {};

  if (!raw.date) {
    errors.date = 'เลือกวันที่ก่อนนะ';
  } else if (raw.date > today) {
    errors.date = 'เลือกวันในอนาคตไม่ได้';
  }

  if (!raw.map) errors.map = 'เลือก map ก่อน';
  if (!raw.result) errors.result = 'เลือกผลการแข่ง';

  checkNumber(errors, 'kills', raw.kills, 0, 100, 'Kills');
  checkNumber(errors, 'deaths', raw.deaths, 0, 100, 'Deaths');
  checkNumber(errors, 'adr', raw.adr, 0, 300, 'ADR');
  checkNumber(errors, 'hs', raw.hs, 0, 100, 'HS%');

  return errors;
}

// ตัวช่วยเช็คช่องตัวเลข: ต้องกรอก, ต้องเป็นตัวเลข, ต้องอยู่ในช่วงที่กำหนด
function checkNumber(errors, key, value, min, max, label) {
  if (value === null || value.trim() === '') {
    errors[key] = `กรอก ${label} ด้วย`;
    return;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    errors[key] = `${label} ต้องเป็นตัวเลข`;
  } else if (num < min || num > max) {
    errors[key] = `${label} ต้องอยู่ระหว่าง ${min}–${max}`;
  }
}

function showErrors(errors) {
  for (const [key, message] of Object.entries(errors)) {
    const slot = form.querySelector(`[data-error-for="${key}"]`);
    if (slot) slot.textContent = message;
  }
  // โฟกัสช่องแรกที่ผิด (ถ้าเป็นกลุ่ม radio จะได้ RadioNodeList ต้องหยิบตัวแรก)
  const firstKey = Object.keys(errors)[0];
  const field = form.elements[firstKey];
  const target = field instanceof RadioNodeList ? field[0] : field;
  if (target) target.focus();
}

// ล้างช่องสถิติทั้งหมด แต่ไม่แตะช่องวันที่
function clearStatFields() {
  ['map', 'kills', 'deaths', 'adr', 'hs'].forEach((id) => {
    document.getElementById(id).value = '';
  });
  form.querySelectorAll('input[name="result"]').forEach((radio) => {
    radio.checked = false;
  });
  document.getElementById('map').focus();
}

function clearErrors() {
  form.querySelectorAll('.error').forEach((slot) => { slot.textContent = ''; });
}

// K/D: ถ้าตายศูนย์ครั้ง หารไม่ได้ ให้ใช้จำนวน kills ไปเลย
function calcKD(kills, deaths) {
  const ratio = deaths === 0 ? kills : kills / deaths;
  return Number(ratio.toFixed(2));
}

// แปลง Date เป็น 'YYYY-MM-DD' ตามเวลาเครื่อง (toISOString จะเป็น UTC ทำให้วันเพี้ยน)
function toDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function showPreview(match) {
  previewJson.textContent = JSON.stringify(match, null, 2);
  preview.hidden = false;
}
