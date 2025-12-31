-- ============================================================
-- SLA BREACH TEST CASES: MULTI-SCENARIO
-- Author: Puneet Mehra
-- Description: Covers various SLA breach and non-breach scenarios for deterministic validation
-- ============================================================

-- 1️⃣ PICK SLA BREACH ONLY (Delayed Pick, rest on time)
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990002;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990002;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990002, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990002, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990002, 'RLS', (t + INTERVAL '130 minutes')::date, (t + INTERVAL '130 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990002, 'PCK', (t + INTERVAL '145 minutes')::date, (t + INTERVAL '145 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990002, 'OSC', (t + INTERVAL '155 minutes')::date, (t + INTERVAL '155 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990002, 'SPK', (t + INTERVAL '170 minutes')::date, (t + INTERVAL '170 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990002, 'SVC', (t + INTERVAL '190 minutes')::date, (t + INTERVAL '190 minutes')::time FROM base_time;
COMMIT;
-- Verification
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990002;

-- 2️⃣ STAGE STARTED SLA BREACH ONLY (Delayed Stage Start, rest on time)
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990003;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990003;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990003, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990003, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990003, 'RLS', (t + INTERVAL '10 minutes')::date, (t + INTERVAL '10 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990003, 'PCK', (t + INTERVAL '15 minutes')::date, (t + INTERVAL '15 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990003, 'OSC', (t + INTERVAL '120 minutes')::date, (t + INTERVAL '120 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990003, 'SPK', (t + INTERVAL '130 minutes')::date, (t + INTERVAL '130 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990003, 'SVC', (t + INTERVAL '140 minutes')::date, (t + INTERVAL '140 minutes')::time FROM base_time;
COMMIT;
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990003;

-- 3️⃣ NO BREACH (All on time)
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990004;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990004;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990004, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990004, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990004, 'RLS', (t + INTERVAL '10 minutes')::date, (t + INTERVAL '10 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990004, 'PCK', (t + INTERVAL '15 minutes')::date, (t + INTERVAL '15 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990004, 'OSC', (t + INTERVAL '20 minutes')::date, (t + INTERVAL '20 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990004, 'SPK', (t + INTERVAL '30 minutes')::date, (t + INTERVAL '30 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990004, 'SVC', (t + INTERVAL '40 minutes')::date, (t + INTERVAL '40 minutes')::time FROM base_time;
COMMIT;
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990004;

BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990005;


-- 5️⃣ ROCKAUTO ORDER BEFORE 13:00 (SLA rule: pick/stage = 45 min)
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990006;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990006;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990006, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
-- Set order created time to 09:00 (before 13:00)
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990006, 'CRT', t::date, t::time FROM base_time;
-- Pick start at 09:10, pick complete at 09:56 (46 min, should be Delayed for 45 min SLA)
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990006, 'RLS', (t + INTERVAL '10 minutes')::date, (t + INTERVAL '10 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990006, 'PCK', (t + INTERVAL '56 minutes')::date, (t + INTERVAL '56 minutes')::time FROM base_time;
-- Stage start at 09:57, stage complete at 10:44 (47 min, should be Delayed for 45 min SLA)
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990006, 'OSC', (t + INTERVAL '57 minutes')::date, (t + INTERVAL '57 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990006, 'SPK', (t + INTERVAL '104 minutes')::date, (t + INTERVAL '104 minutes')::time FROM base_time;
-- Ship at 10:45
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990006, 'SVC', (t + INTERVAL '105 minutes')::date, (t + INTERVAL '105 minutes')::time FROM base_time;
COMMIT;
-- Verification
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990006;


-- 6️⃣ ROCKAUTO ORDER BEFORE 13:00 (SLA rule: pick/stage = 45 min) - 990007
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990007;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990007;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990007, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990007, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990007, 'RLS', (t + INTERVAL '10 minutes')::date, (t + INTERVAL '10 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990007, 'PCK', (t + INTERVAL '56 minutes')::date, (t + INTERVAL '56 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990007, 'OSC', (t + INTERVAL '57 minutes')::date, (t + INTERVAL '57 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990007, 'SPK', (t + INTERVAL '104 minutes')::date, (t + INTERVAL '104 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990007, 'SVC', (t + INTERVAL '105 minutes')::date, (t + INTERVAL '105 minutes')::time FROM base_time;
COMMIT;
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990007;

-- 7️⃣ ROCKAUTO ORDER BEFORE 13:00 (SLA rule: pick/stage = 45 min) - 990008
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990008;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990008;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990008, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990008, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990008, 'RLS', (t + INTERVAL '10 minutes')::date, (t + INTERVAL '10 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990008, 'PCK', (t + INTERVAL '56 minutes')::date, (t + INTERVAL '56 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990008, 'OSC', (t + INTERVAL '57 minutes')::date, (t + INTERVAL '57 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990008, 'SPK', (t + INTERVAL '104 minutes')::date, (t + INTERVAL '104 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990008, 'SVC', (t + INTERVAL '105 minutes')::date, (t + INTERVAL '105 minutes')::time FROM base_time;
COMMIT;
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990008;

-- 8️⃣ ROCKAUTO ORDER BEFORE 13:00 (SLA rule: pick/stage = 45 min) - 990009
BEGIN;
DELETE FROM raw_otslog WHERE olbran = 350 AND "OLORD#" = 990009;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990009;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990009, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990009, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990009, 'RLS', (t + INTERVAL '10 minutes')::date, (t + INTERVAL '10 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990009, 'PCK', (t + INTERVAL '56 minutes')::date, (t + INTERVAL '56 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990009, 'OSC', (t + INTERVAL '57 minutes')::date, (t + INTERVAL '57 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990009, 'SPK', (t + INTERVAL '104 minutes')::date, (t + INTERVAL '104 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_DATE + TIME '09:00') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990009, 'SVC', (t + INTERVAL '105 minutes')::date, (t + INTERVAL '105 minutes')::time FROM base_time;
COMMIT;
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990009;
DELETE FROM raw_oeordh WHERE brnch = 350 AND "ORDER" = 990005;
INSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (350, 990005, 10000000064356, 3, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, 'UPS');
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990005, 'CRT', t::date, t::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990005, 'RLS', (t + INTERVAL '130 minutes')::date, (t + INTERVAL '130 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990005, 'PCK', (t + INTERVAL '145 minutes')::date, (t + INTERVAL '145 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990005, 'OSC', (t + INTERVAL '155 minutes')::date, (t + INTERVAL '155 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990005, 'SPK', (t + INTERVAL '170 minutes')::date, (t + INTERVAL '170 minutes')::time FROM base_time;
WITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '150 minutes') AS t)
INSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT 350, 990005, 'SVC', (t + INTERVAL '250 minutes')::date, (t + INTERVAL '250 minutes')::time FROM base_time;
COMMIT;
SELECT order_id, pick_breach_state, stage_started_breach_state, stage_complete_breach_state, ship_breach_state FROM order_sla_breach_history WHERE order_id = 990005;
