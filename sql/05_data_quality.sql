-- ============================================================
-- 05 - DATA QUALITY: text functions, casting, NULL checks,
--      and the quirks specific to this table.
-- ============================================================

-- ---------- What's missing? ----------

SELECT
    COUNT(*)                                        AS total,
    COUNT(*) FILTER (WHERE survived IS NULL)        AS null_survived,
    COUNT(*) FILTER (WHERE age IS NULL)             AS null_age,
    COUNT(*) FILTER (WHERE fare IS NULL)            AS null_fare,
    COUNT(*) FILTER (WHERE cabin IS NULL OR cabin = '')       AS null_cabin,
    COUNT(*) FILTER (WHERE embarked IS NULL OR embarked = '') AS null_embarked,
    COUNT(*) FILTER (WHERE hometown IS NULL)        AS null_hometown,
    COUNT(*) FILTER (WHERE age_wiki IS NULL)        AS null_age_wiki
FROM passenger;

-- COALESCE: fall back to the wiki age when age is missing
SELECT
    name,
    age,
    age_wiki,
    COALESCE(age, age_wiki) AS best_age
FROM passenger
WHERE age IS NULL AND age_wiki IS NOT NULL;

-- ---------- pclass vs class ----------
-- Two class columns came from the merge; check whether they agree.

SELECT
    pclass,
    class,
    COUNT(*) AS n
FROM passenger
GROUP BY pclass, class
ORDER BY pclass, class;

-- Rows where they disagree
SELECT passengerid, name, pclass, class
FROM passenger
WHERE pclass IS DISTINCT FROM class;   -- IS DISTINCT FROM is NULL-safe

-- ---------- "body" is text, not a number ----------

-- Non-empty body values
SELECT passengerid, name, body
FROM passenger
WHERE body IS NOT NULL AND body <> ''
ORDER BY passengerid;

-- Cast only the rows that actually look numeric
SELECT passengerid, name, body::integer AS body_number
FROM passenger
WHERE body ~ '^[0-9]+$'
ORDER BY body::integer;

-- Anything in body that is NOT a plain number (find the junk)
SELECT DISTINCT body
FROM passenger
WHERE body IS NOT NULL AND body <> '' AND body !~ '^[0-9]+$';

-- ---------- Text functions on name ----------

SELECT
    name,
    SPLIT_PART(name, ',', 1)                        AS surname,
    TRIM(SPLIT_PART(SPLIT_PART(name, ',', 2), '.', 1)) AS title,
    UPPER(sex)                                      AS sex_upper,
    LENGTH(name)                                    AS name_len
FROM passenger
LIMIT 20;

-- Title distribution (Mr / Mrs / Miss / Master / Dr / Rev ...)
SELECT
    TRIM(SPLIT_PART(SPLIT_PART(name, ',', 2), '.', 1)) AS title,
    COUNT(*)                                           AS n,
    ROUND(AVG(age)::numeric, 1)                        AS avg_age,
    ROUND(AVG(survived)::numeric * 100, 1)             AS survival_pct
FROM passenger
GROUP BY title
ORDER BY n DESC;

-- Cabin deck = first letter of cabin
SELECT
    LEFT(cabin, 1)                          AS deck,
    COUNT(*)                                AS n,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct
FROM passenger
WHERE cabin IS NOT NULL AND cabin <> ''
GROUP BY deck
ORDER BY deck;

-- Does the wiki name differ from the manifest name?
SELECT passengerid, name, name_wiki
FROM passenger
WHERE name_wiki IS NOT NULL
  AND LOWER(TRIM(name)) <> LOWER(TRIM(name_wiki))
LIMIT 30;

-- Age disagreements between the two sources
SELECT
    passengerid, name, age, age_wiki,
    ROUND(ABS(age - age_wiki)::numeric, 1) AS gap
FROM passenger
WHERE age IS NOT NULL
  AND age_wiki IS NOT NULL
  AND ABS(age - age_wiki) >= 1
ORDER BY gap DESC;

-- ---------- Duplicates / integrity ----------

-- Duplicate names (passengerid is the PK so it can't repeat)
SELECT name, COUNT(*) AS n
FROM passenger
GROUP BY name
HAVING COUNT(*) > 1;

-- Suspicious values worth a look
SELECT passengerid, name, age, fare
FROM passenger
WHERE age < 0 OR age > 100 OR fare < 0
ORDER BY passengerid;

-- Free tickets
SELECT passengerid, name, pclass, fare FROM passenger WHERE fare = 0;

-- Distinct values in the small text columns, to spot stray casing/spaces
SELECT DISTINCT sex FROM passenger;
SELECT DISTINCT embarked FROM passenger;
SELECT DISTINCT boarded FROM passenger;
