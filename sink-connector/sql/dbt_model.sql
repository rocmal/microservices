{{
  config(
    materialized='incremental',
    unique_key=['order_number', 'location'],
    on_schema_change='sync_all_columns',
    indexes=[
      {'columns': ['order_number']},
      {'columns': ['location']},
      {'columns': ['order_type']},
      {'columns': ['status']},
      {'columns': ['order_dt']}
    ]
  )
}}

-- Macro for SLA calculation (create in macros/calculate_sla.sql)
{% macro calculate_sla(cusno, rte_type, sla_type) %}
  CASE
    WHEN MOD({{ cusno }}, 10000000000) = 64356 THEN 
      {% if sla_type == 'pick' or sla_type == 'stage' %} 60
      {% elif sla_type == 'pack' %} 20
      {% elif sla_type == 'ship' %} 120
      {% endif %}
    WHEN {{ rte_type }} = 'C' THEN 
      {% if sla_type == 'pick' or sla_type == 'stage' %} 15
      {% elif sla_type == 'pack' %} 10
      {% elif sla_type == 'ship' %} 0
      {% endif %}
    WHEN {{ rte_type }} IS NULL THEN 
      {% if sla_type == 'pick' or sla_type == 'stage' %} 120
      {% elif sla_type == 'pack' %} 40
      {% elif sla_type == 'ship' %} 240
      {% endif %}
    WHEN {{ rte_type }} IN ('H') THEN 
      {% if sla_type == 'pick' or sla_type == 'stage' %} 20
      {% elif sla_type == 'pack' %} 10
      {% elif sla_type == 'ship' %} 10
      {% endif %}
    WHEN {{ rte_type }} IN ('T', 'R') THEN 
      {% if sla_type == 'pick' or sla_type == 'stage' %} 30
      {% elif sla_type == 'pack' %} 10
      {% elif sla_type == 'ship' %} 10
      {% endif %}
    ELSE 
      {% if sla_type == 'pick' or sla_type == 'stage' %} 120
      {% elif sla_type == 'pack' %} 40
      {% elif sla_type == 'ship' %} 240
      {% endif %}
  END
{% endmacro %}

WITH order_base AS (
  SELECT
    oh.order as order_number,
    oh.brnch as location,
    oh.cusno,
    oh.otype,
    oh.rstat,
    oh.dlvrcd,
    oh.received_at as order_received_at,
    oh.kafka_offset,
    oh.kafka_partition
  FROM {{ source('raw', 'oeordh') }} oh
  WHERE 
    oh.brnch = 350
    AND oh.otype = 3
    AND oh.rstat NOT IN (0, 9)
    
  {% if is_incremental() %}
    AND oh.received_at > (SELECT MAX(last_updated) FROM {{ this }})
  {% endif %}
),

order_lines AS (
  SELECT
    ol.lbrnch as branch,
    ol.lorder as order_number,
    ol.boqty,
    ol.iexch,
    ol.rstat
  FROM {{ source('raw', 'oeordl') }} ol
  WHERE 
    ol.rstat NOT IN (0, 9)
    AND ol.iexch NOT IN ('D', 'J')
),

picking AS (
  SELECT
    ph.obr as branch,
    ph.ono as order_number,
    ph.oco
  FROM {{ source('raw', 'wmopckh') }} ph
  WHERE ph.oco = 1
),

shipping_info AS (
  SELECT
    sc.ship_meth,
    sc.*
  FROM {{ source('raw', 'ship_code') }} sc
),

route_info AS (
  SELECT
    r.branch,
    r.ship_meth,
    r.rte_type
  FROM {{ source('raw', 'dl_rte') }} r
),

final AS (
  SELECT
    ob.order_number,
    ob.location,
    
    -- Order Type Logic
    CASE
      WHEN MOD(ob.cusno, 10000000000) = 64356 THEN 'RockAuto'
      WHEN r.rte_type = 'C' THEN 'Store Fulfillment'
      WHEN r.rte_type IS NULL THEN 'Ecommerce'
      WHEN r.rte_type = 'H' THEN 'HotShot'
      WHEN r.rte_type = 'T' THEN 'Transfer'
      WHEN r.rte_type = 'R' THEN 'Route'
      ELSE 'Regular Order'
    END AS order_type,
    
    -- Status Logic (simplified - expand as needed)
    CASE
      WHEN ol.boqty > 0 THEN 'BO'
      ELSE 'Processing'
    END AS status,
    
    -- Timestamps
    ob.order_received_at AS order_dt,
    
    -- SLA Calculations using macro
    {{ calculate_sla('ob.cusno', 'r.rte_type', 'pick') }} AS pick_sla,
    {{ calculate_sla('ob.cusno', 'r.rte_type', 'stage') }} AS stage_sla,
    {{ calculate_sla('ob.cusno', 'r.rte_type', 'pack') }} AS pack_sla,
    {{ calculate_sla('ob.cusno', 'r.rte_type', 'ship') }} AS ship_sla,
    
    -- Metadata
    ob.kafka_offset,
    ob.kafka_partition,
    CURRENT_TIMESTAMP AS last_updated,
    
    -- Additional context
    r.rte_type,
    ob.cusno
    
  FROM order_base ob
  INNER JOIN order_lines ol 
    ON ob.location = ol.branch 
    AND ob.order_number = ol.order_number
  INNER JOIN picking ph
    ON ob.location = ph.branch
    AND ob.order_number = ph.order_number
  LEFT JOIN shipping_info sc
    ON ob.dlvrcd = sc.ship_meth
  LEFT JOIN route_info r
    ON ob.location = r.branch
    AND ob.dlvrcd = r.ship_meth
)

SELECT * FROM final