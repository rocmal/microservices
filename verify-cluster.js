const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'cluster-verifier',
  brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092']
});

const admin = kafka.admin();

async function verifyCluster() {
  try {
    console.log('🔍 Verifying Kafka Cluster Status...');
    console.log('=' .repeat(60));
    
    await admin.connect();
    console.log('✅ Successfully connected to cluster\n');

    // Get cluster info
    const cluster = await admin.describeCluster();
    console.log('📊 Cluster Information:');
    console.log(`   - Cluster ID: ${cluster.clusterId}`);
    console.log(`   - Controller: Node ${cluster.controller}`);
    console.log(`   - Brokers: ${cluster.brokers.length}\n`);
    
    console.log('🖥️  Broker Details:');
    cluster.brokers.forEach(broker => {
      console.log(`   - Node ${broker.nodeId}: ${broker.host}:${broker.port}`);
    });
    console.log();

    // List all topics
    const topics = await admin.listTopics();
    console.log(`📋 Topics (${topics.length} total):`);
    
    for (const topic of topics) {
      if (!topic.startsWith('_') && !topic.startsWith('connect-')) {
        const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
        const topicData = metadata.topics[0];
        console.log(`\n   📌 ${topic}`);
        console.log(`      - Partitions: ${topicData.partitions.length}`);
        console.log(`      - Replication Factor: ${topicData.partitions[0].replicas.length}`);
        console.log(`      - ISR: ${topicData.partitions[0].isr.length} replicas in sync`);
        
        // Show partition distribution
        console.log(`      - Partition Leaders:`);
        topicData.partitions.forEach(partition => {
          console.log(`         Partition ${partition.partitionId}: Leader Node ${partition.leader}`);
        });
      }
    }

    // Check Schema Registry
    console.log('\n🔧 Schema Registry:');
    console.log('   - URL: http://localhost:8081');
    console.log('   - Status: Check http://localhost:8081/subjects for registered schemas');

    console.log('\n✅ Cluster verification complete!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Cannot connect to Kafka cluster.');
      console.log('   Make sure the cluster is running:');
      console.log('   - Run: docker-compose up -d');
      console.log('   - Check: docker-compose ps');
    }
  } finally {
    await admin.disconnect();
  }
}

verifyCluster().catch(console.error);
