import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is missing');

// We use postgresjs which is the driver used in Edge Functions
const sql = postgres(dbUrl);

describe('Driver-Specific Transaction Test: postgresjs Savepoint Rollback', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('EXPIRED OLD LICENSE -> NEW LICENSE -> SAME DEVICE', async () => {
    const testLicenseId1 = crypto.randomUUID();
    const testLicenseId2 = crypto.randomUUID();
    const testDeviceKeyId = crypto.randomUUID();

    // 1. Setup isolated test data
    await sql`
      INSERT INTO devices (device_key_id, public_key)
      VALUES (${testDeviceKeyId}, 'fake-pub-key-123')
    `;

    await sql`
      INSERT INTO licenses (id, product_id, license_key_hmac, status, valid_from, valid_until, max_devices)
      VALUES 
      (${testLicenseId1}, 'test-product', ${crypto.randomUUID()}, 'ACTIVE', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 minute', 1),
      (${testLicenseId2}, 'test-product', ${crypto.randomUUID()}, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', 1)
    `;

    // Insert initial active binding for License 1
    await sql`
      INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
      VALUES (${testLicenseId1}, ${testDeviceKeyId}, 'ACTIVE', NOW())
    `;

    // 2. Perform the exact ActivationService savepoint logic for License 2
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
    
    expect(activeBindings.length).toBe(1);
    expect(activeBindings[0].license_id).toBe(testLicenseId2);

    const inactiveBindings = await sql`
      SELECT * FROM license_bindings WHERE device_key_id = ${testDeviceKeyId} AND status = 'DEACTIVATED'
    `;
    
    expect(inactiveBindings.length).toBe(1);
    expect(inactiveBindings[0].license_id).toBe(testLicenseId1);

    // Cleanup
    await sql`DELETE FROM license_bindings WHERE device_key_id = ${testDeviceKeyId}`;
    await sql`DELETE FROM licenses WHERE id IN (${testLicenseId1}, ${testLicenseId2})`;
    await sql`DELETE FROM devices WHERE device_key_id = ${testDeviceKeyId}`;
  });
});
