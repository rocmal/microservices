// ------------------------------------------------------------
// ✅ Kafka Connect Connector Manager
// ------------------------------------------------------------
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CONNECT_URL = process.env.KAFKA_CONNECT_URL || 'http://localhost:8083';

// Connector configurations
const connectors = [
  {
    name: 'timescale-customer-sink',
    configFile: path.join(__dirname, 'sink-connector', 'timescale-customer-sink.json')
  },
  {
    name: 'timescale-revenue-sink',
    configFile: path.join(__dirname, 'sink-connector', 'timescale-revenue-sink.json')
  }
];

// ------------------------------------------------------------
// ✅ Helper Functions
// ------------------------------------------------------------

function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data: parsed });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function checkConnectorExists(connectorName) {
  try {
    const response = await makeRequest(`${CONNECT_URL}/connectors/${connectorName}`);
    return true;
  } catch (error) {
    return false;
  }
}

async function registerConnector(connectorName, config) {
  try {
    const exists = await checkConnectorExists(connectorName);
    if (exists) {
      console.log(`ℹ️  Connector "${connectorName}" already exists. Updating...`);
      const response = await makeRequest(
        `${CONNECT_URL}/connectors/${connectorName}/config`,
        'PUT',
        JSON.stringify(config)
      );
      console.log(`✅ Updated connector: ${connectorName}`);
      return response;
    } else {
      console.log(`📝 Registering new connector: ${connectorName}...`);
      const response = await makeRequest(
        `${CONNECT_URL}/connectors`,
        'POST',
        JSON.stringify({ name: connectorName, config })
      );
      console.log(`✅ Registered connector: ${connectorName}`);
      return response;
    }
  } catch (error) {
    console.error(`❌ Failed to register connector "${connectorName}":`, error.message);
    throw error;
  }
}

async function getConnectorStatus(connectorName) {
  try {
    const response = await makeRequest(`${CONNECT_URL}/connectors/${connectorName}/status`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to get status for "${connectorName}":`, error.message);
    return null;
  }
}

// ------------------------------------------------------------
// ✅ Main Function
// ------------------------------------------------------------

async function main() {
  console.log('🔌 Starting Kafka Connect Connector Manager...');
  console.log('='.repeat(60));
  console.log(`📍 Kafka Connect URL: ${CONNECT_URL}\n`);

  // Check if Kafka Connect is available
  try {
    await makeRequest(`${CONNECT_URL}/connector-plugins`);
    console.log('✅ Kafka Connect is available\n');
  } catch (error) {
    console.error('❌ Kafka Connect is not available:', error.message);
    console.error('🔎 Make sure Kafka Connect is running on', CONNECT_URL);
    process.exit(1);
  }

  // Register all connectors
  for (const connector of connectors) {
    try {
      if (!fs.existsSync(connector.configFile)) {
        console.error(`❌ Config file not found: ${connector.configFile}`);
        continue;
      }

      const configContent = fs.readFileSync(connector.configFile, 'utf8');
      const configJson = JSON.parse(configContent);
      const connectorConfig = configJson.config || configJson;

      await registerConnector(connector.name, connectorConfig);
      
      // Wait a bit and check status
      await new Promise(resolve => setTimeout(resolve, 2000));
      const status = await getConnectorStatus(connector.name);
      if (status) {
        console.log(`   Status: ${status.connector.state}`);
        if (status.connector.state === 'FAILED') {
          console.log(`   ⚠️  Connector is in FAILED state. Check Kafka Connect logs.`);
        }
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Error processing connector "${connector.name}":`, error.message);
    }
  }

  console.log('✅ Connector registration complete');
  console.log('\n📊 Monitoring connectors... (Press Ctrl+C to exit)\n');

  // Monitor connectors periodically
  const monitorInterval = setInterval(async () => {
    console.log('─'.repeat(60));
    for (const connector of connectors) {
      const status = await getConnectorStatus(connector.name);
      if (status) {
        const state = status.connector.state;
        const tasks = status.tasks || [];
        const runningTasks = tasks.filter(t => t.state === 'RUNNING').length;
        console.log(`📌 ${connector.name}: ${state} (${runningTasks}/${tasks.length} tasks running)`);
      }
    }
    console.log('');
  }, 30000); // Check every 30 seconds

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down connector manager...');
    clearInterval(monitorInterval);
    process.exit(0);
  });
}

// Run main function
main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});

