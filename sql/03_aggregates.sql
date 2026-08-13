-- ============================================================
-- 03 - AGGREGATES: COUNT, AVG, SUM, GROUP BY, HAVING
-- ============================================================

-- The basic five
SELECT
    COUNT(*)      AS n_rows,
    COUNT(age)    AS n_with_age,     -- COUNT(col) skips NULLs
    AVG(age)      AS avg_age,
    MIN(age)      AS youngest,
    MAX(age)      AS oldest,
    SUM(fare)     AS total_fare
FROM passenger;

-- Round the ugly decimals
SELECT ROUND(AVG(age)::numeric, 1) AS avg_age FROM passenger;

-- ---------- GROUP BY ----------

-- Passengers per class
SELECT pclass, COUNT(*) AS n
FROM passenger
GROUP BY pclass
ORDER BY pclass;

-- Survival rate by sex (AVG of a 0/1 column = the rate)
SELECT
    sex,
    COUNT(*)                                   AS n,
    SUM(survived)                              AS survivors,
    ROUND(AVG(survived)::numeric * 100, 1)     AS survival_pct
FROM passenger
GROUP BY sex
ORDER BY survival_pct DESC;

-- Survival rate by class
SELECT
    pclass,
    COUNT(*)                                AS n,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct,
    ROUND(AVG(fare)::numeric, 2)            AS avg_fare
FROM passenger
GROUP BY pclass
ORDER BY pclass;

-- Two-way breakdown: class x sex
SELECT
    pclass,
    sex,
    COUNT(*)                                AS n,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct
FROM passenger
GROUP BY pclass, sex
ORDER BY pclass, sex;

-- Where people boarded
SELECT
    COALESCE(embarked, '(unknown)') AS port,
    COUNT(*)                        AS n,
    ROUND(AVG(fare)::numeric, 2)    AS avg_fare
FROM passenger
GROUP BY embarked
ORDER BY n DESC;

-- ---------- HAVING (filter AFTER grouping) ----------

-- Hometowns that sent more than 5 passengers
SELECT hometown, COUNT(*) AS n
FROM passenger
WHERE hometown IS NOT NULL
GROUP BY hometown
HAVING COUNT(*) > 5
ORDER BY n DESC;

-- Tickets shared by 3+ people (travelling groups)
SELECT ticket, COUNT(*) AS party_size, MIN(name) AS a_passenger
FROM passenger
GROUP BY ticket
HAVING COUNT(*) >= 3
ORDER BY party_size DESC;

-- Lifeboats and who got in them
SELECT lifeboat, COUNT(*) AS n
FROM passenger
WHERE lifeboat IS NOT NULL AND lifeboat <> ''
GROUP BY lifeboat
ORDER BY n DESC;

-- ---------- CASE: bucketing ----------

-- Age groups
SELECT
    CASE
        WHEN age IS NULL  THEN '0 unknown'
        WHEN age < 13     THEN '1 child'
        WHEN age < 20     THEN '2 teen'
        WHEN age < 60     THEN '3 adult'
        ELSE                   '4 senior'
    END                                     AS age_group,
    COUNT(*)                                AS n,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct
FROM passenger
GROUP BY age_group
ORDER BY age_group;

-- Fare bands
SELECT
    CASE
        WHEN fare IS NULL THEN 'unknown'
        WHEN fare = 0     THEN 'free'
        WHEN fare < 10    THEN 'under 10'
        WHEN fare < 30    THEN '10-30'
        WHEN fare < 100   THEN '30-100'
        ELSE                   '100+'
    END                                     AS fare_band,
    COUNT(*)                                AS n,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct
FROM passenger
GROUP BY fare_band
ORDER BY n DESC;

-- Family size derived from sibsp + parch
SELECT
    sibsp + parch + 1                       AS family_size,
    COUNT(*)                                AS n,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct
FROM passenger
GROUP BY family_size
ORDER BY family_size;

-- Pivot-style: survival counts side by side (FILTER is the clean way)
SELECT
    pclass,
    COUNT(*) FILTER (WHERE survived = 1) AS lived,
    COUNT(*) FILTER (WHERE survived = 0) AS died,
    COUNT(*) FILTER (WHERE survived IS NULL) AS unknown
FROM passenger
GROUP BY pclass
ORDER BY pclass;
