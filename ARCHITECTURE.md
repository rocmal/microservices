# Kafka Cluster Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOST MACHINE                              │
│                      (Your Applications)                         │
│                                                                   │
│  Applications connect to:                                        │
│  • localhost:32090 (kafka1)                                      │
│  • localhost:32091 (kafka2)                                      │
│  • localhost:32092 (kafka3)                                      │
│  • http://localhost:8081 (Schema Registry)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Docker Network (monitoring)
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     KAFKA CLUSTER                                │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   kafka1     │  │   kafka2     │  │   kafka3     │          │
│  │              │  │              │  │              │          │
│  │ Port: 9092   │  │ Port: 9092   │  │ Port: 9092   │          │
│  │ Ext:  32090  │  │ Ext:  32091  │  │ Ext:  32092  │          │
│  │ JMX:  9991   │  │ JMX:  9992   │  │ JMX:  9993   │          │
│  │              │  │              │  │              │          │
│  │ Node ID: 1   │  │ Node ID: 2   │  │ Node ID: 3   │          │
│  │ (Controller) │  │ (Controller) │  │ (Controller) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                    KRaft Quorum                                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                  SCHEMA REGISTRY                                 │
│                                                                   │
│  ┌────────────────────────────────────────────────────┐         │
│  │   schema-registry:8081                              │         │
│  │                                                      │         │
│  │   • Stores Avro schemas                             │         │
│  │   • Connected to all 3 brokers                      │         │
│  │   • Schemas for 5 topics (key & value)              │         │
│  └────────────────────────────────────────────────────┘         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                  INTEGRATION SERVICES                            │
│                                                                   │
│  ┌──────────────────┐   ┌──────────────────┐                    │
│  │  Kafka Connect   │   │    Kafka UI      │                    │
│  │   Port: 8083     │   │   Port: 8080     │                    │
│  │                  │   │                  │                    │
│  │  • Sink/Source   │   │  • Web UI        │                    │
│  │  • JSON based    │   │  • Monitoring    │                    │
│  └──────────────────┘   └──────────────────┘                    │
│                                                                   │
│  ┌──────────────────┐                                            │
│  │   Logstash       │   Pipeline to TimescaleDB                 │
│  │                  │                                            │
│  └──────────────────┘                                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                  MONITORING STACK                                │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ JMX Exporter │  │Kafka Exporter│  │Node Exporter │          │
│  │  Port: 5556  │  │  Port: 9308  │  │  Port: 9100  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                           │                                      │
│                  ┌────────┴────────┐                            │
│                  │   Prometheus    │                            │
│                  │   Port: 9090    │                            │
│                  └────────┬────────┘                            │
│                           │                                      │
│                  ┌────────┴────────┐                            │
│                  │    Grafana      │                            │
│                  │   Port: 3000    │                            │
│                  │ admin/admin123  │                            │
│                  └─────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Topic Creation
```
CSV Files (confluent folder)
    ↓
create-topics.js
    ↓
Kafka Cluster
    ↓
Topics with 3 partitions, RF=3
```

### 2. Schema Registration
```
CSV Files (field definitions)
    ↓
register-schemas.js
    ↓
Avro Schema Generation
    ↓
Schema Registry
```

### 3. Message Production
```
Producer Application
    ↓
Schema Registry (encode with schema)
    ↓
Kafka Broker (any of 3)
    ↓
Replicated to all brokers
    ↓
Stored in partition
```

### 4. Message Consumption
```
Consumer Application
    ↓
Subscribe to topic
    ↓
Kafka Broker (reads from leader)
    ↓
Schema Registry (decode with schema)
    ↓
Process message
```

## Topics and Partitions

```
Topic: DL_RTEAVROQAOC
├── Partition 0 → Leader: kafka1, Replicas: [1, 2, 3]
├── Partition 1 → Leader: kafka2, Replicas: [2, 3, 1]
└── Partition 2 → Leader: kafka3, Replicas: [3, 1, 2]

Topic: OEORDHAVROQAOC
├── Partition 0 → Leader: kafka2, Replicas: [2, 3, 1]
├── Partition 1 → Leader: kafka3, Replicas: [3, 1, 2]
└── Partition 2 → Leader: kafka1, Replicas: [1, 2, 3]

Topic: OEORDLAVROQAOC
├── Partition 0 → Leader: kafka3, Replicas: [3, 1, 2]
├── Partition 1 → Leader: kafka1, Replicas: [1, 2, 3]
└── Partition 2 → Leader: kafka2, Replicas: [2, 3, 1]

Topic: SHIP_CODEAVROQAOC
├── Partition 0 → Leader: kafka1, Replicas: [1, 2, 3]
├── Partition 1 → Leader: kafka2, Replicas: [2, 3, 1]
└── Partition 2 → Leader: kafka3, Replicas: [3, 1, 2]

Topic: WMOPCKHAVROQAOC
├── Partition 0 → Leader: kafka2, Replicas: [2, 3, 1]
├── Partition 1 → Leader: kafka3, Replicas: [3, 1, 2]
└── Partition 2 → Leader: kafka1, Replicas: [1, 2, 3]
```

## Fault Tolerance Scenarios

### Scenario 1: One Broker Fails
```
Before:
kafka1 ✅  kafka2 ✅  kafka3 ✅
  │          │          │
  └──────────┴──────────┘
     All 3 replicas

After kafka2 fails:
kafka1 ✅  kafka2 ❌  kafka3 ✅
  │                      │
  └──────────────────────┘
    2 replicas (still available)

Status: ✅ Cluster operational
        ✅ Data still accessible
        ✅ New leader elected
        ⚠️  Replication factor = 2
```

### Scenario 2: Two Brokers Fail
```
kafka1 ✅  kafka2 ❌  kafka3 ❌
  │
  │ (Only 1 replica)

Status: ⚠️  Cluster degraded
        ⚠️  Cannot meet min.insync.replicas=2
        ❌ Writes blocked
        ✅ Reads still possible
```

## Network Communication

```
External Access (from host):
┌──────────────────────┐
│   Your Application   │
│                      │
└──────────┬───────────┘
           │
    ┌──────┴──────┬──────────┬─────────┐
    │             │          │         │
    ↓             ↓          ↓         ↓
localhost:32090  32091    32092    :8081
    │             │          │         │
    ↓             ↓          ↓         ↓
┌───────┐   ┌───────┐  ┌───────┐  ┌──────────┐
│kafka1 │   │kafka2 │  │kafka3 │  │ schema-  │
│ :9092 │   │ :9092 │  │ :9092 │  │ registry │
└───────┘   └───────┘  └───────┘  └──────────┘

Internal Communication (containers):
┌──────────────────────┐
│  Kafka Connect       │
└──────────┬───────────┘
           │
    kafka1:9092,kafka2:9092,kafka3:9092
           │
    ┌──────┴──────┬──────────┐
    ↓             ↓          ↓
┌───────┐   ┌───────┐  ┌───────┐
│kafka1 │───│kafka2 │──│kafka3 │
│ :9092 │   │ :9092 │  │ :9092 │
└───────┘   └───────┘  └───────┘
     │           │          │
     └───────────┴──────────┘
        Controller Quorum
       (KRaft - no Zookeeper)
```

## Schema Registry Integration

```
┌─────────────────────────────────────────────────┐
│           Schema Registry Storage               │
│                                                  │
│  Subject: DL_RTEAVROQAOC-key                    │
│    Version 1: Schema ID 1                       │
│      { "type": "record", "name": "..." }        │
│                                                  │
│  Subject: DL_RTEAVROQAOC-value                  │
│    Version 1: Schema ID 2                       │
│      { "type": "record", "fields": [...] }      │
│                                                  │
│  Subject: OEORDHAVROQAOC-key                    │
│    Version 1: Schema ID 3                       │
│                                                  │
│  Subject: OEORDHAVROQAOC-value                  │
│    Version 1: Schema ID 4                       │
│                                                  │
│  ... (10 schemas total)                         │
└─────────────────────────────────────────────────┘
```

## Port Summary

| Service | Internal | External | Purpose |
|---------|----------|----------|---------|
| kafka1 | 9092 | 32090 | Broker communication |
| kafka1 | 9093 | - | Controller (KRaft) |
| kafka1 | 9991 | 9991 | JMX metrics |
| kafka2 | 9092 | 32091 | Broker communication |
| kafka2 | 9093 | - | Controller (KRaft) |
| kafka2 | 9992 | 9992 | JMX metrics |
| kafka3 | 9092 | 32092 | Broker communication |
| kafka3 | 9093 | - | Controller (KRaft) |
| kafka3 | 9993 | 9993 | JMX metrics |
| Schema Registry | 8081 | 8081 | Schema API |
| Kafka Connect | 8083 | 8083 | Connect API |
| Kafka UI | 8080 | 8080 | Web interface |
| Grafana | 3000 | 3000 | Monitoring UI |
| Prometheus | 9090 | 9090 | Metrics collection |

## Resource Usage (Approximate)

```
Per Broker:
├── CPU: 0.5-1 core
├── Memory: 1-2 GB
└── Disk: Varies by data retention

Total Cluster:
├── CPU: 1.5-3 cores
├── Memory: 3-6 GB
└── Network: Internal Docker network

Recommended Host:
├── CPU: 4+ cores
├── Memory: 8+ GB RAM
└── Disk: SSD recommended
```

---
**Documentation**: See [KAFKA_CLUSTER_GUIDE.md](KAFKA_CLUSTER_GUIDE.md) for detailed setup and usage instructions
