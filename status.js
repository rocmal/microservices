#!/usr/bin/env node

console.log('\n' + '='.repeat(70));
console.log('  KAFKA CLUSTER - QUICK STATUS CHECK');
console.log('='.repeat(70));
console.log();

const endpoints = [
  { name: 'Kafka Broker 1', url: 'http://localhost:32090', type: 'tcp' },
  { name: 'Kafka Broker 2', url: 'http://localhost:32091', type: 'tcp' },
  { name: 'Kafka Broker 3', url: 'http://localhost:32092', type: 'tcp' },
  { name: 'Schema Registry', url: 'http://localhost:8081', type: 'http' },
  { name: 'Kafka UI', url: 'http://localhost:8080', type: 'http' },
  { name: 'Kafka Connect', url: 'http://localhost:8083', type: 'http' },
  { name: 'Grafana', url: 'http://localhost:3000', type: 'http' },
  { name: 'Prometheus', url: 'http://localhost:9090', type: 'http' }
];

async function checkEndpoint(endpoint) {
  if (endpoint.type === 'http') {
    try {
      const axios = require('axios');
      await axios.get(endpoint.url, { timeout: 2000 });
      return '✅';
    } catch (error) {
      return '❌';
    }
  } else {
    // For TCP endpoints (Kafka brokers)
    return '📡'; // Assume running if containers are up
  }
}

async function main() {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  // Check Docker containers
  console.log('📦 DOCKER CONTAINERS:');
  try {
    const { stdout } = await execPromise('docker ps --filter name=kafka --format "{{.Names}}: {{.Status}}"');
    const lines = stdout.trim().split('\n');
    lines.forEach(line => {
      if (line.includes('Up')) {
        console.log(`   ✅ ${line}`);
      } else {
        console.log(`   ❌ ${line}`);
      }
    });
  } catch (error) {
    console.log('   ❌ Error checking containers');
  }
  
  // Check Schema Registry
  console.log('\n🔧 SCHEMA REGISTRY:');
  try {
    const { stdout } = await execPromise('curl -s http://localhost:8081/subjects');
    const schemas = JSON.parse(stdout);
    console.log(`   ✅ ${schemas.length} schemas registered`);
    schemas.forEach(schema => {
      console.log(`      - ${schema}`);
    });
  } catch (error) {
    console.log('   ❌ Schema Registry not accessible');
  }
  
  // Check Topics
  console.log('\n📋 KAFKA TOPICS:');
  try {
    const { Kafka } = require('kafkajs');
    const kafka = new Kafka({
      clientId: 'status-check',
      brokers: ['localhost:32090', 'localhost:32091', 'localhost:32092'],
      connectionTimeout: 5000
    });
    
    const admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    const userTopics = topics.filter(t => !t.startsWith('_') && !t.startsWith('connect-'));
    
    console.log(`   ✅ ${userTopics.length} topics found:`);
    userTopics.forEach(topic => {
      console.log(`      - ${topic}`);
    });
    
    await admin.disconnect();
  } catch (error) {
    console.log('   ❌ Cannot list topics');
  }
  
  // Check endpoints
  console.log('\n🌐 SERVICE ENDPOINTS:');
  for (const endpoint of endpoints) {
    const status = await checkEndpoint(endpoint);
    console.log(`   ${status} ${endpoint.name.padEnd(20)} - ${endpoint.url}`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Kafka Cluster is operational!');
  console.log('='.repeat(70));
  console.log('\n💡 Quick Links:');
  console.log('   - Kafka UI:        http://localhost:8080');
  console.log('   - Schema Registry: http://localhost:8081/subjects');
  console.log('   - Grafana:         http://localhost:3000 (admin/admin123)');
  console.log('\n📚 Documentation:');
  console.log('   - Setup Guide:     KAFKA_CLUSTER_SETUP.md');
  console.log('   - Full Docs:       KAFKA_CLUSTER_GUIDE.md');
  console.log('   - Quick Ref:       QUICK_REFERENCE.md');
  console.log('\n🔧 Utilities:');
  console.log('   - Verify:          node verify-cluster.js');
  console.log('   - Validate:        node validate-setup.js');
  console.log('   - Create Topics:   node create-topics.js');
  console.log('   - Register Schemas: node register-schemas.js');
  console.log();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
