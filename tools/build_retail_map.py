#!/usr/bin/env python3
"""Build a self-contained HTML mapping dashboard from the retail invoice workbook.

Usage:
    python3 tools/build_retail_map.py <input.xlsx> [-o maps/retail-map-june2026.html]

Reads the invoice export (one row per invoice line with geocoded ShipTo/customer
coordinates), derives retail chain / region / status dimensions, and injects the
result as JSON into tools/map_template.html.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "tools" / "map_template.html"

# --- retail chain detection ------------------------------------------------
# order matters: first matching pattern wins
CHAINS = [
    ("Big C",              r"BIG\s*C",                                  "#1a73e8"),
    ("Makro",              r"MAKRO",                                    "#d93025"),
    ("Lotus's",            r"LOTUS",                                    "#12b5cb"),
    ("Tops / CFR",         r"CENTRAL\s*FOOD",                           "#e8710a"),
    ("The Mall Group",     r"THE\s*MALL|SIAM\s*PARAGON|GOURMET",        "#9334e6"),
    ("Foodland",           r"FOODLAND",                                 "#188038"),
    ("Villa Market",       r"VILLA\s*MARKET",                           "#f9ab00"),
    ("Tantrapan",          r"TANTRAPAN",                                "#e52592"),
    ("Asia Books",         r"ASIA\s*BOOKS",                             "#7cb342"),
    ("Lemon Farm",         r"LEMON\s*FARM|HEALTH\s*SOCIETY",            "#0b8043"),
    ("City Mall (EM)",     r"CITY\s*MALL",                              "#00897b"),
    ("UFM Fuji Super",     r"UFM|FUJI",                                 "#607d8b"),
    ("Home Fresh Mart",    r"HOME\s*FRESH",                             "#795548"),
]
OTHER = ("Others", "#80868b")

CHAIN_COLORS = {name: color for name, _, color in CHAINS}
CHAIN_COLORS[OTHER[0]] = OTHER[1]


def chain_of(name: str) -> str:
    up = (name or "").upper()
    for label, pattern, _ in CHAINS:
        if re.search(pattern, up):
            return label
    return OTHER[0]


def region_of(lat, lon):
    """Coarse Thai region from coordinates (approximation, for filtering only)."""
    if lat is None or lon is None or (isinstance(lat, float) and math.isnan(lat)):
        return "Unknown"
    if 13.40 <= lat <= 14.25 and 100.20 <= lon <= 100.95:
        return "Bangkok & Metro"
    if lat < 11.5:
        return "South"
    if lat >= 16.3 and lon < 101.5:
        return "North"
    if lat >= 14.3 and lon >= 101.6:
        return "Northeast"
    if lon >= 100.95 and lat < 14.3:
        return "East"
    if lon < 99.7:
        return "West"
    return "Central"


TRANSPORT_COLORS = {"Transporter": "#1a73e8", "CCS Own Truck": "#188038", "The Rest": "#9aa0a6"}


def transport_of(route: str) -> str:
    """Split the actual route (`Route_จริง`) into the three delivery modes.

    Transporter    — outsourced: InterExp, IE,B&W, B & W
    CCS Own Truck  — numbered routes plus the PTY / PTY1 Pattaya runs
    The Rest       — anything else (blank or unrecognised route)
    """
    u = (route or "").upper().replace(" ", "")
    if not u:
        return "The Rest"
    if "INTEREXP" in u or "B&W" in u:
        return "Transporter"
    if u.isdigit() or u.startswith("PTY"):
        return "CCS Own Truck"
    return "The Rest"


def is_postponed(route: str) -> bool:
    return "เลื่อน" in (route or "")


def route_label(route: str) -> str:
    """English display label for the handful of Thai route codes in the source."""
    r = (route or "").strip()
    if not r:
        return ""
    if r.startswith("เลื่อนส่ง"):
        rest = r[len("เลื่อนส่ง"):].strip()
        return f"Postponed to {rest}" if rest else "Postponed"
    if r == "เลื่อน":
        return "Postponed"
    if r.upper() == "CXL":
        return "Cancelled (CXL)"
    return r


def status_of(planned: str, actual: str) -> str:
    """Postponed rows are dropped upstream, so a row that was replanned and then
    driven counts as a normal delivery; only an explicit CXL stays cancelled."""
    if "CXL" in (planned or "").upper() or "CXL" in (actual or "").upper():
        return "Cancelled"
    if is_postponed(actual):
        return "Postponed"
    return "Normal"


def norm_date(v):
    if pd.isna(v):
        return None
    if isinstance(v, str):
        s = v.strip().replace("/", "-")
        m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
        if m:
            return "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3)))
        return None
    try:
        return pd.Timestamp(v).strftime("%Y-%m-%d")
    except Exception:
        return None


def clean(v):
    if v is None or (isinstance(v, float) and math.isnan(v)) or pd.isna(v):
        return ""
    if isinstance(v, float) and v == int(v):
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def build(src: Path, out: Path, keep_postponed: bool = False) -> None:
    df = pd.read_excel(src)
    # drop fully-empty rows and the workbook's grand-total row (no doc/customer)
    df = df.dropna(how="all")
    df = df[df["DocNo"].notna() | df["Cust Name"].notna()]

    rows, dropped, dropped_value = [], 0, 0.0
    for _, r in df.iterrows():
        lat, lon = r.get("Latitude"), r.get("Longitude")
        lat = None if pd.isna(lat) else round(float(lat), 6)
        lon = None if pd.isna(lon) else round(float(lon), 6)
        value = 0.0 if pd.isna(r.get("Value")) else round(float(r["Value"]), 2)
        cust = clean(r.get("Cust Name"))
        planned = clean(r.get("Route"))
        # `Route_จริง` (actual route driven) is the source of truth; fall back to the plan
        actual = clean(r.get("Route_\u0e08\u0e23\u0e34\u0e07")) or planned
        if is_postponed(actual) and not keep_postponed:
            dropped += 1
            dropped_value += 0.0 if pd.isna(r.get("Value")) else float(r["Value"])
            continue
        route = actual
        rows.append({
            "date": norm_date(r.get("DATE")),
            "order": clean(r.get("OrderNo")).replace(".0", ""),
            "doc": clean(r.get("DocNo")),
            "code": clean(r.get("Cust Code")),
            "cust": cust,
            "chain": chain_of(cust),
            "value": value,
            "ship": clean(r.get("ShipTo Name")) or cust,
            "addr": clean(r.get("ShipTo.Address")),
            "route": route_label(actual),
            "routeSrc": actual,
            "plan": route_label(planned),
            "transport": transport_of(actual),
            "status": status_of(planned, actual),
            "region": region_of(lat, lon),
            "remark": clean(r.get("Remark")),
            "lat": lat,
            "lon": lon,
        })

    payload = {
        "source": src.name,
        "rows": rows,
        "colors": CHAIN_COLORS,
        "transportColors": TRANSPORT_COLORS,
        "droppedPostponed": dropped,
        "droppedValue": round(dropped_value, 2),
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
    }

    html = TEMPLATE.read_text(encoding="utf-8")
    html = html.replace("/*__DATA__*/null", json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    # inline Leaflet + heat plugin so the report is a single self-contained file
    vendor = ROOT / "tools" / "vendor"
    for token, fname, cdn in (
        ("/*__LEAFLET_CSS__*/", "leaflet.css", '@import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");'),
        ("/*__LEAFLET_JS__*/", "leaflet.js", 'document.write(\'<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\\/script>\');'),
        ("/*__HEAT_JS__*/", "leaflet-heat.js", 'document.write(\'<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"><\\/script>\');'),
    ):
        f = vendor / fname
        html = html.replace(token, f.read_text(encoding="utf-8") if f.exists() else cdn)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")

    geo = sum(1 for x in rows if x["lat"] is not None)
    print(f"rows={len(rows)} geocoded={geo} value={sum(x['value'] for x in rows):,.2f}")
    print(f"postponed rows dropped={dropped} value={dropped_value:,.2f}")
    for mode in ("Transporter", "CCS Own Truck", "The Rest"):
        sel = [x for x in rows if x["transport"] == mode]
        print(f"  {mode:<14} rows={len(sel):>4} value={sum(x['value'] for x in sel):,.2f}")
    print(f"wrote {out} ({out.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=ROOT / "maps" / "retail-map-june2026.html")
    ap.add_argument("--keep-postponed", action="store_true",
                    help="keep rows whose actual route is still 'เลื่อน' (dropped by default)")
    a = ap.parse_args()
    if not a.src.exists():
        sys.exit(f"input not found: {a.src}")
    build(a.src, a.out, a.keep_postponed)
