const { Kafka } = require("kafkajs");

// In-memory state store (can later be replaced with Redis / RocksDB)
const revenueStore = new Map();

const kafka = new Kafka({
  clientId: "revenue-stream-app",
  brokers: ["localhost:29092"],
});

const consumer = kafka.consumer({ groupId: "revenue-stream-group" });
const producer = kafka.producer();

async function run() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: "orders", fromBeginning: false });

  console.log("🚀 Revenue Stream Processor Running...");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const order = JSON.parse(message.value.toString());
      const customerId = order.customerId;
      const amount = order.totalAmount;

      // Update revenue in state
      const current = revenueStore.get(customerId) || 0;
      const newTotal = current + amount;
      revenueStore.set(customerId, newTotal);

      console.log(`💰 Updated Revenue — ${customerId}: ${newTotal.toFixed(2)}`);

      // Publish to output topic
      await producer.send({
        topic: "customer_revenue",
        messages: [
          {
            key: customerId,
            value: JSON.stringify({ customerId, totalRevenue: newTotal }),
          },
        ],
      });
    },
  });
}

run().catch(console.error);
module.exports = {};