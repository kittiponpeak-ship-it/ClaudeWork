/* ============================================================
   Combined view — January + March + June 2026
   Built from the three single-month files; the app code below is
   the January/March app extended with a month dimension, June's
   invoice-level extras (daily value, actual route) and the June
   coordinate fix.
   ============================================================ */

const MONTHS  = DATA.months;
const COLORS  = DATA.colors, TCOLORS = DATA.transportColors, MCOLORS = DATA.monthColors;
const OTHER_COLOR = '#80868b';

const ROWS = [];
MONTHS.forEach(m => m.rows.forEach(r => { r.m = m.key; ROWS.push(r); }));

const ORDERS = [];
MONTHS.forEach(m => (m.orders || []).forEach(o => { o.m = m.key; o.row = m.rows[o.i]; ORDERS.push(o); }));

const DP     = DATA.dropPoints;                 // canonical drop-point labels
const MINFO  = new Map(MONTHS.map(m => [m.key, m]));
const mLabel = k => (MINFO.get(k) || {}).label || k;
const mShort = k => (MINFO.get(k) || {}).short || k;

const nf0 = new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const nf2 = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const colorOf  = c => COLORS[c] || OTHER_COLOR;
const tColorOf = m => TCOLORS[m] || OTHER_COLOR;
const mColorOf = k => MCOLORS[k] || OTHER_COLOR;
const money = v => v>=1e6 ? (v/1e6).toFixed(2)+'M' : v>=1e3 ? nf0.format(Math.round(v)) : nf0.format(v);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

/* Coordinates: r.lat/r.lon are the best-known store coordinates (June points
   moved off the transporter hub where the master data knew the store);
   r.olat/r.olon are exactly what the source file contained. */
const LAT = r => state.snap ? r.lat : r.olat;
const LON = r => state.snap ? r.lon : r.olon;
const hasGeo = r => LAT(r) != null && LON(r) != null;

const state = {q:'', minVal:0, minOrd:1, topN:0, onlyCheck:false,
  sets:{m:new Set(), chain:new Set(), transport:new Set(), region:new Set(), tier:new Set(), ship:new Set(), route:new Set()},
  size:true, heat:false, labels:false, snap:true, colorBy:'chain', sortKey:'value', sortDir:-1};

/* ---------------- dimension values ---------------- */
/* Chip counts follow the month selection, so switching month re-counts them. */
const inMonth = r => !state.sets.m.size || state.sets.m.has(r.m);
let DIM = {}, MAXROWVAL = 1, MAXORDERS = 1;

function buildDims(){
  const scope = ROWS.filter(inMonth);
  const uniq = key => {
    const m = new Map();
    scope.forEach(r => { const k = r[key] || '(none)'; const o = m.get(k) || {n:0,v:0}; o.n++; o.v += r.value; m.set(k,o); });
    return [...m.entries()].sort((a,b)=>b[1].v-a[1].v);
  };
  const routes = new Map();
  ORDERS.forEach(o => {
    if(!inMonth(o.row)) return;
    const k = o.route || '(none)';
    const e = routes.get(k) || {n:0,v:0}; e.n++; e.v += o.v; routes.set(k,e);
  });
  const ships = new Map();
  scope.forEach(r => { const o = ships.get(r.k) || {n:0,v:0}; o.n++; o.v += r.value; ships.set(r.k,o); });
  DIM = {chain:uniq('chain'), transport:uniq('transport'), region:uniq('region'), tier:uniq('tier'),
         ship:[...ships.entries()].map(([k,o])=>[String(k),o]).sort((a,b)=>b[1].v-a[1].v),
         route:[...routes.entries()].sort((a,b)=>b[1].v-a[1].v)};
  DIM.tier.sort((a,b)=>a[0].localeCompare(b[0]));
  MAXROWVAL = Math.max(1, ...scope.map(r=>r.value));
  MAXORDERS = Math.max(1, ...scope.map(r=>r.orders));
}

/* ---------------- filtering ---------------- */
function pass(r){
  if(!inMonth(r)) return false;
  if(state.q){
    const q = state.q.toLowerCase();
    const hay = (r.ship+' '+DP[r.k]+' '+r.code+' '+r.chain+' '+r.transport+' '+r.region).toLowerCase();
    if(!hay.includes(q)) return false;
  }
  if(state.onlyCheck && !r.check) return false;
  if(r.value < state.minVal) return false;
  if(r.orders < state.minOrd) return false;
  for(const k of ['chain','transport','region','tier']){
    const s = state.sets[k];
    if(s.size && !s.has(r[k] || '(none)')) return false;
  }
  if(state.sets.ship.size && !state.sets.ship.has(String(r.k))) return false;
  if(state.sets.route.size){
    if(!r.routes || !r.routes.some(x => state.sets.route.has(x || '(none)'))) return false;
  }
  return true;
}
let filtered = [], filteredSet = new Set();
function applyTopN(rows){
  if(!state.topN) return rows;
  return rows.slice().sort((a,b)=>b.value-a.value).slice(0, state.topN);
}

/* ---------------- map ---------------- */
const HAS_LEAFLET = typeof L !== 'undefined';
let map, layer, heat, baseLayers = {}, currentBase;
const BKK = [13.7563,100.5018];

if(HAS_LEAFLET){
  map = L.map('map',{zoomControl:true,preferCanvas:true}).setView([13.2,100.9],6);
  const attr = '&copy; OpenStreetMap contributors';
  baseLayers = {
    voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:attr+' &copy; CARTO',subdomains:'abcd'}),
    osm:     L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:attr}),
    light:   L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:attr+' &copy; CARTO',subdomains:'abcd'}),
    sat:     L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri'})
  };
  Object.values(baseLayers).forEach(t=>{
    t.on('tileerror',()=>{ document.getElementById('tileWarn').style.display='block'; });
    t.on('tileload', ()=>{ document.getElementById('tileWarn').style.display='none'; });
  });
  currentBase = baseLayers.voyager.addTo(map);
  layer = L.layerGroup().addTo(map);
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
}else{
  document.getElementById('map').style.display='none';
  document.getElementById('fallback').style.display='block';
}

/* group filtered rows into map points keyed by coordinate */
function points(rows){
  const m = new Map();
  for(const r of rows){
    if(!hasGeo(r)) continue;
    const lat = LAT(r), lon = LON(r);
    const k = lat.toFixed(5)+','+lon.toFixed(5);
    let p = m.get(k);
    if(!p){ p = {lat:lat, lon:lon, value:0, orders:0, n:0, check:false,
                 ships:new Map(), chains:new Map(), byMonth:new Map(),
                 modes:new Map(), regions:new Set(), codes:new Set()}; m.set(k,p); }
    p.value += r.value; p.orders += r.orders; p.n++;
    p.check = p.check || !!r.check;
    p.ships.set(r.ship,(p.ships.get(r.ship)||0)+r.value);
    p.chains.set(r.chain,(p.chains.get(r.chain)||0)+r.value);
    p.byMonth.set(r.m,(p.byMonth.get(r.m)||0)+r.value);
    if(r.transport) p.modes.set(r.transport,(p.modes.get(r.transport)||0)+r.value);
    if(r.region) p.regions.add(r.region);
    p.codes.add(r.code);
  }
  const top = mm => [...mm.entries()].sort((a,b)=>b[1]-a[1])[0][0];
  for(const p of m.values()){
    p.chain = top(p.chains);
    p.title = top(p.ships);
    p.month = top(p.byMonth);
    p.mode  = p.modes.size ? top(p.modes) : '(not specified)';
  }
  return [...m.values()].sort((a,b)=>b.value-a.value);
}

function pointColor(p){
  return state.colorBy==='month'     ? mColorOf(p.month)
       : state.colorBy==='transport' ? tColorOf(p.mode)
       : colorOf(p.chain);
}

function popupHtml(p){
  const ships = [...p.ships.entries()].sort((a,b)=>b[1]-a[1]);
  const rows = ships.slice(0,40).map(([s,v])=>`<div class="r"><span>${esc(s)}</span><b>${nf0.format(Math.round(v))}</b></div>`).join('');
  const months = MONTHS.filter(m=>p.byMonth.has(m.key)).map(m=>{
    const v = p.byMonth.get(m.key);
    return `<div class="r"><i><em style="background:${mColorOf(m.key)}"></em>${esc(m.label)}</i><b>${nf0.format(Math.round(v))}</b></div>`;
  }).join('');
  const tags = [...p.modes.keys()].map(m=>`<i style="background:${tColorOf(m)};color:#fff">${esc(m)}</i>`).join('')
    + [...p.regions].map(r=>`<i>${esc(r)}</i>`).join('');
  return `<div class="pop">
    <span class="badge" style="background:${colorOf(p.chain)}">${esc(p.chain)}</span>
    <h4>${esc(p.title)}</h4>
    <div class="addr">${ships.length>1?ships.length+' drop points at this coordinate · ':''}${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>
    ${p.check?`<div class="check">Coordinate flagged for verification — either unmatched in the source file, or a shared transporter/DC coordinate rather than the store itself.</div>`:''}
    ${tags?`<div class="tags">${tags}</div>`:''}
    <div class="grid">
      <div><b>${nf0.format(Math.round(p.value))}</b><span>Total value (THB)</span></div>
      <div><b>${nf0.format(p.orders)}</b><span>Orders</span></div>
    </div>
    <div class="mrows">${months}</div>
    <div class="rows">${rows}${ships.length>40?`<div class="r"><span>…and ${ships.length-40} more</span></div>`:''}</div>
    <a class="gm" href="https://www.google.com/maps?q=${p.lat},${p.lon}" target="_blank" rel="noopener">↗ Open in Google Maps</a>
  </div>`;
}

let markers = [];
function drawMap(pts){
  if(!HAS_LEAFLET){ drawFallback(pts); return; }
  layer.clearLayers(); markers = [];
  if(heat){ map.removeLayer(heat); heat = null; }
  const maxV = pts.length ? pts[0].value : 1;
  if(state.heat && L.heatLayer){
    heat = L.heatLayer(pts.map(p=>[p.lat,p.lon,Math.max(.12,Math.sqrt(p.value/maxV))]),
      {radius:34,blur:24,maxZoom:12,gradient:{0.2:'#4285f4',0.45:'#34a853',0.65:'#fbbc04',0.85:'#ea4335'}}).addTo(map);
  }
  pts.forEach((p,i)=>{
    const r = state.size ? 6 + 24*Math.sqrt(p.value/maxV) : 7;
    const mk = L.circleMarker([p.lat,p.lon],{radius:r,weight:p.check?2.2:1.6,opacity:.95,
      color:p.check?'#202124':'#fff', dashArray:p.check?'3 2':null,
      fillColor:pointColor(p),fillOpacity:state.heat?.55:.82}).addTo(layer);
    mk.bindPopup(popupHtml(p),{maxWidth:340});
    const mtags = [...p.byMonth.keys()].map(mShort).join(' · ');
    mk.bindTooltip(`<b>${esc(p.title)}</b><br>${money(p.value)} THB · ${p.orders} order${p.orders===1?'':'s'}<br>${esc(mtags)}`,{direction:'top',offset:[0,-4]});
    if(state.labels && i<40){
      L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'',iconSize:[0,0]}),interactive:false})
        .bindTooltip(p.title.length>26?p.title.slice(0,26)+'…':p.title,{permanent:true,direction:'right',offset:[r,0],className:'ptlabel'})
        .addTo(layer);
    }
    markers.push(mk);
  });
  document.getElementById('emptyMap').style.display = pts.length ? 'none' : 'grid';
}

function fit(pts){
  if(!pts.length) return;
  if(HAS_LEAFLET) map.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])).pad(.12),{maxZoom:14});
}

/* SVG fallback scatter when Leaflet is unavailable */
function drawFallback(pts){
  const svg = document.getElementById('fbSvg');
  const w = svg.clientWidth || 800, h = svg.clientHeight || 600;
  if(!pts.length){ svg.innerHTML=''; return; }
  const lats = pts.map(p=>p.lat), lons = pts.map(p=>p.lon);
  const la0=Math.min(...lats), la1=Math.max(...lats), lo0=Math.min(...lons), lo1=Math.max(...lons);
  const pad=40, sx=(w-2*pad)/Math.max(.0001,lo1-lo0), sy=(h-2*pad)/Math.max(.0001,la1-la0), s=Math.min(sx,sy);
  const cx=(w-(lo1-lo0)*s)/2, cy=(h-(la1-la0)*s)/2;
  const maxV=pts[0].value;
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.innerHTML = pts.map(p=>{
    const x=cx+(p.lon-lo0)*s, y=cy+(la1-p.lat)*s;
    const r=state.size ? 4+18*Math.sqrt(p.value/maxV) : 6;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${pointColor(p)}" fill-opacity=".8" stroke="#fff"/>`;
  }).join('');
}

/* ---------------- UI builders ---------------- */
function chipRow(el, dim, key){
  el.innerHTML = dim.map(([name,o])=>{
    const dot = key==='chain' ? `<i class="dot" style="background:${colorOf(name)}"></i>`
              : key==='transport' ? `<i class="dot" style="background:${tColorOf(name)}"></i>`
              : key==='m' ? `<i class="dot" style="background:${mColorOf(name)}"></i>` : '';
    const label = key==='m' ? mLabel(name) : name;
    const on = state.sets[key].has(name) ? ' on' : '';
    return `<span class="chip${on}" data-v="${esc(name)}">${dot}${esc(label)}<span class="n">${o.n}</span></span>`;
  }).join('') || '<div class="hint">No values in this month</div>';
  el.onclick = e => {
    const c = e.target.closest('.chip'); if(!c) return;
    const v = c.dataset.v, s = state.sets[key];
    s.has(v) ? s.delete(v) : s.add(v);
    c.classList.toggle('on', s.has(v));
    if(key==='m') monthChanged();
    render();
  };
}
function monthChips(){
  const m = new Map();
  MONTHS.forEach(x => m.set(x.key, {n:x.rows.length, v:x.rows.reduce((s,r)=>s+r.value,0)}));
  chipRow(document.getElementById('fM'), [...m.entries()], 'm');
}
function monthSeg(){
  const el = document.getElementById('monthSeg');
  const sel = state.sets.m;
  el.innerHTML = `<button data-v="" class="${sel.size?'':'on'}">All months</button>` +
    MONTHS.map(m=>`<button data-v="${m.key}" class="${sel.size===1&&sel.has(m.key)?'on':''}"><i style="background:${mColorOf(m.key)}"></i>${esc(m.short)}</button>`).join('');
  el.onclick = e => {
    const b = e.target.closest('button'); if(!b) return;
    state.sets.m.clear();
    if(b.dataset.v) state.sets.m.add(b.dataset.v);
    monthChanged(); render();
  };
}
/* month selection changes the chip counts, the ship list and the sliders */
function monthChanged(){
  buildDims();
  ['chain','transport','region','tier','route'].forEach(k=>{
    const valid = new Set(DIM[k].map(d=>d[0]));
    [...state.sets[k]].forEach(v=>{ if(!valid.has(v)) state.sets[k].delete(v); });
  });
  monthSeg();
  monthChips();
  chipRow(document.getElementById('fChain'), DIM.chain, 'chain');
  chipRow(document.getElementById('fTransport'), DIM.transport, 'transport');
  chipRow(document.getElementById('fRegion'), DIM.region, 'region');
  chipRow(document.getElementById('fTier'), DIM.tier, 'tier');
  chipRow(document.getElementById('fRoute'), DIM.route, 'route');
  document.getElementById('routeGroup').style.display = DIM.route.length ? 'block' : 'none';
  document.getElementById('minOrd').max = Math.max(2, Math.min(15, MAXORDERS));
  shipList(document.getElementById('shipSearch').value.trim());
}
function shipList(term=''){
  const box = document.getElementById('fShip');
  const t = term.toLowerCase();
  const items = DIM.ship.filter(([k])=>!t || DP[+k].toLowerCase().includes(t)).slice(0,300);
  box.innerHTML = items.map(([k,o])=>`<label><input type="checkbox" value="${k}" ${state.sets.ship.has(k)?'checked':''}>
    <span class="nm" title="${esc(DP[+k])}">${esc(DP[+k])}</span><span class="vl">${money(o.v)}</span></label>`).join('')
    || '<div class="more">No matching drop point</div>';
}
document.getElementById('fShip').onchange = e => {
  if(e.target.type!=='checkbox') return;
  const s = state.sets.ship;
  e.target.checked ? s.add(e.target.value) : s.delete(e.target.value);
  render();
};

function bars(el, entries, colorFn){
  const max = entries.length ? entries[0][1] : 1;
  el.innerHTML = entries.map(([k,v])=>`<div class="bar">
    <div class="top"><span>${esc(k)}</span><b>${money(v)}</b></div>
    <div class="track"><div class="fill" style="width:${(v/max*100).toFixed(1)}%;background:${colorFn(k)}"></div></div>
  </div>`).join('') || '<div class="hint">No data</div>';
}

/* Value per month — the reason the three files are in one page */
function monthBars(rows){
  const m = new Map();
  rows.forEach(r => m.set(r.m,(m.get(r.m)||0)+r.value));
  const entries = MONTHS.filter(x=>m.has(x.key)).map(x=>[x.key, m.get(x.key)]);
  const max = entries.length ? Math.max(...entries.map(e=>e[1])) : 1;
  document.getElementById('monthBars').innerHTML = entries.map(([k,v])=>`<div class="bar">
      <div class="top"><span>${esc(mLabel(k))}</span><b>${money(v)}</b></div>
      <div class="track"><div class="fill" style="width:${(v/max*100).toFixed(1)}%;background:${mColorOf(k)}"></div></div>
    </div>`).join('') || '<div class="hint">No data</div>';
  let hint = '';
  if(entries.length > 1){
    const parts = [];
    for(let i=1;i<entries.length;i++){
      const d = entries[i-1][1] ? (entries[i][1]-entries[i-1][1])/entries[i-1][1]*100 : 0;
      parts.push(`${mShort(entries[i-1][0])} → ${mShort(entries[i][0])}: ${d>=0?'+':''}${d.toFixed(1)}%`);
    }
    hint = parts.join(' · ');
  }
  document.getElementById('monthHint').textContent = hint;
}

/* Pareto: how much of the value sits in the biggest drop points */
function pareto(pts){
  const svg = document.getElementById('pareto');
  const hint = document.getElementById('paretoHint');
  if(!pts.length){ svg.innerHTML=''; hint.textContent='No data'; return; }
  const bars = pts.slice(0,30), total = pts.reduce((s,p)=>s+p.value,0);
  const max = bars[0].value, W=320, H=64, bw = W/bars.length;
  let cum = 0;
  const line = [];
  pts.forEach((p,i)=>{ cum += p.value; if(i<bars.length) line.push([i*bw+bw/2, H - (cum/total)*H]); });
  svg.innerHTML = bars.map((p,i)=>{
    const h = Math.max(1.5, p.value/max*H);
    return `<rect x="${(i*bw+bw*.12).toFixed(2)}" y="${(H-h).toFixed(2)}" width="${(bw*.76).toFixed(2)}" height="${h.toFixed(2)}"><title>${esc(p.title)} · ${money(p.value)}</title></rect>`;
  }).join('')
   + `<path class="cum" d="M${line.map(([x,y])=>x.toFixed(1)+','+y.toFixed(1)).join(' L')}"/>`
   + `<text class="axis" x="0" y="78">#1</text>`
   + `<text class="axis" x="320" y="78" text-anchor="end">#${bars.length}</text>`;
  let run = 0, half = 0;
  for(let i=0;i<pts.length;i++){ run += pts[i].value; if(run >= total*.5){ half = i+1; break; } }
  const top10 = pts.slice(0,10).reduce((s,p)=>s+p.value,0);
  hint.textContent = `Top ${half} of ${pts.length} coordinates carry 50% of the value · top 10 carry ${(top10/total*100).toFixed(1)}%. Red line = cumulative share.`;
}

/* Daily value + actual route — only exist for June (invoice-level source) */
function juneCards(){
  const rows = ORDERS.filter(o => filteredSet.has(o.row));
  const dailyCard = document.getElementById('dailyCard'), routeCard = document.getElementById('routeCard');
  if(!rows.length){ dailyCard.style.display='none'; routeCard.style.display='none'; return; }
  dailyCard.style.display='block'; routeCard.style.display='block';

  const byDay = new Map();
  rows.forEach(o => byDay.set(o.d,(byDay.get(o.d)||0)+o.v));
  const days = [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const max = Math.max(...days.map(d=>d[1])), W=320, H=62, bw = W/days.length;
  document.getElementById('daily').innerHTML = days.map(([d,v],i)=>{
    const h = Math.max(1.5, v/max*H);
    return `<rect x="${(i*bw+bw*.12).toFixed(2)}" y="${(H-h).toFixed(2)}" width="${(bw*.76).toFixed(2)}" height="${h.toFixed(2)}"><title>${d} · ${money(v)}</title></rect>`;
  }).join('')
   + `<text class="axis" x="0" y="74">${days[0][0].slice(5)}</text>`
   + `<text class="axis" x="320" y="74" text-anchor="end">${days[days.length-1][0].slice(5)}</text>`;
  const tot = days.reduce((s,d)=>s+d[1],0);
  const best = days.slice().sort((a,b)=>b[1]-a[1])[0];
  document.getElementById('dailyHint').textContent =
    `${days.length} delivery days · ${money(tot/days.length)} avg/day · busiest ${best[0]} (${money(best[1])})`;

  const byRoute = new Map();
  rows.forEach(o => { const k = o.route || '(none)'; byRoute.set(k,(byRoute.get(k)||0)+o.v); });
  bars(document.getElementById('routeBars'),
       [...byRoute.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12), ()=>'#12b5cb');
}

function topList(pts){
  const el = document.getElementById('topList');
  document.getElementById('topCount').textContent = pts.length ? `(${pts.length} coords)` : '';
  el.innerHTML = pts.slice(0,12).map((p,i)=>`<div class="rank" data-i="${i}">
      <div class="no">${i+1}</div>
      <div class="nm"><div>${esc(p.title)}</div><div>${esc(p.chain)} · ${p.orders} order${p.orders===1?'':'s'}${p.ships.size>1?` · ${p.ships.size} drop points`:''} · ${[...p.byMonth.keys()].map(mShort).join('/')}</div></div>
      <div class="vl">${money(p.value)}</div></div>`).join('') || '<div class="hint">No data</div>';
  el.onclick = e => {
    const r = e.target.closest('.rank'); if(!r) return;
    const p = pts[+r.dataset.i];
    if(HAS_LEAFLET){ map.flyTo([p.lat,p.lon],14,{duration:.7}); const mk=markers[+r.dataset.i]; if(mk) setTimeout(()=>mk.openPopup(),750); }
  };
}

function legend(pts){
  const m = new Map();
  let title = 'Retail group', colorFn = colorOf;
  if(state.colorBy==='month'){
    title = 'Month'; colorFn = mColorOf;
    pts.forEach(p=>p.byMonth.forEach((v,k)=>m.set(k,(m.get(k)||0)+v)));
  }else if(state.colorBy==='transport'){
    title = 'Transport mode'; colorFn = tColorOf;
    pts.forEach(p=>p.modes.forEach((v,k)=>m.set(k,(m.get(k)||0)+v)));
  }else{
    pts.forEach(p=>p.chains.forEach((v,k)=>m.set(k,(m.get(k)||0)+v)));
  }
  const items = [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  document.getElementById('legend').innerHTML =
    `<h3>${title}</h3>` +
    items.map(([k,v])=>`<div class="it"><i style="background:${colorFn(k)}"></i>${esc(state.colorBy==='month'?mLabel(k):k)} <span style="margin-left:auto;color:#5f6368">${money(v)}</span></div>`).join('') +
    (state.size?`<div class="scale">Circle size = total value at that coordinate</div>`:'') +
    `<div class="scale">Dashed outline = coordinate to verify</div>`;
}

/* ---------------- table ---------------- */
function table(rows){
  const s = rows.slice().sort((a,b)=>{
    const k = state.sortKey, d = state.sortDir;
    const av = k==='avg' ? (a.orders?a.value/a.orders:0) : a[k];
    const bv = k==='avg' ? (b.orders?b.value/b.orders:0) : b[k];
    if(typeof av==='number' && typeof bv==='number') return (av-bv)*d;
    return String(av==null?'':av).localeCompare(String(bv==null?'':bv))*d;
  });
  const show = s.slice(0,600);
  document.querySelector('#tbl tbody').innerHTML = show.map(r=>{
    const lat = LAT(r), lon = LON(r);
    const geo = lat==null ? '<span class="nogeo">no coordinate</span>'
      : `<span style="color:#5f6368;font-size:11px">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>`;
    return `<tr>
    <td class="nw"><span class="tag month" style="background:${mColorOf(r.m)}">${esc(mShort(r.m))}</span></td>
    <td>${esc(r.code)}</td>
    <td>${esc(r.ship)}${r.geo==='shared'?' <span class="tag warn">shared coord</span>':r.check?' <span class="tag warn">verify coord</span>':''}${r.geo==='corrected'?' <span class="tag grey">coord corrected</span>':r.geo==='snapped'&&state.snap?' <span class="tag grey">coord fixed</span>':''}<br>${geo}</td>
    <td><span class="tag" style="background:${colorOf(r.chain)}">${esc(r.chain)}</span></td>
    <td><span class="tag" style="background:${tColorOf(r.transport)}">${esc(r.transport)}</span></td>
    <td class="nw">${esc(r.region)}</td>
    <td class="nw">${esc(r.tier)}</td>
    <td class="num">${nf0.format(r.orders)}</td>
    <td class="num">${nf2.format(r.value)}</td>
    <td class="num">${nf2.format(r.orders?r.value/r.orders:0)}</td></tr>`;
  }).join('');
  document.getElementById('tblMore').textContent = s.length>600 ? `Showing 600 of ${nf0.format(s.length)} rows — narrow the filters to see the rest` : `${nf0.format(s.length)} rows`;
}
document.querySelector('#tbl thead').onclick = e => {
  const th = e.target.closest('th'); if(!th) return;
  const k = th.dataset.k;
  state.sortDir = state.sortKey===k ? -state.sortDir : ((k==='value'||k==='orders'||k==='avg')?-1:1);
  state.sortKey = k; table(filtered);
};

/* ---------------- render ---------------- */
function render(){
  filtered = applyTopN(ROWS.filter(pass));
  filteredSet = new Set(filtered);
  const pts = points(filtered);
  const total = filtered.reduce((s,r)=>s+r.value,0);
  const orders = filtered.reduce((s,r)=>s+r.orders,0);
  document.getElementById('kValue').textContent = money(total);
  document.getElementById('kShip').textContent = nf0.format(new Set(filtered.map(r=>r.k)).size);
  document.getElementById('kOrders').textContent = nf0.format(orders);
  document.getElementById('kCust').textContent = nf0.format(new Set(filtered.map(r=>r.code)).size);
  document.getElementById('kAvg').textContent = orders ? money(total/orders) : '0';

  drawMap(pts); legend(pts); topList(pts); pareto(pts); table(filtered);
  monthBars(filtered); juneCards();

  const agg = key => {
    const m = new Map();
    filtered.forEach(r=>m.set(r[key]||'(none)',(m.get(r[key]||'(none)')||0)+r.value));
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
  };
  bars(document.getElementById('transportBars'), agg('transport'), tColorOf);
  bars(document.getElementById('chainBars'), agg('chain'), colorOf);
  bars(document.getElementById('regionBars'), agg('region'), ()=> '#1a73e8');

  const geoCount = g => filtered.filter(r=>r.geo===g).length;
  const checks  = filtered.filter(r=>r.check).length;
  const snapped = geoCount('snapped'), sharedN = geoCount('shared');
  const hubN    = geoCount('hub'),     fixedN  = geoCount('corrected');
  const nogeo   = filtered.filter(r=>!hasGeo(r)).length;
  const mUsed   = MONTHS.filter(m=>filtered.some(r=>r.m===m.key)).map(m=>m.label).join(' + ') || '—';
  document.getElementById('coordNote').innerHTML =
    `${nf0.format(new Set(filtered.map(r=>r.k)).size)} drop points · ${nf0.format(filtered.length)} month rows · ${pts.length} distinct coordinates · ${esc(mUsed)}` +
    (checks?` · <b>${checks}</b> flagged to verify`:'') +
    (nogeo?` · <b>${nogeo}</b> without a coordinate (not on the map)`:'') +
    `<br>A drop point that appears in several months is one marker; its value is the sum of those months.` +
    `<br>Value = Ambient + Temp Controlled turnover per ShipTo. Orders = distinct order numbers.` +
    `<br><b>Coordinates:</b> ` + [
      fixedN  ? `<b>${fixedN}</b> corrected by hand` : '',
      sharedN ? `<b>${sharedN}</b> sharing a pin with another branch — the source geocode matched on cust code, so branches of the same chain can land on each other's coordinates` : '',
      state.snap && snapped ? `<b>${snapped}</b> June row(s) moved off the transporter hub onto the store coordinate` : '',
      hubN ? `<b>${hubN}</b> still on a transporter hub` : ''
    ].filter(Boolean).join(' · ') +
    (state.snap ? `<br>Turn off “Fix June coordinates” to see the June file exactly as it was.` : '') +
    `<br>Note: some coordinates are genuinely DC / head-office locations, so several drop points stack on one marker.`;
}

/* ---------------- events ---------------- */
const debounce = (f,ms=180)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
document.getElementById('q').oninput = debounce(e=>{state.q=e.target.value.trim();render()});
document.getElementById('shipSearch').oninput = debounce(e=>shipList(e.target.value.trim()));
document.getElementById('minVal').oninput = e=>{
  const pct = +e.target.value/100;
  state.minVal = Math.round(Math.pow(pct,3)*MAXROWVAL/100)*100;
  document.getElementById('minValLbl').textContent = nf0.format(state.minVal);
  render();
};
document.getElementById('minOrd').oninput = e=>{
  state.minOrd = +e.target.value;
  document.getElementById('minOrdLbl').textContent = state.minOrd+'+';
  render();
};
document.getElementById('topN').onclick = e=>{
  const b = e.target.closest('button'); if(!b) return;
  state.topN = +b.dataset.v;
  document.querySelectorAll('#topN button').forEach(x=>x.classList.toggle('on', x===b));
  render(); fit(points(filtered));
};
document.getElementById('colorBy').onclick = e=>{
  const b = e.target.closest('button'); if(!b) return;
  state.colorBy = b.dataset.v;
  document.querySelectorAll('#colorBy button').forEach(x=>x.classList.toggle('on', x===b));
  render();
};
document.getElementById('sizeMode').onclick = e=>{
  const b = e.target.closest('button'); if(!b) return;
  state.size = b.dataset.v === 'value';
  document.querySelectorAll('#sizeMode button').forEach(x=>x.classList.toggle('on', x===b));
  render();
};
document.getElementById('optHeat').onchange  = e=>{state.heat=e.target.checked;render()};
document.getElementById('optLabel').onchange = e=>{state.labels=e.target.checked;render()};
document.getElementById('optCheck').onchange = e=>{state.onlyCheck=e.target.checked;render();fit(points(filtered))};
document.getElementById('optSnap').onchange  = e=>{state.snap=e.target.checked;render();fit(points(filtered))};
document.querySelectorAll('[data-clear]').forEach(a=>a.onclick=()=>{
  const k = a.dataset.clear;
  state.sets[k].clear();
  if(k==='ship') shipList(document.getElementById('shipSearch').value.trim());
  else if(k==='m'){ monthChanged(); }
  else document.querySelectorAll('#f'+k.replace(/^./,c=>c.toUpperCase())+' .chip').forEach(c=>c.classList.remove('on'));
  render();
});
document.getElementById('btnReset').onclick = ()=>{
  state.q=''; state.minVal=0; state.minOrd=1; state.topN=0; state.onlyCheck=false;
  Object.values(state.sets).forEach(s=>s.clear());
  document.getElementById('q').value=''; document.getElementById('shipSearch').value='';
  document.getElementById('minVal').value=0; document.getElementById('minValLbl').textContent='0';
  document.getElementById('minOrd').value=1; document.getElementById('minOrdLbl').textContent='1+';
  document.getElementById('optCheck').checked=false;
  document.querySelectorAll('#topN button').forEach((x,i)=>x.classList.toggle('on', i===0));
  monthChanged(); render(); fit(points(filtered));
};
document.getElementById('btnCsv').onclick = ()=>{
  const head = ['Month','RetailGroup','CustCode','ShipTo','Value','Orders','ValuePerOrder','Transport','Region','Tier',
                'Latitude','Longitude','CoordinateSource','SourceLatitude','SourceLongitude','VerifyCoordinate','Routes','GoogleMaps'];
  const q = v => `"${String(v==null?'':v).replace(/"/g,'""')}"`;
  const csv = '﻿' + [head.join(',')].concat(filtered.map(r=>[mLabel(r.m),r.chain,r.code,r.ship,r.value,r.orders,
      (r.orders?r.value/r.orders:0).toFixed(2),r.transport,r.region,r.tier,LAT(r),LON(r),r.geo,r.olat,r.olon,
      r.check?'YES':'',(r.routes||[]).join(' / '),
      hasGeo(r)?`https://www.google.com/maps?q=${LAT(r)},${LON(r)}`:''].map(q).join(','))).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const tag = state.sets.m.size ? [...state.sets.m].join('_') : 'Jan_Mar_Jun_2026';
  a.download = 'retail_map_'+tag+'_filtered.csv'; a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('btnFit').onclick = ()=>fit(points(filtered));
document.getElementById('btnBkk').onclick = ()=>{ if(HAS_LEAFLET) map.flyTo(BKK,11,{duration:.8}); };
document.getElementById('baseSel').onchange = e=>{
  if(!HAS_LEAFLET) return;
  map.removeLayer(currentBase); currentBase = baseLayers[e.target.value].addTo(map);
};
document.getElementById('tabMap').onclick = ()=>switchView('map');
document.getElementById('tabTable').onclick = ()=>switchView('table');
function switchView(v){
  const t = v==='table';
  document.getElementById('tableView').style.display = t?'block':'none';
  document.getElementById('legend').style.display = t?'none':'block';
  document.querySelector('.maptools').style.display = t?'none':'flex';
  if(t) document.getElementById('emptyMap').style.display='none';
  document.getElementById('tabTable').classList.toggle('on',t);
  document.getElementById('tabMap').classList.toggle('on',!t);
  if(!t && HAS_LEAFLET) setTimeout(()=>map.invalidateSize(),60);
}
window.addEventListener('resize', debounce(()=>{ if(!HAS_LEAFLET) drawFallback(points(filtered)); },200));

/* ---------------- init ---------------- */
document.getElementById('srcline').textContent =
  MONTHS.map(m=>`${m.short}: ${nf0.format(m.rows.length)} drop points`).join(' · ') + ` · ${nf0.format(ROWS.length)} rows total`;
monthChanged();
render();
fit(points(filtered));
