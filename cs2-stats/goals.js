// CS2 Match Tracker — ขั้น 10: ตั้งเป้าหมาย + แถบความคืบหน้า
// เก็บเป้าไว้ใน localStorage อีก key หนึ่ง (cs2-goals) แยกจากข้อมูลแมตช์
// รูปแบบที่เก็บ: { adr: 90, kd: 1.1, hs: 45 }  — ช่องไหนไม่ได้ตั้ง ก็ไม่มี key นั้นเลย

const GOALS_KEY = 'cs2-goals';

// นิยามเป้าแต่ละตัวไว้ที่เดียว ทั้งฟอร์ม การตรวจค่า และการคำนวณใช้ชุดนี้หมด
const GOAL_DEFS = [
  { key: 'adr', label: 'ADR', max: 300, digits: 1, pick: (match) => Number(match.adr) },
  { key: 'kd', label: 'K/D', max: 10, digits: 2, pick: (match) => Number(match.kd) },
  { key: 'hs', label: 'HS%', max: 100, digits: 1, pick: (match) => Number(match.hs) },
];

const goalForm = document.getElementById('goal-form');
const goalProgressEl = document.getElementById('goal-progress');
const goalClearBtn = document.getElementById('goal-clear');

// --- localStorage ของเป้าหมาย --------------------------------------------------

function loadGoals() {
  try {
    const data = JSON.parse(localStorage.getItem(GOALS_KEY));
    if (!data || typeof data !== 'object') return {};

    // กรองเอาเฉพาะ key ที่รู้จักและเป็นตัวเลขบวก เผื่อไฟล์ที่ import เข้ามาเพี้ยน
    const clean = {};
    GOAL_DEFS.forEach(({ key, max }) => {
      const value = Number(data[key]);
      if (Number.isFinite(value) && value > 0 && value <= max) clean[key] = value;
    });
    return clean;
  } catch (err) {
    console.error('อ่านเป้าหมายไม่ได้:', err);
    return {};
  }
}

function saveGoals(goals) {
  try {
    if (Object.keys(goals).length === 0) localStorage.removeItem(GOALS_KEY);
    else localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    return true;
  } catch (err) {
    console.error('เซฟเป้าหมายไม่สำเร็จ:', err);
    return false;
  }
}

// --- ฟอร์มตั้งเป้า ---------------------------------------------------------------

goalForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearGoalErrors();

  const formData = new FormData(goalForm);
  const goals = {};
  const errors = {};

  GOAL_DEFS.forEach(({ key, label, max }) => {
    const raw = (formData.get(key) ?? '').trim();
    if (raw === '') return;                       // เว้นว่าง = ไม่ตั้งเป้าตัวนี้ ไม่ใช่ error

    const value = Number(raw);
    if (!Number.isFinite(value)) errors[key] = `${label} ต้องเป็นตัวเลข`;
    else if (value <= 0) errors[key] = `เป้า ${label} ต้องมากกว่า 0`;
    else if (value > max) errors[key] = `${label} ต้องไม่เกิน ${max}`;
    else goals[key] = value;
  });

  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([key, message]) => {
      const slot = goalForm.querySelector(`[data-error-for="${key}"]`);
      if (slot) slot.textContent = message;
    });
    return;
  }

  saveGoals(goals);
  console.log('ตั้งเป้าหมายเป็น:', goals);
  refresh();                                      // วาดใหม่ให้แถบความคืบหน้าอัปเดต
});

// พิมพ์แก้ช่องไหน ให้ error ของช่องนั้นหายทันที (เหมือนฟอร์มบันทึกแมตช์)
goalForm.addEventListener('input', (event) => {
  const slot = goalForm.querySelector(`[data-error-for="${event.target.name}"]`);
  if (slot) slot.textContent = '';
});

goalClearBtn.addEventListener('click', () => {
  if (!confirm('ล้างเป้าหมายทั้งหมด? (ข้อมูลแมตช์ไม่หาย)')) return;
  saveGoals({});
  fillGoalInputs();
  console.log('ล้างเป้าหมายแล้ว');
  refresh();
});

// เอาค่าที่เก็บไว้ใส่กลับลงช่องกรอก (ใช้ตอนโหลดหน้า ตอนล้างเป้า และตอน import ไฟล์)
function fillGoalInputs() {
  const goals = loadGoals();
  GOAL_DEFS.forEach(({ key }) => {
    const input = goalForm.elements[key];
    if (input) input.value = goals[key] ?? '';
  });
  clearGoalErrors();
}

function clearGoalErrors() {
  goalForm.querySelectorAll('.error').forEach((slot) => { slot.textContent = ''; });
}

// --- แถบความคืบหน้า ------------------------------------------------------------

function renderGoals(matches) {
  const goals = loadGoals();
  const keys = Object.keys(goals);

  goalClearBtn.hidden = keys.length === 0;
  goalProgressEl.replaceChildren();

  if (keys.length === 0) {
    goalProgressEl.appendChild(muted('ยังไม่ได้ตั้งเป้า — กรอกช่องไหนก็ได้ด้านบน (เว้นว่างคือไม่ตั้งเป้าตัวนั้น)'));
    return;
  }

  if (matches.length === 0) {
    goalProgressEl.appendChild(muted('ตั้งเป้าไว้แล้ว แต่ยังไม่มีแมตช์จะเอามาเทียบ'));
    return;
  }

  const caption = muted(`เทียบกับค่าเฉลี่ยของ ${matches.length} แมตช์ที่แสดงอยู่`);
  caption.className = 'muted trend-caption';
  goalProgressEl.appendChild(caption);

  GOAL_DEFS.forEach((def) => {
    if (goals[def.key] === undefined) return;
    goalProgressEl.appendChild(goalRow(def, goals[def.key], mean(matches, def.pick)));
  });
}

function goalRow({ label, digits }, target, current) {
  // ความคืบหน้า = ค่าเฉลี่ยจริง / เป้า  (เกิน 100% ได้ แต่แถบตันที่ 100)
  const percent = (current / target) * 100;
  const reached = percent >= 100;

  const box = document.createElement('div');
  box.className = `goal-item${reached ? ' is-reached' : ''}`;

  const head = document.createElement('div');
  head.className = 'goal-head';

  const nameEl = document.createElement('span');
  nameEl.className = 'goal-name';
  nameEl.textContent = reached ? `${label} ✓` : label;

  const valueEl = document.createElement('span');
  valueEl.className = 'goal-value';
  valueEl.textContent = `${current.toFixed(digits)} / ${target.toFixed(digits)} · ${percent.toFixed(0)}%`;

  head.append(nameEl, valueEl);

  const bar = document.createElement('div');
  bar.className = 'progress';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = `${Math.min(100, percent)}%`;
  bar.appendChild(fill);

  box.append(head, bar);
  return box;
}

fillGoalInputs();
