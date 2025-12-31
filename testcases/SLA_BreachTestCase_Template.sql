-- ============================================================
-- SLA END-TO-END TEST SCRIPT TEMPLATE (ORDER TYPE: <ORDER_TYPE>)
-- Order  : <ORDER_NUMBER>
-- Branch : <BRANCH>
-- Customer: <CUSTOMER_NUMBER>
-- Type   : <ORDER_TYPE>
-- SLA    : pick=<PICK_SLA>m, stage=<STAGE_SLA>m, stage_complete=<STAGE_COMPLETE_SLA>m, pack=<PACK_SLA>m, ship=<SHIP_SLA>m
-- Author : <AUTHOR>
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 0: CLEANUP (SAFE TO RE-RUN)
-- ============================================================
DELETE FROM raw_otslog
WHERE olbran = <BRANCH> AND "OLORD#" = <ORDER_NUMBER>;

DELETE FROM raw_oeordh
WHERE brnch = <BRANCH> AND "ORDER" = <ORDER_NUMBER>;

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
  <BRANCH>,
  <ORDER_NUMBER>,
  <CUSTOMER_NUMBER>,
  <ORDER_TYPE_ID>,
  1,
  TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT,
  '<DELIVERY_CODE>'
);

-- ============================================================
-- STEP 2+: ORDER EVENTS (ADJUST TIMINGS FOR SLA BREACH/ON-TIME)
-- ============================================================
-- Example: CRT (Created), RLS (Pick Start), PCK (Pick Complete), OSC (Stage Start), SPK (Stage Complete), SVC (Ship Verified)
-- Use base_time and INTERVALs to simulate event timings

WITH base_time AS (
  SELECT (CURRENT_TIMESTAMP - INTERVAL '<BASE_MINUTES> minutes') AS t
)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim)
SELECT
  <BRANCH>,
  <ORDER_NUMBER>,
  '<EVENT_CODE>',
  (t + INTERVAL '<EVENT_OFFSET_MINUTES> minutes')::date,
  (t + INTERVAL '<EVENT_OFFSET_MINUTES> minutes')::time
FROM base_time;

-- Repeat above block for each event (CRT, RLS, PCK, OSC, SPK, SVC) with appropriate offsets

COMMIT;

-- ============================================================
-- VERIFICATION SECTION (RUN AFTER COMMIT)
-- ============================================================

-- 1️⃣ RAW EVENT ORDER (MUST BE MONOTONIC)
SELECT
  oltran,
  event_ts
FROM raw_otslog
WHERE "OLORD#" = <ORDER_NUMBER>
ORDER BY event_ts;

-- 2️⃣ ORDER LIFECYCLE
SELECT *
FROM order_lifecycle
WHERE order_id = <ORDER_NUMBER>;

-- 3️⃣ SLA VALUES APPLIED (RULE ENGINE CHECK)
SELECT
  order_id,
  pick_sla_minutes,
  stage_sla_minutes,
  stage_complete_sla_minutes,
  pack_sla_minutes,
  ship_sla_minutes
FROM order_sla_evaluation
WHERE order_id = <ORDER_NUMBER>;

-- 4️⃣ REALTIME SLA BREACH (BEFORE SHIP)
SELECT
  order_id,
  pick_breach_state,
  stage_started_breach_state,
  stage_complete_breach_state,
  ship_breach_state
FROM order_sla_breach_realtime
WHERE order_id = <ORDER_NUMBER>;

-- 5️⃣ HISTORICAL SLA BREACH (AFTER SHIP)
SELECT
  order_id,
  pick_breach_state,
  stage_started_breach_state,
  stage_complete_breach_state,
  ship_breach_state
FROM order_sla_breach_history
WHERE order_id = <ORDER_NUMBER>;

-- 6️⃣ CHECK SLA CONFIG FOR ORDER TYPE
SELECT * FROM sla_config WHERE order_type = '<ORDER_TYPE>';

-- 7️⃣ CHECK SLA RULES APPLIED
SELECT * FROM check_sla_config('<ORDER_TYPE>');

-- Replace placeholders <...> with actual values for each test case.
-- Adjust event timings to simulate on-time or breach scenarios as needed.
