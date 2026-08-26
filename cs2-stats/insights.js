// CS2 Match Tracker — ขั้น 8, 9, 11: อ่านข้อมูลที่มีอยู่แล้วมาสรุปเป็นข้อสังเกต
//   ขั้น 8  เทรนด์ฟอร์ม: 5 แมตช์ล่าสุด เทียบ 5 แมตช์ก่อนหน้า
//   ขั้น 9  map ถนัด / map ที่ต้องซ้อม (จาก win rate รายแมพ)
//   ขั้น 11 สตรีค: ชนะ/แพ้ติดกันกี่แมตช์
//
// ไฟล์นี้ไม่แตะ localStorage เลย รับ array แมตช์เข้ามาแล้วคืน DOM ออกไปอย่างเดียว
// (app.js เป็นคนอ่านข้อมูลแล้วเรียกฟังก์ชันในนี้ตอน render)

const TREND_WINDOW = 5;        // ขนาดกลุ่มที่เอามาเทียบกัน (ล่าสุด 5 vs ก่อนหน้า 5)
const MIN_PREVIOUS = 2;        // กลุ่มก่อนหน้าต้องมีอย่างน้อยเท่านี้ ไม่งั้นเทียบแล้วไม่มีความหมาย
const MIN_MAP_MATCHES = 3;     // map ที่เล่นน้อยกว่านี้ ยังไม่เอามาตัดสินว่าถนัด/ไม่ถนัด (กันสรุปมั่ว)

const trendEl = document.getElementById('trend');
const mapBoardsEl = document.getElementById('map-boards');
const mapBoardsNoteEl = document.getElementById('map-boards-note');

// ค่าที่เอามาเทียบเทรนด์ — ทั้งสามตัวนี้ "มากขึ้น = ดีขึ้น" เหมือนกันหมด
const TREND_METRICS = [
  { key: 'adr', label: 'ADR', digits: 1, pick: (match) => Number(match.adr) },
  { key: 'kd', label: 'K/D', digits: 2, pick: (match) => Number(match.kd) },
  { key: 'hs', label: 'HS%', digits: 1, pick: (match) => Number(match.hs) },
];

// --- ขั้น 8: เทรนด์ฟอร์ม -------------------------------------------------------

// แบ่งเป็น 2 กลุ่มแล้วเทียบค่าเฉลี่ยทีละตัว — คืน null ถ้าข้อมูลยังน้อยเกินไป
function computeTrend(matches) {
  const sorted = [...matches].sort(byNewestFirst);       // ใหม่ -> เก่า
  const recent = sorted.slice(0, TREND_WINDOW);          // 5 แมตช์ล่าสุด
  const previous = sorted.slice(TREND_WINDOW, TREND_WINDOW * 2);  // 5 แมตช์ก่อนหน้านั้น

  if (previous.length < MIN_PREVIOUS) return null;

  return {
    recentCount: recent.length,
    previousCount: previous.length,
    rows: TREND_METRICS.map((metric) => {
      const now = mean(recent, metric.pick);
      const before = mean(previous, metric.pick);
      return { ...metric, now, before, diff: now - before };
    }),
  };
}

function renderTrend(matches) {
  trendEl.replaceChildren();

  if (matches.length === 0) return;                      // ส่วนสรุปด้านบนบอกไปแล้วว่าไม่มีข้อมูล

  const trend = computeTrend(matches);
  if (!trend) {
    const need = TREND_WINDOW + MIN_PREVIOUS - matches.length;
    trendEl.appendChild(muted(`อีก ${need} แมตช์จะเริ่มเทียบฟอร์มให้ (ต้องมี ${TREND_WINDOW + MIN_PREVIOUS} แมตช์ขึ้นไป)`));
    return;
  }

  const caption = muted(`ฟอร์ม ${trend.recentCount} แมตช์ล่าสุด เทียบ ${trend.previousCount} แมตช์ก่อนหน้า`);
  caption.className = 'muted trend-caption';

  const row = document.createElement('div');
  row.className = 'trend-row';
  trend.rows.forEach((item) => row.appendChild(trendChip(item)));

  trendEl.append(caption, row);
}

// ชิปหนึ่งใบ = ค่าหนึ่งตัว เช่น  ADR ▲ +6.2  (86.4 → 92.6)
function trendChip({ label, digits, now, before, diff }) {
  // ปัดตามจำนวนทศนิยมที่จะโชว์ก่อน แล้วค่อยตัดสินว่าขึ้น/ลง
  // ไม่งั้นส่วนต่าง 0.04 จะขึ้นลูกศรเขียวทั้งที่หน้าจอโชว์ +0.0 เท่ากัน
  const shown = Number(diff.toFixed(digits));
  const direction = shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat';
  const arrow = { up: '▲', down: '▼', flat: '▬' }[direction];
  const sign = shown > 0 ? '+' : '';                     // ค่าติดลบมีเครื่องหมายมาเองอยู่แล้ว

  const chip = document.createElement('div');
  chip.className = `trend-chip is-${direction}`;

  const head = document.createElement('p');
  head.className = 'trend-chip-head';
  head.textContent = label;

  const value = document.createElement('p');
  value.className = 'trend-chip-value';
  value.textContent = direction === 'flat'
    ? `${arrow} เท่าเดิม`
    : `${arrow} ${sign}${shown.toFixed(digits)}`;

  const sub = document.createElement('p');
  sub.className = 'trend-chip-sub';
  sub.textContent = `${before.toFixed(digits)} → ${now.toFixed(digits)}`;

  chip.append(head, value, sub);
  return chip;
}

// --- ขั้น 9: map ถนัด / map ที่ต้องซ้อม ---------------------------------------

// จับกลุ่มตาม map ด้วย object (key = ชื่อ map) แล้วคืนออกมาเป็น array พร้อมค่าเฉลี่ย
function computeMapStats(matches) {
  const byMap = {};

  matches.forEach((match) => {
    if (!byMap[match.map]) {
      byMap[match.map] = { map: match.map, played: 0, wins: 0, losses: 0, adrSum: 0, kdSum: 0 };
    }
    const row = byMap[match.map];
    row.played += 1;
    if (match.result === 'win') row.wins += 1;
    if (match.result === 'loss') row.losses += 1;
    row.adrSum += Number(match.adr);
    row.kdSum += Number(match.kd);
  });

  // Object.values แปลง object กลับเป็น array เพื่อให้ sort/filter ได้
  return Object.values(byMap).map((row) => ({
    ...row,
    winRate: (row.wins / row.played) * 100,
    adr: row.adrSum / row.played,
    kd: row.kdSum / row.played,
  }));
}

function renderMapBoards(matches) {
  mapBoardsEl.replaceChildren();
  mapBoardsNoteEl.hidden = true;

  if (matches.length === 0) {
    mapBoardsEl.appendChild(muted('ยังไม่มีข้อมูล — เล่นแมพไหนครบ 3 แมตช์ แมพนั้นจะเริ่มถูกนำมาเทียบ'));
    return;
  }

  const all = computeMapStats(matches);
  const ranked = all
    .filter((row) => row.played >= MIN_MAP_MATCHES)
    // win rate สูงสุดอยู่หน้า ถ้าเท่ากันใช้ ADR ตัดสิน
    .sort((a, b) => b.winRate - a.winRate || b.adr - a.adr);

  // map ที่ยังเล่นไม่ครบเกณฑ์ บอกไว้ด้วยว่าเหลืออีกกี่แมตช์ จะได้ไม่งงว่าทำไมไม่ขึ้น
  const waiting = all
    .filter((row) => row.played < MIN_MAP_MATCHES)
    .sort((a, b) => b.played - a.played)
    .map((row) => `${row.map} (${row.played}/${MIN_MAP_MATCHES})`);

  if (ranked.length < 2) {
    const reason = ranked.length === 0
      ? `ยังไม่มี map ไหนเล่นครบ ${MIN_MAP_MATCHES} แมตช์`
      : `ตอนนี้มี ${ranked[0].map} แมพเดียวที่ครบ ${MIN_MAP_MATCHES} แมตช์ — ต้องมีอย่างน้อย 2 แมพถึงจะเทียบกันได้`;
    mapBoardsEl.appendChild(muted(reason));
  } else {
    mapBoardsEl.append(
      mapBoard('best', 'Map ถนัด', ranked[0]),
      mapBoard('worst', 'Map ที่ต้องซ้อม', ranked[ranked.length - 1]),
    );
  }

  if (waiting.length > 0) {
    mapBoardsNoteEl.textContent = `ยังไม่นับ: ${waiting.join(' · ')}`;
    mapBoardsNoteEl.hidden = false;
  }
}

function mapBoard(kind, title, row) {
  const box = document.createElement('div');
  box.className = `board board--${kind}`;

  const titleEl = document.createElement('p');
  titleEl.className = 'board-title';
  titleEl.textContent = title;

  const nameEl = document.createElement('p');
  nameEl.className = 'board-map';
  nameEl.textContent = row.map;

  const rateEl = document.createElement('p');
  rateEl.className = 'board-rate';
  rateEl.textContent = `win rate ${row.winRate.toFixed(0)}%`;

  const subEl = document.createElement('p');
  subEl.className = 'board-sub';
  subEl.textContent = `ชนะ ${row.wins} จาก ${row.played} · ADR ${row.adr.toFixed(1)} · K/D ${row.kd.toFixed(2)}`;

  box.append(titleEl, nameEl, rateEl, subEl);
  return box;
}

// --- ขั้น 11: สตรีค -------------------------------------------------------------

// ไล่จากแมตช์ล่าสุดย้อนกลับไป นับว่าผลเหมือนกันติดกันกี่แมตช์ เจอผลต่างเมื่อไหร่หยุดทันที
function computeStreak(matches) {
  const sorted = [...matches].sort(byNewestFirst);
  if (sorted.length === 0) return null;

  const result = sorted[0].result;
  let count = 0;
  for (const match of sorted) {
    if (match.result !== result) break;
    count += 1;
  }

  return { result, count, from: sorted[count - 1].date };   // from = แมตช์แรกของสตรีค
}

// --- ตัวช่วยเล็ก ๆ -------------------------------------------------------------

function mean(list, pick) {
  return list.reduce((sum, item) => sum + pick(item), 0) / list.length;
}
