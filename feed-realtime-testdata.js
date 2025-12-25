// feed-realtime-testdata.js
// CONTINUOUS SLA DATA FEEDER — 50 ORDERS EVERY 5 MINUTES (PM2 SAFE)

const { Client } = require('pg');

const client = new Client({
  user: 'admin',
  host: 'localhost',
  database: 'grafana',
  password: 'admin123',
  port: 5432,
});

// ---------------- CONFIG ----------------
const ORDERS_PER_BATCH = 50;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const BRANCHES = [350, 360, 370];
const ORDER_TYPES = ['RockAuto','StoreFulfillment','Ecommerce','HotShot','Transfer','Route','Regular'];
const ROUTE_TYPES = ['C','H','T','R',null];
const SHIP_METHODS = ['STD','EXP','ONE','ECO'];

// ---------------- HELPERS ----------------
const rand = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const pick = a=>a[Math.floor(Math.random()*a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function julian(date){
  const yy = date.getFullYear() % 100;
  const start = new Date(date.getFullYear(), 0, 1);
  const doy = Math.floor((date - start) / 86400000) + 1;
  return Number(`${String(yy).padStart(2,'0')}${String(doy).padStart(3,'0')}`);
}

function ymd(d){
  return Number(
    `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  );
}

function timeHHMMSS(d){
  return d.toTimeString().slice(0,8);
}

async function getSla(orderType){
  try{
    const r = await client.query(
      `SELECT pick_sla_minutes,stage_sla_minutes,pack_sla_minutes,ship_sla_minutes
       FROM sla_config WHERE order_type=$1`,[orderType]);
    if(r.rows.length) return r.rows[0];
  }catch{}
  return { pick_sla_minutes:60, stage_sla_minutes:40, pack_sla_minutes:30, ship_sla_minutes:90 };
}

// ---------------- SINGLE ORDER ----------------
async function createOrder(special) {
  const branch = pick(BRANCHES);
  const orderId = (Math.floor(Date.now()/1000) % 1_000_000_000) + rand(0,999);
  const ship = pick(SHIP_METHODS);
  const route = pick(ROUTE_TYPES);
  const type = pick(ORDER_TYPES);
  const cust = rand(60000,70000);
  const od = new Date(Date.now() - rand(0, 3 * 86400000));
  const sla = await getSla(type);

  await client.query('BEGIN');

  try {
    // HEADER
    await client.query(
      `INSERT INTO raw_oeordh
       (brnch,"ORDER",cusno,otype,rstat,fdate,dlvrcd)
       VALUES ($1,$2,$3,3,1,$4,$5)`,
      [branch, orderId, cust, julian(od), ship]
    );

    // SHIPPING MASTER
    await client.query(
      `INSERT INTO ship_meth (branch,dlvrcd,route_type,route_name)
       SELECT $1::int,$2::text,$3::text,$4::text
       WHERE NOT EXISTS (
         SELECT 1 FROM ship_meth WHERE branch=$1::int AND dlvrcd=$2::text
       )`,
      [branch, ship, route, route ? `${route}-Route` : 'Ecom']
    );

    await client.query(
      `INSERT INTO ship_code (ship_meth,service,carrier)
       SELECT $1::text,'Ground','CarrierX'
       WHERE NOT EXISTS (
         SELECT 1 FROM ship_code WHERE ship_meth=$1::text AND service='Ground'
       )`,
      [ship]
    );

    // ORDER LINES
    const lines = rand(1,3);
    for(let l=1;l<=lines;l++){
      await client.query(
        `INSERT INTO raw_oeordl
         (lbrnch,lorder,lline,rstat,iexch,boqty)
         VALUES ($1,$2,$3,1,NULL,$4)`,
        [branch, orderId, l, Math.random()<0.2 ? rand(1,5) : 0]
      );
    }

    // EVENTS
    let ts = new Date(od);
    const ev = [
      ['CRT',0],
      ['RLS',5],
      ['PCK',sla.pick_sla_minutes*special.f],
      ['OSC',5],
      ['SPK',sla.stage_sla_minutes*special.f],
      ['SVC',(sla.pack_sla_minutes+sla.ship_sla_minutes)*special.f]
    ];

    for(const [code,min] of ev){
      ts = new Date(ts.getTime() + Math.round(min)*60000);
      await client.query(
        `INSERT INTO raw_otslog
         (olbran,"OLORD#",olodat,oltran,oltdat,olttim,oluser)
         VALUES ($1,$2,$3,$4,$5,$6,'testuser')`,
        [branch, orderId, ymd(od), code, ymd(ts), timeHHMMSS(ts)]
      );
    }

    await client.query('COMMIT');
  } catch(e){
    await client.query('ROLLBACK');
    console.error('❌ Order failed:', orderId, e.message);
  }
}

// ---------------- LOOP ----------------
async function runLoop(){
  const specials = [
    { label:'moving_slow', f:0.8 },
    { label:'delayed', f:1.2 }
  ];

  let counter = 0;

  while(true){
    console.log(`🚀 Creating ${ORDERS_PER_BATCH} orders...`);

    for(let i=0;i<ORDERS_PER_BATCH;i++){
      const sp = specials[counter % specials.length] || { label:'normal', f:1 };
      counter++;
      await createOrder(sp);
    }

    console.log(`⏳ Batch done. Sleeping 5 minutes...\n`);
    await sleep(INTERVAL_MS);
  }
}

// ---------------- START ----------------
(async ()=>{
  await client.connect();
  console.log('✅ Connected – Continuous mode (50 orders / 5 min)');
  await runLoop();
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down...');
  await client.end();
  process.exit(0);
});
