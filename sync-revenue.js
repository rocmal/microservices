// ------------------------------------------------------------
// ✅ Sync Historical Revenue Data from Orders
// ------------------------------------------------------------
// Reads all existing orders and calculates cumulative revenue per customer
// Inserts revenue snapshots into customer_revenue hypertable
// ------------------------------------------------------------

const { pool } = require('./db-config');

async function syncHistoricalRevenue() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting historical revenue sync...\n');
    
    // Get total order count
    const countResult = await client.query('SELECT COUNT(*) as total FROM orders');
    const totalOrders = parseInt(countResult.rows[0].total);
    console.log(`📊 Found ${totalOrders.toLocaleString()} orders to process\n`);
    
    // Clear existing revenue data (optional - comment out if you want to keep existing)
    console.log('🧹 Clearing existing revenue data...');
    await client.query('DELETE FROM customer_revenue');
    console.log('✅ Cleared existing revenue data\n');
    
    // Fetch all orders ordered by customer_id and order_date
    // This ensures we process orders chronologically per customer
    console.log('📥 Fetching orders from database...');
    const ordersResult = await client.query(`
      SELECT 
        customer_id,
        order_id,
        total_amount,
        order_date
      FROM orders
      ORDER BY customer_id, order_date ASC
    `);
    
    const orders = ordersResult.rows;
    console.log(`✅ Fetched ${orders.length.toLocaleString()} orders\n`);
    
    // Process orders and calculate cumulative revenue
    console.log('💰 Calculating cumulative revenue per customer...');
    const revenueMap = new Map(); // customer_id -> { totalRevenue, lastOrderDate }
    const revenueRecords = [];
    
    let processed = 0;
    for (const order of orders) {
      const { customer_id, total_amount, order_date } = order;
      
      // Get current revenue for customer
      const current = revenueMap.get(customer_id) || { totalRevenue: 0, lastOrderDate: null };
      
      // Add this order's amount to cumulative total
      const newTotal = current.totalRevenue + parseFloat(total_amount);
      
      // Update map
      revenueMap.set(customer_id, {
        totalRevenue: newTotal,
        lastOrderDate: order_date
      });
      
      // Create a revenue record for this order
      revenueRecords.push({
        customer_id,
        total_revenue: newTotal,
        time: order_date
      });
      
      processed++;
      if (processed % 10000 === 0) {
        process.stdout.write(`   Processed ${processed.toLocaleString()} / ${orders.length.toLocaleString()} orders\r`);
      }
    }
    
    console.log(`\n✅ Calculated revenue for ${revenueMap.size.toLocaleString()} customers\n`);
    
    // Insert revenue records in batches
    console.log('💾 Inserting revenue records into TimescaleDB...');
    const BATCH_SIZE = 5000;
    let inserted = 0;
    
    for (let i = 0; i < revenueRecords.length; i += BATCH_SIZE) {
      const batch = revenueRecords.slice(i, i + BATCH_SIZE);
      
      // Build batch insert query
      const values = [];
      const params = [];
      let paramIndex = 1;
      
      for (const record of batch) {
        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        params.push(record.time, record.customer_id, record.total_revenue);
      }
      
      const insertQuery = `
        INSERT INTO customer_revenue (time, customer_id, total_revenue)
        VALUES ${values.join(', ')}
        ON CONFLICT (time, customer_id) DO UPDATE
        SET total_revenue = EXCLUDED.total_revenue
      `;
      
      await client.query(insertQuery, params);
      inserted += batch.length;
      
      process.stdout.write(`   Inserted ${inserted.toLocaleString()} / ${revenueRecords.length.toLocaleString()} records\r`);
    }
    
    console.log(`\n✅ Inserted ${inserted.toLocaleString()} revenue records\n`);
    
    // Get summary statistics
    const statsResult = await client.query(`
      SELECT 
        COUNT(DISTINCT customer_id) as unique_customers,
        COUNT(*) as total_records,
        MIN(time) as earliest_revenue,
        MAX(time) as latest_revenue,
        SUM(total_revenue) as total_revenue_sum
      FROM customer_revenue
    `);
    
    const stats = statsResult.rows[0];
    console.log('📊 Revenue Sync Summary:');
    console.log(`   Unique Customers: ${parseInt(stats.unique_customers).toLocaleString()}`);
    console.log(`   Total Records: ${parseInt(stats.total_records).toLocaleString()}`);
    console.log(`   Earliest Revenue: ${stats.earliest_revenue}`);
    console.log(`   Latest Revenue: ${stats.latest_revenue}`);
    console.log(`   Total Revenue Tracked: $${parseFloat(stats.total_revenue_sum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    
    // Show top customers by revenue
    const topCustomersResult = await client.query(`
      SELECT 
        customer_id,
        MAX(total_revenue) as max_revenue,
        COUNT(*) as record_count
      FROM customer_revenue
      GROUP BY customer_id
      ORDER BY max_revenue DESC
      LIMIT 10
    `);
    
    console.log('\n🏆 Top 10 Customers by Revenue:');
    topCustomersResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.customer_id.substring(0, 8)}... → $${parseFloat(row.max_revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${row.record_count} records)`);
    });
    
    console.log('\n🎉 Historical revenue sync completed successfully!\n');
    
  } catch (err) {
    console.error('❌ Error syncing revenue:', err.message);
    console.error(err.stack);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run sync
syncHistoricalRevenue()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

