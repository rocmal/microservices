-- =========================================================
-- FINAL SLA IMPLEMENTATION (LOCKED – PRODUCTION READY)
-- Author : Puneet Mehra
-- Date   : December 2025
--
-- CONTRACT:
--  - ONLY Delayed / Moving Slow are reported
--  - SLA Met / Non-risk NEVER appear in MVs or Grafana
--  - Realtime & Historical are strictly separated
-- =========================================================

BEGIN;

-- =========================================================
-- STEP 0: ENSURE TIMESCALEDB
-- =========================================================
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =========================================================
-- STEP 1: raw_otslog.event_ts (TRIGGER-ONLY, IMMUTABLE SAFE)
-- =========================================================
ALTER TABLE raw_otslog DROP COLUMN IF EXISTS event_ts;
ALTER TABLE raw_otslog ADD COLUMN event_ts TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_event_ts()
RETURNS trigger AS $$
BEGIN
  IF NEW.oltdat IS NOT NULL AND NEW.olttim IS NOT NULL THEN
    NEW.event_ts :=
      (NEW.oltdat::text || ' ' ||
       substring(lpad(NEW.olttim::text,6,'0') FROM 1 FOR 2) || ':' ||
       substring(lpad(NEW.olttim::text,6,'0') FROM 3 FOR 2) || ':' ||
       substring(lpad(NEW.olttim::text,6,'0') FROM 5 FOR 2)
      )::timestamptz;
  ELSE
    NEW.event_ts := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_event_ts ON raw_otslog;
CREATE TRIGGER trg_set_event_ts
BEFORE INSERT OR UPDATE ON raw_otslog
FOR EACH ROW EXECUTE FUNCTION set_event_ts();

UPDATE raw_otslog
SET event_ts =
  (oltdat::text || ' ' ||
   substring(lpad(olttim::text,6,'0') FROM 1 FOR 2) || ':' ||
   substring(lpad(olttim::text,6,'0') FROM 3 FOR 2) || ':' ||
   substring(lpad(olttim::text,6,'0') FROM 5 FOR 2)
  )::timestamptz
WHERE event_ts IS NULL AND oltdat IS NOT NULL AND olttim IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_otslog_event_ts
ON raw_otslog (event_ts DESC);

-- =========================================================
-- STEP 2: ORDER CLASSIFICATION
-- =========================================================
CREATE OR REPLACE VIEW order_classification AS
SELECT
  oh.brnch AS branch_id,
  oh."ORDER" AS order_id,
  oh.cusno AS customer_id,
  oh.dlvrcd AS ship_method,
  oh.fdate AS order_date,
  oh.otype AS order_type_code,
  oh.rstat AS order_status,
  sm.route_type,
  sm.route_name,
  CASE
    WHEN MOD(oh.cusno,10000000000)=64356 THEN 'RockAuto'
    WHEN sm.route_type='C' THEN 'StoreFulfillment'
    WHEN sm.route_type='H' THEN 'HotShot'
    WHEN sm.route_type='T' THEN 'Transfer'
    WHEN sm.route_type='R' THEN 'Route'
    WHEN sm.route_type IS NULL THEN 'Ecommerce'
    ELSE 'Regular'
  END AS base_order_type
FROM raw_oeordh oh
LEFT JOIN ship_meth sm
  ON oh.brnch=sm.branch AND oh.dlvrcd=sm.dlvrcd
WHERE oh.otype=3 AND oh.rstat NOT IN (0,9);

-- =========================================================
-- STEP 3: BACKORDER DETECTION
-- =========================================================
CREATE OR REPLACE VIEW order_backorder_status AS
SELECT
  lbrnch AS branch_id,
  lorder AS order_id,
  BOOL_OR(boqty>0) AS has_backorder,
  SUM(boqty) AS total_backorder_qty
FROM raw_oeordl
WHERE rstat NOT IN (0,9)
  AND (iexch IS NULL OR iexch NOT IN ('D','J'))
GROUP BY lbrnch,lorder;

-- =========================================================
-- STEP 4: FINAL ORDER TYPE
-- =========================================================
CREATE OR REPLACE VIEW order_type_final AS
SELECT
  oc.*,
  COALESCE(bo.has_backorder,false) AS has_backorder,
  bo.total_backorder_qty,
  CASE WHEN COALESCE(bo.has_backorder,false)
       THEN 'BO' ELSE oc.base_order_type END AS effective_order_type
FROM order_classification oc
LEFT JOIN order_backorder_status bo
  ON oc.branch_id=bo.branch_id AND oc.order_id=bo.order_id;

-- =========================================================
-- STEP 5: ORDER LIFECYCLE
-- =========================================================
CREATE OR REPLACE VIEW order_lifecycle AS
SELECT
  ot.branch_id,
  ot.order_id,
  ot.effective_order_type AS order_type,
  ot.has_backorder,
  ot.total_backorder_qty,
  ot.ship_method,
  ot.route_type,

  COALESCE(
    MIN(CASE WHEN l.oltran IN ('CRT','Q2O') THEN l.event_ts END),
    MIN(l.event_ts)
  ) AS order_created_ts,

  MIN(CASE WHEN l.oltran='RLS' THEN l.event_ts END) AS pick_start_ts,
  MIN(CASE WHEN l.oltran='PCK' THEN l.event_ts END) AS pick_complete_ts,
  MIN(CASE WHEN l.oltran='OSC' THEN l.event_ts END) AS stage_start_ts,
  MIN(CASE WHEN l.oltran='SPK' THEN l.event_ts END) AS stage_complete_ts,
  MIN(CASE WHEN l.oltran IN ('SVC','SHV') THEN l.event_ts END) AS ship_ts

FROM order_type_final ot
LEFT JOIN raw_otslog l
  ON ot.branch_id=l.olbran AND ot.order_id=l."OLORD#"
GROUP BY
  ot.branch_id, ot.order_id, ot.effective_order_type,
  ot.has_backorder, ot.total_backorder_qty,
  ot.ship_method, ot.route_type;

-- =========================================================
-- STEP 6: SLA CONFIG (UPSERT)
-- =========================================================
INSERT INTO sla_config
(order_type,pick_sla_minutes,stage_sla_minutes,stage_complete_sla_minutes,pack_sla_minutes,ship_sla_minutes,rules)
VALUES
('RockAuto',60,60,60,20,120,'{"order_time_before_hour":13,"then":{"pick":45,"stage":45},"else":{"pick":60,"stage":60}}'),
('StoreFulfillment',15,15,15,10,0,NULL),
('Ecommerce',120,120,120,40,240,NULL),
('HotShot',20,20,20,10,10,NULL),
('Transfer',30,30,30,10,10,NULL),
('Route',30,30,30,10,10,NULL),
('Regular',120,120,120,40,240,NULL),
('BO',9999,9999,9999,9999,9999,NULL)
ON CONFLICT(order_type) DO UPDATE SET
pick_sla_minutes=EXCLUDED.pick_sla_minutes,
stage_sla_minutes=EXCLUDED.stage_sla_minutes,
stage_complete_sla_minutes=EXCLUDED.stage_complete_sla_minutes,
pack_sla_minutes=EXCLUDED.pack_sla_minutes,
ship_sla_minutes=EXCLUDED.ship_sla_minutes,
rules=EXCLUDED.rules;

-- =========================================================
-- STEP 7: SLA EVALUATION
-- =========================================================
DROP VIEW IF EXISTS order_sla_evaluation CASCADE;

CREATE OR REPLACE VIEW order_sla_evaluation AS
SELECT
  ol.*,
  sla.pick_sla_minutes,
  sla.stage_sla_minutes,               -- Stage Started SLA
  sla.stage_sla_complete_minutes,      -- ✅ RENAMED
  sla.ship_sla_minutes
FROM order_lifecycle ol
CROSS JOIN LATERAL get_sla_for_order(
  ol.order_type,
  ol.order_created_ts
) sla
WHERE ol.order_created_ts IS NOT NULL
  AND ol.has_backorder = FALSE;

-- =========================================================
-- STEP 8: REALTIME BREACH (IN-PROGRESS ONLY)
-- =========================================================
-- =========================================================
-- FIXED REALTIME SLA BREACH VIEW (SHIP SLA CORRECTED)
-- =========================================================

DROP VIEW IF EXISTS order_sla_breach_realtime CASCADE;

CREATE VIEW order_sla_breach_realtime AS
SELECT
  o.*,

  /* PICK SLA (RLS → PCK) */
  CASE
    WHEN pick_start_ts IS NOT NULL
     AND pick_complete_ts IS NULL
     AND (clock_timestamp() - pick_start_ts)
          >= INTERVAL '1 minute' * pick_sla_minutes
      THEN 'Delayed'
    WHEN pick_start_ts IS NOT NULL
     AND pick_complete_ts IS NULL
     AND (clock_timestamp() - pick_start_ts)
          >= INTERVAL '1 minute' * (pick_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS pick_breach_state,

  /* STAGE STARTED SLA (PCK → OSC) */
  CASE
    WHEN pick_complete_ts IS NOT NULL
     AND stage_start_ts IS NULL
     AND (clock_timestamp() - pick_complete_ts)
          >= INTERVAL '1 minute' * stage_sla_minutes
      THEN 'Delayed'
    WHEN pick_complete_ts IS NOT NULL
     AND stage_start_ts IS NULL
     AND (clock_timestamp() - pick_complete_ts)
          >= INTERVAL '1 minute' * (stage_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS stage_started_breach_state,

  /* STAGE COMPLETED SLA (OSC → SPK) */
  CASE
    WHEN stage_start_ts IS NOT NULL
     AND stage_complete_ts IS NULL
     AND (clock_timestamp() - stage_start_ts)
          >= INTERVAL '1 minute' * stage_complete_sla_minutes
      THEN 'Delayed'
    WHEN stage_start_ts IS NOT NULL
     AND stage_complete_ts IS NULL
     AND (clock_timestamp() - stage_start_ts)
          >= INTERVAL '1 minute' * (stage_complete_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS stage_complete_breach_state,

  /* SHIP SLA (SPK → SVC / SHV) */
  CASE
    WHEN stage_complete_ts IS NOT NULL
     AND ship_ts IS NULL
     AND (clock_timestamp() - stage_complete_ts)
          >= INTERVAL '1 minute' * ship_sla_minutes
      THEN 'Delayed'
    WHEN stage_complete_ts IS NOT NULL
     AND ship_ts IS NULL
     AND (clock_timestamp() - stage_complete_ts)
          >= INTERVAL '1 minute' * (ship_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS ship_breach_state

FROM order_sla_evaluation o;


-- =========================================================
-- STEP 9: HISTORICAL BREACH (COMPLETED ONLY)
-- =========================================================
DROP VIEW IF EXISTS order_sla_breach_history CASCADE;

CREATE VIEW order_sla_breach_history AS
SELECT
  o.*,

  /* PICK SLA */
  CASE
    WHEN pick_complete_ts - pick_start_ts
          >= INTERVAL '1 minute' * pick_sla_minutes
      THEN 'Delayed'
    WHEN pick_complete_ts - pick_start_ts
          >= INTERVAL '1 minute' * (pick_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS pick_breach_state,

  /* STAGE STARTED SLA */
  CASE
    WHEN stage_start_ts - pick_complete_ts
          >= INTERVAL '1 minute' * stage_sla_minutes
      THEN 'Delayed'
    WHEN stage_start_ts - pick_complete_ts
          >= INTERVAL '1 minute' * (stage_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS stage_started_breach_state,

  /* STAGE COMPLETED SLA */
  CASE
    WHEN stage_complete_ts - stage_start_ts
          >= INTERVAL '1 minute' * stage_complete_sla_minutes
      THEN 'Delayed'
    WHEN stage_complete_ts - stage_start_ts
          >= INTERVAL '1 minute' * (stage_complete_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS stage_complete_breach_state,

  /* SHIP SLA (FIXED) */
  CASE
    WHEN ship_ts - stage_complete_ts
          >= INTERVAL '1 minute' * ship_sla_minutes
      THEN 'Delayed'
    WHEN ship_ts - stage_complete_ts
          >= INTERVAL '1 minute' * (ship_sla_minutes * 0.8)
      THEN 'Moving Slow'
  END AS ship_breach_state

FROM order_sla_evaluation o
WHERE ship_ts IS NOT NULL;

-- =========================================================
-- STEP 10: UNIFIED + REPORTING CONTRACT
-- =========================================================
DROP VIEW IF EXISTS order_sla_breach_reporting CASCADE;

CREATE VIEW order_sla_breach_reporting AS
SELECT *, 'REALTIME' AS breach_scope
FROM order_sla_breach_realtime
WHERE pick_breach_state IS NOT NULL
   OR stage_started_breach_state IS NOT NULL
   OR stage_complete_breach_state IS NOT NULL
   OR ship_breach_state IS NOT NULL

UNION ALL

SELECT *, 'HISTORICAL' AS breach_scope
FROM order_sla_breach_history
WHERE pick_breach_state IS NOT NULL
   OR stage_started_breach_state IS NOT NULL
   OR stage_complete_breach_state IS NOT NULL
   OR ship_breach_state IS NOT NULL;


-- =========================================================
-- STEP 11: MATERIALIZED VIEWS (GRAFANA CONTRACT)
-- =========================================================
DROP MATERIALIZED VIEW IF EXISTS sla_pick_status_5min_mv;

CREATE MATERIALIZED VIEW sla_pick_status_5min_mv AS
SELECT
  time_bucket('5 minutes', order_created_ts) AS bucket,
  order_type,
  breach_scope,
  pick_breach_state AS sla_status,
  COUNT(*) AS order_count
FROM order_sla_breach_reporting
WHERE pick_breach_state IN ('Delayed','Moving Slow')
GROUP BY bucket, order_type, breach_scope, pick_breach_state;

CREATE UNIQUE INDEX uq_sla_pick_5min
ON sla_pick_status_5min_mv (bucket, order_type, breach_scope, sla_status);

DROP MATERIALIZED VIEW IF EXISTS sla_stage_started_status_5min_mv;

CREATE MATERIALIZED VIEW sla_stage_started_status_5min_mv AS
SELECT
  time_bucket('5 minutes', order_created_ts) AS bucket,
  order_type,
  breach_scope,
  stage_started_breach_state AS sla_status,
  COUNT(*) AS order_count
FROM order_sla_breach_reporting
WHERE stage_started_breach_state IN ('Delayed','Moving Slow')
GROUP BY bucket, order_type, breach_scope, stage_started_breach_state;

CREATE UNIQUE INDEX uq_sla_stage_started_5min
ON sla_stage_started_status_5min_mv (bucket, order_type, breach_scope, sla_status);

DROP MATERIALIZED VIEW IF EXISTS sla_stage_status_5min_mv;

CREATE MATERIALIZED VIEW sla_stage_status_5min_mv AS
SELECT
  time_bucket('5 minutes', order_created_ts) AS bucket,
  order_type,
  breach_scope,
  stage_complete_breach_state AS sla_status,
  COUNT(*) AS order_count
FROM order_sla_breach_reporting
WHERE stage_complete_breach_state IN ('Delayed','Moving Slow')
GROUP BY bucket, order_type, breach_scope, stage_complete_breach_state;

CREATE UNIQUE INDEX uq_sla_stage_complete_5min
ON sla_stage_status_5min_mv (bucket, order_type, breach_scope, sla_status);


DROP MATERIALIZED VIEW IF EXISTS sla_ship_status_5min_mv;

CREATE MATERIALIZED VIEW sla_ship_status_5min_mv AS
SELECT
  time_bucket('5 minutes', order_created_ts) AS bucket,
  order_type,
  breach_scope,
  ship_breach_state AS sla_status,
  COUNT(*) AS order_count
FROM order_sla_breach_reporting
WHERE ship_breach_state IN ('Delayed','Moving Slow')
GROUP BY bucket, order_type, breach_scope, ship_breach_state;

CREATE UNIQUE INDEX uq_sla_ship_5min
ON sla_ship_status_5min_mv (bucket, order_type, breach_scope, sla_status);


COMMIT;

REFRESH MATERIALIZED VIEW CONCURRENTLY sla_pick_status_5min_mv;
REFRESH MATERIALIZED VIEW CONCURRENTLY sla_stage_started_status_5min_mv;
REFRESH MATERIALIZED VIEW CONCURRENTLY sla_stage_status_5min_mv;
REFRESH MATERIALIZED VIEW CONCURRENTLY sla_ship_status_5min_mv;

SELECT matviewname
FROM pg_matviews
WHERE matviewname LIKE 'sla_%_5min_mv'
ORDER BY matviewname;
