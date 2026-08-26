// CS2 Match Tracker — Milestone 3
// ขั้นนี้เพิ่ม: เอาข้อมูลใน localStorage มาวาดเป็นตาราง เรียงล่าสุดขึ้นก่อน + ลบทีละแถว

// ชื่อ key ที่ใช้ใน localStorage — ตั้งเป็นตัวแปรไว้ จะได้ไม่พิมพ์ผิดกระจายทั้งไฟล์
const STORAGE_KEY = 'cs2-matches';

// ข้อความไทยของผลการแข่ง — ต้องอยู่บนสุด เพราะ render() ตอนหน้าโหลดเรียกใช้ก่อน
const RESULT_TEXT = { win: 'ชนะ', loss: 'แพ้', draw: 'เสมอ' };

// --- 1) จับ element ที่ต้องใช้ ---------------------------------------------
const form = document.getElementById('match-form');
const dateInput = document.getElementById('date');
const tbody = document.getElementById('match-tbody');
const tableWrap = document.querySelector('.table-wrap');
const emptyState = document.getElementById('empty-state');
const matchCountEl = document.getElementById('match-count');
const clearAllBtn = document.getElementById('clear-all');
const storageWarning = document.getElementById('storage-warning');

// ตั้งค่าเริ่มต้นเป็น "วันนี้" และห้ามเลือกวันในอนาคต
const today = toDateString(new Date());
dateInput.value = today;
dateInput.max = today;

// --- 2) ส่วนที่คุยกับ localStorage ------------------------------------------
// localStorage เก็บได้แต่ "ข้อความ" เท่านั้น
// ตอนเซฟ: object/array -> JSON.stringify -> string
// ตอนอ่าน: string -> JSON.parse -> object/array

// อ่านทั้ง array ออกมา ถ้าไม่มีหรือข้อมูลพัง ให้คืน array ว่างแทนการ crash
function loadMatches() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return [];              // ยังไม่เคยเซฟ -> getItem คืน null
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('อ่านข้อมูลจาก localStorage ไม่ได้ เริ่มใหม่เป็นลิสต์ว่าง:', err);
    return [];
  }
}

// เขียนทั้ง array กลับลงไป (localStorage ไม่มีคำสั่ง "เพิ่มทีละตัว")
function saveMatches(matches) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
    return true;
  } catch (err) {
    // เจอได้จริงตอนพื้นที่เต็ม (QuotaExceededError) หรือเบราว์เซอร์บล็อกการเก็บข้อมูล
    console.error('เซฟไม่สำเร็จ:', err);
    showWarning('เซฟข้อมูลไม่สำเร็จ — เบราว์เซอร์อาจบล็อก localStorage หรือพื้นที่เต็ม');
    return false;
  }
}

// เช็คว่าเบราว์เซอร์ให้ใช้ localStorage จริงไหม (โหมดส่วนตัวบางตัวห้ามใช้)
function storageAvailable() {
  try {
    const probe = '__cs2_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch (err) {
    return false;
  }
}

// กันไอดีซ้ำ เผื่อกด submit สองครั้งภายในมิลลิวินาทีเดียวกัน
function makeId(matches) {
  let id = Date.now();
  while (matches.some((match) => match.id === id)) id += 1;
  return id;
}

// --- 3) ตอนหน้าเว็บโหลด -----------------------------------------------------
if (!storageAvailable()) {
  showWarning('เบราว์เซอร์นี้ไม่ให้ใช้ localStorage (เช่นเปิดในโหมดส่วนตัว) — ฟอร์มยังกรอกได้ แต่ข้อมูลจะไม่ถูกเซฟ');
}

const savedOnLoad = loadMatches();
console.log(`โหลดจาก localStorage ได้ ${savedOnLoad.length} แมตช์:`, savedOnLoad);
render(savedOnLoad);

// --- 4) ตอน submit -----------------------------------------------------------
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

  // อ่านของเก่าออกมาก่อน แล้วค่อยต่อท้าย
  const matches = loadMatches();

  const match = {
    id: makeId(matches),
    date: raw.date,              // 'YYYY-MM-DD'
    map: raw.map,
    kills,
    deaths,
    kd: calcKD(kills, deaths),   // คำนวณให้ ไม่ต้องกรอกเอง
    adr: Number(raw.adr),
    hs: Number(raw.hs),
    result: raw.result,          // 'win' | 'loss' | 'draw'
    savedAt: new Date().toISOString(), // เวลาที่กดบันทึก เผื่อใช้เรียงลำดับทีหลัง
  };

  matches.push(match);
  const ok = saveMatches(matches);

  console.log(ok ? `บันทึกแล้ว (รวม ${matches.length} แมตช์):` : 'บันทึกไม่สำเร็จ:', match);
  console.table(matches);

  render(matches);

  // เคลียร์เฉพาะช่องสถิติ (คงวันที่ไว้) เพื่อกรอกแมตช์ถัดไปต่อได้เลย
  clearStatFields();
});

// ล้าง error เวลากดปุ่ม "ล้างฟอร์ม" (ปุ่มนี้ล้างแค่ช่องกรอก ไม่ยุ่งกับข้อมูลที่เซฟไว้)
form.addEventListener('reset', () => {
  clearErrors();
  // ต้องรอให้ reset ทำงานเสร็จก่อน ค่อยเซ็ตวันที่กลับเป็นวันนี้
  setTimeout(() => { dateInput.value = today; }, 0);
});

// --- 5) ปุ่มล้างข้อมูลทั้งหมด --------------------------------------------------
clearAllBtn.addEventListener('click', () => {
  const matches = loadMatches();
  if (matches.length === 0) return;

  if (!confirm(`ลบข้อมูลทั้งหมด ${matches.length} แมตช์? กู้คืนไม่ได้นะ`)) return;

  localStorage.removeItem(STORAGE_KEY);
  console.log('ล้างข้อมูลใน localStorage แล้ว');
  render([]);
});

// --- 6) ปุ่มลบรายแถว --------------------------------------------------------
// ผูก listener ไว้ที่ <tbody> ตัวเดียว แทนที่จะผูกทีละปุ่ม (เรียกว่า event delegation)
// ข้อดี: แถวที่วาดใหม่ทีหลังก็กดได้เลย ไม่ต้องผูก listener ใหม่ทุกครั้ง
tbody.addEventListener('click', (event) => {
  const button = event.target.closest('.row-delete');
  if (!button) return;                       // คลิกโดนที่อื่นในตาราง ไม่ต้องทำอะไร

  const id = Number(button.dataset.id);      // data-id="..." อ่านได้จาก dataset
  const matches = loadMatches();
  const target = matches.find((match) => match.id === id);
  if (!target) return;

  if (!confirm(`ลบแมตช์ ${target.map} วันที่ ${formatDate(target.date)}?`)) return;

  const remaining = matches.filter((match) => match.id !== id);
  saveMatches(remaining);
  render(remaining);
  console.log(`ลบแล้ว (เหลือ ${remaining.length} แมตช์):`, target);
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

function clearErrors() {
  form.querySelectorAll('.error').forEach((slot) => { slot.textContent = ''; });
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

// จุดเดียวที่วาดหน้าจอใหม่ — เรียกทุกครั้งที่ข้อมูลเปลี่ยน (โหลด/เพิ่ม/ลบ/ล้าง)
function render(matches) {
  matchCountEl.textContent = matches.length;
  clearAllBtn.disabled = matches.length === 0;

  const isEmpty = matches.length === 0;
  tableWrap.hidden = isEmpty;
  emptyState.hidden = !isEmpty;

  // sort() แก้ array ตัวเดิม เลยก็อปด้วย [...matches] ก่อน จะได้ไม่ไปยุ่งกับลำดับที่เซฟไว้
  const sorted = [...matches].sort(byNewestFirst);

  tbody.replaceChildren();                       // ล้างแถวเก่าทั้งหมด
  sorted.forEach((match) => tbody.appendChild(buildRow(match)));
}

// เรียงจากใหม่ไปเก่า: วันที่ก่อน ถ้าวันเดียวกันใช้ id (= เวลาที่กดบันทึก) ตัดสิน
function byNewestFirst(a, b) {
  if (a.date === b.date) return b.id - a.id;
  return a.date < b.date ? 1 : -1;               // 'YYYY-MM-DD' เทียบแบบ string ได้เลย
}

// สร้าง <tr> ของแมตช์หนึ่งแถว
function buildRow(match) {
  const row = document.createElement('tr');

  row.appendChild(cell(formatDate(match.date)));
  row.appendChild(cell(match.map));

  // ช่อง K/D: ตัวเลขใหญ่ + kills/deaths ตัวเล็กใต้กำกับ
  const kd = cell(Number(match.kd).toFixed(2), 'num');
  const detail = document.createElement('span');
  detail.className = 'sub';
  detail.textContent = `${match.kills}/${match.deaths}`;
  kd.appendChild(detail);
  row.appendChild(kd);

  row.appendChild(cell(Number(match.adr).toFixed(1), 'num'));
  row.appendChild(cell(`${Number(match.hs).toFixed(1)}%`, 'num'));

  const resultCell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge badge--${match.result}`;
  badge.textContent = RESULT_TEXT[match.result] ?? match.result;
  resultCell.appendChild(badge);
  row.appendChild(resultCell);

  const actionCell = document.createElement('td');
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'row-delete';
  deleteBtn.dataset.id = match.id;              // ฝังไอดีไว้กับปุ่ม ไว้หาตอนกดลบ
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'ลบแมตช์นี้';
  actionCell.appendChild(deleteBtn);
  row.appendChild(actionCell);

  return row;
}

// ตัวช่วยสร้าง <td> — ใช้ textContent (ไม่ใช่ innerHTML) ข้อความแปลก ๆ จะได้ไม่กลายเป็น HTML
function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

// '2026-08-26' -> '26/08/2026'
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function showWarning(message) {
  storageWarning.textContent = message;
  storageWarning.hidden = false;
}
