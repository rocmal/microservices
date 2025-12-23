@echo off
echo ========================================
echo Kafka Cluster Setup Script
echo ========================================
echo.
echo This script will:
echo 1. Stop existing containers
echo 2. Start 3-broker Kafka cluster
echo 3. Wait for cluster to be ready
echo 4. Create topics based on confluent folder
echo 5. Register Avro schemas with Schema Registry
echo.
echo ========================================
echo.

echo [1/5] Stopping existing containers...
docker-compose down
echo.

echo [2/5] Starting Kafka cluster and Schema Registry...
docker-compose up -d kafka1 kafka2 kafka3 schema-registry
echo.

echo [3/5] Waiting for Kafka cluster to be ready (60 seconds)...
timeout /t 60 /nobreak
echo.

echo [4/5] Creating topics from confluent folder...
node create-topics.js
echo.

echo [5/5] Registering Avro schemas...
node register-schemas.js
echo.

echo ========================================
echo Starting remaining services...
echo ========================================
docker-compose up -d
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Access points:
echo - Kafka UI:        http://localhost:8080
echo - Schema Registry: http://localhost:8081
echo - Grafana:         http://localhost:3000
echo - Prometheus:      http://localhost:9090
echo.
echo Kafka Brokers:
echo - kafka1: localhost:32090
echo - kafka2: localhost:32091
echo - kafka3: localhost:32092
echo.
pause
