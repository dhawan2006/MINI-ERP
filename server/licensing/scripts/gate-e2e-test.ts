import { canonicalize } from '../../../src/shared/crypto/canonicalize';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runE2ETest(baseUrl: string) {
  console.log(`Starting E2E against ${baseUrl}`);
  const deviceKeyId = crypto.randomUUID();
  
  const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKey = keyPair.privateKey;
  const publicKeyObj = keyPair.publicKey;
  const spkiDer = publicKeyObj.export({ type: 'spki', format: 'der' });
  const rawPubKey = spkiDer.subarray(-65);
  const publicKey = rawPubKey.toString('base64url');

  const { Pool } = require('pg');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  const pool = new Pool({ connectionString: dbUrl });
  
  const licenseIdA = crypto.randomUUID();
  const licenseKeyA = 'KEY-A-' + crypto.randomUUID().slice(0, 10).toUpperCase();
  const canonicalKeyA = licenseKeyA.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hmacA = crypto.createHmac('sha256', process.env.LICENSE_KEY_HMAC_SECRET!).update(canonicalKeyA).digest('hex');

  const licenseIdB = crypto.randomUUID();
  const licenseKeyB = 'KEY-B-' + crypto.randomUUID().slice(0, 10).toUpperCase();
  const canonicalKeyB = licenseKeyB.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hmacB = crypto.createHmac('sha256', process.env.LICENSE_KEY_HMAC_SECRET!).update(canonicalKeyB).digest('hex');

  await pool.query(`
    INSERT INTO licenses (id, product_id, license_key_hmac, status, valid_from, valid_until, max_devices)
    VALUES 
    ($1, 'test-product', $2, 'ACTIVE', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 minute', 1),
    ($3, 'test-product', $4, 'ACTIVE', NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour', 1)
  `, [licenseIdA, hmacA, licenseIdB, hmacB]);

  await pool.query(`
    INSERT INTO devices (device_key_id, public_key) VALUES ($1, $2)
  `, [deviceKeyId, publicKey]);

  await pool.query(`
    INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
    VALUES ($1, $2, 'ACTIVE', NOW())
  `, [licenseIdA, deviceKeyId]);

  console.log('Setup complete. License A (expired) is bound to device.');

  console.log('Activating License B on the same device...');
  try {
    const challengeRes = await fetch(`${baseUrl}/api/v1/activation/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceKeyId })
    });
    const challenge = await challengeRes.json();
    
    // Sign using Node.js crypto (DER) and correct domain tag
    const CHALLENGE_DOMAIN_TAG = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf-8');
    const canonicalBytes = Buffer.from(canonicalize(challenge), 'utf-8');
    const messageBuf = Buffer.concat([CHALLENGE_DOMAIN_TAG, canonicalBytes]);
    
    const signature = crypto.sign('SHA256', messageBuf, privateKey).toString('base64url');

    const activateRes = await fetch(`${baseUrl}/api/v1/activation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        licenseKey: licenseKeyB,
        deviceKeyId,
        publicKey,
        deviceProof: { challenge, signature }
      })
    });
    
    if (!activateRes.ok) {
      throw new Error(`Activation failed: ${activateRes.status} ${await activateRes.text()}`);
    }

    console.log('✅ Activation Successful!');
    
    // Verify bindings in DB
    const activeRes = await pool.query(`SELECT license_id FROM license_bindings WHERE device_key_id = $1 AND status = 'ACTIVE'`, [deviceKeyId]);
    if (activeRes.rows.length !== 1 || activeRes.rows[0].license_id !== licenseIdB) {
      throw new Error(`Expected 1 active binding for License B, got ${JSON.stringify(activeRes.rows)}`);
    }

    const inactiveRes = await pool.query(`SELECT license_id FROM license_bindings WHERE device_key_id = $1 AND status = 'DEACTIVATED'`, [deviceKeyId]);
    if (inactiveRes.rows.length !== 1 || inactiveRes.rows[0].license_id !== licenseIdA) {
      throw new Error(`Expected 1 deactivated binding for License A, got ${JSON.stringify(inactiveRes.rows)}`);
    }

    console.log('✅ Database state correct! Exactly 1 active binding for License B, and 1 deactivated binding for License A.');
  } finally {
    // Cleanup
    await pool.query('DELETE FROM license_bindings WHERE device_key_id = $1', [deviceKeyId]);
    await pool.query('DELETE FROM devices WHERE device_key_id = $1', [deviceKeyId]);
    await pool.query('DELETE FROM licenses WHERE id IN ($1, $2)', [licenseIdA, licenseIdB]);
    await pool.end();
  }
}

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: tsx gate-e2e-test.ts <BASE_URL>');
  process.exit(1);
}

runE2ETest(baseUrl).catch(err => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
