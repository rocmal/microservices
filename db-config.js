// ---------------------------------------------------------
// ✅ TimescaleDB Connection Configuration
// ---------------------------------------------------------
const { Pool } = require('pg');

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',          // e.g., 'timescaledb' if running in Docker
  port: process.env.DB_PORT || 5432,                 // Default PostgreSQL port
  user: process.env.DB_USER || 'admin',              // Database user
  password: process.env.DB_PASSWORD || 'admin123',   // Database password
  database: process.env.DB_NAME || 'analytics',      // TimescaleDB database
  max: 10,                                           // Connection pool size
  idleTimeoutMillis: 30000,                          // Close idle clients after 30s
  connectionTimeoutMillis: 5000,                     // Timeout for initial connection (5s)
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
};

// Create a pool instance
const pool = new Pool(dbConfig);

// ---------------------------------------------------------
// ✅ Test Database Connection
// ---------------------------------------------------------
async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() AS server_time;');
    console.log(`✅ TimescaleDB connected successfully — Server Time: ${result.rows[0].server_time}`);
    client.release();
    return true;
  } catch (err) {
    console.error('❌ TimescaleDB connection failed:', err.message);
    console.error('🔎 Check if TimescaleDB container/service is running and credentials are correct.');
    return false;
  }
}

// ---------------------------------------------------------
// ✅ Export pool and testConnection
// ---------------------------------------------------------
module.exports = {
  pool,
  testConnection,
};
