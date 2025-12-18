-- Materialized View: Refreshes periodically with all your business logic
CREATE MATERIALIZED VIEW order_fulfillment_metrics AS
SELECT
   oh.order as order_number,
   
   -- Order Type Logic
   MAX(CASE
       WHEN MOD(oh.cusno, 10000000000) = 64356 THEN 'RockAuto'
       WHEN r.rte_type = 'C' THEN 'Store Fulfillment'
       WHEN r.rte_type IS NULL THEN 'Ecommerce'
       WHEN r.rte_type = 'H' THEN 'HotShot'
       WHEN r.rte_type = 'T' THEN 'Transfer'
       WHEN r.rte_type = 'R' THEN 'Route'
       ELSE 'Regular Order' 
   END) AS order_type,
   
   oh.brnch as location,
   
   -- Status Logic
   MAX(CASE
       WHEN svc.kafka_topic IS NOT NULL THEN 'Ship'
       WHEN spk.kafka_topic IS NOT NULL THEN 'StageC'
       WHEN osc.kafka_topic IS NOT NULL THEN 'StageS'
       WHEN pck.kafka_topic IS NOT NULL THEN 'PickC'
       WHEN rls.kafka_topic IS NOT NULL THEN 'PickS'
       WHEN ol.boqty > 0 THEN 'BO'
       ELSE ' ' 
   END) AS status,

   -- Timestamps for each stage (using Kafka metadata)
   MAX(crt.received_at) AS order_dt,
   MAX(rls.received_at) AS pick_strt_dt,
   MAX(pck.received_at) AS pick_cmp_dt,
   MAX(osc.received_at) AS stage_strt_dt,
   MAX(spk.received_at) AS stage_cmp_dt,
   MAX(spk.received_at) AS pack_strt_dt,
   MAX(spk.received_at) AS pack_cmp_dt,
   MAX(svc.received_at) AS ship_dt,
   MAX(svc.received_at) AS invoice_dt,

   -- SLA Columns (Pick)
   MAX(CASE
       WHEN MOD(oh.cusno, 10000000000) = 64356 THEN 60
       WHEN r.rte_type = 'C' THEN 15
       WHEN r.rte_type IS NULL THEN 120
       WHEN r.rte_type = 'H' THEN 20
       WHEN r.rte_type = 'T' THEN 30
       WHEN r.rte_type = 'R' THEN 30
       ELSE 120 
   END) AS pick_sla,

   -- SLA Columns (Stage)
   MAX(CASE
       WHEN MOD(oh.cusno, 10000000000) = 64356 THEN 60
       WHEN r.rte_type = 'C' THEN 15
       WHEN r.rte_type IS NULL THEN 120
       WHEN r.rte_type = 'H' THEN 20
       WHEN r.rte_type = 'T' THEN 30
       WHEN r.rte_type = 'R' THEN 30
       ELSE 120 
   END) AS stage_sla,

   -- SLA Columns (Pack)
   MAX(CASE
       WHEN MOD(oh.cusno, 10000000000) = 64356 THEN 20
       WHEN r.rte_type = 'C' THEN 10
       WHEN r.rte_type IS NULL THEN 40
       WHEN r.rte_type = 'H' THEN 10
       WHEN r.rte_type = 'T' THEN 10
       WHEN r.rte_type = 'R' THEN 10
       ELSE 40 
   END) AS pack_sla,

   -- SLA Columns (Ship)
   MAX(CASE
       WHEN MOD(oh.cusno, 10000000000) = 64356 THEN 120
       WHEN r.rte_type = 'C' THEN 0
       WHEN r.rte_type IS NULL THEN 240
       WHEN r.rte_type = 'H' THEN 10
       WHEN r.rte_type = 'T' THEN 10
       WHEN r.rte_type = 'R' THEN 10
       ELSE 240 
   END) AS ship_sla,
   
   -- Add calculated SLA breach indicators
   MAX(CASE 
       WHEN EXTRACT(EPOCH FROM (pck.received_at - rls.received_at))/60 > 
            CASE
                WHEN MOD(oh.cusno, 10000000000) = 64356 THEN 60
                WHEN r.rte_type = 'C' THEN 15
                WHEN r.rte_type IS NULL THEN 120
                WHEN r.rte_type = 'H' THEN 20
                WHEN r.rte_type IN ('T', 'R') THEN 30
                ELSE 120 
            END 
       THEN TRUE ELSE FALSE 
   END) AS pick_sla_breached,
   
   -- Metadata from Kafka
   MAX(oh.kafka_offset) as latest_offset,
   MAX(oh.received_at) as last_updated

FROM raw_oeordh oh
JOIN raw_oeordl ol
   ON oh.brnch = ol.lbrnch
   AND oh.order = ol.lorder
   AND ol.rstat NOT IN (0, 9)
JOIN raw_wmopckh ph
   ON ph.oco = 1
   AND ph.owhse = oh.brnch
   AND ph.obr = oh.brnch
   AND ph.ono = oh.order
LEFT JOIN raw_oeordh crt
   ON crt.brnch = oh.brnch
   AND crt.order = oh.order
   -- Add your CRT/Q2O transaction filtering logic
LEFT JOIN raw_oeordh rls
   ON rls.brnch = oh.brnch
   AND rls.order = oh.order
   -- Add your RLS transaction filtering logic
LEFT JOIN raw_oeordh pck
   ON pck.brnch = oh.brnch
   AND pck.order = oh.order
   -- Add your PCK transaction filtering logic
LEFT JOIN raw_oeordh osc
   ON osc.brnch = oh.brnch
   AND osc.order = oh.order
   -- Add your OSC transaction filtering logic
LEFT JOIN raw_oeordh spk
   ON spk.brnch = oh.brnch
   AND spk.order = oh.order
   -- Add your SPK transaction filtering logic
LEFT JOIN raw_oeordh svc
   ON svc.brnch = oh.brnch
   AND svc.order = oh.order
   -- Add your SVC/SHV transaction filtering logic
LEFT JOIN raw_ship_code sc
   ON oh.dlvrcd = sc.ship_meth
LEFT JOIN raw_dl_rte r
   ON oh.brnch = r.branch 
   AND oh.dlvrcd = r.ship_meth

WHERE
  oh.brnch = 350
  AND oh.otype = 3
  AND oh.rstat NOT IN (0, 9)
  AND ol.iexch NOT IN ('D', 'J')

GROUP BY
   oh.order,
   oh.brnch;

-- Create indexes for performance
CREATE INDEX idx_order_fulfillment_order ON order_fulfillment_metrics(order_number);
CREATE INDEX idx_order_fulfillment_location ON order_fulfillment_metrics(location);
CREATE INDEX idx_order_fulfillment_status ON order_fulfillment_metrics(status);
CREATE INDEX idx_order_fulfillment_type ON order_fulfillment_metrics(order_type);

-- Refresh strategy (choose one):

-- Option 1: Manual refresh
-- REFRESH MATERIALIZED VIEW order_fulfillment_metrics;

-- Option 2: Scheduled refresh via cron/pg_cron
-- SELECT cron.schedule('refresh-order-metrics', '*/5 * * * *', 
--   'REFRESH MATERIALIZED VIEW order_fulfillment_metrics');

-- Option 3: Trigger-based refresh (near real-time)
CREATE OR REPLACE FUNCTION refresh_order_metrics()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY order_fulfillment_metrics;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refresh_order_metrics
AFTER INSERT OR UPDATE ON raw_oeordh
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_order_metrics();