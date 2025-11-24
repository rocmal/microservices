# TimescaleDB Step‑by‑Step Setup Guide

This document provides a complete, clear, and production‑ready guide to installing, configuring, and using **TimescaleDB** for real‑time analytics and SLA monitoring.

---

## 1. **Prerequisites**
Before installing TimescaleDB, ensure you have:

- Linux (Ubuntu recommended) or Docker installed
- PostgreSQL 14+ (TimescaleDB is an extension to Postgres)
- Administrative access (sudo)
- Internet access for package installation

---

## 2. **Install TimescaleDB on Ubuntu (Recommended)**

### 2.1 Add TimescaleDB Repository
```bash
sudo apt install gnupg postgresql-common apt-transport-https lsb-release wget
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo tee /etc/apt/trusted.gpg.d/timescaledb.asc > /dev/null
echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/timescaledb.list
sudo apt update
```

### 2.2 Install TimescaleDB
```bash
sudo apt install timescaledb-2-postgresql-14
```

### 2.3 Run TimescaleDB Tuning Tool
```bash
sudo timescaledb-tune
```
Choose **Yes** to apply recommended settings.

### 2.4 Restart PostgreSQL
```bash
sudo systemctl restart postgresql
```

---

## 3. **Install TimescaleDB Using Docker (Alternative)**

### 3.1 Pull TimescaleDB Image
```bash
docker pull timescale/timescaledb-ha:pg14-latest
```

### 3.2 Run Container
```bash
docker run -d --name timescaledb \
 -p 5432:5432 \
 -e POSTGRES_PASSWORD=postgres \
 timescale/timescaledb-ha:pg14-latest
```

Use `docker logs timescaledb` to verify startup.

---

## 4. **Enable TimescaleDB in PostgreSQL**

### 4.1 Connect to Postgres
```bash
sudo -u postgres psql
```

### 4.2 Create Database
```sql
CREATE DATABASE mydb;
```

### 4.3 Enable Extension
```sql
\c mydb;
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

---

## 5. **Create a Hypertable**
Hypertables are the key TimescaleDB feature for time-series data.

### 5.1 Create a Standard Table
```sql
CREATE TABLE order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,
    sla_target_minutes INT,
    sla_met BOOLEAN,
    worker_id BIGINT,
    notes TEXT
);
```

### 5.2 Convert to Hypertable
```sql
SELECT create_hypertable('order_status_history', 'entered_at');
```

---

## 6. **Create SLA Events Table (Optional but Recommended)**

```sql
CREATE TABLE sla_events (
    id BIGSERIAL PRIMARY KEY,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    order_id BIGINT NOT NULL,
    order_line_id BIGINT,
    stage VARCHAR(50) NOT NULL,
    duration_seconds INT,
    sla_target_minutes INT,
    sla_met BOOLEAN,
    breach BOOLEAN,
    details JSONB DEFAULT '{}'
);
```

---

## 7. **Add Indexes for Performance**

```sql
CREATE INDEX idx_osh_entered ON order_status_history(entered_at DESC);
CREATE INDEX idx_sla_events_detected ON sla_events(detected_at DESC);
```

---

## 8. **Enable Compression & Retention Policies**

### 8.1 Enable Compression
```sql
ALTER TABLE order_status_history SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'order_id'
);
```

### 8.2 Add Policy
```sql
SELECT add_compression_policy('order_status_history', INTERVAL '7 days');
```

---

## 9. **Create Continuous Aggregates (For Grafana Dashboards)**

```sql
CREATE MATERIALIZED VIEW cagg_sla_summary
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', entered_at) AS bucket,
  status,
  COUNT(*) AS total_events,
  SUM( (NOT sla_met)::int ) AS breaches
FROM order_status_history
GROUP BY bucket, status;
```

---

## 10. **Trigger for Real-Time SLA Detection**

```sql
CREATE OR REPLACE FUNCTION fn_detect_sla_breach()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE breach BOOLEAN;
BEGIN
    breach := (NEW.duration_seconds > NEW.sla_target_minutes * 60);

    INSERT INTO sla_events(order_id, order_line_id, stage, duration_seconds, sla_target_minutes, sla_met, breach)
    VALUES (NEW.order_id, NULL, NEW.status, NEW.duration_seconds, NEW.sla_target_minutes, NEW.sla_met, breach);

    RETURN NEW;
END $$;

CREATE TRIGGER trg_sla_check
AFTER INSERT ON order_status_history
FOR EACH ROW EXECUTE FUNCTION fn_detect_sla_breach();
```

---

## 11. **Grafana Setup (Quick Overview)**

- Add PostgreSQL/TimescaleDB datasource
- Use queries:  
  ```sql
  SELECT * FROM sla_events ORDER BY detected_at DESC LIMIT 50;
  ```
- Build panels:
  - Real-time breach table
  - SLA breach trend (using continuous aggregates)
  - Per-stage heatmap

---

## 12. **Monitoring & Maintenance**

### Check hypertable size
```sql
SELECT hypertable_size('order_status_history');
```

### Check chunks
```sql
SELECT show_chunks('order_status_history');
```

### Recompress older chunks
```sql
SELECT compress_chunk(chunk) FROM show_chunks('order_status_history') chunk;
```

---

## 13. **Create All Tables and Convert to Hypertables (Step-by-Step)**

Below is the complete SQL workflow to create all tables (Orders, OrderLines, OrderStatusHistory, SLAEvents, LocationMaster, SLAConfig) and convert the required ones into hypertables.

---

### **Step 1: Create Orders Table**
```sql
CREATE TABLE orders (
    order_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT,
    order_type VARCHAR(50),
    branch VARCHAR(50),
    priority INT,
    total_lines INT,
    created_at TIMESTAMPTZ NOT NULL,
    target_ship_time TIMESTAMPTZ,
    actual_ship_time TIMESTAMPTZ,
    current_status VARCHAR(50)
);
```

---

### **Step 2: Create OrderLines Table**
```sql
CREATE TABLE order_lines (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES orders(order_id),
    order_number VARCHAR(50),
    order_type VARCHAR(50),
    location VARCHAR(50),
    order_dt TIMESTAMPTZ,
    pick_start_dt TIMESTAMPTZ,
    pick_complete_dt TIMESTAMPTZ,
    stage_start_dt TIMESTAMPTZ,
    stage_complete_dt TIMESTAMPTZ,
    pack_start_dt TIMESTAMPTZ,
    pack_complete_dt TIMESTAMPTZ,
    ship_dt TIMESTAMPTZ,
    invoice_dt TIMESTAMPTZ,
    status VARCHAR(50)
);
```

---

### **Step 3: Create SLAConfig Table**
```sql
CREATE TABLE sla_config (
    order_type VARCHAR(50) PRIMARY KEY,
    pick_sla_minutes INT,
    stage_sla_minutes INT,
    stage_complete_sla_minutes INT,
    pack_sla_minutes INT,
    ship_sla_minutes INT
);
```

---

### **Step 4: Create LocationMaster Table**
```sql
CREATE TABLE location_master (
    location_id BIGSERIAL PRIMARY KEY,
    location_code VARCHAR(50) UNIQUE,
    location_name VARCHAR(100),
    location_type VARCHAR(50),
    area VARCHAR(50),
    warehouse_code VARCHAR(50),
    capacity_units INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### **Step 5: Create OrderStatusHistory Table**
(Will be converted to hypertable)
```sql
CREATE TABLE order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES orders(order_id),
    order_line_id BIGINT,
    status VARCHAR(50) NOT NULL,
    entered_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,
    sla_target_minutes INT,
    sla_met BOOLEAN,
    worker_id BIGINT,
    notes TEXT,
    meta JSONB DEFAULT '{}'
);
```

#### Convert to Hypertable
```sql
SELECT create_hypertable('order_status_history', 'entered_at', if_not_exists => TRUE);
```

---

### **Step 6: Create SLAEvents Table**
(Used for real-time SLA breach monitoring)
```sql
CREATE TABLE sla_events (
    id BIGSERIAL PRIMARY KEY,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    order_id BIGINT NOT NULL,
    order_line_id BIGINT,
    stage VARCHAR(50) NOT NULL,
    duration_seconds INT,
    sla_target_minutes INT,
    sla_met BOOLEAN,
    breach BOOLEAN,
    details JSONB DEFAULT '{}'
);
```

---

### **Step 7: Add Required Indexes**
```sql
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_order_lines_order ON order_lines(order_id);
CREATE INDEX idx_osh_entered ON order_status_history(entered_at DESC);
CREATE INDEX idx_sla_events_detected ON sla_events(detected_at DESC);
```

---

### **Step 8: Optional — Enable Compression & Retention Policies**
```sql
ALTER TABLE order_status_history SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'order_id'
);

SELECT add_compression_policy('order_status_history', INTERVAL '7 days');
```

---

## ✔ Document Completed (Updated)
All steps to create all tables and convert the necessary ones into hypertables have been added.
If you want, I can also prepare:
- A **print-friendly PDF**
- A **Docker Compose** stack for Timescale + Grafana
- A **Grafana dashboard JSON** export

