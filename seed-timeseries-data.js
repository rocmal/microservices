/**
 * seed-timeseries-data.js
 * -------------------------------------------------
 * Generates daily time-series data for the last 6 months
 * Perfect for Grafana or Power BI dashboards.
 *
 * Tables: customers, orders, order_items, payments
 * Order statuses: completed, pending, rejected
 * Payment statuses: completed, pending, failed
 */

const mysql = require("mysql2/promise");
const { faker } = require("@faker-js/faker");

const dbConfig = {
  host: "localhost", // or 'mysql' if in Docker
  user: "root",
  password: "",
  database: "microservices",
  multipleStatements: true,
};

// Random helper for realistic data
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Weighted status choice
function weightedChoice(choices) {
  const total = choices.reduce((sum, c) => sum + c.weight, 0);
  const rand = Math.random() * total;
  let cum = 0;
  for (const c of choices) {
    cum += c.weight;
    if (rand < cum) return c.value;
  }
  return choices[choices.length - 1].value;
}

// Get array of all dates between (6 months ago -> today)
function generateDateRange() {
  const dates = [];
  const today = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(today.getMonth() - 6);
  for (let d = new Date(sixMonthsAgo); d <= today; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

async function seedDatabase() {
  const connection = await mysql.createConnection(dbConfig);
  console.log("✅ Connected to MySQL");
  console.log("🚀 Generating daily transactional data (6 months)...\n");

  // ---------------------------
  // 👥 Customers
  // ---------------------------
  console.log("👥 Generating 10K customers...");
  const customers = [];
  for (let i = 0; i < 10000; i++) {
    customers.push([
      faker.string.uuid(),
      faker.person.fullName(),
      faker.internet.email(),
      faker.phone.number(),
      faker.location.streetAddress(),
      faker.location.city(),
      faker.location.state(),
      faker.location.zipCode(),
      faker.location.country(),
      faker.date.past({ years: 1 }),
    ]);
  }

  await connection.query(
    `INSERT INTO customers (customer_id, name, email, phone, street, city, state, zip_code, country, created_at)
     VALUES ?`,
    [customers]
  );
  console.log("✅ Inserted 10,000 customers");

  // ---------------------------
  // 📆 Generate daily orders
  // ---------------------------
  const [rows] = await connection.query("SELECT customer_id FROM customers");
  const customerIds = rows.map((r) => r.customer_id);
  const dateRange = generateDateRange();
  const orderStatusWeights = [
    { value: "completed", weight: 65 },
    { value: "pending", weight: 25 },
    { value: "rejected", weight: 10 },
  ];
  const paymentStatusMap = {
    completed: "completed",
    pending: "pending",
    rejected: "failed",
  };

  const paymentMethods = ["credit_card", "debit_card", "paypal", "bank_transfer"];
  const cardTypes = ["Visa", "Mastercard", "Amex"];

  console.log(`📦 Generating orders for ${dateRange.length} days...`);

  for (const date of dateRange) {
    const ordersToday = randomInt(500, 1000);
    const orders = [];
    const items = [];
    const payments = [];

    for (let i = 0; i < ordersToday; i++) {
      const orderId = faker.string.uuid();
      const customerId = faker.helpers.arrayElement(customerIds);
      const status = weightedChoice(orderStatusWeights);
      const totalAmount = faker.number.float({ min: 100, max: 5000, precision: 0.01 });

      orders.push([orderId, customerId, totalAmount, status, date]);

      // Items (1–5 per order)
      const itemCount = randomInt(1, 5);
      for (let j = 0; j < itemCount; j++) {
        items.push([
          orderId,
          faker.string.uuid(),
          faker.commerce.productName(),
          faker.number.float({ min: 10, max: 500, precision: 0.01 }),
          faker.number.int({ min: 1, max: 5 }),
        ]);
      }

      // Payments (linked to order)
      payments.push([
        faker.string.uuid(),
        orderId,
        customerId,
        totalAmount,
        faker.helpers.arrayElement(paymentMethods),
        paymentStatusMap[status],
        faker.helpers.arrayElement(cardTypes),
        faker.finance.creditCardNumber().slice(-4),
        date,
      ]);
    }

    // Insert batch for the day
    await connection.query(
      `INSERT INTO orders (order_id, customer_id, total_amount, status, order_date) VALUES ?`,
      [orders]
    );
    await connection.query(
      `INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES ?`,
      [items]
    );
    await connection.query(
      `INSERT INTO payments (payment_id, order_id, customer_id, amount, payment_method, status, card_type, last_4_digits, transaction_date)
       VALUES ?`,
      [payments]
    );

    console.log(
      `📅 ${date.toISOString().split("T")[0]} → ${ordersToday} orders, ${items.length} items, ${payments.length} payments`
    );
  }

  console.log("\n🎉 Seeding complete — full 6-month dataset generated!");
  await connection.end();
}

seedDatabase().catch((err) => {
  console.error("❌ Error during seeding:", err);
  process.exit(1);
});
