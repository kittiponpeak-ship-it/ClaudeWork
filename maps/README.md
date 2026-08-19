# Retail Delivery Mapping — June 2026

Interactive map + filter dashboard built from the invoice export
`JUNE_26_RetailFROMINVOICE_withCoordinates.xlsx`.

## Opening it

Just double-click `retail-map-june2026.html` — the data and the Leaflet library are
embedded in the single file, nothing to install. Keep an internet connection so the map
tiles load; offline it falls back to a plain coordinate plot and every filter still works.

## What's on the page

| Area | Details |
|---|---|
| KPI bar | Total value, invoices, drop points, customers, average per invoice — all react to the filters |
| Map | One circle per coordinate, coloured by retail group; click for a detail card with an "Open in Google Maps" link |
| Marker size | **By value** (circle area scales with value) or **Uniform** (every point the same size) |
| Basemaps | Map (Google style / CARTO Voyager), Streets (OSM), Light, Satellite (Esri) |
| Heatmap | Density view of where the value lands |
| Table | Every row, sortable on any column, with `Postponed` / `CXL` / `no coordinate` badges |
| Right panel | Value by retail group, daily value, top drop points (click to fly to the marker), value by route |
| CSV | Exports exactly the rows currently filtered (UTF-8 BOM, opens straight in Excel) |

## Filters

Full-text search (customer / drop point / doc no / address / remark / route) · date range ·
retail group · route · region · status (Normal / Postponed / Cancelled) · customer name
multi-select · minimum value per invoice. Filters combine with AND, and each one accepts
multiple selections.

## Columns derived from the source file

- **RetailGroup** — matched from `Cust Name` (Big C, Makro, Lotus's, Tops/CFR, The Mall
  Group, Foodland, Villa Market, Tantrapan, Asia Books, Lemon Farm, City Mall (EM),
  UFM Fuji Super, Home Fresh Mart, Others)
- **Region** — approximated from lat/lon (coarse filtering aid, not real province borders)
- **Status** — read from `Route`: contains "เลื่อน" → Postponed, `CXL` → Cancelled
- **RouteLabel** — English label for the Thai route codes; the CSV keeps the original
  value in `Route` and the label in `RouteLabel`

## Data notes

- 1,100 records totalling 6,408,977.94 THB — matches the grand-total row in the workbook
- 1,097 records have coordinates; **3 do not** — they stay in the table and CSV, not on the map
- Many coordinates in the source are **DC / head-office** positions rather than store
  fronts: 333 Big C CreditDC invoices sit on one marker, and CP Axtra (Makro / Lotus's)
  collapses onto the office coordinate. All 1,097 records land on just 132 coordinates,
  so each popup lists every drop point stacked at that marker
- `เวลาเข้า` / `เวลาออก` are empty for the whole file, so they are not shown
- Rows with an empty `Value` count as 0
- Free-text remarks are kept verbatim in the original language — they are operator notes,
  not UI labels

## Rebuilding when the data changes

```bash
python3 tools/build_retail_map.py <file.xlsx> -o maps/retail-map-june2026.html
```

Needs `pandas` + `openpyxl`. The script reads the workbook, derives the extra columns and
injects the JSON into `tools/map_template.html` (edit that file to change the UI or the
filters). Leaflet 1.9.4 + leaflet.heat from `tools/vendor/` are inlined into the output.
