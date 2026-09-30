import { getClient } from '../src/config/db';
import crypto from 'crypto';

const HMAC_SECRET = process.env.LICENSE_KEY_HMAC_SECRET || 'qa_hmac_secret_qa_hmac_secret_qa_hmac_secret_123';

function canonicalizeLicenseKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashLicenseKey(key: string): string {
  const canonical = canonicalizeLicenseKey(key);
  return crypto.createHmac('sha256', HMAC_SECRET).update(canonical).digest('hex');
}

async function createQaLicense() {
  const client = await getClient();
  try {
    const rawKey = 'QA-LICENSE-001';
    const hashedKey = hashLicenseKey(rawKey);

    const checkRes = await client.query('SELECT 1 FROM licenses WHERE license_key_hmac = $1', [hashedKey]);
    if (checkRes.rowCount && checkRes.rowCount > 0) {
      console.log(`[QA] License ${rawKey} already exists.`);
      return;
    }

    const validFrom = new Date();
    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    await client.query(`
      INSERT INTO licenses (
        id, 
        product_id,
        license_key_hmac, 
        status, 
        max_devices, 
        valid_from,
        valid_until
      ) VALUES (
        gen_random_uuid(),
        'minipos-standard-v1',
        $1,
        'ACTIVE',
        1,
        $2,
        $3
      )
    `, [hashedKey, validFrom, validUntil]);

    console.log(`✅ QA License created successfully: ${rawKey}`);
  } catch (err: any) {
    console.error('Failed to create QA license:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

createQaLicense();
