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

# Coordinates corrected by hand.  All Big C branches share one cust code
# (CM01347), so the geocode behind the source files matched on the code alone
# and handed several branches the coordinate of an unrelated branch — these
# four landed in the deep south.  Keyed by shipkey(), applied to every month.
COORD_FIXES = {
    'BIG C SUPERCENTER CO LTD PATTAYA 2': (12.915305025205562, 100.89467767833683),
    'BIG C SUPERCENTER CO LTD MAHATHUN':  (13.741699438833214, 100.54903710895151),
    'BIG C SUPERCENTER CO LTD SAMRONG':   (13.650368172660121, 100.59652357045272),
    'BIG C SUPERCENTER CO LTD RAMINTRA':  (13.861051834227965, 100.61845645313313),
}

def knn_region(lat, lon, ref, k=7):
    """Region of the k nearest reference points — the files derive region from
    the coordinate, so a moved pin has to be re-derived the same way."""
    near = sorted(ref, key=lambda t: km((lat, lon), (t[0], t[1])))[:k]
    return Counter(t[2] for t in near).most_common(1)[0][0]

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
master.update(COORD_FIXES)

# ---------------------------------------------------- Jan / Mar passthrough
def month_from_monthly_file(d, key, label, short):
    rows = []
    for r in d['rows']:
        fix = COORD_FIXES.get(shipkey(r['ship']))
        lat, lon = (fix if fix else (r['lat'], r['lon']))
        rows.append({
            'chain': r['chain'], 'code': r['code'], 'ship': r['ship'],
            'value': round(r['value'], 2), 'orders': r['orders'],
            'transport': r['transport'], 'region': r['region'], 'tier': r['tier'],
            'lat': lat, 'lon': lon, 'olat': r['lat'], 'olon': r['lon'],
            'geo': 'corrected' if fix else 'source', 'check': 1 if r.get('check') else 0,
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

# June's coordinates were joined on cust code alone: 120 of its 122 cust codes
# resolve to exactly one coordinate, so every branch sharing a code got the same
# pin.  Code CM01347 covers 147 different Big C ShipTos and put all 321 of its
# invoice rows on Big C (Pattaya Marina)'s coordinate.  A code covering more than
# one ShipTo name therefore has a code-level pin, not a branch-level one.
code_ships = defaultdict(set)
for r in jrows:
    code_ships[r['code']].add(shipkey(r['ship']))
BY_CODE = {c for c, names in code_ships.items() if len(names) > 1}

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
            lat, lon = ref
            geo = 'corrected' if k in COORD_FIXES else 'snapped'
    elif olat is None:
        geo = 'none'
    elif g['codes'].most_common(1)[0][0] in BY_CODE:
        geo = 'bycode'
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
        'check': 1 if geo in ('bycode', 'none') else 0,
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
    'Coordinate ของ June ผูกกับ Cust Code ไม่ใช่สาขา (code เดียวมีหลาย ShipTo): ย้ายมาที่พิกัดสาขาจาก master ของ Jan/Mar แล้ว %d ราย, แก้มือ %d ราย, ยังเป็นพิกัดระดับ code %d ราย, ไม่มีพิกัด %d ราย' % (stats['snapped'], stats['corrected'], stats['bycode'], stats['none']),
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

# ---------------------------------------------------- coordinate hygiene
# Reference points for re-deriving a region: Jan/Mar rows the source matched
# cleanly and that do not sit on a coordinate shared with another branch.
ref_pts = []
seen_at = defaultdict(set)
for m in months[:2]:
    for r in m['rows']:
        if r['olat'] is not None:
            seen_at[(round(r['olat'], 5), round(r['olon'], 5))].add(shipkey(r['ship']))
for m in months[:2]:
    for r in m['rows']:
        if (r['geo'] == 'source' and not r['check'] and r['lat'] is not None
                and len(seen_at[(round(r['olat'], 5), round(r['olon'], 5))]) == 1):
            ref_pts.append((r['lat'], r['lon'], r['region']))

fixed_regions = {}
for m in months:
    for r in m['rows']:
        if r['geo'] == 'corrected':
            k = shipkey(r['ship'])
            if k not in fixed_regions:
                fixed_regions[k] = knn_region(r['lat'], r['lon'], ref_pts)
            r['region'] = fixed_regions[k]

# One coordinate serving several different branch names is the same geocoding
# failure the four hand-fixes came from, so flag the rest for a look.
shared = defaultdict(set)
for m in months:
    for r in m['rows']:
        if r['lat'] is not None:
            shared[(round(r['lat'], 5), round(r['lon'], 5))].add(shipkey(r['ship']))
n_shared = 0
for m in months:
    for r in m['rows']:
        if r['lat'] is None:
            continue
        if len(shared[(round(r['lat'], 5), round(r['lon'], 5))]) > 1 and r['geo'] == 'source':
            r['geo'] = 'shared'
            r['check'] = 1
            n_shared += 1

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
print('corrected by hand:', len(COORD_FIXES), 'ship names ->', fixed_regions)
print('rows on a coordinate shared with another branch:', n_shared)
print('wrote :', OUT, f'{OUT.stat().st_size/1024:.0f} KB')
