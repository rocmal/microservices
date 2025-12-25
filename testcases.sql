-- ============================================================
-- SLA END-TO-END TEST SCRIPT (DETERMINISTIC & ORDER-SAFE)
-- Order  : 990001
-- Branch : 350
-- Type   : Rock Auto
-- Author : Puneet Mehra
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 0: CLEANUP (SAFE TO RE-RUN)
-- ============================================================
DELETE FROM raw_otslog
WHERE olbran = 350 AND "OLORD#" = 990001;

DELETE FROM raw_oeordh
WHERE brnch = 350 AND "ORDER" = 990001;

-- ============================================================
-- STEP 1: ORDER HEADER
-- ============================================================
INSERT INTO raw_oeordh (
  brnch,
  "ORDER",
  cusno,
  otype,
  rstat,
  fdate,
  dlvrcd
) VALUES (
  350,
  990001,
  10000000064356,        -- Rock Auto customer
  3,
  1,
  TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT,
  'UPS'
);


-- STEP 2/3: CRT (ORDER CREATED)
WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  350,
  990001,
  'CRT',
  t::date,
  t::time
FROM base_time;

-- ============================================================
-- STEP 4: RLS (PICK START)  -- AFTER CRT
-- Pick elapsed ≈ 140 minutes → DELAYED
-- ============================================================
WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  350,
  990001,
  'RLS',
  (t + INTERVAL '10 minutes')::date,
  (t + INTERVAL '10 minutes')::time
FROM base_time;

-- ============================================================
-- STEP 5: PCK (PICK COMPLETE)
-- ============================================================
WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  350,
  990001,
  'PCK',
  (t + INTERVAL '15 minutes')::date,
  (t + INTERVAL '15 minutes')::time
FROM base_time;

-- ============================================================
-- STEP 6: OSC (STAGE STARTED)
-- Stage Started elapsed ≈ 75 minutes → DELAYED
-- ============================================================
WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  350,
  990001,
  'OSC',
  (t + INTERVAL '90 minutes')::date,
  (t + INTERVAL '90 minutes')::time
FROM base_time;

-- ============================================================
-- STEP 7: SPK (STAGE COMPLETED)
-- Stage Completed elapsed ≈ 60 minutes → DELAYED
-- ============================================================
WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  350,
  990001,
  'SPK',
  (t + INTERVAL '150 minutes')::date,
  (t + INTERVAL '150 minutes')::time
FROM base_time;

-- ============================================================
-- STEP 8: SVC (SHIP VERIFIED)
-- Ship elapsed ≈ 40 minutes → DELAYED
-- ============================================================
WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  350,
  990001,
  'SVC',
  (t + INTERVAL '190 minutes')::date,
  (t + INTERVAL '190 minutes')::time
FROM base_time;

COMMIT;

-- ============================================================
-- VERIFICATION SECTION (RUN AFTER COMMIT)
-- ============================================================

-- 1️⃣ RAW EVENT ORDER (MUST BE MONOTONIC)
SELECT
  oltran,
  event_ts
FROM raw_otslog
WHERE "OLORD#" = 990001
ORDER BY event_ts;

-- 2️⃣ ORDER LIFECYCLE
SELECT *
FROM order_lifecycle
WHERE order_id = 990001;

-- 3️⃣ SLA VALUES APPLIED (RULE ENGINE CHECK)
SELECT
  order_id,
  pick_sla_minutes,
  stage_sla_minutes,
  stage_complete_sla_minutes,
  ship_sla_minutes
FROM order_sla_evaluation
WHERE order_id = 990001;

-- 4️⃣ REALTIME SLA BREACH (BEFORE SHIP)
SELECT
  order_id,
  pick_breach_state,
  stage_started_breach_state,
  stage_complete_breach_state,
  ship_breach_state
FROM order_sla_breach_realtime
WHERE order_id = 990001;

-- 5️⃣ HISTORICAL SLA BREACH (AFTER SHIP)
SELECT
  order_id,
  pick_breach_state,
  stage_started_breach_state,
  stage_complete_breach_state,
  ship_breach_state
FROM order_sla_breach_history
WHERE order_id = 990001;
