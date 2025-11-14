// Database setup script
const { pool } = require('./db-config');

async function setupDatabase() {
  let connection;
  
  try {
    connection = await pool.getConnection();
    console.log('🔧 Setting up database tables...\n');

    // Create customers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        street VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        zip_code VARCHAR(20),
        country VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('✅ Customers table created');

    // Create orders table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(255) PRIMARY KEY,
        customer_id VARCHAR(255) NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
        INDEX idx_customer (customer_id),
        INDEX idx_status (status),
        INDEX idx_order_date (order_date)
      )
    `);
    console.log('✅ Orders table created');

    // Create order_items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL,
        product_id VARCHAR(255) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        quantity INT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
        INDEX idx_order (order_id),
        INDEX idx_product (product_id)
      )
    `);
    console.log('✅ Order items table created');

    // Create payments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        card_type VARCHAR(50),
        last_4_digits VARCHAR(4),
        transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(order_id),
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
        INDEX idx_order (order_id),
        INDEX idx_customer (customer_id),
        INDEX idx_status (status),
        INDEX idx_transaction_date (transaction_date)
      )
    `);
    console.log('✅ Payments table created');

    console.log('\n🎉 Database setup completed successfully!\n');
    
    // Show table info
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📊 Available tables:');
    tables.forEach(table => {
      console.log(`   - ${Object.values(table)[0]}`);
    });

  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    throw error;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

// Run setup
setupDatabase()
  .then(() => {
    console.log('\n✨ Setup complete! You can now run the producer and consumer.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });