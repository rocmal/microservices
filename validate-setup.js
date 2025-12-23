const { Kafka } = require('kafkajs');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KAFKA_BROKERS = ['localhost:32090', 'localhost:32091', 'localhost:32092'];
const SCHEMA_REGISTRY_URL = 'http://localhost:8081';

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

function log(status, message) {
  const symbols = {
    success: '✅',
    error: '❌',
    warning: '⚠️ ',
    info: 'ℹ️ '
  };
  console.log(`${symbols[status]} ${message}`);
}

async function validateKafkaBrokers() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VALIDATING KAFKA BROKERS');
  console.log('='.repeat(60));
  
  const kafka = new Kafka({
    clientId: 'validator',
    brokers: KAFKA_BROKERS,
    connectionTimeout: 10000,
    requestTimeout: 10000
  });
  
  const admin = kafka.admin();
  
  try {
    log('info', 'Connecting to Kafka cluster...');
    await admin.connect();
    log('success', 'Connected to Kafka cluster');
    
    // Get cluster info
    const cluster = await admin.describeCluster();
    log('success', `Cluster ID: ${cluster.clusterId}`);
    log('success', `Controller: Node ${cluster.controller}`);
    log('success', `Number of brokers: ${cluster.brokers.length}`);
    
    console.log('\n📊 Broker Details:');
    cluster.brokers.forEach(broker => {
      log('success', `Node ${broker.nodeId}: ${broker.host}:${broker.port}`);
    });
    
    if (cluster.brokers.length !== 3) {
      log('error', `Expected 3 brokers, found ${cluster.brokers.length}`);
      return false;
    }
    
    // List topics
    const topics = await admin.listTopics();
    console.log(`\n📋 Topics found: ${topics.length}`);
    
    await admin.disconnect();
    return true;
    
  } catch (error) {
    log('error', `Kafka connection failed: ${error.message}`);
    if (error.code === 'ECONNREFUSED') {
      log('warning', 'Make sure Kafka brokers are running:');
      console.log('   Run: docker-compose up -d kafka1 kafka2 kafka3');
    }
    return false;
  }
}

async function validateSchemaRegistry() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VALIDATING SCHEMA REGISTRY');
  console.log('='.repeat(60));
  
  try {
    log('info', `Testing connection to ${SCHEMA_REGISTRY_URL}...`);
    
    // Test connectivity
    const response = await axios.get(`${SCHEMA_REGISTRY_URL}/subjects`, {
      timeout: 5000
    });
    
    log('success', 'Schema Registry is accessible');
    log('success', `Status Code: ${response.status}`);
    
    const subjects = response.data;
    log('info', `Registered schemas: ${subjects.length}`);
    
    if (subjects.length > 0) {
      console.log('\n📌 Registered Schemas:');
      for (const subject of subjects) {
        try {
          const versionResponse = await axios.get(
            `${SCHEMA_REGISTRY_URL}/subjects/${subject}/versions/latest`
          );
          log('success', `${subject} (v${versionResponse.data.version}, ID: ${versionResponse.data.id})`);
        } catch (err) {
          log('warning', `${subject} (error fetching details)`);
        }
      }
    } else {
      log('warning', 'No schemas registered yet. Run: node register-schemas.js');
    }
    
    return true;
    
  } catch (error) {
    log('error', `Schema Registry connection failed: ${error.message}`);
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      log('warning', 'Make sure Schema Registry is running:');
      console.log('   Run: docker-compose up -d schema-registry');
      console.log('   Check logs: docker logs schema-registry');
    }
    return false;
  }
}

async function validateTopics() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VALIDATING TOPICS');
  console.log('='.repeat(60));
  
  const kafka = new Kafka({
    clientId: 'validator',
    brokers: KAFKA_BROKERS
  });
  
  const admin = kafka.admin();
  
  try {
    await admin.connect();
    
    // Get expected topics from confluent folder
    const confluentPath = path.join(__dirname, 'confluent');
    const files = fs.readdirSync(confluentPath);
    const expectedTopics = new Set();
    
    files.forEach(file => {
      if (file.endsWith('-key.csv') || file.endsWith('-value.csv')) {
        const topicName = file.replace('-key.csv', '').replace('-value.csv', '');
        expectedTopics.add(topicName);
      }
    });
    
    log('info', `Expected topics from confluent folder: ${expectedTopics.size}`);
    
    // Get actual topics
    const topics = await admin.listTopics();
    const userTopics = topics.filter(t => !t.startsWith('_') && !t.startsWith('connect-'));
    
    log('info', `Actual topics in cluster: ${userTopics.length}`);
    
    // Check each expected topic
    console.log('\n📊 Topic Status:');
    for (const expectedTopic of expectedTopics) {
      if (topics.includes(expectedTopic)) {
        const metadata = await admin.fetchTopicMetadata({ topics: [expectedTopic] });
        const topicData = metadata.topics[0];
        
        log('success', `${expectedTopic}`);
        console.log(`     - Partitions: ${topicData.partitions.length}`);
        console.log(`     - Replication Factor: ${topicData.partitions[0].replicas.length}`);
        console.log(`     - ISR: ${topicData.partitions[0].isr.length}`);
        
        // Validate configuration
        if (topicData.partitions.length !== 3) {
          log('warning', `     Expected 3 partitions, found ${topicData.partitions.length}`);
        }
        if (topicData.partitions[0].replicas.length !== 3) {
          log('warning', `     Expected replication factor 3, found ${topicData.partitions[0].replicas.length}`);
        }
      } else {
        log('error', `${expectedTopic} - NOT FOUND`);
        log('warning', '     Run: node create-topics.js');
      }
    }
    
    await admin.disconnect();
    return expectedTopics.size === userTopics.length;
    
  } catch (error) {
    log('error', `Topic validation failed: ${error.message}`);
    return false;
  }
}

async function validateDockerContainers() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VALIDATING DOCKER CONTAINERS');
  console.log('='.repeat(60));
  
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    const { stdout } = await execPromise('docker-compose ps --format json');
    const containers = stdout.trim().split('\n').map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    const requiredServices = ['kafka1', 'kafka2', 'kafka3', 'schema-registry'];
    const runningServices = new Set(containers.filter(c => c.State === 'running').map(c => c.Service));
    
    console.log('\n📦 Container Status:');
    for (const service of requiredServices) {
      if (runningServices.has(service)) {
        log('success', `${service} is running`);
      } else {
        log('error', `${service} is NOT running`);
      }
    }
    
    // Optional services
    const optionalServices = ['kafka-ui', 'kafka-connect', 'prometheus', 'grafana'];
    console.log('\n📦 Optional Services:');
    for (const service of optionalServices) {
      if (runningServices.has(service)) {
        log('success', `${service} is running`);
      } else {
        log('info', `${service} is not running (optional)`);
      }
    }
    
    return requiredServices.every(s => runningServices.has(s));
    
  } catch (error) {
    log('error', `Docker validation failed: ${error.message}`);
    log('warning', 'Make sure Docker is running and containers are started');
    return false;
  }
}

async function validateCSVFiles() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VALIDATING CSV FILES');
  console.log('='.repeat(60));
  
  const confluentPath = path.join(__dirname, 'confluent');
  
  try {
    const files = fs.readdirSync(confluentPath);
    const csvFiles = files.filter(f => f.endsWith('.csv'));
    
    log('info', `Found ${csvFiles.length} CSV files in confluent folder`);
    
    const topics = new Map();
    csvFiles.forEach(file => {
      const match = file.match(/^(.+)-(key|value)\.csv$/);
      if (match) {
        const [, topic, type] = match;
        if (!topics.has(topic)) {
          topics.set(topic, { key: false, value: false });
        }
        topics.get(topic)[type] = true;
      }
    });
    
    console.log('\n📄 CSV File Pairs:');
    let allValid = true;
    for (const [topic, files] of topics) {
      if (files.key && files.value) {
        log('success', `${topic} (key ✓, value ✓)`);
      } else {
        log('error', `${topic} (key ${files.key ? '✓' : '✗'}, value ${files.value ? '✓' : '✗'})`);
        allValid = false;
      }
    }
    
    return allValid && topics.size > 0;
    
  } catch (error) {
    log('error', `CSV validation failed: ${error.message}`);
    return false;
  }
}

async function validateConnectivity() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 VALIDATING CONNECTIVITY');
  console.log('='.repeat(60));
  
  const endpoints = [
    { name: 'Schema Registry', url: 'http://localhost:8081' },
    { name: 'Kafka UI', url: 'http://localhost:8080' },
    { name: 'Kafka Connect', url: 'http://localhost:8083' }
  ];
  
  let allAccessible = true;
  
  for (const endpoint of endpoints) {
    try {
      await axios.get(endpoint.url, { timeout: 3000 });
      log('success', `${endpoint.name}: ${endpoint.url} ✓`);
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        log('error', `${endpoint.name}: ${endpoint.url} ✗ (Not running)`);
      } else {
        log('warning', `${endpoint.name}: ${endpoint.url} ⚠ (${error.message})`);
      }
      allAccessible = false;
    }
  }
  
  return allAccessible;
}

async function runFullValidation() {
  console.log('\n' + '='.repeat(60));
  console.log('🎯 KAFKA CLUSTER VALIDATION SUITE');
  console.log('='.repeat(60));
  console.log('Started at:', new Date().toLocaleString());
  
  const results = {
    docker: await validateDockerContainers(),
    csvFiles: await validateCSVFiles(),
    kafka: await validateKafkaBrokers(),
    schemaRegistry: await validateSchemaRegistry(),
    topics: await validateTopics(),
    connectivity: await validateConnectivity()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));
  
  const checks = [
    { name: 'Docker Containers', status: results.docker },
    { name: 'CSV Files', status: results.csvFiles },
    { name: 'Kafka Brokers', status: results.kafka },
    { name: 'Schema Registry', status: results.schemaRegistry },
    { name: 'Topics', status: results.topics },
    { name: 'Connectivity', status: results.connectivity }
  ];
  
  checks.forEach(check => {
    log(check.status ? 'success' : 'error', `${check.name}: ${check.status ? 'PASS' : 'FAIL'}`);
  });
  
  const allPassed = Object.values(results).every(r => r);
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    log('success', 'ALL VALIDATIONS PASSED! ✨');
    console.log('\n🚀 Your Kafka cluster is ready to use!');
    console.log('\n💡 Next steps:');
    console.log('   - Access Kafka UI: http://localhost:8080');
    console.log('   - View schemas: http://localhost:8081/subjects');
    console.log('   - Start producing: node producer.js');
  } else {
    log('error', 'SOME VALIDATIONS FAILED');
    console.log('\n🔧 Troubleshooting:');
    
    if (!results.docker) {
      console.log('   1. Start containers: docker-compose up -d');
    }
    if (!results.kafka) {
      console.log('   2. Check Kafka logs: docker logs kafka1');
    }
    if (!results.topics) {
      console.log('   3. Create topics: node create-topics.js');
    }
    if (!results.schemaRegistry) {
      console.log('   4. Check Schema Registry: docker logs schema-registry');
    }
  }
  
  console.log('='.repeat(60));
  console.log();
  
  process.exit(allPassed ? 0 : 1);
}

// Check dependencies
const requiredModules = ['kafkajs', 'axios'];
for (const mod of requiredModules) {
  try {
    require.resolve(mod);
  } catch (e) {
    console.error(`❌ ${mod} is not installed!`);
    console.error(`   Run: npm install ${mod}`);
    process.exit(1);
  }
}

runFullValidation().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
