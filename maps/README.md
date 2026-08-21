# Retail mapping — three months in one page

Merges the three single-month mapping pages into one file with a month switch:

| Source page | Month | Rows in the source |
|---|---|---|
| `January_2026_Customer_Map_1.html` | January 2026 | 408 ShipTo rows |
| `March_2026_Customer_Map_1.html`   | March 2026   | 362 ShipTo rows |
| `RetailMapJuneCCS.html`            | June 2026    | 1,064 invoice rows |

```bash
python3 build_combined_map.py <dir-with-the-three-pages> retail_customer_map_2026_combined.html
```

The output is one self-contained HTML file (Leaflet is inlined, only the base map
tiles need the network). `app.js`, `body.html` and `extra.css` are the page's own
code — the script inlines them together with the merged data.

## What the merge had to reconcile

**Different grain.** January and March are one row per ShipTo with a pre-computed
order count. June is one row per invoice. June is aggregated up to one row per
ShipTo (value summed, `Orders` = distinct order numbers, tier recomputed with the
Jan/Mar thresholds), and its invoice rows are kept alongside so the *Daily value*
and *Value by actual route* cards still work.

**Different spellings.** June writes `Tops / CFR`, `Tantrapan`, `Lemon Farm` and
regions as `North` / `South` / `East`; January and March write `Tops / Central`,
`Rimping (Tantrapan)`, `Lemon Farm (Health Society)` and `Northern` / `Southern` /
`Eastern`. June is mapped onto the Jan/Mar names so one filter chip covers all
three months. `BIC C SUPERCENTER` (typo in the June file) is read as `BIG C`.

**Different coordinates — the big one.** June's coordinates were joined on *cust
code*, not on the branch: 120 of its 122 cust codes resolve to exactly one point.
Code `CM01347` covers 147 different Big C ShipTos, so all 321 of its invoice rows
carry Big C (Pattaya Marina)'s coordinate; two Tops/Lotus codes put 276 more rows
on one Bangkok point. Where the Jan/Mar master data knows the branch, those pins
are moved onto the branch's own coordinate (185 of 343 June drop points, plus the
4 corrected by hand); 38 stay on a cust-code pin and are flagged "verify coord",
2 have no coordinate at all. The **Fix June coordinates** switch turns this off
and shows the file exactly as it was. Every row keeps its original coordinate,
and the CSV export carries both plus a `CoordinateSource` column
(`source` / `snapped` / `corrected` / `shared` / `bycode` / `none`).

**The same join hurts Jan/Mar, less badly.** January's own notes say its match was
redone on Cust Code + ShipTo Name (97.3% exact), which is why Jan/Mar are mostly
branch-accurate. Where it still fell back to the code alone, a branch was handed
the coordinate of a completely different branch — `Pattaya 2` sat in Pattani,
`Mahathun` and `Ramintra` in Songkhla and Phatthalung. Four of them are corrected
by hand in `COORD_FIXES`, applied to all three months, with the region re-derived
from the corrected pin (the source files derive region from the coordinate, so a
moved pin needs a new region). The same failure leaves 23 coordinates carrying two
to five different branch names each — those rows are marked `shared` and flagged
to verify rather than silently trusted.

**Cross-month identity.** The same store is spelled slightly differently between
the monthly files and the June route file, so each row also carries an id into one
shared drop-point list (`DATA.dropPoints`). That is what makes "521 drop points
across 1,113 month rows" — and the per-month breakdown inside a marker popup —
possible.

## What the combined page adds

- Month switch in the header (All / Jan / Mar / Jun) plus multi-select month chips.
- **Value by month** card with the month-over-month change.
- **Colour markers by** Group / Transport / **Month**.
- Popup and top-list show which months a drop point appears in.
- Table has a Month column; CSV export gains Month, routes and coordinate columns.
- June's *Daily value* and *Value by actual route* cards appear whenever June rows
  are in scope, driven by the invoice rows behind the current filters.

## Numbers to check against the sources

| | January | March | June | Total |
|---|---|---|---|---|
| Value (THB) | 9,486,707.55 | 9,011,244.75 | 6,224,026.48 | 24,721,978.78 |
| Drop points | 408 | 362 | 343 | 521 distinct |
| Orders | 1,541 | 1,258 | 1,037 | 3,836 |

Each month's total matches the total in its own source page, so nothing is lost or
double-counted in the merge.
