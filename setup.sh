#!/bin/bash

echo "🚀 Setting up Kafka Microservices with MySQL..."
echo "================================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check if Docker is running
echo -e "\n${YELLOW}Step 1: Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Step 2: Start containers
echo -e "\n${YELLOW}Step 2: Starting Docker containers...${NC}"
docker-compose up -d
echo -e "${GREEN}✅ Containers started${NC}"

# Step 3: Wait for MySQL to be ready
echo -e "\n${YELLOW}Step 3: Waiting for MySQL to be ready...${NC}"
echo "This may take 30-60 seconds..."
for i in {1..60}; do
    if docker exec mysql mysqladmin ping -h localhost --silent 2>/dev/null; then
        echo -e "${GREEN}✅ MySQL is ready${NC}"
        break
    fi
    echo -n "."
    sleep 1
done

# Step 4: Install Node dependencies
echo -e "\n${YELLOW}Step 4: Installing Node.js dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 5: Setup database
echo -e "\n${YELLOW}Step 5: Setting up database tables...${NC}"
npm run setup
echo -e "${GREEN}✅ Database tables created${NC}"

# Step 6: Create Kafka topics
echo -e "\n${YELLOW}Step 6: Creating Kafka topics...${NC}"

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --create --topic customers \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1 \
  --if-not-exists 2>/dev/null

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --create --topic orders \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1 \
  --if-not-exists 2>/dev/null

docker exec kafka /opt/kafka/bin/kafka-topics.sh \
  --create --topic payments \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1 \
  --if-not-exists 2>/dev/null

echo -e "${GREEN}✅ Kafka topics created${NC}"

# Step 7: Verify setup
echo -e "\n${YELLOW}Step 7: Verifying setup...${NC}"

# Check Kafka topics
TOPICS=$(docker exec kafka /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092 2>/dev/null)
echo "Kafka topics:"
echo "$TOPICS"

# Check MySQL tables
echo -e "\nMySQL tables:"
docker exec mysql mysql -uadmin -padmin123 microservices -e "SHOW TABLES;" 2>/dev/null

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo -e "\n${YELLOW}To run the application:${NC}"
echo "  Terminal 1: npm run consumer"
echo "  Terminal 2: npm run producer"
echo "  Terminal 3: npm run query (to view data)"
echo -e "\n${YELLOW}To stop:${NC}"
echo "  docker-compose down"
echo -e "${GREEN}================================================${NC}"