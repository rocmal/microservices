// ------------------------------------------------------------
// ✅ TimescaleDB Seeding Script — fast, realistic, batched (FIXED)
// ------------------------------------------------------------
// npm install @faker-js/faker pg
// Run: node seed-timescale-optimized.js
//
// Assumes tables:
//  customers(customer_id, name, email, phone, street, city, state, zip_code, country, created_at)
//  orders(order_id, customer_id, total_amount, status, order_date) -- hypertable on order_date is ideal
//  order_items(order_id, product_id, product_name, price, quantity)
//  payments(payment_id, order_id, customer_id, amount, payment_method, status, card_type, last_4_digits, transaction_date)
// ------------------------------------------------------------

const { pool } = require('./db-config');
const { faker } = require('@faker-js/faker');

// -------------------- Config (tweak here or via env) --------------------
const DEFAULT_CUSTOMERS = parseInt(process.env.SEED_CUSTOMERS || '5000', 10);
const DEFAULT_ORDERS_PER_CUSTOMER = parseInt(process.env.SEED_ORDERS_PER_CUSTOMER || '10', 10);
const ITEMS_PER_ORDER_MIN = 1;
const ITEMS_PER_ORDER_MAX = 5;
const START_MONTHS_AGO = parseInt(process.env.SEED_MONTHS || '6', 10);

// Batch sizes (keep params < 60k to avoid PG parameter limits)
const CUSTOMER_BATCH_ROWS = parseInt(process.env.SEED_CUSTOMER_BATCH || '1000', 10);
const ORDER_BATCH_ROWS = parseInt(process.env.SEED_ORDER_BATCH || '1500', 10);
// items & payments are derived from orders; we insert them in sub-batches
const DERIVED_SUBBATCH_ROWS = parseInt(process.env.SEED_DERIVED_SUBBATCH || '5000', 10);

// Distributions (REALISTIC)
const ORDER_STATUS_DIST = {
  completed: 0.60,
  pending:   0.20,
  rejected:  0.10,
  confirmed: 0.10,
};
const PAYMENT_STATUS_DIST = {
  completed: 0.85,
  failed:    0.10,
  pending:   0.05,
};
const PAYMENT_METHODS = ['credit_card', 'debit_card', 'paypal', 'bank_transfer'];
const CARD_TYPES = ['Visa', 'Mastercard', 'Amex'];

// -------------------- Utilities --------------------
function weightedPick(map) {
  const r = Math.random();
  let acc = 0;
  for (const [k, v] of Object.entries(map)) {
    acc += v;
    if (r <= acc) return k;
  }
  return Object.keys(map)[Object.keys(map).length - 1];
}

function randomDateInLastMonths(months = 6) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  return faker.date.between({ from: start, to: end });
}

function randomDateOnOrAfter(date, maxDays = 14) {
  const start = new Date(date);
  const end = new Date(date);
  end.setDate(end.getDate() + maxDays);
  return faker.date.between({ from: start, to: end });
}

function* chunk(arr, size) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

function progress(curr, total, label = '') {
  process.stdout.write(`${label} ${curr.toLocaleString()} / ${total.toLocaleString()}
`);
}

// -------------------- Inserts --------------------
async function insertCustomers(client, rows) {
  if (!rows.length) return;
  const cols = [
    'customer_id', 'name', 'email', 'phone',
    'street', 'city', 'state', 'zip_code', 'country', 'created_at'
  ];
  const values = [];
  const params = [];
  let p = 1;

  for (const r of rows) {
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    params.push(
      r.customer_id, r.name, r.email, r.phone,
      r.street, r.city, r.state, r.zip_code, r.country, r.created_at
    );
  }

  const sql = `INSERT INTO customers (${cols.join(',')}) VALUES ${values.join(',')}`;
  await client.query(sql, params);
}

async function insertOrders(client, orders) {
  if (!orders.length) return;

  for (const o of orders) {
    await client.query(
      `INSERT INTO orders (order_id, customer_id, total_amount, status, order_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [o.order_id, o.customer_id, o.total_amount, o.status, o.order_date]
    );
  }
}

async function insertOrderItems(client, items) {
  // order_items(order_id, product_id, product_name, price, quantity)
  for (const sub of chunk(items, DERIVED_SUBBATCH_ROWS)) {
    if (!sub.length) continue;
    const cols = ['order_id','product_id','product_name','price','quantity'];
    const values = [];
    const params = [];
    let p = 1;
    for (const r of sub) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(r.order_id, r.product_id, r.product_name, r.price, r.quantity);
    }
    const sql = `INSERT INTO order_items (${cols.join(',')}) VALUES ${values.join(',')}`;
    await client.query(sql, params);
  }
}

async function insertPayments(client, pays) {
  // payments(payment_id, order_id, customer_id, amount, payment_method, status, card_type, last_4_digits, transaction_date)
  for (const sub of chunk(pays, DERIVED_SUBBATCH_ROWS)) {
    if (!sub.length) continue;
    const cols = ['payment_id','order_id','customer_id','amount','payment_method','status','card_type','last_4_digits','transaction_date'];
    const values = [];
    const params = [];
    let p = 1;
    for (const r of sub) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        r.payment_id, r.order_id, r.customer_id, r.amount,
        r.payment_method, r.status, r.card_type, r.last_4_digits, r.transaction_date
      );
    }
    const sql = `INSERT INTO payments (${cols.join(',')}) VALUES ${values.join(',')}`;
    await client.query(sql, params);
  }
}

// -------------------- Generators --------------------
function generateCustomerRow() {
  return {
    customer_id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    zip_code: faker.location.zipCode(),
    country: faker.location.country(),
    created_at: randomDateInLastMonths(START_MONTHS_AGO)
  };
}

function generateOrderRowsForCustomers(customers, ordersPerCustomer) {
  const orders = [];
  const items = [];
  const payments = [];

  for (const c of customers) {
    for (let i = 0; i < ordersPerCustomer; i++) {
      const order_id = faker.string.uuid();
      const order_date = randomDateInLastMonths(START_MONTHS_AGO);
      const status = weightedPick(ORDER_STATUS_DIST);

      let total_amount = 0;
      const itemCount = faker.number.int({ min: ITEMS_PER_ORDER_MIN, max: ITEMS_PER_ORDER_MAX });

      for (let j = 0; j < itemCount; j++) {
        const price = Number(faker.commerce.price({ min: 10, max: 500 }));
        const qty = faker.number.int({ min: 1, max: 3 });
        total_amount += price * qty;

        items.push({
          order_id,
          product_id: faker.string.uuid(),
          product_name: faker.commerce.productName(),
          price,
          quantity: qty,
        });
      }

      orders.push({
        order_id,
        customer_id: c.customer_id,
        total_amount: Number(total_amount.toFixed(2)),
        status,
        order_date,
      });

      const pStatus = weightedPick(PAYMENT_STATUS_DIST);
      const pMethod = faker.helpers.arrayElement(PAYMENT_METHODS);
      const cardType = faker.helpers.arrayElement(CARD_TYPES);
      const last4 = faker.finance.creditCardNumber().slice(-4);
      const txDate = randomDateOnOrAfter(order_date, 14);

      payments.push({
        payment_id: faker.string.uuid(),
        order_id,
        customer_id: c.customer_id,
        amount: Number(total_amount.toFixed(2)),
        payment_method: pMethod,
        status: pStatus,
        card_type: cardType,
        last_4_digits: last4,
        transaction_date: txDate,
      });
    }
  }

  return { orders, items, payments };
}

// -------------------- Main Seeding Flow --------------------
async function seedCustomers(client, totalCustomers) {
  console.log(`👤 Seeding ${totalCustomers.toLocaleString()} customers...`);

  let inserted = 0;
  while (inserted < totalCustomers) {
    const batchSize = Math.min(CUSTOMER_BATCH_ROWS, totalCustomers - inserted);
    const batch = Array.from({ length: batchSize }, generateCustomerRow);
    await insertCustomers(client, batch);
    inserted += batchSize;
    progress(inserted, totalCustomers, '   Inserted customers:');
  }
  process.stdout.write('✅ Customers seeded!');
}

async function fetchCustomerIds(client, limit) {
  const res = await client.query(`
    SELECT customer_id, created_at
    FROM customers
    ORDER BY created_at ASC
    LIMIT $1
  `, [limit]);
  return res.rows;
}

async function seedOrdersItemsPayments(client, customers, ordersPerCustomer) {
  const totalOrders = customers.length * ordersPerCustomer;
  console.log(`
📦 Seeding ~${totalOrders.toLocaleString()} orders + items + payments...`);
  let processedOrders = 0;

  for (const customerChunk of chunk(customers, ORDER_BATCH_ROWS)) {
    const { orders, items, payments } = generateOrderRowsForCustomers(customerChunk, ordersPerCustomer);

    await insertOrders(client, orders);                    // <-- FIX: correct columns + params
    processedOrders += orders.length;
    progress(processedOrders, totalOrders, '   Inserted orders:');

    await insertOrderItems(client, items);                 // sub-batched
    await insertPayments(client, payments);                // sub-batched
  }
  process.stdout.write('✅ Orders, items & payments seeded!');
}

async function ensureHypertable(client) {
  try {
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'orders'
        ) THEN
          PERFORM create_hypertable('orders', 'order_date', if_not_exists => TRUE);
        END IF;
      END$$;
    `);
  } catch (e) {
    console.warn('ℹ️ Hypertable setup skipped (Timescale extension not available or already set):', e.message);
  }
}

async function main() {
  const TOTAL_CUSTOMERS = DEFAULT_CUSTOMERS;
  const ORDERS_PER_CUSTOMER = DEFAULT_ORDERS_PER_CUSTOMER;

  const client = await pool.connect();
  try {
    console.log('🚀 Starting TimescaleDB Seeder (realistic)...');

    await client.query('BEGIN');
    await ensureHypertable(client);

   // await seedCustomers(client, TOTAL_CUSTOMERS);
    await client.query('COMMIT');

    const customers = await fetchCustomerIds(client, TOTAL_CUSTOMERS);
    const CHUNK = 5000; // customers per big commit
    let done = 0;

    for (const slice of chunk(customers, CHUNK)) {
      await client.query('BEGIN');
      await seedOrdersItemsPayments(client, slice, ORDERS_PER_CUSTOMER);
      await client.query('COMMIT');
      done += slice.length;
      console.log(`✅ Committed chunk for ${done.toLocaleString()} / ${customers.length.toLocaleString()} customers`);
    }

    console.log('🎉 Seeding completed successfully!');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('❌ Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('Fatal:', e);
});
