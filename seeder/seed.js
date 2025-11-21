const { Client } = require("pg");
const faker = require("faker");
const dayjs = require("dayjs");

// PostgreSQL connection
const client = new Client({
  user: "admin",
  host: "localhost",
  database: "GrafanaData",
  password: "admin123",
  port: 5432,
});

// Order Types with SLA
const SLA_CONFIG = {
  "HotShot": { pick: 10, stage: 8, stageCmp: 5, pack: 6, ship: 20 },
  "RockAuto": { pick: 15, stage: 10, stageCmp: 6, pack: 8, ship: 25 },
  "Store Fulfillment": { pick: 12, stage: 8, stageCmp: 6, pack: 7, ship: 20 },
  "Internet": { pick: 20, stage: 12, stageCmp: 8, pack: 10, ship: 30 },
};

// Utility to create random date between now - 6 months
function randomDateInLast6Months() {
  const now = dayjs();
  const past = now.subtract(6, "month");
  const randomTime = Math.random() * (now.valueOf() - past.valueOf());
  return dayjs(past.valueOf() + randomTime);
}

async function seed() {
  await client.connect();
  console.log("Connected.");

  // Insert SLA_CONFIG
  for (const type of Object.keys(SLA_CONFIG)) {
    const s = SLA_CONFIG[type];
    await client.query(
      `INSERT INTO sla_config (order_type, pick_sla_minutes, stage_sla_minutes, stage_cmp_sla_minutes, pack_sla_minutes, ship_sla_minutes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (order_type) DO NOTHING`,
      [type, s.pick, s.stage, s.stageCmp, s.pack, s.ship]
    );
  }

  console.log("Inserted SLA Config.");

  // Generate 6 months of orders
  const days = 180;
  for (let i = 0; i < days; i++) {
    const dailyOrders = faker.datatype.number({ min: 40, max: 200 });

    console.log(`Generating day ${i + 1}/${days} → ${dailyOrders} orders`);

    for (let j = 0; j < dailyOrders; j++) {
      const orderType = faker.random.arrayElement(Object.keys(SLA_CONFIG));

      const orderId = faker.datatype.number({ min: 10000, max: 99999 }).toString();
      const orderDate = randomDateInLast6Months();

      const SLA = SLA_CONFIG[orderType];

      // Generate timestamps in sequence
      const pickStart = orderDate.add(faker.datatype.number({ min: 1, max: 10 }), "minute");
      const pickEnd = pickStart.add(faker.datatype.number({ min: SLA.pick - 5, max: SLA.pick + 10 }), "minute");

      const stageStart = pickEnd.add(faker.datatype.number({ min: 1, max: 5 }), "minute");
      const stageEnd = stageStart.add(faker.datatype.number({ min: SLA.stage - 4, max: SLA.stage + 8 }), "minute");

      const packStart = stageEnd.add(faker.datatype.number({ min: 1, max: 5 }), "minute");
      const packEnd = packStart.add(faker.datatype.number({ min: SLA.pack - 3, max: SLA.pack + 5 }), "minute");

      const shipDate = packEnd.add(faker.datatype.number({ min: 5, max: 20 }), "minute");

      const finalStatus = "Shipped";

      // Insert Order
      await client.query(
        `INSERT INTO orders
         (order_id, customer_id, order_type, branch, priority, total_lines, created_at, target_ship_time, actual_ship_time, current_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          orderId,
          faker.datatype.number({ min: 1000, max: 9000 }).toString(),
          orderType,
          faker.random.arrayElement(["350", "420", "550", "600"]),
          5,
          1,
          orderDate.toISOString(),
          shipDate.subtract(SLA.ship, "minute").toISOString(),
          shipDate.toISOString(),
          finalStatus,
        ]
      );

      // Insert Order Lines
      await client.query(
        `INSERT INTO order_lines
         (order_number, order_type, location, status, order_dt, pick_strt_dt, pick_cmp_dt, stage_strt_dt, stage_cmp_dt,
          pack_strt_dt, pack_cmp_dt, ship_dt, invoice_dt,
          pick_sla_minutes, stage_sla_minutes, stage_cmp_sla_minutes, pack_sla_minutes, ship_sla_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        `,
        [
          orderId,
          orderType,
          faker.random.arrayElement(["350", "420", "550", "600"]),
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
        ]
      );

      // Insert Status History
      const statusHistory = [
        { status: "Pending", start: orderDate, end: pickStart },
        { status: "Picking", start: pickStart, end: pickEnd },
        { status: "Staging", start: stageStart, end: stageEnd },
        { status: "Packing", start: packStart, end: packEnd },
        { status: "Shipped", start: shipDate, end: null },
      ];

      for (const s of statusHistory) {
        await client.query(
          `INSERT INTO order_status_history
            (order_id, status, entered_at, completed_at, duration_seconds, sla_target_minutes, sla_met, worker_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
          [
            orderId,
            s.status,
            s.start.toISOString(),
            s.end ? s.end.toISOString() : null,
            s.end ? s.end.diff(s.start, "second") : null,
            0,
            true,
            faker.datatype.number({ min: 100, max: 999 }).toString(),
          ]
        );
      }
    }
  }

  console.log("Finished seeding 6 months of data.");
  await client.end();
}

seed().catch(console.error);
