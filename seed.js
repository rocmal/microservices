
import pkg from "pg";
import { faker } from "@faker-js/faker";

const { Client } = pkg;

const client = new Client({
  user: process.env.PGUSER || "admin",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "grafana",
  password: process.env.PGPASSWORD || "admin123",
  port: Number(process.env.PGPORT || 5432),
});

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function getSla(orderType, createdDate) {
  const res = await client.query(
    `SELECT * FROM get_sla_for_order($1, $2)`,
    [orderType, createdDate]
  );
  return res.rows[0] || {};
}

function chooseCreatedDate(orderType, wantBeforeCutoff = null) {
  const d = new Date();
  d.setSeconds(0, 0);
  if (orderType === "Rock Auto") {
    const before = wantBeforeCutoff ?? faker.datatype.boolean();
    // Force around the 1 PM boundary to exercise the rule
    d.setHours(before ? 12 : 14, 30, 0, 0);
  }
  return d;
}

async function insertRandomOrder({ ensureBreachPick = false, ensureBreachStage = false, ensureSLAMet = false, forcedOrderType = null, forcedCreatedDate = null } = {}) {
  const orderId = faker.number.int({ min: 10000, max: 99999 });

  // Align order types with sla_config
  const orderType = forcedOrderType || faker.helpers.arrayElement([
    "Hotshot",
    "Ecommerce",
    "Store Fullfillment",
    "Rock Auto",
  ]);

  // Get order_type_id from order_type_master
  const orderTypeRes = await client.query(
    `SELECT id FROM order_type_master WHERE name = $1`,
    [orderType]
  );
  const orderTypeId = orderTypeRes.rows[0]?.id;

  // Choose created_date to intentionally hit Rock Auto rule branches as needed
  const created_date = forcedCreatedDate || chooseCreatedDate(orderType, ensureBreachStage ? faker.datatype.boolean() : null);
  // Anchor SLAs on order_date (business order time)
  const order_date = created_date;

  // Fetch SLA targets for this order at creation time
  const sla = await getSla(orderType, order_date);
  const pickTarget = Number(sla.pick_sla_minutes || 20);
  const stageTarget = Number(sla.stage_sla_minutes || 20);
  const stageCompleteTarget = Number(sla.stage_complete_sla_minutes || 20);
  const packTarget = Number(sla.pack_sla_minutes || 10);
  const shipTarget = Number(sla.ship_sla_minutes || 60);

  // Insert Order
  await client.query(
    `INSERT INTO orders(order_id, created_date, customer_id, order_type, order_type_id, branch, priority, total_lines, current_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      orderId,
      created_date,
      faker.number.int({ min: 1000, max: 9999 }),
      orderType,
      orderTypeId,
      faker.location.city(),
      faker.number.int({ min: 1, max: 5 }),
      faker.number.int({ min: 1, max: 5 }),
      "Created",
    ]
  );

  const lineCount = faker.number.int({ min: 1, max: 5 });

  for (let ln = 0; ln < lineCount; ln++) {
    const id = faker.number.int({ min: 100000, max: 999999 });

    // Decide breaches and SLA Met status
    let breachPick, breachStage, breachStageComplete, breachPack, breachShip;
    
    if (ensureSLAMet) {
      // All stages meet SLA (green) - duration <= 25% of target
      breachPick = false;
      breachStage = false;
      breachStageComplete = false;
      breachPack = false;
      breachShip = false;
    } else {
      // Decide breaches (explicit flags override randomness)
      breachPick = ensureBreachPick || (!ensureBreachStage && faker.datatype.boolean());
      breachStage = ensureBreachStage || (!ensureBreachPick && faker.datatype.boolean());
      breachStageComplete = faker.datatype.boolean();
      breachPack = faker.datatype.boolean();
      breachShip = faker.datatype.boolean();
    }

    // Construct a realistic timeline in minutes around SLA targets
    const pick_start = addMinutes(order_date, 5);
    const pick_complete = addMinutes(
      pick_start,
      ensureSLAMet 
        ? Math.floor(pickTarget * 0.15) // 15% of target = SLA Met (green)
        : pickTarget + (breachPick ? faker.number.int({ min: 10, max: 25 }) : -faker.number.int({ min: 3, max: 5 }))
    );

    const stage_start = addMinutes(pick_complete, 3);
    const stage_complete = addMinutes(
      stage_start,
      ensureSLAMet
        ? Math.floor(stageTarget * 0.15) // 15% of target = SLA Met (green)
        : stageTarget + (breachStage ? faker.number.int({ min: 10, max: 25 }) : -faker.number.int({ min: 3, max: 5 }))
    );

    // Keep stage_complete at least as long as its static target
    const stage_complete_clamped = ensureSLAMet 
      ? addMinutes(stage_start, Math.floor(stageCompleteTarget * 0.15))
      : new Date(Math.max(stage_complete.getTime(), addMinutes(stage_start, Math.max(stageCompleteTarget - 5, 1)).getTime()));

    const pack_start = addMinutes(stage_complete_clamped, 2);
    const pack_complete = addMinutes(
      pack_start, 
      ensureSLAMet 
        ? Math.floor(packTarget * 0.15) // 15% of target = SLA Met (green)
        : (breachPack ? packTarget + faker.number.int({ min: 5, max: 15 }) : Math.floor(packTarget * 0.8))
    );
    
    const ship_date = addMinutes(pack_complete, 10);
    const invoice_date = addMinutes(ship_date, 5);

    const event_date = ship_date;

    await client.query(
      `INSERT INTO order_lines
      (id, event_date, order_id, order_number, order_type, order_type_id, location,
          order_date, pick_start_date, pick_complete_date,
          stage_start_date, stage_complete_date,
          pack_start_date, pack_complete_date,
          ship_date, invoice_date, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        event_date,
        orderId,
        `ORD-${orderId}-${ln + 1}`,
        orderType,
        orderTypeId,
        faker.location.buildingNumber(),
        order_date,
        pick_start,
        pick_complete,
        stage_start,
        stage_complete_clamped,
        pack_start,
        pack_complete,
        ship_date,
        invoice_date,
        "Completed",
      ]
    );

    // Insert status history records for each stage
    let historyId = faker.number.int({ min: 1000000, max: 9999999 });

    // Pick stage
    const pickElapsed = (pick_complete - pick_start) / 1000;
    const pickMet = pickElapsed / 60 <= pickTarget;
    await client.query(
      `INSERT INTO order_status_history 
      (id, entered_date, order_id, order_line_id, order_type_id, status, completed_date, duration_seconds, sla_target_minutes, sla_met)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [historyId++, pick_complete, orderId, id, orderTypeId, 'picked', pick_complete, Math.floor(pickElapsed), pickTarget, pickMet]
    );

    // Stage stage
    const stageElapsed = (stage_complete_clamped - order_date) / 1000;
    const stageMet = stageElapsed / 60 <= stageTarget;
    await client.query(
      `INSERT INTO order_status_history 
      (id, entered_date, order_id, order_line_id, order_type_id, status, completed_date, duration_seconds, sla_target_minutes, sla_met)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [historyId++, stage_complete_clamped, orderId, id, orderTypeId, 'staged', stage_complete_clamped, Math.floor(stageElapsed), stageTarget, stageMet]
    );

    // Stage Complete stage
    const stageCompleteElapsed = (stage_complete_clamped - stage_start) / 1000;
    const stageCompleteMet = stageCompleteElapsed / 60 <= stageCompleteTarget;
    await client.query(
      `INSERT INTO order_status_history 
      (id, entered_date, order_id, order_line_id, order_type_id, status, completed_date, duration_seconds, sla_target_minutes, sla_met)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [historyId++, stage_complete_clamped, orderId, id, orderTypeId, 'stage_complete', stage_complete_clamped, Math.floor(stageCompleteElapsed), stageCompleteTarget, stageCompleteMet]
    );

    // Pack stage
    const packElapsed = (pack_complete - pack_start) / 1000;
    const packMet = packElapsed / 60 <= packTarget;
    await client.query(
      `INSERT INTO order_status_history 
      (id, entered_date, order_id, order_line_id, order_type_id, status, completed_date, duration_seconds, sla_target_minutes, sla_met)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [historyId++, pack_complete, orderId, id, orderTypeId, 'packed', pack_complete, Math.floor(packElapsed), packTarget, packMet]
    );

    // Ship stage
    const shipElapsed = (ship_date - order_date) / 1000;
    const shipMet = shipElapsed / 60 <= shipTarget;
    await client.query(
      `INSERT INTO order_status_history 
      (id, entered_date, order_id, order_line_id, order_type_id, status, completed_date, duration_seconds, sla_target_minutes, sla_met)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [historyId++, ship_date, orderId, id, orderTypeId, 'shipped', ship_date, Math.floor(shipElapsed), shipTarget, shipMet]
    );
  }

  console.log(`✅ Inserted order ${orderId} (${orderType}) at ${new Date().toLocaleTimeString()}${ensureSLAMet ? " [✅ SLA MET]" : ensureBreachPick || ensureBreachStage ? " [🔴 BREACH]" : " [🟡 MIXED]"}`);
}

async function startSeeding() {
  await client.connect();
  console.log("✅ Connected to TimescaleDB");

  const intervalSec = Number(process.env.SEED_INTERVAL_SEC || 120);
  const batchSize = Number(process.env.SEED_BATCH || 3);

  // Warm-up batch: Mix of SLA Met (green), Moving Slow (yellow), and Delayed (red)
  console.log("🌱 Creating initial seed data with mixed SLA statuses...");
  
  // Create 3 SLA Met orders (green) - these will show up immediately
  for (let i = 0; i < 3; i++) {
    await insertRandomOrder({ ensureSLAMet: true });
  }
  
  // Create 2 Moving Slow orders (yellow)
  for (let i = 0; i < 2; i++) {
    await insertRandomOrder({ ensureBreachPick: false, ensureBreachStage: false });
  }
  
  // Create 2 Delayed orders (red)
  await insertRandomOrder({ ensureBreachPick: true, ensureBreachStage: false });
  await insertRandomOrder({ ensureBreachPick: false, ensureBreachStage: true });

  console.log("✅ Initial seed complete! Dashboard should now show all 3 colors.");

  setInterval(async () => {
    for (let i = 0; i < batchSize; i++) {
      // 40% SLA Met (green), 30% Moving Slow (yellow), 30% Delayed (red)
      const rand = Math.random();
      if (rand < 0.4) {
        // SLA Met (green)
        await insertRandomOrder({ ensureSLAMet: true });
      } else if (rand < 0.7) {
        // Moving Slow (yellow)
        await insertRandomOrder({ ensureBreachPick: false, ensureBreachStage: false });
      } else {
        // Delayed (red)
        const breach = faker.datatype.boolean();
        await insertRandomOrder({ ensureBreachPick: breach, ensureBreachStage: !breach });
      }
    }
  }, intervalSec * 1000);
}

startSeeding().catch((err) => console.error(err));
