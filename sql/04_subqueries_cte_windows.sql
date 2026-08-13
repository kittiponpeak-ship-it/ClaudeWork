-- ============================================================
-- 04 - SUBQUERIES, CTEs, WINDOW FUNCTIONS, SELF-JOINS
-- The fun stuff. Single flat table, so "joins" here are self-joins.
-- ============================================================

-- ---------- SUBQUERIES ----------

-- Everyone who paid more than average
SELECT name, fare
FROM passenger
WHERE fare > (SELECT AVG(fare) FROM passenger)
ORDER BY fare DESC;

-- Older than the average for their own class (correlated subquery)
SELECT p.name, p.pclass, p.age
FROM passenger p
WHERE p.age > (
    SELECT AVG(p2.age)
    FROM passenger p2
    WHERE p2.pclass = p.pclass
)
ORDER BY p.pclass, p.age DESC;

-- Passengers sharing a ticket with someone who survived (EXISTS)
SELECT p.name, p.ticket, p.survived
FROM passenger p
WHERE EXISTS (
    SELECT 1
    FROM passenger q
    WHERE q.ticket = p.ticket
      AND q.passengerid <> p.passengerid
      AND q.survived = 1
)
ORDER BY p.ticket;

-- IN with a subquery: everyone on a "group" ticket
SELECT name, ticket
FROM passenger
WHERE ticket IN (
    SELECT ticket FROM passenger GROUP BY ticket HAVING COUNT(*) > 4
);

-- ---------- CTEs (WITH) ----------

-- Same as above but readable
WITH group_tickets AS (
    SELECT ticket, COUNT(*) AS party_size
    FROM passenger
    GROUP BY ticket
    HAVING COUNT(*) > 4
)
SELECT p.name, p.ticket, g.party_size, p.survived
FROM passenger p
JOIN group_tickets g ON g.ticket = p.ticket
ORDER BY g.party_size DESC, p.ticket;

-- Chain a couple of CTEs: class stats, then compare each passenger to them
WITH class_stats AS (
    SELECT pclass,
           AVG(fare) AS avg_fare,
           AVG(age)  AS avg_age
    FROM passenger
    GROUP BY pclass
)
SELECT
    p.name,
    p.pclass,
    p.fare,
    ROUND(c.avg_fare::numeric, 2)            AS class_avg_fare,
    ROUND((p.fare - c.avg_fare)::numeric, 2)  AS diff_from_class_avg
FROM passenger p
JOIN class_stats c ON c.pclass = p.pclass
ORDER BY diff_from_class_avg DESC NULLS LAST
LIMIT 20;

-- Surname extracted, then family groups
WITH fam AS (
    SELECT
        passengerid,
        name,
        SPLIT_PART(name, ',', 1) AS surname,
        pclass,
        survived
    FROM passenger
)
SELECT surname, COUNT(*) AS n, ROUND(AVG(survived)::numeric * 100, 1) AS survival_pct
FROM fam
GROUP BY surname
HAVING COUNT(*) >= 4
ORDER BY n DESC;

-- ---------- WINDOW FUNCTIONS ----------

-- Rank by fare within each class
SELECT
    name,
    pclass,
    fare,
    RANK()       OVER (PARTITION BY pclass ORDER BY fare DESC NULLS LAST) AS fare_rank,
    ROW_NUMBER() OVER (PARTITION BY pclass ORDER BY fare DESC NULLS LAST) AS row_num
FROM passenger
ORDER BY pclass, fare_rank
LIMIT 30;

-- Top 3 fares per class (window in a CTE, then filter)
WITH ranked AS (
    SELECT name, pclass, fare,
           ROW_NUMBER() OVER (PARTITION BY pclass ORDER BY fare DESC NULLS LAST) AS rn
    FROM passenger
)
SELECT * FROM ranked WHERE rn <= 3 ORDER BY pclass, rn;

-- Class average alongside each row, without a GROUP BY
SELECT
    name,
    pclass,
    age,
    ROUND(AVG(age) OVER (PARTITION BY pclass)::numeric, 1) AS class_avg_age,
    COUNT(*)       OVER (PARTITION BY pclass)              AS class_size
FROM passenger
LIMIT 25;

-- Percentile / quartile of fare
SELECT
    name,
    fare,
    NTILE(4)      OVER (ORDER BY fare NULLS FIRST)  AS fare_quartile,
    PERCENT_RANK() OVER (ORDER BY fare NULLS FIRST) AS pct_rank
FROM passenger
WHERE fare IS NOT NULL
ORDER BY fare DESC
LIMIT 20;

-- Running total of fares by passengerid
SELECT
    passengerid,
    name,
    fare,
    SUM(fare) OVER (ORDER BY passengerid ROWS UNBOUNDED PRECEDING) AS running_total
FROM passenger
ORDER BY passengerid
LIMIT 25;

-- LAG/LEAD: age gap to the next passenger in the list
SELECT
    passengerid,
    name,
    age,
    LAG(age)  OVER (ORDER BY passengerid) AS prev_age,
    LEAD(age) OVER (ORDER BY passengerid) AS next_age
FROM passenger
ORDER BY passengerid
LIMIT 20;

-- ---------- SELF-JOIN ----------

-- Pairs of passengers travelling on the same ticket
SELECT
    a.ticket,
    a.name AS passenger_a,
    b.name AS passenger_b,
    a.survived AS a_survived,
    b.survived AS b_survived
FROM passenger a
JOIN passenger b
  ON a.ticket = b.ticket
 AND a.passengerid < b.passengerid   -- avoids duplicate/self pairs
ORDER BY a.ticket
LIMIT 40;

-- Same cabin, different people
SELECT a.cabin, a.name, b.name
FROM passenger a
JOIN passenger b
  ON a.cabin = b.cabin
 AND a.passengerid < b.passengerid
WHERE a.cabin IS NOT NULL AND a.cabin <> ''
ORDER BY a.cabin;

-- ---------- SET OPERATIONS ----------

SELECT name FROM passenger WHERE pclass = 1 AND survived = 1
UNION
SELECT name FROM passenger WHERE age < 10 AND survived = 1;

SELECT hometown FROM passenger WHERE survived = 1
INTERSECT
SELECT hometown FROM passenger WHERE survived = 0;

SELECT hometown FROM passenger WHERE survived = 1
EXCEPT
SELECT hometown FROM passenger WHERE survived = 0;
