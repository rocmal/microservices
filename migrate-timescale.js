const { pool } = require('./db-config');

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log('🔧 Setting up TimescaleDB schema...\n');

    await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);
    console.log('✅ TimescaleDB extension enabled');

    // ------------------------------------------------
    // Drop old tables
    // ------------------------------------------------
    await client.query(`
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS customers CASCADE;
    `);
    console.log('🧹 Old tables (if any) dropped');

    // ------------------------------------------------
    // CUSTOMERS
    // ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        street TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        country TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);`);
    console.log('✅ Customers table created');

    // ------------------------------------------------
    // ORDERS (Hypertable)
    // ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        total_amount NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL,
        order_date TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (order_id, order_date)
      );
    `);
    await client.query(`SELECT create_hypertable('orders', 'order_date', if_not_exists => TRUE);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);`);
    console.log('✅ Orders hypertable created');

    // ------------------------------------------------
    // ORDER ITEMS
    // ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        quantity INT NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);`);
    console.log('✅ Order items table created');

    // ------------------------------------------------
    // PAYMENTS (Hypertable)
    // ------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT NOT NULL,
        card_type TEXT,
        last_4_digits TEXT,
        transaction_date TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (payment_id, transaction_date)
      );
    `);
    await client.query(`SELECT create_hypertable('payments', 'transaction_date', if_not_exists => TRUE);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_transaction_date ON payments(transaction_date);`);
    console.log('✅ Payments hypertable created');

    // ------------------------------------------------
    // ✅ Verify Hypertables (Universal Compatible Query)
    // ------------------------------------------------
    const { rows } = await client.query(`
      SELECT hypertable_name
      FROM timescaledb_information.hypertables
      ORDER BY hypertable_name;
    `);

    console.log('\n📊 Hypertables registered:');
    rows.forEach(r => console.log(`   - ${r.hypertable_name}`));

    console.log('\n🎉 TimescaleDB migration completed successfully!\n');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase()
  .then(() => {
    console.log('\n✨ Setup complete! You can now seed or query the database.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
