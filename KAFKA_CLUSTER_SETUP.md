# Kafka Cluster Setup - Configuration Summary

## ✅ What Has Been Configured

### 1. **3-Broker Kafka Cluster**
   - **kafka1**: localhost:32090 (Internal: kafka1:9092, JMX: 9991)
   - **kafka2**: localhost:32091 (Internal: kafka2:9092, JMX: 9992)
   - **kafka3**: localhost:32092 (Internal: kafka3:9092, JMX: 9993)
   
   **Features:**
   - Running in KRaft mode (no Zookeeper required)
   - 3-node cluster for high availability
   - Replication factor: 3 (all brokers)
   - Min in-sync replicas: 2

### 2. **Confluent Schema Registry**
   - **URL**: http://localhost:8081
   - Integrated with all 3 Kafka brokers
   - Available in Kafka UI for schema management

### 3. **Topics Based on Confluent Folder CSV Files**
   The following topics will be created automatically:
   
   | Topic Name | Based On CSV Files | Partitions | Replication |
   |------------|-------------------|------------|-------------|
   | DL_RTEAVROQAOC | DL_RTEAVROQAOC-key.csv, DL_RTEAVROQAOC-value.csv | 3 | 3 |
   | OEORDHAVROQAOC | OEORDHAVROQAOC-key.csv, OEORDHAVROQAOC-value.csv | 3 | 3 |
   | OEORDLAVROQAOC | OEORDLAVROQAOC-key.csv, OEORDLAVROQAOC-value.csv | 3 | 3 |
   | SHIP_CODEAVROQAOC | SHIP_CODEAVROQAOC-key.csv, SHIP_CODEAVROQAOC-value.csv | 3 | 3 |
   | WMOPCKHAVROQAOC | WMOPCKHAVROQAOC-key.csv, WMOPCKHAVROQAOC-value.csv | 3 | 3 |

### 4. **Updated Services**
   All services have been updated to use the 3-broker cluster:
   - ✅ Kafka Connect
   - ✅ Kafka UI (with Schema Registry integration)
   - ✅ Logstash
   - ✅ JMX Exporter
   - ✅ Kafka Exporter (monitoring all 3 brokers)

### 5. **Helper Scripts Created**

   | Script | Purpose |
   |--------|---------|
   | `setup-kafka-cluster.bat` | Complete automated setup |
   | `create-topics.js` | Creates topics from confluent folder |
   | `verify-cluster.js` | Verifies cluster status and health |
   | `check-cluster.bat` | Quick health check with dependency verification |

## 🚀 Quick Start Commands

### Option 1: Automated Setup (Recommended)
```bash
setup-kafka-cluster.bat
```
This will:
1. Stop existing containers
2. Start the 3-broker cluster + Schema Registry
3. Wait for cluster initialization (60 seconds)
4. Create all topics automatically
5. Start remaining services

### Option 2: Manual Setup
```bash
# Start all services
docker-compose up -d

# Wait 60 seconds for cluster to be ready, then create topics
timeout /t 60
node create-topics.js

# Verify cluster
node verify-cluster.js
```

### Option 3: Step-by-Step
```bash
# Start Kafka cluster only
docker-compose up -d kafka1 kafka2 kafka3 schema-registry

# Wait and verify
timeout /t 60
node verify-cluster.js

# Create topics
node create-topics.js

# Start remaining services
docker-compose up -d
```

## 🔍 Verification

### Check Cluster Status
```bash
node verify-cluster.js
# OR
check-cluster.bat
```

### Access Kafka UI
Open browser to: **http://localhost:8080**
- View all brokers
- See topic configurations
- Monitor messages
- Manage schemas

### Access Schema Registry
Open browser to: **http://localhost:8081/subjects**
- List all registered schemas
- View schema versions
- Test schema compatibility

## 📊 Connection Strings

### From Host Machine (Your Applications)
```javascript
const kafka = new Kafka({
  brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
});
```

### From Docker Containers
```javascript
const kafka = new Kafka({
  brokers: ['kafka1:9092', 'kafka2:9092', 'kafka3:9092']
});
```

### Schema Registry URL
```
http://localhost:8081        (from host)
http://schema-registry:8081  (from containers)
```

## 🎯 Next Steps

1. **Start the cluster:**
   ```bash
   setup-kafka-cluster.bat
   ```

2. **Verify everything is working:**
   ```bash
   node verify-cluster.js
   ```

3. **Access Kafka UI:**
   Open http://localhost:8080

4. **Test with a producer:**
   ```bash
   node producer.js
   ```

5. **Test with a consumer:**
   ```bash
   node consumer.js
   ```

## 🛠️ Configuration Changes Summary

### docker-compose.yml Changes:
- ✅ Replaced single `kafka` service with `kafka1`, `kafka2`, `kafka3`
- ✅ Added `schema-registry` service
- ✅ Updated all broker references in dependent services
- ✅ Configured proper replication factors (3) for all services
- ✅ Set up JMX monitoring for all 3 brokers
- ✅ Configured Kafka UI with Schema Registry integration

### New Files Created:
- ✅ `create-topics.js` - Automatic topic creation from CSV files
- ✅ `verify-cluster.js` - Cluster health verification
- ✅ `setup-kafka-cluster.bat` - Automated setup script
- ✅ `check-cluster.bat` - Quick health check
- ✅ `KAFKA_CLUSTER_GUIDE.md` - Complete documentation
- ✅ `KAFKA_CLUSTER_SETUP.md` - This summary document

## 📈 High Availability Features

- **Fault Tolerance**: Can survive 1 broker failure
- **Load Balancing**: Partitions distributed across 3 brokers
- **Data Durability**: 3x replication for all data
- **No Single Point of Failure**: All brokers act as controllers

## 🔧 Monitoring Stack

All monitoring services remain active:
- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **JMX Exporter**: http://localhost:5556/metrics
- **Kafka Exporter**: http://localhost:9308/metrics
- **Node Exporter**: http://localhost:9100/metrics

## 📝 Important Notes

1. **Wait Time**: Always wait 60+ seconds after starting before creating topics
2. **Port Conflicts**: Ensure ports 32090, 32091, 32092, 8081 are free
3. **Resources**: 3-broker cluster requires more memory (recommended: 8GB+ RAM)
4. **Data Persistence**: Kafka data is stored in Docker volumes
5. **Dependencies**: KafkaJS is already in package.json

## 🆘 Troubleshooting

### Cluster won't start?
```bash
docker-compose logs kafka1 kafka2 kafka3
```

### Topics not creating?
```bash
# Ensure brokers are ready
node verify-cluster.js

# Try manual creation
docker exec -it kafka1 kafka-topics --bootstrap-server localhost:9092 --list
```

### Connection refused?
- Check you're using correct ports (32090/32091/32092 from host)
- Verify brokers are running: `docker-compose ps`
- Check logs: `docker-compose logs kafka1`

---

**Setup Status**: ✅ Configuration Complete - Ready to run `setup-kafka-cluster.bat`
