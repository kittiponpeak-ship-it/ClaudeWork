# Passenger Database — SQL Playground

SQL for the `public.passenger` table (Titanic manifest merged with Wikipedia data).
Single flat table, 21 columns, `passengerid` as primary key.

## Files

| File | What's in it |
|---|---|
| `sql/01_schema.sql` | Table DDL plus useful indexes |
| `sql/02_basics.sql` | SELECT, WHERE, ORDER BY, LIMIT, DISTINCT |
| `sql/03_aggregates.sql` | COUNT/AVG/SUM, GROUP BY, HAVING, CASE bucketing |
| `sql/04_subqueries_cte_windows.sql` | Subqueries, CTEs, window functions, self-joins, set ops |
| `sql/05_data_quality.sql` | Missing values, casting, text parsing, source disagreements |
| `sql/06_modify_and_views.sql` | INSERT/UPDATE/DELETE (rollback-wrapped), views, sandbox tables |

Run them a statement at a time in pgAdmin or psql — they're written to be read and
tinkered with, not executed top to bottom.

## Gotchas in this table

- **`survived` is `double precision`**, not boolean or int. Use `survived = 1`, and
  `AVG(survived)` to get a survival rate directly.
- **`class` duplicates `pclass`** from the wiki merge. `05_data_quality.sql` checks
  whether they agree. `class` and `name` are also reserved-ish words — quote them
  (`"class"`) if your tool complains.
- **`body` is `text`**, though body-recovery numbers are numeric. Cast with a
  `~ '^[0-9]+$'` guard before comparing.
- **`age` and `age_wiki` are two independent sources** and disagree on some rows.
  `COALESCE(age, age_wiki)` fills gaps.
- **Empty strings vs NULL** — `cabin`, `embarked`, `lifeboat`, and `body` contain
  both. Check for `IS NULL OR = ''`, or normalise with `NULLIF(TRIM(col), '')`.
- **No foreign keys, no other tables** — every join here is a self-join
  (same ticket, same cabin, same surname).

## Quick start

```sql
-- the one-line overview
SELECT pclass, sex, COUNT(*) AS n,
       ROUND(AVG(survived)::numeric * 100, 1) AS survival_pct
FROM passenger
GROUP BY pclass, sex
ORDER BY pclass, sex;
```

`sql/06_modify_and_views.sql` creates a `passenger_clean` view with the derived
columns (surname, title, age group, deck, family size) already worked out — worth
running early so the rest of your queries stay short.

---

## Also in this repo

`maps/` — interactive retail customer maps for January and March 2026, one
self-contained HTML file per month (map + filters + insights + sortable table),
built from the workbooks in `data/` by `tools/build_customer_maps.py`.
See [`maps/README.md`](maps/README.md).
