const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');

// Configuration
const kafka = new Kafka({
  clientId: 'order-fulfillment-etl',
  brokers: ['your-kafka-broker:9092'],
});

const registry = new SchemaRegistry({ 
  host: 'http://kregistry.stream-qa.router-default.apps.pamnoscqas100.panetcorp.com/apis/ccompat/v7' 
});

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'grafana',
  user: 'postgres',
  password: 'postgres',
  max: 20,
});

const consumer = kafka.consumer({ groupId: 'order-fulfillment-processor' });

// Business Logic Functions
const determineOrderType = (cusno, rteType) => {
  if (cusno % 10000000000 === 64356) return 'RockAuto';
  if (rteType === 'C') return 'Store Fulfillment';
  if (!rteType) return 'Ecommerce';
  if (rteType === 'H') return 'HotShot';
  if (rteType === 'T') return 'Transfer';
  if (rteType === 'R') return 'Route';
  return 'Regular Order';
};

const calculateSLA = (cusno, rteType, slaType) => {
  const isRockAuto = cusno % 10000000000 === 64356;
  
  const slaMatrix = {
    pick: {
      RockAuto: 60, Store: 15, Ecommerce: 120, 
      HotShot: 20, Transfer: 30, Route: 30, Default: 120
    },
    stage: {
      RockAuto: 60, Store: 15, Ecommerce: 120, 
      HotShot: 20, Transfer: 30, Route: 30, Default: 120
    },
    pack: {
      RockAuto: 20, Store: 10, Ecommerce: 40, 
      HotShot: 10, Transfer: 10, Route: 10, Default: 40
    },
    ship: {
      RockAuto: 120, Store: 0, Ecommerce: 240, 
      HotShot: 10, Transfer: 10, Route: 10, Default: 240
    }
  };

  if (isRockAuto) return slaMatrix[slaType].RockAuto;
  if (rteType === 'C') return slaMatrix[slaType].Store;
  if (!rteType) return slaMatrix[slaType].Ecommerce;
  if (rteType === 'H') return slaMatrix[slaType].HotShot;
  if (rteType === 'T') return slaMatrix[slaType].Transfer;
  if (rteType === 'R') return slaMatrix[slaType].Route;
  return slaMatrix[slaType].Default;
};

// Main processing function
const processOrderFulfillment = async (orderNumber, branch) => {
  const client = await pool.connect();
  
  try {
    // Query to fetch all related data
    const query = `
      SELECT 
        oh.*,
        ol.boqty,
        ol.iexch,
        ph.oco,
        sc.ship_meth,
        r.rte_type,
        r.branch as rte_branch
      FROM raw_oeordh oh
      JOIN raw_oeordl ol ON oh.brnch = ol.lbrnch AND oh.order = ol.lorder
      JOIN raw_wmopckh ph ON ph.owhse = oh.brnch AND ph.ono = oh.order
      LEFT JOIN raw_ship_code sc ON oh.dlvrcd = sc.ship_meth
      LEFT JOIN raw_dl_rte r ON oh.brnch = r.branch AND oh.dlvrcd = r.ship_meth
      WHERE oh.order = $1 AND oh.brnch = $2
        AND oh.otype = 3
        AND oh.rstat NOT IN (0, 9)
        AND ol.rstat NOT IN (0, 9)
        AND ol.iexch NOT IN ('D', 'J')
    `;
    
    const result = await client.query(query, [orderNumber, branch]);
    
    if (result.rows.length === 0) {
      console.log(`No data found for order ${orderNumber}`);
      return;
    }

    const orderData = result.rows[0];
    
    // Apply business logic
    const orderType = determineOrderType(orderData.cusno, orderData.rte_type);
    const pickSLA = calculateSLA(orderData.cusno, orderData.rte_type, 'pick');
    const stageSLA = calculateSLA(orderData.cusno, orderData.rte_type, 'stage');
    const packSLA = calculateSLA(orderData.cusno, orderData.rte_type, 'pack');
    const shipSLA = calculateSLA(orderData.cusno, orderData.rte_type, 'ship');
    
    // Determine status (you'll need to join with otslog equivalent or track separately)
    let status = ' ';
    if (orderData.boqty > 0) status = 'BO';
    // Add more status logic based on your tracking
    
    // Upsert into final table
    const upsertQuery = `
      INSERT INTO order_fulfillment_metrics (
        order_number, order_type, location, status,
        pick_sla, stage_sla, pack_sla, ship_sla,
        order_dt, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (order_number, location) 
      DO UPDATE SET
        order_type = EXCLUDED.order_type,
        status = EXCLUDED.status,
        pick_sla = EXCLUDED.pick_sla,
        stage_sla = EXCLUDED.stage_sla,
        pack_sla = EXCLUDED.pack_sla,
        ship_sla = EXCLUDED.ship_sla,
        last_updated = NOW()
    `;
    
    await client.query(upsertQuery, [
      orderNumber, orderType, branch, status,
      pickSLA, stageSLA, packSLA, shipSLA,
      orderData.received_at || new Date()
    ]);
    
    console.log(`✅ Processed order ${orderNumber}`);
    
  } catch (error) {
    console.error(`Error processing order ${orderNumber}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

// Kafka consumer setup
const run = async () => {
  await consumer.connect();
  
  await consumer.subscribe({ 
    topics: [
      'OEORDHAVROQAOC',
      'OEORDLAVROQAOC',
      'WMOPCKHAVROQAOC'
    ],
    fromBeginning: false 
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        // Decode Avro message
        const key = await registry.decode(message.key);
        const value = await registry.decode(message.value);
        
        // Extract order info
        const orderNumber = value.order || value.lorder;
        const branch = value.brnch || value.lbrnch;
        
        if (orderNumber && branch) {
          await processOrderFulfillment(orderNumber, branch);
        }
        
      } catch (error) {
        console.error('Error processing message:', error);
        // Implement your error handling (DLQ, retry, etc.)
      }
    },
  });
};

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down...');
  await consumer.disconnect();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the service
run().catch(console.error);

module.exports = { processOrderFulfillment, determineOrderType, calculateSLA };