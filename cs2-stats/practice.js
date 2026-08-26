// CS2 Match Tracker — Milestone 5: เช็กลิสต์ซ้อมรายสัปดาห์
// แยกไฟล์จาก app.js เพราะเป็นคนละเรื่องกัน และใช้ key ใน localStorage คนละอัน

const PRACTICE_KEY = 'cs2-practice';

// รายการซ้อมประจำสัปดาห์ — อยากเพิ่ม/แก้ ก็แก้ที่ array นี้ที่เดียว
// (id ห้ามซ้ำ และห้ามเปลี่ยนทีหลัง ไม่งั้นที่ติ๊กไว้จะจำไม่ได้)
const PRACTICE_ITEMS = [
  { id: 'warmup', text: 'วอร์ม aim_botz 100 kills ก่อนเข้าแมตช์' },
  { id: 'spray', text: 'ฝึกสเปรย์ AK / M4 ใส่กำแพง 10 นาที' },
  { id: 'dm', text: 'Deathmatch 20 นาที' },
  { id: 'prefire', text: 'วิ่ง prefire map 1 แมพ' },
  { id: 'nade', text: 'ซ้อมโยน smoke / flash ของแมพหลัก 1 แมพ' },
  { id: 'demo', text: 'ดู demo ตัวเอง 1 แมตช์ หาจังหวะที่ตายฟรี' },
];

const practiceList = document.getElementById('practice-list');
const practiceDoneEl = document.getElementById('practice-done');
const practiceTotalEl = document.getElementById('practice-total');
const practiceBar = document.getElementById('practice-bar');
const weekRangeEl = document.getElementById('week-range');

// --- localStorage ของเช็กลิสต์ ------------------------------------------------
// รูปแบบที่เก็บ: { week: '2026-W35', done: ['warmup', 'dm'] }
// เก็บ week ไว้ด้วย จะได้รู้ว่าข้ามสัปดาห์แล้วต้องล้างที่ติ๊กไว้

function loadPractice() {
  const thisWeek = weekId(new Date());
  try {
    const data = JSON.parse(localStorage.getItem(PRACTICE_KEY));
    if (data && data.week === thisWeek && Array.isArray(data.done)) return data.done;
  } catch (err) {
    console.error('อ่านเช็กลิสต์ไม่ได้ เริ่มใหม่:', err);
  }
  return [];                       // สัปดาห์ใหม่ (หรือยังไม่เคยมี) = เริ่มจากศูนย์
}

function savePractice(done) {
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify({ week: weekId(new Date()), done }));
  } catch (err) {
    console.error('เซฟเช็กลิสต์ไม่สำเร็จ:', err);
  }
}

// --- วาดหน้าจอ ---------------------------------------------------------------
function renderPractice() {
  const done = loadPractice();

  practiceList.replaceChildren();
  PRACTICE_ITEMS.forEach((item) => {
    practiceList.appendChild(buildPracticeRow(item, done.includes(item.id)));
  });

  practiceDoneEl.textContent = done.length;
  practiceTotalEl.textContent = PRACTICE_ITEMS.length;
  practiceBar.style.width = `${(done.length / PRACTICE_ITEMS.length) * 100}%`;
  weekRangeEl.textContent = `(${weekRangeText(new Date())})`;
}

function buildPracticeRow(item, isDone) {
  const li = document.createElement('li');

  const label = document.createElement('label');
  label.className = 'check';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = isDone;
  box.dataset.id = item.id;

  const text = document.createElement('span');
  text.textContent = item.text;

  label.append(box, text);
  li.appendChild(label);
  return li;
}

// ติ๊ก/ยกเลิกติ๊ก -> เซฟทันที (event delegation เหมือนปุ่มลบในตาราง)
practiceList.addEventListener('change', (event) => {
  const box = event.target;
  if (box.type !== 'checkbox') return;

  const done = loadPractice();
  const next = box.checked
    ? [...done, box.dataset.id]
    : done.filter((id) => id !== box.dataset.id);

  savePractice(next);
  renderPractice();
  console.log(`ซ้อมสัปดาห์นี้ ${next.length}/${PRACTICE_ITEMS.length}:`, next);
});

// --- เรื่องสัปดาห์ -------------------------------------------------------------

// คืนรหัสสัปดาห์แบบ ISO เช่น '2026-W35' (สัปดาห์เริ่มวันจันทร์)
function weekId(date) {
  const thursday = mondayOf(date);
  thursday.setDate(thursday.getDate() + 3);          // วันพฤหัสเป็นตัวกำหนดปีของสัปดาห์

  const firstThursday = mondayOf(new Date(thursday.getFullYear(), 0, 4));
  firstThursday.setDate(firstThursday.getDate() + 3);

  const week = 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// วันจันทร์ของสัปดาห์ที่วันนั้นอยู่
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayIndex = (d.getDay() + 6) % 7;             // getDay(): อาทิตย์=0 -> แปลงให้จันทร์=0
  d.setDate(d.getDate() - dayIndex);
  return d;
}

// '24/08 – 30/08'
function weekRangeText(date) {
  const monday = mondayOf(date);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const short = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${short(monday)} – ${short(sunday)}`;
}

renderPractice();
