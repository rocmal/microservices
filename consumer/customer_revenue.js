const { Kafka } = require("kafkajs");
const { pool } = require("../db-config");

const kafka = new Kafka({ clientId: "revenue-db-writer", brokers: ["localhost:29092"] });
const consumer = kafka.consumer({ groupId: "revenue-writer-group" });

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: "customer_revenue" });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const { customerId, totalRevenue } = JSON.parse(message.value.toString());

      await pool.query(
  `INSERT INTO customer_revenue (time, customer_id, total_revenue)
   VALUES (NOW(), $1, $2)`,
  [customerId, totalRevenue]
);

      console.log(`💾 Stored Revenue: ${customerId} → ${totalRevenue}`);
    },
  });
}

run().catch(console.error);
