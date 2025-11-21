const { Client } = require("pg");
const { faker } = require("@faker-js/faker");
const dayjs = require("dayjs");

const client = new Client({
  user: "admin",
  host: "localhost",
  database: "grafanadata",
  password: "admin123",
  port: 5432,
});

// SLA config
const SLA_CONFIG = {
  HotShot: { pick: 10, stage: 8, stageCmp: 5, pack: 6, ship: 20 },
  RockAuto: { pick: 15, stage: 10, stageCmp: 6, pack: 8, ship: 25 },
  "Store Fulfillment": { pick: 12, stage: 8, stageCmp: 6, pack: 7, ship: 20 },
  Internet: { pick: 20, stage: 12, stageCmp: 8, pack: 10, ship: 30 },
};

function randomDateInLast6Months() {
  const now = dayjs();
  const past = now.subtract(6, "month");
  const randomTime = faker.number.int({ min: past.valueOf(), max: now.valueOf() });
  return dayjs(randomTime);
}

// Chunk helper for batch inserts
function chunk(array, size) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

async function seed() {
  await client.connect();
  console.log("Connected.");

  // Insert SLA config
  for (const type of Object.keys(SLA_CONFIG)) {
    const s = SLA_CONFIG[type];
    await client.query(
      `INSERT INTO sla_config 
        (order_type, pick_sla_minutes, stage_sla_minutes, stage_cmp_sla_minutes, pack_sla_minutes, ship_sla_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) 
       ON CONFLICT (order_type) DO NOTHING`,
      [type, s.pick, s.stage, s.stageCmp, s.pack, s.ship]
    );
  }

  console.log("SLA config inserted.");

  // Generate 6 months of data
  const days = 180;
  const rowsOrders = [];
  const rowsLines = [];
  const rowsHistory = [];

  for (let d = 1; d <= days; d++) {
    const dailyOrders = faker.number.int({ min: 40, max: 150 });

    console.log(`Generating day ${d}/${days} → ${dailyOrders} orders`);

    for (let i = 1; i <= dailyOrders; i++) {
      const orderType = faker.helpers.arrayElement(Object.keys(SLA_CONFIG));
      const orderId = `ORD-${d}-${i}`;
      const orderDate = randomDateInLast6Months();
      const SLA = SLA_CONFIG[orderType];

      // Timestamp chain
      const pickStart = orderDate.add(faker.number.int({ min: 1, max: 10 }), "minute");
      const pickEnd = pickStart.add(faker.number.int({ min: SLA.pick - 4, max: SLA.pick + 8 }), "minute");

      const stageStart = pickEnd.add(faker.number.int({ min: 1, max: 5 }), "minute");
      const stageEnd = stageStart.add(faker.number.int({ min: SLA.stage - 4, max: SLA.stage + 8 }), "minute");

      const packStart = stageEnd.add(faker.number.int({ min: 1, max: 4 }), "minute");
      const packEnd = packStart.add(faker.number.int({ min: SLA.pack - 3, max: SLA.pack + 5 }), "minute");

      const shipDate = packEnd.add(faker.number.int({ min: 5, max: 20 }), "minute");

      const branch = faker.helpers.arrayElement(["350", "420", "550", "600"]);

      // ======================
      // ORDERS TABLE
      // ======================
      rowsOrders.push([
        orderId,
        faker.number.int({ min: 1000, max: 9000 }).toString(),
        orderType,
        branch,
        5,
        1,
        orderDate.toISOString(),
        shipDate.subtract(SLA.ship, "minute").toISOString(),
        shipDate.toISOString(),
        "Shipped",
      ]);

      // ======================
      // ORDER_LINES TABLE
      // ======================
      rowsLines.push([
        orderId,
        orderType,
        branch,
        "Ship",
        orderDate.toISOString(),
        pickStart.toISOString(),
        pickEnd.toISOString(),
        stageStart.toISOString(),
        stageEnd.toISOString(),
        packStart.toISOString(),
        packEnd.toISOString(),
        shipDate.toISOString(),
        shipDate.toISOString(),
        SLA.pick,
        SLA.stage,
        SLA.stageCmp,
        SLA.pack,
        SLA.ship,
      ]);

      // ======================
      // STATUS HISTORY (5 rows per order)
      // ======================
      const statusHistory = [
        ["Pending", orderDate, pickStart],
        ["Picking", pickStart, pickEnd],
        ["Staging", stageStart, stageEnd],
        ["Packing", packStart, packEnd],
        ["Shipped", shipDate, null],
      ];

      for (const [status, start, end] of statusHistory) {
        rowsHistory.push([
          orderId,
          status,
          start.toISOString(),
          end ? end.toISOString() : null,
          end ? end.diff(start, "second") : null,
          0,
          true,
          faker.number.int({ min: 100, max: 999 }).toString(),
        ]);
      }
    }
  }

  console.log("Data generation finished. Inserting in batches...");

  // =============================================
  // BATCH INSERTS (50–200 rows per batch)
  // =============================================
  await client.query("BEGIN");

  // Insert orders
  const orderBatches = chunk(rowsOrders, 200);
  for (const batch of orderBatches) {
    const values = batch.map(
      r => `('${r[0]}','${r[1]}','${r[2]}','${r[3]}',${r[4]},${r[5]},'${r[6]}','${r[7]}','${r[8]}','${r[9]}')`
    ).join(",");
    await client.query(
      `INSERT INTO orders 
       (order_id, customer_id, order_type, branch, priority, total_lines, created_at, target_ship_time, actual_ship_time, current_status)
       VALUES ${values}`
    );
  }

  // Insert order_lines
  const lineBatches = chunk(rowsLines, 200);
  for (const batch of lineBatches) {
    const values = batch.map(
      r => `('${r[0]}','${r[1]}','${r[2]}','${r[3]}','${r[4]}','${r[5]}','${r[6]}','${r[7]}','${r[8]}','${r[9]}','${r[10]}','${r[11]}','${r[12]}',${r[13]},${r[14]},${r[15]},${r[16]},${r[17]})`
    ).join(",");
    await client.query(
      `INSERT INTO order_lines
       (order_number, order_type, location, status, order_dt, pick_strt_dt, pick_cmp_dt, stage_strt_dt, stage_cmp_dt, pack_strt_dt, pack_cmp_dt, ship_dt, invoice_dt,
        pick_sla_minutes, stage_sla_minutes, stage_cmp_sla_minutes, pack_sla_minutes, ship_sla_minutes)
       VALUES ${values}`
    );
  }

  // Insert status history
  const historyBatches = chunk(rowsHistory, 200);
  for (const batch of historyBatches) {
    const values = batch.map(
      r => `('${r[0]}','${r[1]}','${r[2]}',${r[3] ? `'${r[3]}'` : null},${r[4]},${r[5]},${r[6]},'${r[7]}')`
    ).join(",");
    await client.query(
      `INSERT INTO order_status_history 
       (order_id, status, entered_at, completed_at, duration_seconds, sla_target_minutes, sla_met, worker_id)
       VALUES ${values}`
    );
  }

  await client.query("COMMIT");

  console.log("✔ FAST BATCH INSERT COMPLETED");
  await client.end();
}

seed().catch(console.error);
