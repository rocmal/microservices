import pkg from "pg";
import { faker } from "@faker-js/faker";

const { Client } = pkg;

const client = new Client({
    user: "admin",
    host: "localhost",
    database: "analytics_sla",
    password: "admin123",
    port: 5432
});

// Utility: add 5–10 minutes realistically
function addMinutes(date, min = 5, max = 10) {
    const d = new Date(date);
    const minutesToAdd = faker.number.int({ min, max });
    d.setMinutes(d.getMinutes() + minutesToAdd);
    return d;
}

async function seed() {
    await client.connect();

    console.log("Connected to TimescaleDB");

    const days = 15;
    const ordersPerDay = 50;

    for (let d = 0; d < days; d++) {
        const baseDate = faker.date.recent({ days });
        const day = new Date(baseDate.getTime() - d * 24 * 60 * 60 * 1000);

        console.log(`\n📅 Seeding Day ${d + 1} (${day.toDateString()})`);

        for (let i = 0; i < ordersPerDay; i++) {
            const orderId = faker.number.int({ min: 10000, max: 99999 });

            // Created date between 8 AM – 6 PM
            const created_date = faker.date.between({
                from: new Date(day.setHours(8, 0, 0)),
                to: new Date(day.setHours(18, 0, 0))
            });

            // Insert Order
            await client.query(
                `INSERT INTO orders(order_id, created_date, customer_id, order_type, branch, priority, total_lines, current_status)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    orderId,
                    created_date,
                    faker.number.int({ min: 1000, max: 9999 }),
                    faker.helpers.arrayElement(["StoreFulfillment", "HotShot", "RockAuto"]),
                    faker.location.city(),
                    faker.number.int({ min: 1, max: 5 }),
                    faker.number.int({ min: 1, max: 5 }),
                    "Created"
                ]
            );

            const lineCount = faker.number.int({ min: 1, max: 5 });

            for (let ln = 0; ln < lineCount; ln++) {
                const id = faker.number.int({ min: 100000, max: 999999 });

                // Build realistic minute-based flow
                const order_date = created_date;
                const pick_start = addMinutes(order_date);
                const pick_complete = addMinutes(pick_start);
                const stage_start = addMinutes(pick_complete);
                const stage_complete = addMinutes(stage_start);
                const pack_start = addMinutes(stage_complete);
                const pack_complete = addMinutes(pack_start);
                const ship_date = addMinutes(pack_complete);
                const invoice_date = addMinutes(ship_date);

                const event_date = ship_date; // latest point

                // Insert Order Line
                await client.query(
                    `INSERT INTO order_lines
                    (id, event_date, order_id, order_number, order_type, location,
                        order_date, pick_start_date, pick_complete_date,
                        stage_start_date, stage_complete_date,
                        pack_start_date, pack_complete_date,
                        ship_date, invoice_date, status)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                    [
                        id,
                        event_date,
                        orderId,
                        `ORD-${orderId}-${ln + 1}`,
                        faker.helpers.arrayElement(["StoreFulfillment", "HotShot", "RockAuto"]),
                        faker.location.buildingNumber(),
                        order_date,
                        pick_start,
                        pick_complete,
                        stage_start,
                        stage_complete,
                        pack_start,
                        pack_complete,
                        ship_date,
                        invoice_date,
                        "Completed"
                    ]
                );

                const stages = [
                    { status: "Picking", start: pick_start, end: pick_complete },
                    { status: "Staging", start: stage_start, end: stage_complete },
                    { status: "Packing", start: pack_start, end: pack_complete },
                    { status: "Shipping", start: pack_complete, end: ship_date }
                ];

                for (const st of stages) {
                    const duration = Math.floor((st.end - st.start) / 1000);
                    const slaMinutes = faker.number.int({ min: 10, max: 60 });
                    const slaMet = duration <= slaMinutes * 60;

                    // Insert order status history
                    await client.query(
                        `INSERT INTO order_status_history
                         (id, entered_date, order_id, order_line_id, status,
                          completed_date, duration_seconds, sla_target_minutes, sla_met)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [
                            faker.number.int({ min: 1000000, max: 9999999 }),
                            st.start,
                            orderId,
                            id,
                            st.status,
                            st.end,
                            duration,
                            slaMinutes,
                            slaMet
                        ]
                    );

                    // Insert SLA events
                    await client.query(
                        `INSERT INTO sla_events
                         (id, detected_date, order_id, order_line_id, stage,
                          duration_seconds, sla_target_minutes, sla_met, breach)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [
                            faker.number.int({ min: 2000000, max: 9999999 }),
                            st.end,
                            orderId,
                            id,
                            st.status,
                            duration,
                            slaMinutes,
                            slaMet,
                            !slaMet
                        ]
                    );
                }
            }
        }
    }

    console.log("\n🎉 DONE! Seed completed for 15 days.\n");
    await client.end();
}

seed().catch(err => console.error(err));
