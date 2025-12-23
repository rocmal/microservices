const { Kafka } = require('kafkajs');
const fs = require('fs');
const path = require('path');

// Kafka cluster configuration
const kafka = new Kafka({
  clientId: 'topic-creator',
  brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
});

const admin = kafka.admin();

// Extract topic names from CSV files in confluent folder
function getTopicsFromConfluentFolder() {
  const confluentPath = path.join(__dirname, 'confluent');
  const files = fs.readdirSync(confluentPath);
  
  // Group by topic name (remove -key.csv and -value.csv suffix)
  const topics = new Set();
  files.forEach(file => {
    if (file.endsWith('-key.csv') || file.endsWith('-value.csv')) {
      const topicName = file.replace('-key.csv', '').replace('-value.csv', '');
      topics.add(topicName);
    }
  });
  
  return Array.from(topics);
}

async function createTopics() {
  try {
    console.log('🔗 Connecting to Kafka cluster...');
    await admin.connect();
    console.log('✅ Connected to Kafka cluster');

    // Get existing topics
    const existingTopics = await admin.listTopics();
    console.log('📋 Existing topics:', existingTopics);

    // Get topics from confluent folder
    const topicsToCreate = getTopicsFromConfluentFolder();
    console.log('\n📝 Topics found in confluent folder:', topicsToCreate);

    // Filter out topics that already exist
    const newTopics = topicsToCreate.filter(topic => !existingTopics.includes(topic));

    if (newTopics.length === 0) {
      console.log('\n✅ All topics already exist!');
      return;
    }

    console.log('\n🚀 Creating new topics:', newTopics);

    // Create topics with proper configuration for 3-broker cluster
    const topicConfigs = newTopics.map(topic => ({
      topic: topic,
      numPartitions: 3,
      replicationFactor: 3,
      configEntries: [
        { name: 'min.insync.replicas', value: '2' },
        { name: 'retention.ms', value: '604800000' }, // 7 days
        { name: 'cleanup.policy', value: 'delete' }
      ]
    }));

    await admin.createTopics({
      topics: topicConfigs,
      waitForLeaders: true
    });

    console.log('\n✅ Topics created successfully!');

    // List all topics after creation
    const allTopics = await admin.listTopics();
    console.log('\n📋 All topics in cluster:');
    allTopics.forEach((topic, index) => {
      console.log(`   ${index + 1}. ${topic}`);
    });

    // Get topic details
    console.log('\n📊 Topic configurations:');
    for (const topic of newTopics) {
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      const topicData = metadata.topics[0];
      console.log(`\n   ${topic}:`);
      console.log(`      - Partitions: ${topicData.partitions.length}`);
      console.log(`      - Replicas: ${topicData.partitions[0].replicas.length}`);
      console.log(`      - Leader: Node ${topicData.partitions[0].leader}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.retriable) {
      console.log('⚠️  Error is retriable. Make sure all Kafka brokers are running.');
    }
    process.exit(1);
  } finally {
    await admin.disconnect();
    console.log('\n👋 Disconnected from Kafka cluster');
  }
}

// Run the script
console.log('🎬 Kafka Topic Creator');
console.log('=' .repeat(50));
console.log('📍 Schema Registry URL: http://localhost:8081');
console.log('📍 Kafka Brokers:');
console.log('   - kafka1:32090 (localhost:32090)');
console.log('   - kafka2:32091 (localhost:32091)');
console.log('   - kafka3:32092 (localhost:32092)');
console.log('=' .repeat(50));
console.log();

createTopics().catch(console.error);
