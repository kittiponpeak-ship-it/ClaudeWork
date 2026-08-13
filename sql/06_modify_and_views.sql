-- ============================================================
-- 06 - MODIFYING DATA + VIEWS
-- Everything that writes is wrapped in a transaction with
-- ROLLBACK, so you can run it safely. Swap ROLLBACK for COMMIT
-- when you actually want to keep a change.
-- ============================================================

-- ---------- INSERT ----------

BEGIN;

INSERT INTO passenger (passengerid, survived, pclass, name, sex, age, sibsp, parch, ticket, fare, embarked, class)
VALUES (9001, 1, 3, 'Test, Mr. Only A Test', 'male', 30, 0, 0, 'TEST123', 7.25, 'S', 3);

-- Several at once
INSERT INTO passenger (passengerid, survived, pclass, name, sex, age)
VALUES
    (9002, 0, 2, 'Test, Mrs. Two',   'female', 41),
    (9003, 1, 1, 'Test, Miss. Three','female',  9);

SELECT * FROM passenger WHERE passengerid >= 9000;

ROLLBACK;   -- <- change to COMMIT to keep them

-- Insert that ignores an existing key instead of erroring
BEGIN;
INSERT INTO passenger (passengerid, name) VALUES (1, 'Duplicate attempt')
ON CONFLICT (passengerid) DO NOTHING;
ROLLBACK;

-- Upsert: insert, or update if the id already exists
BEGIN;
INSERT INTO passenger (passengerid, name, age)
VALUES (1, 'Braund, Mr. Owen Harris', 23)
ON CONFLICT (passengerid) DO UPDATE
    SET age = EXCLUDED.age;
SELECT passengerid, name, age FROM passenger WHERE passengerid = 1;
ROLLBACK;

-- ---------- UPDATE ----------

BEGIN;

-- Fill missing age from the wiki column
UPDATE passenger
SET age = age_wiki
WHERE age IS NULL AND age_wiki IS NOT NULL;

-- Normalise blank strings to NULL
UPDATE passenger SET cabin    = NULL WHERE TRIM(cabin) = '';
UPDATE passenger SET embarked = NULL WHERE TRIM(embarked) = '';
UPDATE passenger SET body     = NULL WHERE TRIM(body) = '';

-- Make class agree with pclass
UPDATE passenger SET class = pclass WHERE class IS DISTINCT FROM pclass;

-- See what you changed, then decide
SELECT COUNT(*) FILTER (WHERE age IS NULL) AS still_missing_age FROM passenger;

ROLLBACK;

-- UPDATE ... RETURNING shows you the rows it touched
BEGIN;
UPDATE passenger
SET fare = 0
WHERE fare < 0
RETURNING passengerid, name, fare;
ROLLBACK;

-- ---------- DELETE ----------

BEGIN;
DELETE FROM passenger WHERE passengerid >= 9000 RETURNING passengerid, name;
ROLLBACK;

-- ---------- WORKING COPY (safer playground) ----------

-- A full copy you can wreck without touching the original
CREATE TABLE IF NOT EXISTS passenger_sandbox AS SELECT * FROM passenger;

-- Reset it whenever
-- DROP TABLE passenger_sandbox;

-- A temp table that disappears when your session ends
CREATE TEMP TABLE first_class AS
SELECT * FROM passenger WHERE pclass = 1;

SELECT COUNT(*) FROM first_class;

-- ---------- VIEWS ----------

-- A cleaned-up view with the derived fields already worked out
CREATE OR REPLACE VIEW passenger_clean AS
SELECT
    passengerid,
    name,
    SPLIT_PART(name, ',', 1)                            AS surname,
    TRIM(SPLIT_PART(SPLIT_PART(name, ',', 2), '.', 1))  AS title,
    sex,
    COALESCE(age, age_wiki)                             AS age,
    CASE
        WHEN COALESCE(age, age_wiki) IS NULL THEN 'unknown'
        WHEN COALESCE(age, age_wiki) < 13    THEN 'child'
        WHEN COALESCE(age, age_wiki) < 20    THEN 'teen'
        WHEN COALESCE(age, age_wiki) < 60    THEN 'adult'
        ELSE 'senior'
    END                                                 AS age_group,
    pclass,
    sibsp,
    parch,
    sibsp + parch + 1                                   AS family_size,
    ticket,
    fare,
    NULLIF(TRIM(cabin), '')                             AS cabin,
    LEFT(NULLIF(TRIM(cabin), ''), 1)                    AS deck,
    NULLIF(TRIM(embarked), '')                          AS embarked,
    hometown,
    destination,
    NULLIF(TRIM(lifeboat), '')                          AS lifeboat,
    survived = 1                                        AS survived_bool,
    survived
FROM passenger;

-- Now the analysis queries get short
SELECT age_group, COUNT(*) AS n,
       ROUND(AVG(survived)::numeric * 100, 1) AS survival_pct
FROM passenger_clean
GROUP BY age_group
ORDER BY age_group;

SELECT title, COUNT(*) AS n FROM passenger_clean GROUP BY title ORDER BY n DESC;

-- A summary view
CREATE OR REPLACE VIEW survival_by_class_sex AS
SELECT
    pclass,
    sex,
    COUNT(*)                                AS n,
    SUM(survived)                           AS survivors,
    ROUND(AVG(survived)::numeric * 100, 1)  AS survival_pct
FROM passenger
GROUP BY pclass, sex;

SELECT * FROM survival_by_class_sex ORDER BY pclass, sex;

-- Tidy up
-- DROP VIEW IF EXISTS survival_by_class_sex;
-- DROP VIEW IF EXISTS passenger_clean;

-- ---------- INSPECTING THE TABLE ITSELF ----------

-- Column list and types
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'passenger'
ORDER BY ordinal_position;

-- Indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'passenger';

-- How a query will run
EXPLAIN ANALYZE
SELECT pclass, AVG(survived) FROM passenger GROUP BY pclass;
