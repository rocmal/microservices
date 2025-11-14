CREATE DATABASE analytics;
\connect analytics
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE TABLE IF NOT EXISTS metrics (
  time TIMESTAMPTZ NOT NULL,
  metric TEXT,
  value DOUBLE PRECISION,
  region TEXT
);
SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);