
-- =========================================================
-- File: sla_production_schema.sql
-- Description: Production-ready SLA schema with BO logic
-- Kafka -> TimescaleDB -> SLA Engine
-- =========================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ================================
-- RAW TABLES
-- ================================

CREATE TABLE IF NOT EXISTS raw_oeordh (
    order_id TEXT,
    branch_id INT,
    customer_id BIGINT,
    order_dt TIMESTAMPTZ,
    ship_method TEXT,
    kafka_topic TEXT,
    kafka_partition INT,
    kafka_offset BIGINT,
    received_at TIMESTAMPTZ,
    PRIMARY KEY (order_id, branch_id)
);

CREATE TABLE IF NOT EXISTS raw_oeordl (
    order_id TEXT,
    branch_id INT,
    line_no INT,
    boqty INT,
    rstat INT,
    iexch TEXT,
    received_at TIMESTAMPTZ,
    PRIMARY KEY (order_id, branch_id, line_no)
);

CREATE TABLE IF NOT EXISTS raw_dl_rte (
    branch INT,
    ship_meth TEXT,
    rte_type TEXT,
    received_at TIMESTAMPTZ,
    PRIMARY KEY (branch, ship_meth)
);

CREATE TABLE IF NOT EXISTS raw_wmopckh (
    order_id TEXT,
    branch_id INT,
    pick_wave_id TEXT,
    received_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS raw_otslog (
    order_id TEXT,
    branch_id INT,
    event_code TEXT,
    event_ts TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    PRIMARY KEY (order_id, branch_id, event_code, event_ts)
);

SELECT create_hypertable('raw_otslog', 'event_ts', if_not_exists => true);

-- ================================
-- BO DETECTION
-- ================================

CREATE OR REPLACE VIEW order_line_bo_summary AS
SELECT
    order_id,
    branch_id,
    BOOL_OR(boqty > 0) AS has_backorder
FROM raw_oeordl
WHERE rstat NOT IN (0,9)
  AND iexch NOT IN ('D','J')
GROUP BY order_id, branch_id;

-- ================================
-- ORDER CLASSIFICATION
-- ================================

CREATE OR REPLACE VIEW order_classification AS
SELECT
    oh.order_id,
    oh.branch_id,
    oh.order_dt,
    CASE
        WHEN MOD(oh.customer_id, 10000000000) = 64356 THEN 'RockAuto'
        WHEN r.rte_type = 'C' THEN 'StoreFulfillment'
        WHEN r.rte_type = 'H' THEN 'HotShot'
        WHEN r.rte_type = 'T' THEN 'Transfer'
        WHEN r.rte_type = 'R' THEN 'Route'
        ELSE 'Ecommerce'
    END AS base_order_type,
    COALESCE(bo.has_backorder, false) AS has_backorder,
    CASE
        WHEN COALESCE(bo.has_backorder, false) THEN 'BO'
        WHEN MOD(oh.customer_id, 10000000000) = 64356 THEN 'RockAuto'
        WHEN r.rte_type = 'C' THEN 'StoreFulfillment'
        WHEN r.rte_type = 'H' THEN 'HotShot'
        WHEN r.rte_type = 'T' THEN 'Transfer'
        WHEN r.rte_type = 'R' THEN 'Route'
        ELSE 'Ecommerce'
    END AS effective_order_type
FROM raw_oeordh oh
LEFT JOIN raw_dl_rte r
  ON oh.branch_id = r.branch
 AND oh.ship_method = r.ship_meth
LEFT JOIN order_line_bo_summary bo
  ON oh.order_id = bo.order_id
 AND oh.branch_id = bo.branch_id;

-- ================================
-- ORDER LIFECYCLE
-- ================================

CREATE OR REPLACE VIEW order_lifecycle AS
SELECT
    oc.order_id,
    oc.branch_id,
    oc.effective_order_type AS order_type,
    oc.order_dt,
    MIN(CASE WHEN l.event_code IN ('CRT','Q2O') THEN l.event_ts END) AS order_created_ts,
    MIN(CASE WHEN l.event_code = 'RLS' THEN l.event_ts END) AS pick_start_ts,
    MIN(CASE WHEN l.event_code = 'PCK' THEN l.event_ts END) AS pick_complete_ts,
    MIN(CASE WHEN l.event_code = 'OSC' THEN l.event_ts END) AS stage_start_ts,
    MIN(CASE WHEN l.event_code = 'SPK' THEN l.event_ts END) AS stage_complete_ts,
    MIN(CASE WHEN l.event_code IN ('SVC','SHV') THEN l.event_ts END) AS ship_ts
FROM order_classification oc
LEFT JOIN raw_otslog l
  ON oc.order_id = l.order_id
 AND oc.branch_id = l.branch_id
GROUP BY oc.order_id, oc.branch_id, oc.effective_order_type, oc.order_dt;

-- ================================
-- SLA CONFIG
-- ================================

CREATE TABLE IF NOT EXISTS sla_config (
    order_type TEXT PRIMARY KEY,
    pick_sla_minutes INT NOT NULL,
    stage_sla_minutes INT NOT NULL,
    stage_complete_sla_minutes INT NOT NULL,
    pack_sla_minutes INT NOT NULL,
    ship_sla_minutes INT NOT NULL,
    rules JSONB
);

INSERT INTO sla_config
VALUES ('BO', 9999, 9999, 9999, 9999, 9999, NULL)
ON CONFLICT (order_type) DO NOTHING;

-- ================================
-- APPLY SLA
-- ================================

CREATE OR REPLACE VIEW order_sla_target AS
SELECT
    ol.*,
    s.pick_sla_minutes,
    s.stage_sla_minutes,
    s.pack_sla_minutes,
    s.ship_sla_minutes
FROM order_lifecycle ol
CROSS JOIN LATERAL get_sla_for_order(ol.order_type, ol.order_dt) s;

-- ================================
-- SLA EVALUATION
-- ================================

CREATE TABLE IF NOT EXISTS order_sla_eval (
    order_id TEXT,
    branch_id INT,
    order_type TEXT,
    order_dt TIMESTAMPTZ,
    pick_duration_minutes INT,
    stage_duration_minutes INT,
    pack_duration_minutes INT,
    ship_duration_minutes INT,
    pick_sla_minutes INT,
    stage_sla_minutes INT,
    pack_sla_minutes INT,
    ship_sla_minutes INT,
    pick_sla_status TEXT,
    stage_sla_status TEXT,
    pack_sla_status TEXT,
    ship_sla_status TEXT
);

SELECT create_hypertable('order_sla_eval', 'order_dt', if_not_exists => true);

-- ================================
-- SLA AGGREGATION
-- ================================

CREATE MATERIALIZED VIEW IF NOT EXISTS sla_status_5min_agg
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', order_dt) AS bucket,
    order_type,
    pick_sla_status,
    COUNT(*) AS order_count
FROM order_sla_eval
GROUP BY bucket, order_type, pick_sla_status;
