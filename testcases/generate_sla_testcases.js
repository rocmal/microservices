// SLA Test Case SQL Generator
// Usage: node generate_sla_testcases.js
// Place this script in your microservices/testcases directory

const fs = require('fs');
const path = require('path');

// Define your SLA config here (copy from your DB or schema)
const slaConfigs = [
  {
    order_type: 'Hotshot',
    pick_sla: 20,
    stage_sla: 20,
    stage_complete_sla: 20,
    pack_sla: null,
    ship_sla: 10,
    order_type_id: 1,
    rules: {}
  },
  {
    order_type: 'Ecommerce',
    pick_sla: 120,
    stage_sla: 60,
    stage_complete_sla: 50,
    pack_sla: null,
    ship_sla: 60,
    order_type_id: 2,
    rules: {}
  },
  {
    order_type: 'StoreFullfillment',
    pick_sla: 15,
    stage_sla: 15,
    stage_complete_sla: 15,
    pack_sla: null,
    ship_sla: 15,
    order_type_id: 3,
    rules: {}
  },
  {
    order_type: 'RockAuto',
    pick_sla: 40,
    stage_sla: 50,
    stage_complete_sla: 40,
    pack_sla: null,
    ship_sla: 30,
    order_type_id: 4,
    rules: { "order_time_before_hour": 13, "then": { pick: 20, stage: 40 }, "else": { pick: 40, stage: 50 } }
  }
];

// Helper to generate SQL for a scenario
function generateSQL({order_type, pick_sla, stage_sla, stage_complete_sla, pack_sla, ship_sla, order_type_id}, scenario) {
  const orderNum = 900000 + Math.floor(Math.random() * 10000);
  const branch = 350;
  const customer = 10000000000000 + Math.floor(Math.random() * 10000);
  const delivery = 'UPS';
  // Timings for each event (in minutes from base)
  // On-time: all within SLA, Breach: one stage exceeds SLA
  let offsets = {
    CRT: 0,
    RLS: pick_sla - 5,
    PCK: pick_sla,
    OSC: pick_sla + stage_sla - 5,
    SPK: pick_sla + stage_sla + stage_complete_sla - 5,
    SVC: pick_sla + stage_sla + stage_complete_sla + ship_sla - 5
  };
  if (scenario !== 'on_time') {
    // Breach the selected stage by +20 min
    offsets[scenario] += 20;
    // All subsequent stages must be offset as well
    let breachFound = false;
    let sum = 0;
    for (const k of ['CRT','RLS','PCK','OSC','SPK','SVC']) {
      if (k === scenario) breachFound = true;
      if (breachFound) offsets[k] += 20;
    }
  }
  // SQL generation
  return `-- SLA TEST CASE: ${order_type} (${scenario.replace('_',' ').toUpperCase()})\nBEGIN;\n\nDELETE FROM raw_otslog WHERE olbran = ${branch} AND "OLORD#" = ${orderNum};\nDELETE FROM raw_oeordh WHERE brnch = ${branch} AND "ORDER" = ${orderNum};\n\nINSERT INTO raw_oeordh (brnch, "ORDER", cusno, otype, rstat, fdate, dlvrcd) VALUES (${branch}, ${orderNum}, ${customer}, ${order_type_id}, 1, TO_CHAR(CURRENT_DATE, 'MMDDYYYY')::INT, '${delivery}');\n\nWITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '${offsets.CRT} minutes') AS t)\nINSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT ${branch}, ${orderNum}, 'CRT', t::date, t::time FROM base_time;\nWITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '${offsets.CRT} minutes') AS t)\nINSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT ${branch}, ${orderNum}, 'RLS', (t + INTERVAL '${offsets.RLS-offsets.CRT} minutes')::date, (t + INTERVAL '${offsets.RLS-offsets.CRT} minutes')::time FROM base_time;\nWITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '${offsets.CRT} minutes') AS t)\nINSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT ${branch}, ${orderNum}, 'PCK', (t + INTERVAL '${offsets.PCK-offsets.CRT} minutes')::date, (t + INTERVAL '${offsets.PCK-offsets.CRT} minutes')::time FROM base_time;\nWITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '${offsets.CRT} minutes') AS t)\nINSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT ${branch}, ${orderNum}, 'OSC', (t + INTERVAL '${offsets.OSC-offsets.CRT} minutes')::date, (t + INTERVAL '${offsets.OSC-offsets.CRT} minutes')::time FROM base_time;\nWITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '${offsets.CRT} minutes') AS t)\nINSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT ${branch}, ${orderNum}, 'SPK', (t + INTERVAL '${offsets.SPK-offsets.CRT} minutes')::date, (t + INTERVAL '${offsets.SPK-offsets.CRT} minutes')::time FROM base_time;\nWITH base_time AS (SELECT (CURRENT_TIMESTAMP - INTERVAL '${offsets.CRT} minutes') AS t)\nINSERT INTO raw_otslog (olbran,"OLORD#",oltran,oltdat,olttim) SELECT ${branch}, ${orderNum}, 'SVC', (t + INTERVAL '${offsets.SVC-offsets.CRT} minutes')::date, (t + INTERVAL '${offsets.SVC-offsets.CRT} minutes')::time FROM base_time;\n\nCOMMIT;\n\n-- Verification queries\nSELECT * FROM order_sla_breach_realtime WHERE order_id = ${orderNum};\nSELECT * FROM order_sla_breach_history WHERE order_id = ${orderNum};\n`;
}

// Scenarios: on_time, breach each stage
const scenarios = ['on_time', 'RLS', 'PCK', 'OSC', 'SPK', 'SVC'];

slaConfigs.forEach(cfg => {
  scenarios.forEach(scenario => {
    const sql = generateSQL(cfg, scenario);
    const fname = `${cfg.order_type.replace(/\s+/g,'_')}_${scenario}_TestCase.sql`;
    fs.writeFileSync(path.join(__dirname, fname), sql);
    console.log(`Generated: ${fname}`);
  });
});

console.log('All test case files generated.');
