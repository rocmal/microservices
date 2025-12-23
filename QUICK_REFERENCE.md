# 🚀 Kafka Cluster - Quick Reference

## 📋 Quick Start
```bash
# Complete setup (recommended)
setup-kafka-cluster.bat

# OR step-by-step
docker-compose up -d
timeout /t 60
node create-topics.js
node register-schemas.js
```

## 🔌 Connection Strings

### From Host Machine
```javascript
brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
```

### From Docker Containers
```javascript
brokers: ['kafka1:9092', 'kafka2:9092', 'kafka3:9092']
```

### Schema Registry
```
Host:      http://localhost:8081
Container: http://schema-registry:8081
```

## 📊 Topics Created
- `DL_RTEAVROQAOC`
- `OEORDHAVROQAOC`
- `OEORDLAVROQAOC`
- `SHIP_CODEAVROQAOC`
- `WMOPCKHAVROQAOC`

**Configuration:** 3 partitions, replication factor 3, min ISR 2

## 🌐 Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Kafka UI | http://localhost:8080 | - |
| Schema Registry | http://localhost:8081 | - |
| Grafana | http://localhost:3000 | admin/admin123 |
| Prometheus | http://localhost:9090 | - |
| Kafka Connect | http://localhost:8083 | - |

## 🛠️ Useful Commands

### Verification
```bash
node verify-cluster.js          # Check cluster health
check-cluster.bat               # Quick check with dependencies
docker-compose ps               # View running containers
docker-compose logs kafka1      # View broker logs
```

### Topic Management
```bash
node create-topics.js           # Create topics from CSV files

# Manual topic creation
docker exec -it kafka1 kafka-topics \
  --bootstrap-server localhost:9092 \
  --create --topic my-topic \
  --partitions 3 --replication-factor 3
```

### Schema Management
```bash
node register-schemas.js        # Register schemas from CSV files

# View schemas
curl http://localhost:8081/subjects

# Get schema details
curl http://localhost:8081/subjects/DL_RTEAVROQAOC-value/versions/latest
```

### Docker Commands
```bash
docker-compose up -d            # Start all services
docker-compose down             # Stop all services
docker-compose restart kafka1   # Restart a broker
docker-compose logs -f kafka1   # Follow logs
```

## 💻 Code Examples

### Producer
```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'my-app',
  brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
});

const producer = kafka.producer();
await producer.connect();
await producer.send({
  topic: 'DL_RTEAVROQAOC',
  messages: [{ key: 'key1', value: 'Hello!' }]
});
```

### Consumer
```javascript
const consumer = kafka.consumer({ groupId: 'my-group' });
await consumer.connect();
await consumer.subscribe({ topic: 'DL_RTEAVROQAOC' });
await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    console.log(message.value.toString());
  }
});
```

### With Schema Registry
```javascript
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

const registry = new SchemaRegistry({ 
  host: 'http://localhost:8081' 
});

// Encode with schema
const id = await registry.getLatestSchemaId('DL_RTEAVROQAOC-value');
const payload = await registry.encode(id, data);
```

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Use correct ports: 32090/32091/32092 from host |
| Cluster not starting | `docker-compose down -v && docker-compose up -d` |
| Topics not creating | Wait 60+ seconds, then run `node create-topics.js` |
| Schema Registry 404 | Check: `docker-compose logs schema-registry` |

## 📦 Files Created
- ✅ `docker-compose.yml` - Updated with 3-broker cluster
- ✅ `create-topics.js` - Topic creation script
- ✅ `verify-cluster.js` - Health check script
- ✅ `register-schemas.js` - Schema registration script
- ✅ `setup-kafka-cluster.bat` - Automated setup
- ✅ `check-cluster.bat` - Quick health check
- ✅ `KAFKA_CLUSTER_GUIDE.md` - Full documentation
- ✅ `KAFKA_CLUSTER_SETUP.md` - Setup summary
- ✅ `package.json` - Updated with axios dependency

## 🎯 High Availability
- ✅ 3 brokers with replication factor 3
- ✅ Can survive 1 broker failure
- ✅ Automatic leader election
- ✅ Load balancing across partitions

---
**Need help?** See [KAFKA_CLUSTER_GUIDE.md](KAFKA_CLUSTER_GUIDE.md) for detailed documentation
