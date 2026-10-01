import { getClient } from '../src/config/db';
import crypto from 'crypto';
import { hashLicenseKey } from '../src/crypto/licenseKey';

async function seed() {
  const client = await getClient();
  try {
    await client.query('TRUNCATE TABLE licenses CASCADE');

    const keys = ['QA-LICENSE-001', 'Z5QHH-AVBH7-ZT0NZ'];
    for (const key of keys) {
      const hmac = hashLicenseKey(key);
      const id = key === 'Z5QHH-AVBH7-ZT0NZ' ? '266c9e29-12ed-4ed4-849f-e114fdc5d122' : crypto.randomUUID();
      await client.query(`
        INSERT INTO licenses (id, license_key_hmac, product_id, valid_from, valid_until, max_devices, status)
        VALUES ($1, $2, 'PROD_1', NOW(), NOW() + interval '1 year', 5, 'ACTIVE')
        ON CONFLICT DO NOTHING
      `, [id, hmac]);
      console.log(`Seeded: ${key} -> ${hmac}`);
    }
  } finally {
    client.release();
  }
}

seed().catch(console.error);
