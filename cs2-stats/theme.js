// CS2 Match Tracker — ขั้น 13: สลับธีมมืด / สว่าง
// เก็บ preference ไว้ใน localStorage เหมือนข้อมูลอื่นของหน้านี้ (key: cs2-theme)
//
// ค่าเริ่มต้นคือธีมมืด (หน้าตาเดิมของแอป) จะเป็นสว่างก็ต่อเมื่อกดปุ่มเลือกเองเท่านั้น
// ตัวที่ตัดสินหน้าตาจริง ๆ คือ attribute data-theme บน <html> ส่วน CSS ไปดักอ่านเอง

const THEME_KEY = 'cs2-theme';
const DEFAULT_THEME = 'dark';
const themeToggle = document.getElementById('theme-toggle');

// ธีมที่ผู้ใช้เลือกไว้ — คืน null ถ้ายังไม่เคยเลือก
function loadTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch (err) {
    return null;                       // โหมดส่วนตัวบางตัวห้ามอ่าน localStorage
  }
}

// ธีมที่ "เห็นอยู่บนจอตอนนี้" จริง ๆ
function activeTheme() {
  return loadTheme() ?? DEFAULT_THEME;
}

function applyTheme(theme) {
  // ใส่ที่ <html> ไม่ใช่ <body> เพราะตัวแปรสีทั้งหมดประกาศไว้ที่ :root
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  updateThemeButton();
}

// ปุ่มบอก "ธีมที่จะเปลี่ยนไป" ไม่ใช่ธีมปัจจุบัน จะได้รู้ว่ากดแล้วได้อะไร
function updateThemeButton() {
  const goingTo = activeTheme() === 'dark' ? 'สว่าง' : 'มืด';
  themeToggle.textContent = goingTo === 'สว่าง' ? '☀ โหมดสว่าง' : '☾ โหมดมืด';
  themeToggle.title = `เปลี่ยนเป็นธีม${goingTo}`;
  themeToggle.setAttribute('aria-label', `เปลี่ยนเป็นธีม${goingTo}`);
}

themeToggle.addEventListener('click', () => {
  const next = activeTheme() === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (err) {
    console.error('จำธีมไม่ได้ (เปลี่ยนได้ แต่รีเฟรชแล้วจะกลับเป็นเดิม):', err);
  }
  applyTheme(next);
  redrawChartForTheme();
  console.log('เปลี่ยนธีมเป็น:', next);
});

// กราฟ Chart.js วาดลง <canvas> เป็นภาพ ไม่ได้รับสีจาก CSS เอง ต้องสั่งวาดใหม่เอง
// (refresh() อยู่ใน app.js ซึ่งโหลดทีหลังไฟล์นี้ ตอนกดปุ่มมันมีแล้วแน่นอน แต่กันไว้ก่อน)
function redrawChartForTheme() {
  if (typeof refresh === 'function') refresh();
}

updateThemeButton();
