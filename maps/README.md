# Retail Customer Mapping — January & March 2026

One self-contained interactive map per month, built from the workbooks in `data/`.

| File | Month | Drop points | Orders | Total value (THB) |
|---|---|---|---|---|
| `January_2026_Customer_Map.html` | January 2026 | 408 | 1,541 | 9,486,707.55 |
| `March_2026_Customer_Map.html` | March 2026 | 362 | 1,258 | 9,011,244.75 |

Double-click to open — no server needed. Leaflet and Leaflet.heat are inlined, so only
the base-map tiles need a connection; offline, the markers, filters, insights and table
all still work.

## Layout

- **Top bar** — five live KPIs (total value, drop points, orders, customers, avg per order)
  and a **Map / Table** switch.
- **Left rail — filters.** Search (drop point / cust code / retail group), retail group,
  transport mode, region, value tier, a searchable drop-point list, minimum value per drop
  point, minimum orders, Top 10/20/50 focus, marker size (by value or uniform), heatmap
  mode, point labels, and an "only coordinates to verify" switch. Chips are additive —
  none selected means no restriction on that dimension.
- **Map** — markers coloured by retail group and sized by turnover, grouped by coordinate
  so a DC serving several ShipTos becomes one marker. Base map: Google style (CARTO
  Voyager), Streets (OSM), Light, or Satellite. Popups carry an **Open in Google Maps**
  link for real navigation.
- **Right rail — insights.** Value by transport mode, value by retail group, a value
  concentration (Pareto) chart, the top 12 drop points, and value by region. Everything
  recomputes against the current filters.
- **Table view** — every filtered row, sortable on any column, and **CSV** exports exactly
  what is on screen with a Google Maps link per row.

## Colours

Markers use the Google Maps palette — red `#EA4335`, blue `#4285F4`, green `#34A853`,
yellow `#FBBC04`, purple `#A142F4`, orange `#FF6D00`, … — handed out by descending
turnover, so the largest retail group is always red and the colours stay stable across
rebuilds. Transport modes have their own fixed colours: Own Truck green, Transporter blue,
both yellow. A dashed dark outline marks a coordinate that needs verification.

## What the build does to the data

- The trailing `TOTAL` row is a summary line, not a customer, so it is dropped. Each map's
  total matches that row exactly.
- The **"No Match"** sheet is left over from an earlier matching pass — every row in it
  already carries a coordinate on the main sheet. Counting it again would double-count the
  turnover, so those rows are flagged **verify coordinate** instead (11 in January, 8 in
  March). They are mostly Tantrapan Chiang Mai and Central Food Retail branches.
- Region is derived from the coordinate with coarse bounding rules, not from an address
  field — it is a grouping aid, not a province boundary.
- Coordinates outside Thailand (lat 5–21, lon 96–106.5) are held back from the map and
  reported under the filter rail. Neither month currently has any.

## Rebuilding

```bash
pip install openpyxl
python3 tools/build_customer_maps.py
```

Reads `data/*.xlsx`, overwrites `maps/*.html`. Add a month by appending to `SOURCES` at the
top of `tools/build_customer_maps.py`. The page itself lives in `tools/map_template.html`;
`tools/vendor/` holds Leaflet 1.9.4 (BSD-2-Clause) and Leaflet.heat 0.2.0 (BSD-2-Clause),
which the build inlines into each output file.
