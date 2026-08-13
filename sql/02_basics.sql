-- ============================================================
-- 02 - BASICS: SELECT, WHERE, ORDER BY, LIMIT
-- Run these one at a time in pgAdmin / psql.
-- ============================================================

-- Everything (careful, ~1300 rows)
SELECT * FROM passenger;

-- Just a peek
SELECT * FROM passenger LIMIT 10;

-- Pick your columns
SELECT passengerid, name, sex, age, pclass, survived
FROM passenger
LIMIT 20;

-- How many rows in total?
SELECT COUNT(*) AS total_passengers FROM passenger;

-- ---------- WHERE ----------

-- Survivors only ("survived" is a double, so compare to 1)
SELECT name, sex, age FROM passenger WHERE survived = 1;

-- First class women
SELECT name, age, fare
FROM passenger
WHERE pclass = 1 AND sex = 'female';

-- Children
SELECT name, age, pclass, survived
FROM passenger
WHERE age < 12
ORDER BY age;

-- Multiple values with IN
SELECT name, embarked FROM passenger WHERE embarked IN ('C', 'Q');

-- Ranges with BETWEEN
SELECT name, fare FROM passenger WHERE fare BETWEEN 50 AND 100;

-- Pattern matching (ILIKE = case-insensitive)
SELECT name FROM passenger WHERE name ILIKE '%murphy%';

-- Everyone with a title of "Master" (young boys)
SELECT name, age FROM passenger WHERE name LIKE '%Master.%';

-- NULL handling -- use IS NULL, never = NULL
SELECT COUNT(*) AS missing_age FROM passenger WHERE age IS NULL;
SELECT name, cabin FROM passenger WHERE cabin IS NOT NULL LIMIT 20;

-- Negation
SELECT name, embarked FROM passenger WHERE embarked <> 'S' OR embarked IS NULL;

-- ---------- ORDER BY / LIMIT ----------

-- 10 most expensive tickets
SELECT name, pclass, fare
FROM passenger
ORDER BY fare DESC NULLS LAST
LIMIT 10;

-- Oldest passengers
SELECT name, age, survived
FROM passenger
ORDER BY age DESC NULLS LAST
LIMIT 10;

-- Sort by two keys
SELECT name, pclass, age
FROM passenger
ORDER BY pclass ASC, age DESC NULLS LAST
LIMIT 25;

-- Paging: rows 11-20
SELECT passengerid, name
FROM passenger
ORDER BY passengerid
LIMIT 10 OFFSET 10;

-- ---------- DISTINCT ----------

SELECT DISTINCT embarked FROM passenger;
SELECT DISTINCT pclass, sex FROM passenger ORDER BY pclass, sex;

-- One row per ticket, keeping the first passenger on it
SELECT DISTINCT ON (ticket) ticket, name, fare
FROM passenger
ORDER BY ticket, passengerid;
