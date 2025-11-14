// ------------------------------------------------------------
// ✅ Kafka Consumer with TimescaleDB persistence
// ------------------------------------------------------------
const { Kafka } = require('kafkajs');
const { pool, testConnection } = require('./db-config');

// Kafka Configuration
const kafka = new Kafka({
  clientId: 'microservices-consumer',
  brokers: ['localhost:29092'],
  retry: { initialRetryTime: 100, retries: 8 },
});

// Consumers
const customerConsumer = kafka.consumer({ groupId: 'customer-group' });
const orderConsumer = kafka.consumer({ groupId: 'order-group' });
const paymentConsumer = kafka.consumer({ groupId: 'payment-group' });

// Convert ISO to PostgreSQL timestamp
function toPGTimestamp(isoDate) {
  return new Date(isoDate).toISOString();
}

// ------------------------------------------------------------
// SAVE FUNCTIONS
// ------------------------------------------------------------

// 🧍 Save customer
async function saveCustomer(customer) {
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO customers (
        customer_id, name, email, phone,
        street, city, state, zip_code, country, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (customer_id)
      DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
      `,
      [
        customer.customerId,
        customer.name,
        customer.email,
        customer.phone,
        customer.address.street,
        customer.address.city,
        customer.address.state,
        customer.address.zipCode,
        customer.address.country,
        toPGTimestamp(customer.createdAt),
      ]
    );
    console.log('   💾 Saved to TimescaleDB (customers)');
  } catch (error) {
    console.error('   ❌ Timescale Error (customers):', error.message);
  } finally {
    client.release();
  }
}

// 📦 Save order
async function saveOrder(order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
      INSERT INTO orders (
        order_id, customer_id, total_amount, status, order_date
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (order_id, order_date)
      DO UPDATE SET status = EXCLUDED.status;
      `,
      [
        order.orderId,
        order.customerId,
        order.totalAmount,
        order.status,
        toPGTimestamp(order.orderDate),
      ]
    );

    // Insert order items
    for (const item of order.items) {
      await client.query(
        `
        INSERT INTO order_items (
          order_id, product_id, product_name, price, quantity
        ) VALUES ($1, $2, $3, $4, $5);
        `,
        [order.orderId, item.productId, item.productName, item.price, item.quantity]
      );
    }

    await client.query('COMMIT');
    console.log('   💾 Saved to TimescaleDB (orders + items)');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('   ❌ Timescale Error (orders):', error.message);
  } finally {
    client.release();
  }
}

// 💳 Save payment
async function savePayment(payment) {
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO payments (
        payment_id, order_id, customer_id, amount,
        payment_method, status, card_type, last_4_digits, transaction_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (payment_id, transaction_date)
      DO UPDATE SET status = EXCLUDED.status;
      `,
      [
        payment.paymentId,
        payment.orderId,
        payment.customerId,
        payment.amount,
        payment.paymentMethod,
        payment.status,
        payment.cardDetails.cardType,
        payment.cardDetails.last4Digits,
        toPGTimestamp(payment.transactionDate),
      ]
    );
    console.log('   💾 Saved to TimescaleDB (payments)');
  } catch (error) {
    console.error('   ❌ Timescale Error (payments):', error.message);
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// CONSUMERS
// ------------------------------------------------------------

async function consumeCustomers() {
  await customerConsumer.connect();
  await customerConsumer.subscribe({ topic: 'customers', fromBeginning: false });

  await customerConsumer.run({
    eachMessage: async ({ message }) => {
      const customer = JSON.parse(message.value.toString());
      console.log('\n🧑 NEW CUSTOMER CREATED:');
      console.log(`   ID: ${customer.customerId}`);
      console.log(`   Name: ${customer.name}`);
      console.log(`   Email: ${customer.email}`);
      console.log(`   Location: ${customer.address.city}, ${customer.address.state}`);
      await saveCustomer(customer);
      console.log('-'.repeat(60));
    },
  });
}

async function consumeOrders() {
  await orderConsumer.connect();
  await orderConsumer.subscribe({ topic: 'orders', fromBeginning: false });

  await orderConsumer.run({
    eachMessage: async ({ message }) => {
      const order = JSON.parse(message.value.toString());
      console.log('\n📦 NEW ORDER PLACED:');
      console.log(`   Order ID: ${order.orderId}`);
      console.log(`   Customer ID: ${order.customerId}`);
      console.log(`   Items: ${order.items.length}`);
      console.log(`   Total Amount: $${order.totalAmount}`);
      console.log(`   Status: ${order.status}`);
      await saveOrder(order);
      console.log('-'.repeat(60));
    },
  });
}

async function consumePayments() {
  await paymentConsumer.connect();
  await paymentConsumer.subscribe({ topic: 'payments', fromBeginning: false });

  await paymentConsumer.run({
    eachMessage: async ({ message }) => {
      const payment = JSON.parse(message.value.toString());
      console.log('\n💳 PAYMENT PROCESSED:');
      console.log(`   Payment ID: ${payment.paymentId}`);
      console.log(`   Order ID: ${payment.orderId}`);
      console.log(`   Amount: $${payment.amount}`);
      console.log(`   Method: ${payment.paymentMethod}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Card: ${payment.cardDetails.cardType} ****${payment.cardDetails.last4Digits}`);
      await savePayment(payment);
      console.log('-'.repeat(60));
    },
  });
}

// ------------------------------------------------------------
// MAIN ENTRY
// ------------------------------------------------------------
async function main() {
  try {
    console.log('🎧 Starting Kafka Consumers with TimescaleDB Persistence...');
    console.log('='.repeat(60));

    const connected = await testConnection();
    if (!connected) throw new Error('Cannot connect to TimescaleDB.');

    await Promise.all([consumeCustomers(), consumeOrders(), consumePayments()]);
    console.log('\n✅ All consumers are running and persisting to TimescaleDB...\n');
  } catch (error) {
    console.error('❌ Startup Error:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down consumers...');
  await Promise.all([
    customerConsumer.disconnect(),
    orderConsumer.disconnect(),
    paymentConsumer.disconnect(),
  ]);
  await pool.end();
  process.exit(0);
});

main();
