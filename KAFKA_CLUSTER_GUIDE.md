# Kafka Cluster Setup Guide

## Architecture Overview

This setup includes:
- **3-broker Kafka cluster** running in KRaft mode (no Zookeeper)
- **Confluent Schema Registry** for schema management
- **Kafka Connect** for data integration
- **Kafka UI** for cluster management
- **Full monitoring stack** (Prometheus + Grafana)

## Kafka Cluster Configuration

### Brokers
| Broker | Internal Port | External Port | JMX Port |
|--------|--------------|---------------|----------|
| kafka1 | 9092 | 32090 | 9991 |
| kafka2 | 9092 | 32091 | 9992 |
| kafka3 | 9092 | 32092 | 9993 |

### Connection Strings

**From host machine:**
```
localhost:32090,localhost:32091,localhost:32092
```

**From Docker containers:**
```
kafka1:9092,kafka2:9092,kafka3:9092
```

### Schema Registry
- **URL**: http://localhost:8081
- **API Docs**: http://localhost:8081/subjects

## Quick Start

### 1. Start the Full Cluster
```bash
# Automated setup (recommended)
setup-kafka-cluster.bat

# OR Manual setup
docker-compose up -d
```

### 2. Create Topics from Confluent Folder
The topics are automatically created based on CSV files in the `confluent/` folder:
- `DL_RTEAVROQAOC`
- `OEORDHAVROQAOC`
- `OEORDLAVROQAOC`
- `SHIP_CODEAVROQAOC`
- `WMOPCKHAVROQAOC`

```bash
# Create topics
node create-topics.js
```

### 3. Verify Cluster Status
```bash
node verify-cluster.js
```

## Topic Configuration

All topics are created with:
- **Partitions**: 3 (one per broker)
- **Replication Factor**: 3 (all brokers)
- **Min ISR**: 2 (minimum in-sync replicas)
- **Retention**: 7 days

This ensures high availability and fault tolerance.

## Access Points

### Web Interfaces
- **Kafka UI**: http://localhost:8080
- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Schema Registry**: http://localhost:8081

### APIs
- **Kafka Connect**: http://localhost:8083
- **Schema Registry**: http://localhost:8081

## Using the Cluster

### Producer Example (Node.js)
```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'my-producer',
  brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
});

const producer = kafka.producer();

await producer.connect();
await producer.send({
  topic: 'DL_RTEAVROQAOC',
  messages: [
    { key: 'key1', value: 'Hello Kafka Cluster!' }
  ]
});
await producer.disconnect();
```

### Consumer Example (Node.js)
```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'my-consumer',
  brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
});

const consumer = kafka.consumer({ groupId: 'test-group' });

await consumer.connect();
await consumer.subscribe({ topic: 'DL_RTEAVROQAOC', fromBeginning: true });

await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    console.log({
      topic,
      partition,
      value: message.value.toString()
    });
  }
});
```

### Using Schema Registry

**Register a schema:**
```bash
curl -X POST http://localhost:8081/subjects/DL_RTEAVROQAOC-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"schema": "{\"type\": \"record\", \"name\": \"MyRecord\", \"fields\": [{\"name\": \"field1\", \"type\": \"string\"}]}"}'
```

**List all schemas:**
```bash
curl http://localhost:8081/subjects
```

**Get latest schema version:**
```bash
curl http://localhost:8081/subjects/DL_RTEAVROQAOC-value/versions/latest
```

## Management Commands

### Docker Commands
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f kafka1 kafka2 kafka3

# Restart a broker
docker-compose restart kafka1

# Check status
docker-compose ps
```

### Kafka Commands (from inside container)
```bash
# Enter kafka1 container
docker exec -it kafka1 bash

# List topics
kafka-topics --bootstrap-server localhost:9092 --list

# Describe a topic
kafka-topics --bootstrap-server localhost:9092 --describe --topic DL_RTEAVROQAOC

# Produce messages
kafka-console-producer --bootstrap-server localhost:9092 --topic DL_RTEAVROQAOC

# Consume messages
kafka-console-consumer --bootstrap-server localhost:9092 --topic DL_RTEAVROQAOC --from-beginning
```

## Monitoring

### Grafana Dashboards
Access Grafana at http://localhost:3000 with:
- Username: `admin`
- Password: `admin123`

Available metrics:
- Kafka broker metrics (JMX)
- Consumer lag metrics
- System metrics (CPU, memory, disk)
- Topic and partition metrics

### Prometheus Metrics
- **Kafka JMX**: http://localhost:5556/metrics
- **Kafka Exporter**: http://localhost:9308/metrics
- **Node Exporter**: http://localhost:9100/metrics

## Troubleshooting

### Cluster won't start
```bash
# Check logs
docker-compose logs kafka1 kafka2 kafka3

# Remove old data and restart
docker-compose down -v
docker-compose up -d
```

### Topics not created
```bash
# Check broker connectivity
node verify-cluster.js

# Manually create topic
docker exec -it kafka1 kafka-topics \
  --bootstrap-server localhost:9092 \
  --create --topic test-topic \
  --partitions 3 --replication-factor 3
```

### Connection refused
Make sure to use the correct ports:
- **From host**: `localhost:32090,localhost:32091,localhost:32092`
- **From Docker**: `kafka1:9092,kafka2:9092,kafka3:9092`

### Schema Registry not accessible
```bash
# Check Schema Registry logs
docker-compose logs schema-registry

# Test connectivity
curl http://localhost:8081/subjects
```

## High Availability

With 3 brokers and replication factor of 3:
- The cluster can tolerate **1 broker failure** without data loss
- With min.insync.replicas=2, writes succeed with 2 brokers available
- All partitions have replicas on all 3 brokers

### Testing Failover
```bash
# Stop one broker
docker-compose stop kafka2

# Verify cluster still works
node verify-cluster.js

# Restart broker
docker-compose start kafka2
```

## Performance Tuning

### Producer Settings
```javascript
const producer = kafka.producer({
  maxInFlightRequests: 5,
  idempotent: true,
  transactionalId: 'my-transactional-id',
  acks: -1  // Wait for all replicas
});
```

### Consumer Settings
```javascript
const consumer = kafka.consumer({
  groupId: 'my-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576
});
```

## Cleanup

```bash
# Stop and remove all containers
docker-compose down

# Stop and remove all containers + volumes (WARNING: deletes all data)
docker-compose down -v
```

## Additional Resources

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Confluent Schema Registry](https://docs.confluent.io/platform/current/schema-registry/index.html)
- [KafkaJS Documentation](https://kafka.js.org/)
- [Kafka UI](https://github.com/provectus/kafka-ui)
