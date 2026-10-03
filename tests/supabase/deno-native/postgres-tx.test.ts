import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.210.0/assert/mod.ts';

const dbUrl = Deno.env.get('DATABASE_URL') || 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(dbUrl);

Deno.test("Transaction Success", async () => {
  const result = await sql.begin(async (tx) => {
    const [{ id }] = await tx`
      INSERT INTO customers (business_name) VALUES ('TX Success Test') RETURNING id
    `;
    return id;
  });
  
  const [row] = await sql`SELECT * FROM customers WHERE id = ${result}`;
  assert(row);
});

Deno.test("Transaction Rollback", async () => {
  let customerId: string = '';
  await assertRejects(async () => {
    await sql.begin(async (tx) => {
      const [{ id }] = await tx`
        INSERT INTO customers (business_name) VALUES ('TX Rollback Test') RETURNING id
      `;
      customerId = id;
      throw new Error("Trigger Rollback");
    });
  });
  
  if (customerId) {
    const rows = await sql`SELECT * FROM customers WHERE id = ${customerId}`;
    assertEquals(rows.length, 0, "Record should have been rolled back");
  }
});

Deno.test("Unique Conflict", async () => {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO devices (device_key_id, public_key) VALUES ('dev_conflict', 'key') ON CONFLICT DO NOTHING`;
  });

  await assertRejects(async () => {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO devices (device_key_id, public_key) VALUES ('dev_conflict', 'key2')`;
    });
  });
});

Deno.test("Savepoint Failure", async () => {
  await sql.begin(async (tx) => {
    const [{ id }] = await tx`INSERT INTO customers (business_name) VALUES ('Savepoint Base') RETURNING id`;
    
    // Postgres.js handles nested transactions with savepoints automatically using sql.savepoint()
    try {
      await tx.savepoint(async (sp) => {
        await sp`INSERT INTO customers (business_name) VALUES ('Savepoint Fail')`;
        throw new Error("Rollback Savepoint");
      });
    } catch (e) {
      // ignore
    }
    
    const rows = await tx`SELECT * FROM customers WHERE business_name = 'Savepoint Fail'`;
    assertEquals(rows.length, 0);
  });
});

Deno.test("Concurrent Mutation", async () => {
  const [{ id }] = await sql`INSERT INTO customers (business_name) VALUES ('Concurrent Base') RETURNING id`;
  
  // Both attempt to modify the same row with delays
  const p1 = sql.begin(async (tx) => {
    await tx`SELECT * FROM customers WHERE id = ${id} FOR UPDATE`;
    await new Promise(r => setTimeout(r, 100));
    await tx`UPDATE customers SET business_name = 'Concurrent 1' WHERE id = ${id}`;
  });

  const p2 = sql.begin(async (tx) => {
    await tx`SELECT * FROM customers WHERE id = ${id} FOR UPDATE`;
    await tx`UPDATE customers SET business_name = 'Concurrent 2' WHERE id = ${id}`;
  });

  await Promise.all([p1, p2]);

  const [{ business_name }] = await sql`SELECT business_name FROM customers WHERE id = ${id}`;
  // Because p1 waits and p2 is blocked, p1 commits first, then p2 commits
  assertEquals(business_name, 'Concurrent 2');
});
