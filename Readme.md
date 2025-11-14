# Kafka Microservices with MySQL Persistence

A complete microservices data generator using Kafka for event streaming and MySQL for data persistence.

## 🏗️ Architecture

```
Producer (Generates Data)
    ↓
Kafka Topics (customers, orders, payments)
    ↓
Consumer (Reads & Persists)
    ↓
MySQL Database
```

## 📁 Project Structure

```
kafka-microservices/
├── docker-compose.yml      # Kafka & MySQL containers
├── package.json            # Node.js dependencies
├── db-config.js           # MySQL connection config
├── setup-database.js      # Database initialization
├── producer.js            # Data generator (Kafka producer)
├── consumer.js            # Data consumer (saves to MySQL)
├── query-data.js          # Query and display data
└── README.md             # This file
```

## 🚀 Quick Start

### 1. Start Docker Containers
```bash
docker-compose up -d
```

Wait for MySQL to be healthy (about 30 seconds):
```bash
docker ps
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Database Tables
```bash
npm run setup
```

### 4. Create Kafka Topics
```bash
# Create customers topic
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --create --topic customers \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1

# Create orders topic
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --create --topic orders \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1

# Create payments topic
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --create --topic payments \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

### 5. Run the Application

**Terminal 1 - Start Consumer:**
```bash
npm run consumer
```

**Terminal 2 - Start Producer:**
```bash
npm run producer
```

**Terminal 3 - View Statistics (optional):**
```bash
npm run query
```

## 📊 Database Schema

### Customers Table
```sql
CREATE TABLE customers (
  customer_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  country VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Orders Table
```sql
CREATE TABLE orders (
  order_id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);
```

### Order Items Table
```sql
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(255) NOT NULL,
  product_id VARCHAR(255) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);
```

### Payments Table
```sql
CREATE TABLE payments (
  payment_id VARCHAR(255) PRIMARY KEY,
  order_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  card_type VARCHAR(50),
  last_4_digits VARCHAR(4),
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);
```

## 🔍 Querying Data

### Using the Query Script
```bash
# View statistics and recent records
npm run query

# View specific customer details
npm run query <customer-id>
```

### Using MySQL CLI
```bash
# Connect to MySQL
docker exec -it mysql mysql -uadmin -padmin123 microservices

# View all customers
SELECT * FROM customers ORDER BY created_at DESC LIMIT 10;

# View orders with customer names
SELECT 
  o.order_id, 
  c.name as customer_name, 
  o.total_amount, 
  o.status, 
  o.order_date
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
ORDER BY o.order_date DESC
LIMIT 10;

# View order details with items
SELECT 
  o.order_id,
  c.name as customer_name,
  oi.product_name,
  oi.quantity,
  oi.price,
  (oi.quantity * oi.price) as item_total
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id
JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.order_id = 'your-order-id';

# View payments
SELECT * FROM payments ORDER BY transaction_date DESC LIMIT 10;

# Get total revenue
SELECT SUM(amount) as total_revenue 
FROM payments 
WHERE status = 'completed';

# Get average order value
SELECT AVG(total_amount) as avg_order_value FROM orders;

# Get top customers by order count
SELECT 
  c.customer_id,
  c.name,
  c.email,
  COUNT(o.order_id) as order_count,
  SUM(o.total_amount) as total_spent
FROM customers c
LEFT JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.name, c.email
ORDER BY total_spent DESC
LIMIT 10;
```

## 🛠️ Configuration

### MySQL Configuration (db-config.js)
```javascript
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'admin',
  password: 'admin123',
  database: 'microservices'
};
```

### Kafka Configuration
- Broker: `localhost:9092`
- Topics: `customers`, `orders`, `payments`
- Consumer Groups: `customer-group`, `order-group`, `payment-group`

## 📈 Monitoring

### Check Kafka Topics
```bash
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh \
  --list --bootstrap-server localhost:9092
```

### View Kafka Messages
```bash
# View customer messages
docker exec -it kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic customers \
  --from-beginning

# View order messages
docker exec -it kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic orders \
  --from-beginning
```

### Check MySQL Tables
```bash
docker exec -it mysql mysql -uadmin -padmin123 microservices -e "SHOW TABLES;"
```

### View Record Counts
```bash
docker exec -it mysql mysql -uadmin -padmin123 microservices -e "
SELECT 
  (SELECT COUNT(*) FROM customers) as customers,
  (SELECT COUNT(*) FROM orders) as orders,
  (SELECT COUNT(*) FROM order_items) as order_items,
  (SELECT COUNT(*) FROM payments) as payments;
"
```

## 🐛 Troubleshooting

### Kafka Connection Issues
```bash
# Check if Kafka is running
docker ps

# View Kafka logs
docker logs kafka

# Restart Kafka
docker restart kafka
```

### MySQL Connection Issues
```bash
# Check if MySQL is running
docker ps

# View MySQL logs
docker logs mysql

# Test MySQL connection
docker exec -it mysql mysql -uadmin -padmin123 -e "SELECT 1;"
```

### Reset Everything
```bash
# Stop all containers
docker-compose down

# Remove volumes (deletes all data)
docker-compose down -v

# Start fresh
docker-compose up -d
npm run setup
```

## 🎯 Features

- ✅ Real-time data generation with Faker.js
- ✅ Event streaming with Kafka
- ✅ Data persistence with MySQL
- ✅ Complete customer, order, and payment workflow
- ✅ Transactional data integrity
- ✅ Scalable microservices architecture
- ✅ Docker containerization
- ✅ Data querying and analytics

## 📝 Notes

- Producer generates new data every 5 seconds
- Consumer automatically saves data to MySQL
- All timestamps are in ISO format
- Foreign key constraints ensure data integrity
- Duplicate records are handled gracefully

## 🚦 Stopping the Application

```bash
# Stop producers/consumers
Ctrl + C in each terminal

# Stop Docker containers
docker-compose down

# Stop and remove all data
docker-compose down -v
```

## 📚 Next Steps

1. Add REST APIs for each microservice
2. Implement data validation
3. Add monitoring with Prometheus/Grafana
4. Implement SAGA pattern for distributed transactions
5. Add data backup strategies
6. Implement caching with Redis
7. Add authentication and authorization
8. Deploy to production environment

#For Sink connectors 

curl -X POST -H "Content-Type: application/json" \
 --data @sink-connector/timescale-customer-sink.json \
 http://localhost:8083/connectors

curl -X POST -H "Content-Type: application/json" \
 --data @sink-connector/timescale-revenue-sink.json \
 http://localhost:8083/connectors
