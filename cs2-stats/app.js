// CS2 Match Tracker — Milestone 4–5
// ขั้นนี้เพิ่ม: กราฟเทรนด์ด้วย Chart.js, ตัวกรองตาม map, สรุป win rate/ค่าเฉลี่ย
// (เช็กลิสต์ซ้อมรายสัปดาห์แยกไปอยู่ practice.js)

// ชื่อ key ที่ใช้ใน localStorage — ตั้งเป็นตัวแปรไว้ จะได้ไม่พิมพ์ผิดกระจายทั้งไฟล์
const STORAGE_KEY = 'cs2-matches';

// ข้อความไทยของผลการแข่ง — ต้องอยู่บนสุด เพราะ render() ตอนหน้าโหลดเรียกใช้ก่อน
const RESULT_TEXT = { win: 'ชนะ', loss: 'แพ้', draw: 'เสมอ' };

// ค่าที่พล็อตได้ในกราฟ — เพิ่มอันใหม่ก็แค่เติมใน object นี้กับปุ่มใน HTML
const METRICS = {
  adr: { label: 'ADR', color: '#f0a500', pick: (match) => Number(match.adr) },
  kd: { label: 'K/D', color: '#4ade80', pick: (match) => Number(match.kd) },
  hs: { label: 'HS%', color: '#60a5fa', pick: (match) => Number(match.hs) },
};

let currentMetric = 'adr';   // ปุ่มที่กำลังเลือกอยู่
let chart = null;            // เก็บ instance ของ Chart.js ไว้ update ทีหลัง

// --- 1) จับ element ที่ต้องใช้ ---------------------------------------------
const form = document.getElementById('match-form');
const dateInput = document.getElementById('date');
const tbody = document.getElementById('match-tbody');
const tableWrap = document.querySelector('.table-wrap');
const emptyState = document.getElementById('empty-state');
const matchCountEl = document.getElementById('match-count');
const mapFilter = document.getElementById('map-filter');
const statsEl = document.getElementById('stats');
const metricToggle = document.getElementById('metric-toggle');
const chartBox = document.getElementById('chart-box');
const chartCanvas = document.getElementById('trend-chart');
const chartMessage = document.getElementById('chart-message');
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

// --- 7) ตัวกรอง map และปุ่มเลือกค่าที่จะพล็อต -------------------------------
mapFilter.addEventListener('change', () => {
  console.log('กรองเฉพาะ map:', mapFilter.value);
  refresh();
});

metricToggle.addEventListener('click', (event) => {
  const button = event.target.closest('.metric');
  if (!button) return;

  currentMetric = button.dataset.metric;
  metricToggle.querySelectorAll('.metric').forEach((btn) => {
    btn.classList.toggle('is-active', btn === button);
  });
  refresh();
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

// จุดเดียวที่วาดหน้าจอใหม่ — เรียกทุกครั้งที่ข้อมูลเปลี่ยน (โหลด/เพิ่ม/ลบ/ล้าง/เปลี่ยนตัวกรอง)
function render(allMatches) {
  matchCountEl.textContent = allMatches.length;
  clearAllBtn.disabled = allMatches.length === 0;

  renderFilterOptions(allMatches);

  // ทุกส่วนด้านล่างมองเห็นเฉพาะแมตช์ที่ผ่านตัวกรอง
  const matches = mapFilter.value === 'all'
    ? allMatches
    : allMatches.filter((match) => match.map === mapFilter.value);

  renderStats(matches);
  renderChart(matches);
  renderTable(matches);
}

// อ่านข้อมูลใหม่จาก localStorage แล้ววาดใหม่ (ใช้ตอนเปลี่ยนตัวกรอง/เปลี่ยนกราฟ)
function refresh() {
  render(loadMatches());
}

// ตัวเลือกใน dropdown สร้างจาก map ที่มีอยู่จริงในข้อมูล
function renderFilterOptions(allMatches) {
  const maps = [...new Set(allMatches.map((match) => match.map))].sort();
  const selected = mapFilter.value;

  mapFilter.replaceChildren(new Option('ทุก map', 'all'));
  maps.forEach((map) => mapFilter.appendChild(new Option(map, map)));

  // ถ้า map ที่กรองอยู่ถูกลบไปหมดแล้ว ให้เด้งกลับเป็น "ทุก map"
  mapFilter.value = maps.includes(selected) ? selected : 'all';
}

// การ์ดสรุป: จำนวนแมตช์, win rate, ค่าเฉลี่ยต่าง ๆ
function renderStats(matches) {
  const total = matches.length;

  if (total === 0) {
    statsEl.replaceChildren(muted('ยังไม่มีข้อมูลสำหรับตัวกรองนี้'));
    return;
  }

  const wins = matches.filter((match) => match.result === 'win').length;
  const losses = matches.filter((match) => match.result === 'loss').length;
  const draws = total - wins - losses;
  const average = (pick) => matches.reduce((sum, match) => sum + pick(match), 0) / total;

  statsEl.replaceChildren(
    tile('แมตช์', total, `${wins} ชนะ · ${losses} แพ้ · ${draws} เสมอ`),
    tile('Win rate', `${((wins / total) * 100).toFixed(0)}%`, `ชนะ ${wins} จาก ${total}`),
    tile('K/D เฉลี่ย', average(METRICS.kd.pick).toFixed(2)),
    tile('ADR เฉลี่ย', average(METRICS.adr.pick).toFixed(1)),
    tile('HS% เฉลี่ย', `${average(METRICS.hs.pick).toFixed(1)}%`),
  );
}

// กราฟเทรนด์: เรียงเก่า → ใหม่ แล้วพล็อตค่าที่เลือกไว้ พร้อมเส้นค่าเฉลี่ย
function renderChart(matches) {
  // ถ้า CDN โหลดไม่ติด (เน็ตหลุด/ออฟไลน์) ก็ให้ส่วนอื่นของหน้าใช้งานได้ตามปกติ
  if (typeof Chart === 'undefined') {
    showChartMessage('โหลด Chart.js จาก CDN ไม่ได้ — ต่อเน็ตแล้ว refresh อีกที (ส่วนอื่นยังใช้ได้ปกติ)');
    return;
  }

  if (matches.length === 0) {
    showChartMessage('ยังไม่มีข้อมูลจะพล็อต');
    return;
  }

  chartMessage.hidden = true;
  chartBox.hidden = false;

  const ordered = [...matches].sort((a, b) => -byNewestFirst(a, b));  // กลับด้าน: เก่า → ใหม่
  const metric = METRICS[currentMetric];
  const values = ordered.map(metric.pick);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  const data = {
    labels: ordered.map((match) => formatShortDate(match.date)),
    datasets: [
      {
        label: metric.label,
        data: values,
        borderColor: metric.color,
        backgroundColor: metric.color,
        tension: 0.25,          // ทำให้เส้นโค้งนิด ๆ (0 = หักมุม)
        pointRadius: 3,
      },
      {
        label: `ค่าเฉลี่ย ${mean.toFixed(2)}`,
        data: values.map(() => mean),   // เส้นตรงแนวนอน = ค่าเดิมซ้ำทุกจุด
        borderColor: '#64748b',
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  if (chart) {
    chart.data = data;          // มีกราฟอยู่แล้ว แค่เปลี่ยนข้อมูลแล้ว update
    chart.update();
    return;
  }

  chart = new Chart(chartCanvas, {
    type: 'line',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,   // ให้สูงตามกล่อง .chart-box ที่กำหนดใน CSS
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 16 }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      },
    },
  });
}

function showChartMessage(text) {
  if (chart) { chart.destroy(); chart = null; }
  chartBox.hidden = true;
  chartMessage.textContent = text;
  chartMessage.hidden = false;
}

// ตารางประวัติ (เรียงล่าสุดขึ้นก่อน)
function renderTable(matches) {
  const isEmpty = matches.length === 0;
  tableWrap.hidden = isEmpty;
  emptyState.hidden = !isEmpty;
  emptyState.textContent = mapFilter.value === 'all'
    ? 'ยังไม่มีข้อมูล — กรอกแมตช์แรกด้านบนได้เลย'
    : `ยังไม่มีแมตช์ของ ${mapFilter.value}`;

  // sort() แก้ array ตัวเดิม เลยก็อปด้วย [...matches] ก่อน จะได้ไม่ไปยุ่งกับลำดับที่เซฟไว้
  const sorted = [...matches].sort(byNewestFirst);

  tbody.replaceChildren();                       // ล้างแถวเก่าทั้งหมด
  sorted.forEach((match) => tbody.appendChild(buildRow(match)));
}

// การ์ดตัวเลขหนึ่งใบในส่วนสรุป
function tile(label, value, sub) {
  const box = document.createElement('div');
  box.className = 'tile';

  const valueEl = document.createElement('p');
  valueEl.className = 'tile-value';
  valueEl.textContent = value;

  const labelEl = document.createElement('p');
  labelEl.className = 'tile-label';
  labelEl.textContent = label;

  box.append(valueEl, labelEl);

  if (sub) {
    const subEl = document.createElement('p');
    subEl.className = 'tile-sub';
    subEl.textContent = sub;
    box.appendChild(subEl);
  }
  return box;
}

function muted(text) {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  return p;
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

// '2026-08-26' -> '26/08' (ใช้เป็น label ในกราฟ ให้สั้นเข้าไว้)
function formatShortDate(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
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
