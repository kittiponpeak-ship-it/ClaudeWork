#!/usr/bin/env python3
"""
Merge the three single-month retail mapping pages into one file.

Usage:  python3 build_combined_map.py <dir-with-the-three-source-pages> [output.html]

Inputs  the three exported HTML pages, each with its own `const DATA = {...}`
Output  a single self-contained page with a month dimension.

The January and March pages already share the same app and the same row shape
(one row per ShipTo).  The June page is invoice-level and uses different
spellings for retail groups / regions and different coordinates, so it is
normalised and aggregated to the same shape here; its invoice rows are kept
alongside for the daily-value and route views.
"""

import json, re, sys, math, unicodedata
from collections import defaultdict, Counter
from pathlib import Path
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent          # app.js / body.html / extra.css live next to this file
SRC  = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'source'
OUT  = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('retail_customer_map_2026_combined.html')

JAN = SRC / 'ed570a3f-January_2026_Customer_Map_1.html'
MAR = SRC / 'bcdda6bd-March_2026_Customer_Map_1.html'
JUN = SRC / '2759040e-RetailMapJuneCCS.html'

# ----------------------------------------------------------------- helpers
def read_data(path):
    """Pull the `const DATA = {...};` payload out of one exported page."""
    text = path.read_text(encoding='utf-8')
    i = text.index('const DATA = ')
    j = text.index('\n', i)
    return json.loads(text[i + len('const DATA = '):j].rstrip().rstrip(';')), text

def shipkey(name):
    """Loose key for matching the same ShipTo across files."""
    s = str(name).upper()
    s = s.replace('CO.,LTD', 'CO LTD').replace('CO., LTD', 'CO LTD').replace('PUBLIC CO', 'CO')
    s = s.replace('BIC C SUPERCENTER', 'BIG C SUPERCENTER')      # typo in the June file
    s = re.sub(r'[^A-Z0-9฀-๿]+', ' ', s)
    return ' '.join(s.split())

def km(a, b):
    return math.hypot((a[0] - b[0]) * 111.0,
                      (a[1] - b[1]) * 111.0 * math.cos(math.radians(a[0])))

def tier_of(v):
    if v >= 100000: return 'A · 100K+'
    if v >=  30000: return 'B · 30K–100K'
    if v >=  10000: return 'C · 10K–30K'
    return 'D · under 10K'

# June spells several things differently from Jan/Mar.
CHAIN_MAP = {
    'Tops / CFR': 'Tops / Central',
    'Tantrapan':  'Rimping (Tantrapan)',
    'Lemon Farm': 'Lemon Farm (Health Society)',
}
REGION_MAP = {
    'South': 'Southern', 'North': 'Northern', 'Northeast': 'Northeastern',
    'East': 'Eastern', 'West': 'Western', 'Unknown': '(unknown)',
}
TRANSPORT_MAP = {'CCS Own Truck': 'Own Truck', 'The Rest': '(not specified)'}

CHAIN_COLORS = {                       # January's palette, plus the June-only groups
    'Tops / Central': '#EA4335', 'Big C': '#4285F4', "Lotus's": '#34A853',
    'Makro': '#FBBC04', 'The Mall Group': '#A142F4', 'Villa Market': '#FF6D00',
    'Foodland': '#24C1E0', 'Rimping (Tantrapan)': '#F439A0', 'Asia Books': '#0F9D58',
    'UFM Fuji Super': '#795548', 'Lemon Farm (Health Society)': '#7CB342',
    'City Mall (EM)': '#00897B', 'Home Fresh Mart': '#8D6E63',
}
TRANSPORT_COLORS = {
    'Own Truck': '#34A853', 'Transporter': '#4285F4',
    'Own Truck + Transporter': '#FBBC04', '(not specified)': '#9AA0A6',
}
MONTH_COLORS = {'2026-01': '#1A73E8', '2026-03': '#12B5CB', '2026-06': '#E8710A'}

jan, jan_html = read_data(JAN)
mar, _        = read_data(MAR)
jun, _        = read_data(JUN)

# ---------------------------------------------------- master coordinates
# Jan/Mar hold per-store coordinates matched from the customer master file;
# they are the reference the June points are corrected against.
master = {}
for src in (mar, jan):                       # March first, January fills the gaps
    for r in src['rows']:
        if r.get('check'):                   # flagged rows are approximations
            continue
        k = shipkey(r['ship'])
        if k not in master and r.get('lat') is not None:
            master[k] = (r['lat'], r['lon'])

# ---------------------------------------------------- Jan / Mar passthrough
def month_from_monthly_file(d, key, label, short):
    rows = []
    for r in d['rows']:
        rows.append({
            'chain': r['chain'], 'code': r['code'], 'ship': r['ship'],
            'value': round(r['value'], 2), 'orders': r['orders'],
            'transport': r['transport'], 'region': r['region'], 'tier': r['tier'],
            'lat': r['lat'], 'lon': r['lon'], 'olat': r['lat'], 'olon': r['lon'],
            'geo': 'source', 'check': 1 if r.get('check') else 0,
        })
    return {'key': key, 'label': label, 'short': short, 'source': d['source'],
            'monthValue': round(sum(r['value'] for r in rows), 2),
            'notes': d.get('notes', []), 'rows': rows}

months = [
    month_from_monthly_file(jan, '2026-01', 'January 2026', 'Jan'),
    month_from_monthly_file(mar, '2026-03', 'March 2026',  'Mar'),
]

# ---------------------------------------------------- June: invoice -> ShipTo
jrows = jun['rows']

# Coordinates the June file reuses for many different ShipTos are hubs
# (the transporter's depot), not stores.
by_coord = defaultdict(set)
for r in jrows:
    if r.get('lat') is not None:
        by_coord[(round(r['lat'], 5), round(r['lon'], 5))].add(shipkey(r['ship']))
HUBS = {c for c, names in by_coord.items() if len(names) >= 5}

groups = {}
for idx, r in enumerate(jrows):
    k = shipkey(r['ship'])
    g = groups.get(k)
    if g is None:
        g = groups[k] = {'ship': r['ship'], 'codes': Counter(), 'chains': Counter(),
                         'regions': Counter(), 'modes': set(), 'routes': set(),
                         'orders': set(), 'value': 0.0, 'coords': Counter(),
                         'src': [], 'cancelled': 0.0}
        g['order_ix'] = []
    g['codes'][r['code']] += 1
    g['chains'][CHAIN_MAP.get(r['chain'], r['chain'])] += r['value']
    g['regions'][REGION_MAP.get(r['region'], r['region'])] += 1
    g['modes'].add(TRANSPORT_MAP.get(r['transport'], r['transport']))
    if r.get('route'): g['routes'].add(str(r['route']))
    g['orders'].add(r['order'])
    g['value'] += r['value']
    if r.get('lat') is not None:
        g['coords'][(r['lat'], r['lon'])] += 1
    if r.get('status') and r['status'] != 'Normal':
        g['cancelled'] += r['value']
    g['order_ix'].append(idx)

jun_rows, jun_orders = [], []
stats = Counter()
for k, g in sorted(groups.items(), key=lambda kv: -kv[1]['value']):
    modes = g['modes']
    transport = ('Own Truck + Transporter' if {'Own Truck', 'Transporter'} <= modes
                 else (next(iter(modes)) if len(modes) == 1 else '(not specified)'))
    olat = olon = None
    if g['coords']:
        olat, olon = g['coords'].most_common(1)[0][0]
    lat, lon, geo = olat, olon, 'source'
    ref = master.get(k)
    if ref:
        if olat is None or km(ref, (olat, olon)) > 0.1:
            lat, lon, geo = ref[0], ref[1], 'snapped'
    elif olat is None:
        geo = 'none'
    elif (round(olat, 5), round(olon, 5)) in HUBS:
        geo = 'hub'
    stats[geo] += 1

    value = round(g['value'], 2)
    row = {
        'chain': g['chains'].most_common(1)[0][0],
        'code': g['codes'].most_common(1)[0][0],
        'ship': g['ship'], 'value': value, 'orders': len(g['orders']),
        'transport': transport,
        'region': g['regions'].most_common(1)[0][0],
        'tier': tier_of(value),
        'lat': lat, 'lon': lon, 'olat': olat, 'olon': olon, 'geo': geo,
        'check': 1 if geo in ('hub', 'none') else 0,
        'routes': sorted(g['routes']),
    }
    i = len(jun_rows)
    jun_rows.append(row)
    for ix in g['order_ix']:
        o = jrows[ix]
        jun_orders.append({'i': i, 'd': o['date'], 'v': round(o['value'], 2),
                           'route': str(o.get('route') or '')})

jun_notes = [
    'ที่มา: %s (invoice level, 1 แถว = 1 ใบกำกับ)' % jun['source'],
    'รวมเป็นราย ShipTo เหมือน Jan/Mar: %d ใบกำกับ → %d drop points' % (len(jrows), len(jun_rows)),
    'Coordinate ของ June ถูก geocode ไปที่ hub ของ transporter: ย้ายกลับมาที่พิกัดสาขาแล้ว %d ราย, ยังค้างอยู่ที่ hub %d ราย, ไม่มีพิกัด %d ราย' % (stats['snapped'], stats['hub'], stats['none']),
    'Order = จำนวน Order No ไม่ซ้ำกัน (%d จาก %d ใบกำกับ)' % (len({r['order'] for r in jrows}), len(jrows)),
    'Tier คำนวณใหม่จากยอดรวมต่อ ShipTo ด้วยเกณฑ์เดียวกับ Jan/Mar (A 100K+, B 30–100K, C 10–30K, D <10K)',
]
if jun.get('droppedPostponed'):
    jun_notes.append('ตัดออกก่อนสร้างไฟล์ (เลื่อน/CXL): %d ใบ มูลค่า %s บาท' % (jun['droppedPostponed'], f"{jun['droppedValue']:,.2f}"))
cxl = sum(r['value'] for r in jrows if r.get('status') and r['status'] != 'Normal')
if cxl:
    jun_notes.append('ยังมีใบสถานะ Cancelled ค้างอยู่ในยอด: %s บาท' % f'{cxl:,.2f}')

months.append({'key': '2026-06', 'label': 'June 2026', 'short': 'Jun',
               'source': jun['source'],
               'monthValue': round(sum(r['value'] for r in jun_rows), 2),
               'notes': jun_notes, 'rows': jun_rows, 'orders': jun_orders})

# ---------------------------------------------------- canonical drop points
# The same store is spelled slightly differently between the monthly files and
# the June route file, so every row also carries an id into one shared list.
labels = {}
for m in months:                                   # Jan/Mar spelling wins the label
    for r in m['rows']:
        labels.setdefault(shipkey(r['ship']), r['ship'])
dp_names = sorted(labels)
dp_index = {k: i for i, k in enumerate(dp_names)}
dp_labels = [labels[k] for k in dp_names]
for m in months:
    for r in m['rows']:
        r['k'] = dp_index[shipkey(r['ship'])]

# ---------------------------------------------------- assemble the page
data = {
    'months': months,
    'dropPoints': dp_labels,
    'colors': CHAIN_COLORS,
    'transportColors': TRANSPORT_COLORS,
    'monthColors': MONTH_COLORS,
    'generated': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    'sources': [m['source'] for m in months],
}

head = jan_html[:jan_html.index('<body>')]
head = head.replace('<title>Retail Customer Mapping — January 2026</title>',
                    '<title>Retail Customer Mapping — Jan / Mar / Jun 2026</title>')
extra_css = (HERE / 'extra.css').read_text(encoding='utf-8')
head = head.replace('</head>', '<style>\n' + extra_css + '</style>\n</head>')

# the inlined Leaflet + simpleheat + Leaflet.heat block, taken from the January page
lib_start = jan_html.index('<script>/* @preserve')
lib_end   = jan_html.index('</script>', jan_html.index('L.heatLayer=function')) + len('</script>')
libs = jan_html[lib_start:lib_end]

body = (HERE / 'body.html').read_text(encoding='utf-8')
app  = (HERE / 'app.js').read_text(encoding='utf-8')
tail = '''<style>.ptlabel{background:rgba(255,255,255,.9);border:0;box-shadow:0 1px 3px rgba(0,0,0,.25);font-size:11px;font-weight:500;padding:1px 5px;border-radius:4px}
.ptlabel:before{display:none}</style>
</body>
</html>
'''

payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
html = (head + body + '\n' + libs + '\n<script>\nconst DATA = ' + payload + ';\n' + app + '</script>\n' + tail)
OUT.write_text(html, encoding='utf-8')

print('drop points (distinct across months):', len(dp_labels))
print('rows  :', {m['short']: len(m['rows']) for m in months})
print('value :', {m['short']: m['monthValue'] for m in months})
print('june geo:', dict(stats))
print('wrote :', OUT, f'{OUT.stat().st_size/1024:.0f} KB')
