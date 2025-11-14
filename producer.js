// ------------------------------------------------------------
// ✅ Kafka Producer for Microservices (TimescaleDB Pipeline)
// ------------------------------------------------------------
// npm install kafkajs @faker-js/faker

const { Kafka } = require('kafkajs');
const { faker } = require('@faker-js/faker');

// Kafka Configuration
const kafka = new Kafka({
  clientId: 'microservices-app',
  brokers: ['localhost:29092'],
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const producer = kafka.producer();

// ------------------------------------------------------------
// 🧠 CONFIG
// ------------------------------------------------------------
const CONFIG = {
  workflowDelayMs: 5000, // delay between workflows
  generateBackdated: true, // backfill realistic timestamps
  maxBackdateDays: 180, // up to 6 months old
};

// ------------------------------------------------------------
// ⏳ Helper: generate realistic (possibly backdated) timestamps
// ------------------------------------------------------------
function generateTimestamp() {
  if (!CONFIG.generateBackdated) return new Date().toISOString();
  const daysAgo = faker.number.int({ min: 0, max: CONFIG.maxBackdateDays });
  const pastDate = faker.date.recent({ days: daysAgo });
  return pastDate.toISOString();
}

// ------------------------------------------------------------
// 🧍 Customer Generator
// ------------------------------------------------------------
function generateCustomer() {
  return {
    customerId: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    address: {
      street: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
      country: faker.location.country(),
    },
    createdAt: generateTimestamp(),
  };
}

// ------------------------------------------------------------
// 📦 Order Generator
// ------------------------------------------------------------
function generateOrder(customerId) {
  const itemCount = faker.number.int({ min: 1, max: 5 });
  const items = [];
  let totalAmount = 0;

  for (let i = 0; i < itemCount; i++) {
    const price = parseFloat(faker.commerce.price({ min: 10, max: 500 }));
    const quantity = faker.number.int({ min: 1, max: 3 });
    totalAmount += price * quantity;

    items.push({
      productId: faker.string.uuid(),
      productName: faker.commerce.productName(),
      price,
      quantity,
    });
  }

  return {
    orderId: faker.string.uuid(),
    customerId,
    items,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    status: faker.helpers.arrayElement(['pending', 'confirmed', 'processing', 'completed', 'rejected']),
    orderDate: generateTimestamp(),
  };
}

// ------------------------------------------------------------
// 💳 Payment Generator
// ------------------------------------------------------------
function generatePayment(orderId, customerId, amount) {
  return {
    paymentId: faker.string.uuid(),
    orderId,
    customerId,
    amount,
    paymentMethod: faker.helpers.arrayElement(['credit_card', 'debit_card', 'paypal', 'bank_transfer']),
    status: faker.helpers.arrayElement(['pending', 'completed', 'failed']),
    transactionDate: generateTimestamp(),
    cardDetails: {
      last4Digits: faker.finance.creditCardNumber().slice(-4),
      cardType: faker.helpers.arrayElement(['Visa', 'Mastercard', 'Amex']),
    },
  };
}

// ------------------------------------------------------------
// 🚀 Send Message to Kafka
// ------------------------------------------------------------
async function sendToKafka(topic, message) {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: message.customerId || message.orderId || message.paymentId,
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        },
      ],
    });
    console.log(`✅ Sent to ${topic}: ${message.customerId || message.orderId}`);
  } catch (error) {
    console.error(`❌ Error sending to ${topic}:`, error.message);
  }
}

// ------------------------------------------------------------
// ⚙️ Services
// ------------------------------------------------------------
async function customerService() {
  console.log('\n🧑 Generating customer...');
  const customer = generateCustomer();
  await sendToKafka('customers', customer);
  return customer;
}

async function orderService(customerId) {
  console.log('\n📦 Generating order...');
  const order = generateOrder(customerId);
  await sendToKafka('orders', order);
  return order;
}

async function paymentService(orderId, customerId, amount) {
  console.log('\n💳 Processing payment...');
  const payment = generatePayment(orderId, customerId, amount);
  await sendToKafka('payments', payment);
  return payment;
}

// ------------------------------------------------------------
// 🔁 Workflow Simulation
// ------------------------------------------------------------
async function simulateWorkflow() {
  try {
    const customer = await customerService();
    await new Promise((r) => setTimeout(r, 1000));

    const order = await orderService(customer.customerId);
    await new Promise((r) => setTimeout(r, 1000));

    const payment = await paymentService(order.orderId, customer.customerId, order.totalAmount);

    console.log('\n✨ Workflow completed successfully!\n' + '='.repeat(60));
  } catch (err) {
    console.error('❌ Workflow Error:', err.message);
  }
}

// ------------------------------------------------------------
// 🧩 Main Function
// ------------------------------------------------------------
async function main() {
  try {
    console.log('🚀 Starting Kafka Timescale Producer...');
    await producer.connect();
    console.log('✅ Connected to Kafka\n');

    while (true) {
      await simulateWorkflow();
      await new Promise((r) => setTimeout(r, CONFIG.workflowDelayMs));
    }
  } catch (err) {
    console.error('❌ Fatal Error:', err.message);
  } finally {
    await producer.disconnect();
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down producer...');
  await producer.disconnect();
  process.exit(0);
});

main();
