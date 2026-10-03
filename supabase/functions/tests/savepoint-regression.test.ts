import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const dbUrl = Deno.env.get('SUPABASE_DB_URL') || Deno.env.get('DB_URL');
if (!dbUrl) throw new Error("Missing DB_URL");

const sql = postgres(dbUrl);

Deno.test("Savepoint Rollback Regression Test - Same-Device Renewal", async () => {
  // 1. Setup isolated test data
  const testLicenseId1 = crypto.randomUUID();
  const testLicenseId2 = crypto.randomUUID();
  const testDeviceKeyId = crypto.randomUUID();
  
  await sql`
    INSERT INTO licenses (id, product_id, license_key_hmac, status, valid_from, valid_until, max_devices)
    VALUES 
    (${testLicenseId1}, 'test-product', ${crypto.randomUUID()}, 'ACTIVE', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 minute', 1),
    (${testLicenseId2}, 'test-product', ${crypto.randomUUID()}, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', 1)
  `;

  await sql`
    INSERT INTO devices (device_key_id, public_key)
    VALUES (${testDeviceKeyId}, 'fake-pem')
  `;

  // Insert initial active binding for License 1
  await sql`
    INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
    VALUES (${testLicenseId1}, ${testDeviceKeyId}, 'ACTIVE', NOW())
  `;

  // 2. Perform the ActivationService savepoint logic for License 2
  await sql.begin(async (tx) => {
    try {
      await tx.savepoint(async (sp) => {
        await sp`
          INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
          VALUES (${testLicenseId2}, ${testDeviceKeyId}, 'ACTIVE', NOW())
        `;
      });
    } catch (err: any) {
      if (err.code === '23505' && err.constraint_name === 'unique_active_device_binding') {
        // Must use tx here, NOT sp, because sp is aborted!
        await tx`
          UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() 
          WHERE device_key_id = ${testDeviceKeyId} AND status = 'ACTIVE'
        `;
        await tx`
          INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
          VALUES (${testLicenseId2}, ${testDeviceKeyId}, 'ACTIVE', NOW())
        `;
      } else {
        throw err;
      }
    }
  });

  // 3. Verify exactly one active binding exists and it is for License 2
  const activeBindings = await sql`
    SELECT * FROM license_bindings WHERE device_key_id = ${testDeviceKeyId} AND status = 'ACTIVE'
  `;
  
  assertEquals(activeBindings.length, 1);
  assertEquals(activeBindings[0].license_id, testLicenseId2);

  const inactiveBindings = await sql`
    SELECT * FROM license_bindings WHERE device_key_id = ${testDeviceKeyId} AND status = 'DEACTIVATED'
  `;
  
  assertEquals(inactiveBindings.length, 1);
  assertEquals(inactiveBindings[0].license_id, testLicenseId1);

  // Cleanup
  await sql`DELETE FROM license_bindings WHERE device_key_id = ${testDeviceKeyId}`;
  await sql`DELETE FROM devices WHERE device_key_id = ${testDeviceKeyId}`;
  await sql`DELETE FROM licenses WHERE id IN (${testLicenseId1}, ${testLicenseId2})`;
});
