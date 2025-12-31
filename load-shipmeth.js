const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'grafana',
  user: 'admin',
  password: 'admin123'
});

async function createTable() {
  const createTableQuery = `
    DROP TABLE IF EXISTS ship_meth CASCADE;
    
    CREATE TABLE ship_meth (
      id SERIAL PRIMARY KEY,
      branch INTEGER NOT NULL,
      dlvrcd VARCHAR(10) NOT NULL,
      rte_id INTEGER,
      route_type VARCHAR(1),
      route_name VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT ship_meth_branch_dlvrcd_unique UNIQUE (branch, dlvrcd)
    );
    
    CREATE INDEX idx_ship_meth_branch ON ship_meth(branch);
    CREATE INDEX idx_ship_meth_route_type ON ship_meth(route_type);
  `;
  
  await client.query(createTableQuery);
}

async function loadData() {
  const csvPath = path.join(__dirname, 'route_type.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  console.log(`   Found ${lines.length} rows to load`);
  
  let insertedCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',');
    
    // Parse and trim values (CSV: branch, dlvcrd, rte_id, route_name, route_type)
    const branch = values[0] ? parseInt(values[0]) : null;
    const dlvrcd = values[1]?.trim() || null;
    const rte_id = values[2] ? parseInt(values[2]) : null;
    const route_name = values[3]?.trim() || null;
    const route_type = values[4]?.trim() || null;

    try {
      await client.query(
        `INSERT INTO ship_meth (rte_id, branch, dlvrcd, route_name, route_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (branch, dlvrcd) DO UPDATE SET
           rte_id = EXCLUDED.rte_id,
           route_type = EXCLUDED.route_type,
           route_name = EXCLUDED.route_name`,
        [rte_id, branch, dlvrcd, route_name, route_type]
      );
      insertedCount++;

    } catch (error) {
      errorCount++;
      console.error(`\n   Error on line ${i + 1}:`, error.message);
      console.error(`   Data: ${line}`);
    }
  }
  
  console.log(`   Inserted: ${insertedCount}/${lines.length}`);
  return { insertedCount, errorCount };
}

async function verifyData() {
  const countResult = await client.query('SELECT COUNT(*) FROM ship_meth');
  const count = parseInt(countResult.rows[0].count);
  
  console.log(`   Total rows: ${count}`);
  
  // Get all data (small lookup table)
  const allResult = await client.query(`
    SELECT branch, dlvrcd, route_type, route_name
    FROM ship_meth 
    ORDER BY branch, dlvrcd
  `);
  
  console.log('\n   All Shipping Methods:');
  console.table(allResult.rows);
  
  // Show route type summary
  const routeResult = await client.query(`
    SELECT 
      route_type,
      COUNT(*) as method_count
    FROM ship_meth
    GROUP BY route_type
    ORDER BY route_type
  `);
  
  console.log('   Route Type Summary:');
  console.table(routeResult.rows);
}

async function main() {
  try {
    console.log('========================================');
    console.log('Load Ship_meth Data into PostgreSQL');
    console.log('========================================');
    
    await client.connect();
    console.log('✓ Connected to database\n');
    
    console.log('📋 Creating ship_meth table...');
    await createTable();
    console.log('   ✓ Table created successfully\n');
    
    console.log('📦 Loading CSV data...');
    const { insertedCount, errorCount } = await loadData();
    console.log('   ✓ Data loaded successfully');
    console.log(`   Total inserted: ${insertedCount}`);
    console.log(`   Errors: ${errorCount}\n`);
    
    console.log('📊 Verifying data...');
    await verifyData();
    
    console.log('\n========================================');
    console.log('✓ Complete!');
    console.log('========================================');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
