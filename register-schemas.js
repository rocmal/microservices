const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SCHEMA_REGISTRY_URL = 'http://localhost:8081';
const CONFLUENT_FOLDER = path.join(__dirname, 'confluent');

// Parse CSV file to create Avro schema
function csvToAvroSchema(csvContent, recordName) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const fields = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',');
    if (parts.length < 2) continue;
    
    const fieldName = parts[0].trim();
    let fieldType = parts[1].replace(/"/g, '').trim();
    
    // Convert types
    const typeMap = {
      'double': 'double',
      'long': 'long',
      'int': 'int',
      'string': 'string',
      'boolean': 'boolean'
    };
    
    fieldType = typeMap[fieldType] || 'string';
    
    fields.push({
      name: fieldName,
      type: ['null', fieldType],
      default: null
    });
  }
  
  return {
    type: 'record',
    name: recordName,
    namespace: 'com.microservices.avro',
    fields: fields
  };
}

// Register schema with Schema Registry
async function registerSchema(subject, schema) {
  try {
    const response = await axios.post(
      `${SCHEMA_REGISTRY_URL}/subjects/${subject}/versions`,
      {
        schema: JSON.stringify(schema)
      },
      {
        headers: {
          'Content-Type': 'application/vnd.schemaregistry.v1+json'
        }
      }
    );
    
    console.log(`   ✅ Registered ${subject} - Schema ID: ${response.data.id}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 409) {
      console.log(`   ℹ️  ${subject} - Schema already exists`);
    } else {
      console.error(`   ❌ Error registering ${subject}:`, error.message);
    }
  }
}

// Get all topics from CSV files
function getTopicsFromFiles() {
  const files = fs.readdirSync(CONFLUENT_FOLDER);
  const topics = new Set();
  
  files.forEach(file => {
    if (file.endsWith('-key.csv') || file.endsWith('-value.csv')) {
      const topicName = file.replace('-key.csv', '').replace('-value.csv', '');
      topics.add(topicName);
    }
  });
  
  return Array.from(topics);
}

async function registerAllSchemas() {
  console.log('📋 Kafka Schema Registration Tool');
  console.log('=' .repeat(60));
  console.log(`📍 Schema Registry: ${SCHEMA_REGISTRY_URL}`);
  console.log('=' .repeat(60));
  console.log();
  
  try {
    // Test Schema Registry connection
    console.log('🔗 Testing Schema Registry connection...');
    await axios.get(`${SCHEMA_REGISTRY_URL}/subjects`);
    console.log('✅ Schema Registry is accessible\n');
  } catch (error) {
    console.error('❌ Cannot connect to Schema Registry!');
    console.error('   Make sure it is running: docker-compose ps schema-registry');
    console.error('   URL:', SCHEMA_REGISTRY_URL);
    process.exit(1);
  }
  
  const topics = getTopicsFromFiles();
  console.log(`📝 Found ${topics.length} topics in confluent folder:\n`);
  
  for (const topic of topics) {
    console.log(`\n🔧 Processing topic: ${topic}`);
    
    // Process key schema
    const keyFile = path.join(CONFLUENT_FOLDER, `${topic}-key.csv`);
    if (fs.existsSync(keyFile)) {
      const keyContent = fs.readFileSync(keyFile, 'utf8');
      const keySchema = csvToAvroSchema(keyContent, `${topic}Key`);
      await registerSchema(`${topic}-key`, keySchema);
    }
    
    // Process value schema
    const valueFile = path.join(CONFLUENT_FOLDER, `${topic}-value.csv`);
    if (fs.existsSync(valueFile)) {
      const valueContent = fs.readFileSync(valueFile, 'utf8');
      const valueSchema = csvToAvroSchema(valueContent, `${topic}Value`);
      await registerSchema(`${topic}-value`, valueSchema);
    }
  }
  
  // List all registered schemas
  console.log('\n' + '=' .repeat(60));
  console.log('📊 All Registered Schemas:');
  console.log('=' .repeat(60));
  
  try {
    const response = await axios.get(`${SCHEMA_REGISTRY_URL}/subjects`);
    const subjects = response.data;
    
    if (subjects.length === 0) {
      console.log('   No schemas registered yet');
    } else {
      for (const subject of subjects) {
        const versionResponse = await axios.get(
          `${SCHEMA_REGISTRY_URL}/subjects/${subject}/versions/latest`
        );
        console.log(`\n   📌 ${subject}`);
        console.log(`      - Version: ${versionResponse.data.version}`);
        console.log(`      - ID: ${versionResponse.data.id}`);
      }
    }
  } catch (error) {
    console.error('   Error listing schemas:', error.message);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Schema registration complete!');
  console.log('=' .repeat(60));
  console.log('\n💡 View schemas in Kafka UI: http://localhost:8080');
  console.log('💡 Schema Registry API: http://localhost:8081/subjects');
}

// Check if axios is available
try {
  require.resolve('axios');
} catch (e) {
  console.error('❌ axios is not installed!');
  console.error('   Run: npm install axios');
  process.exit(1);
}

registerAllSchemas().catch(console.error);
