// run-testcases.js
// Executes testcases.sql against TimescaleDB and prints validation results

const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  user: 'admin',
  host: 'localhost',
  database: 'grafana',
  password: 'admin123',
  port: 5432,
});

async function run() {
  try {
    await client.connect();
    const sql = fs.readFileSync('d:/xampp/htdocs/microservices/testcases.sql', 'utf8');
    // Split on semicolon for individual statements, filter out empty
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      if (stmt.toLowerCase().startsWith('select')) {
        const res = await client.query(stmt);
        console.log(`Result for: ${stmt}`);
        console.table(res.rows);
      } else {
        await client.query(stmt);
      }
    }
  } catch (err) {
    console.error('Error executing SQL:', err);
  } finally {
    await client.end();
  }
}

run();
