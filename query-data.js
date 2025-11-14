// Query data from MySQL
const { pool, testConnection } = require('./db-config');

async function displayStatistics() {
  const connection = await pool.getConnection();
  
  try {
    console.log('\n📊 DATABASE STATISTICS');
    console.log('='.repeat(60));

    // Get record counts
    const [counts] = await connection.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers) as customers,
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT COUNT(*) FROM order_items) as order_items,
        (SELECT COUNT(*) FROM payments) as payments
    `);
    
    console.log('\n📈 Record Counts:');
    console.log(`   Customers: ${counts[0].customers}`);
    console.log(`   Orders: ${counts[0].orders}`);
    console.log(`   Order Items: ${counts[0].order_items}`);
    console.log(`   Payments: ${counts[0].payments}`);

    // Get total revenue
    const [revenue] = await connection.query(`
      SELECT 
        SUM(amount) as total_revenue,
        AVG(amount) as avg_transaction
      FROM payments 
      WHERE status = 'completed'
    `);
    
    if (revenue[0].total_revenue) {
      console.log('\n💰 Revenue Statistics:');
      console.log(`   Total Revenue: $${parseFloat(revenue[0].total_revenue).toFixed(2)}`);
      console.log(`   Average Transaction: $${parseFloat(revenue[0].avg_transaction).toFixed(2)}`);
    }

    // Get orders by status
    const [orderStatus] = await connection.query(`
      SELECT status, COUNT(*) as count 
      FROM orders 
      GROUP BY status
    `);
    
    console.log('\n📦 Orders by Status:');
    orderStatus.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    // Get payment methods
    const [paymentMethods] = await connection.query(`
      SELECT payment_method, COUNT(*) as count 
      FROM payments 
      GROUP BY payment_method
    `);
    
    console.log('\n💳 Payment Methods:');
    paymentMethods.forEach(row => {
      console.log(`   ${row.payment_method}: ${row.count}`);
    });

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
  }
}

async function displayRecentRecords() {
  const connection = await pool.getConnection();
  
  try {
    console.log('\n📋 RECENT RECORDS');
    console.log('='.repeat(60));

    // Recent customers
    const [customers] = await connection.query(`
      SELECT customer_id, name, email, city, created_at 
      FROM customers 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('\n👥 Latest Customers:');
    customers.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.email}) - ${c.city}`);
    });

    // Recent orders
    const [orders] = await connection.query(`
      SELECT o.order_id, o.customer_id, c.name, o.total_amount, o.status, o.order_date
      FROM orders o
      JOIN customers c ON o.customer_id = c.customer_id
      ORDER BY o.order_date DESC 
      LIMIT 5
    `);
    
    console.log('\n📦 Latest Orders:');
    orders.forEach((o, i) => {
      console.log(`   ${i + 1}. Order ${o.order_id.substring(0, 8)}... by ${o.name}`);
      console.log(`      Amount: $${o.total_amount} | Status: ${o.status}`);
    });

    // Recent payments
    const [payments] = await connection.query(`
      SELECT p.payment_id, p.amount, p.payment_method, p.status, p.card_type, p.transaction_date
      FROM payments p
      ORDER BY p.transaction_date DESC 
      LIMIT 5
    `);
    
    console.log('\n💳 Latest Payments:');
    payments.forEach((p, i) => {
      console.log(`   ${i + 1}. $${p.amount} via ${p.payment_method} (${p.card_type})`);
      console.log(`      Status: ${p.status}`);
    });

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
  }
}

async function displayCustomerDetails(customerId) {
  const connection = await pool.getConnection();
  
  try {
    // Get customer info
    const [customers] = await connection.query(
      'SELECT * FROM customers WHERE customer_id = ?',
      [customerId]
    );

    if (customers.length === 0) {
      console.log('❌ Customer not found');
      return;
    }

    const customer = customers[0];
    console.log('\n👤 CUSTOMER DETAILS');
    console.log('='.repeat(60));
    console.log(`Name: ${customer.name}`);
    console.log(`Email: ${customer.email}`);
    console.log(`Phone: ${customer.phone}`);
    console.log(`Address: ${customer.street}, ${customer.city}, ${customer.state} ${customer.zip_code}`);

    // Get customer orders
    const [orders] = await connection.query(
      'SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC',
      [customerId]
    );

    console.log(`\nOrders: ${orders.length}`);
    orders.forEach((order, i) => {
      console.log(`\n  Order #${i + 1}:`);
      console.log(`    ID: ${order.order_id}`);
      console.log(`    Amount: $${order.total_amount}`);
      console.log(`    Status: ${order.status}`);
      console.log(`    Date: ${order.order_date}`);
    });

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
  }
}

async function main() {
  try {
    // Test connection
    const connected = await testConnection();
    if (!connected) {
      console.log('❌ Cannot connect to MySQL. Make sure the database is running.');
      process.exit(1);
    }

    // Display statistics and recent records
    await displayStatistics();
    await displayRecentRecords();

    // If customer ID provided as argument, show customer details
    const customerId = process.argv[2];
    if (customerId) {
      await displayCustomerDetails(customerId);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run
main();