#!/usr/bin/env python3
"""สร้างแผนที่ลูกค้าแบบ interactive (สไตล์ Google Maps) จากไฟล์ Excel รายเดือน

ใช้งาน:
    python3 tools/build_customer_maps.py

อ่านไฟล์ใน data/*.xlsx (ชีต "Customers with Coordinates", "No Match", "Notes")
แล้วเขียนไฟล์ HTML แบบไฟล์เดียวจบลงใน maps/ เดือนละ 1 ไฟล์
"""

import json
import re
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "tools" / "map_template.html"
OUT_DIR = ROOT / "maps"
VENDOR = ROOT / "tools" / "vendor"

SOURCES = [
    {
        "xlsx": ROOT / "data" / "January_2026_Customers_with_Coordinates.xlsx",
        "slug": "January_2026",
        "title": "แผนที่ลูกค้า มกราคม 2026",
        "month_th": "มกราคม 2026",
    },
    {
        "xlsx": ROOT / "data" / "March_2026_Customers_with_Coordinates.xlsx",
        "slug": "March_2026",
        "title": "แผนที่ลูกค้า มีนาคม 2026",
        "month_th": "มีนาคม 2026",
    },
]

# สีชุดเดียวกับหมุด/แบรนด์ของ Google Maps
GOOGLE_PALETTE = [
    "#EA4335",  # red
    "#4285F4",  # blue
    "#34A853",  # green
    "#FBBC04",  # yellow
    "#A142F4",  # purple
    "#FF6D00",  # orange
    "#24C1E0",  # cyan
    "#F439A0",  # pink
    "#0F9D58",  # dark green
    "#795548",  # brown
    "#7CB342",  # light green
    "#00838F",  # teal
    "#C5221F",  # dark red
    "#9E9E9E",  # grey
]

# ระดับยอดขายต่อจุดส่ง (บาท)
TIERS = [
    {"key": "A", "label": "A · ตั้งแต่ 100,000 ขึ้นไป", "min": 100_000, "max": None},
    {"key": "B", "label": "B · 30,000 – 100,000", "min": 30_000, "max": 100_000},
    {"key": "C", "label": "C · 10,000 – 30,000", "min": 10_000, "max": 30_000},
    {"key": "D", "label": "D · ต่ำกว่า 10,000", "min": None, "max": 10_000},
]

ZONES = [
    {"key": "BKK", "label": "กรุงเทพฯ และปริมณฑล"},
    {"key": "C", "label": "ภาคกลาง"},
    {"key": "E", "label": "ภาคตะวันออก"},
    {"key": "W", "label": "ภาคตะวันตก"},
    {"key": "N", "label": "ภาคเหนือ"},
    {"key": "NE", "label": "ภาคตะวันออกเฉียงเหนือ"},
    {"key": "S", "label": "ภาคใต้"},
]


def zone_of(lat, lng):
    """แบ่งโซนอย่างหยาบจากพิกัด — ใช้จัดกลุ่มเชิงภูมิศาสตร์เท่านั้น ไม่ใช่ขอบเขตจังหวัดจริง"""
    if 13.40 <= lat <= 14.30 and 100.20 <= lng <= 100.95:
        return "BKK"
    if lat < 11.0:
        return "S"
    if lat > 16.5 and lng < 101.5:
        return "N"
    if lng > 101.5 and lat > 14.2:
        return "NE"
    if lng > 100.9 and lat <= 14.2:
        return "E"
    if lng < 100.2 and lat <= 16.5:
        return "W"
    return "C"


def tier_of(value):
    for t in TIERS:
        if (t["min"] is None or value >= t["min"]) and (t["max"] is None or value < t["max"]):
            return t["key"]
    return "D"


def clean(text):
    """ตัดช่องว่างซ้ำและอักขระควบคุมออกจากข้อความจาก Excel"""
    if text is None:
        return ""
    text = unicodedata.normalize("NFC", str(text))
    return re.sub(r"\s+", " ", text).strip()


def read_month(path):
    """คืนค่า (rows, skipped, notes) — skipped = แถวที่ไม่มีพิกัดใช้งานได้จริง"""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Customers with Coordinates"]

    # ชีต "No Match" คือรายการที่รอบก่อนหน้าจับคู่พิกัดไม่ได้ ตอนนี้ทุกแถวมีพิกัดในชีตหลักแล้ว
    # จึงไม่นับเป็นรายการแยก แต่ติดธงไว้ว่าพิกัดควรถูกตรวจสอบด้วยตา
    flagged = set()
    if "No Match" in wb.sheetnames:
        for raw in wb["No Match"].iter_rows(min_row=2, values_only=True):
            chain, code, name, _value = (list(raw) + [None] * 4)[:4]
            if clean(chain):
                flagged.add((clean(code).upper(), clean(name).upper()))

    rows, skipped = [], []
    for i, raw in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        chain, code, name, value, orders, mode, lat, lng = (list(raw) + [None] * 8)[:8]
        chain = clean(chain)
        # แถวสรุปท้ายตาราง ไม่ใช่ลูกค้า
        if not chain or chain.upper() == "TOTAL":
            continue
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            skipped.append({"c": chain, "id": clean(code), "n": clean(name), "v": float(value or 0)})
            continue
        # พิกัดนอกกรอบประเทศไทย = ข้อมูลผิด ไม่เอาขึ้นแผนที่
        if not (5.0 <= lat <= 21.0 and 96.0 <= lng <= 106.5):
            skipped.append({"c": chain, "id": clean(code), "n": clean(name), "v": float(value or 0)})
            continue
        value = float(value or 0)
        rows.append({
            "k": f"r{i}",
            "c": chain,
            "id": clean(code),
            "n": clean(name),
            "v": round(value, 2),
            "o": int(orders or 0),
            "m": clean(mode) or "-",
            "z": zone_of(lat, lng),
            "t": tier_of(value),
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "x": 1 if (clean(code).upper(), clean(name).upper()) in flagged else 0,
        })

    skipped.sort(key=lambda r: -r["v"])

    notes = []
    if "Notes" in wb.sheetnames:
        notes = [clean(r[0]) for r in wb["Notes"].iter_rows(values_only=True) if clean(r[0])]

    return rows, skipped, notes


def build(src):
    rows, skipped, notes = read_month(src["xlsx"])

    # ให้ห้างที่ยอดสูงสุดได้สีแรกของ palette เสมอ (สีจึงคงที่เมื่อรันซ้ำ)
    totals = {}
    for r in rows:
        totals[r["c"]] = totals.get(r["c"], 0) + r["v"]
    order = sorted(totals, key=lambda c: (-totals[c], c))
    chains = {
        c: {"color": GOOGLE_PALETTE[i % len(GOOGLE_PALETTE)], "value": round(totals[c], 2)}
        for i, c in enumerate(order)
    }

    flagged = [r for r in rows if r["x"]]
    month_value = sum(r["v"] for r in rows) + sum(r["v"] for r in skipped)
    data = {
        "slug": src["slug"],
        "month": src["month_th"],
        "rows": rows,
        "chains": chains,
        "zones": ZONES,
        "tiers": [{"key": t["key"], "label": t["label"]} for t in TIERS],
        "skipped": skipped,
        "flaggedCount": len(flagged),
        "notes": notes,
        "monthValue": round(month_value, 2),
    }

    vendor_css = "\n".join(
        (VENDOR / f).read_text(encoding="utf-8")
        for f in ("leaflet.css", "MarkerCluster.css", "MarkerCluster.Default.css")
    )
    vendor_js = "\n;\n".join(
        (VENDOR / f).read_text(encoding="utf-8")
        for f in ("leaflet.js", "leaflet.markercluster.js")
    )

    html = TEMPLATE.read_text(encoding="utf-8")
    for token, value in {
        "__TITLE__": src["title"],
        "__MONTH_TH__": src["month_th"],
        "__ROWCOUNT__": f"{len(rows):,}",
        "__FLAGGED__": str(len(flagged)),
        "__SKIPPED__": str(len(skipped)),
        "__VENDOR_CSS__": vendor_css,
        "__VENDOR_JS__": vendor_js,
        "__DATA_JSON__": json.dumps(data, ensure_ascii=False, separators=(",", ":")),
    }.items():
        html = html.replace(token, value)
    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / f"{src['slug']}_Customer_Map.html"
    out.write_text(html, encoding="utf-8")

    print(f"{out.relative_to(ROOT)}")
    print(f"   จุดบนแผนที่ {len(rows):,} · ต้องตรวจพิกัด {len(flagged)} · ไม่มีพิกัด {len(skipped)} · "
          f"ห้าง {len(chains)} · Value รวม {month_value:,.2f} · {out.stat().st_size/1024:.0f} KB")
    return out


if __name__ == "__main__":
    for s in SOURCES:
        build(s)
