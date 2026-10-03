import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';

// SETUP ENV FIRST
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
process.env.LICENSE_KEY_HMAC_SECRET = 'test-secret-key-32-bytes-long-12345';
const { privateKey } = crypto.generateKeyPairSync('ed25519');
process.env.LICENSING_SERVER_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
process.env.LICENSING_SERVER_KEY_ID = 'test-key-1';
process.env.ADMIN_API_TOKEN = '12345678901234567890123456789012';
let app: any;

import request from 'supertest';
import { Pool } from 'pg';
import { canonicalize } from '../../../src/shared/crypto/canonicalize';

const QA_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const QA_KEY = 'QA-RUNTIME-LICENSE-001';
const DEVICE_KEY_ID = 'qa-runtime-device-' + crypto.randomUUID();

describe('Phase 1 Certification Closure - Runtime Check-In', () => {
  let dbClient: any;
  let challengeObj: any;
  let requestId = crypto.randomUUID();
  let privateKey: crypto.KeyObject;
  let publicKey: crypto.KeyObject;
  let rawPubKeyBase64url: string;
  let licenseId: string;
  let bindingId: string;
  let savedSignatureForIdempotency: string;

  beforeAll(async () => {
    // Dynamically import app so env vars are picked up by config.ts
    const appModule = await import('../src/app');
    app = appModule.default;

    const pool = new Pool({ connectionString: QA_DB_URL });
    dbClient = await pool.connect();
    
    // Clear checkin tables
    await dbClient.query('DELETE FROM runtime_directive_deliveries');
    await dbClient.query('DELETE FROM runtime_directives');
    await dbClient.query('DELETE FROM runtime_checkins');
    await dbClient.query('DELETE FROM runtime_checkin_requests');
    await dbClient.query('DELETE FROM device_challenges');
    await dbClient.query('DELETE FROM license_bindings');
    await dbClient.query('DELETE FROM devices');
    await dbClient.query('DELETE FROM licenses');

    // Setup keys
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const rawPubKey = spkiDer.subarray(-65);
    rawPubKeyBase64url = rawPubKey.toString('base64url');
    
    // Create License and Binding directly
    licenseId = crypto.randomUUID();
    const hmacSecret = 'test-hmac-secret-32-chars-min-must-be-long-enough!';
    const hmac = crypto.createHmac('sha256', hmacSecret).update(QA_KEY).digest('hex');
    
    await dbClient.query(`
      INSERT INTO licenses (id, license_key_hmac, product_id, valid_from, valid_until, max_devices, status) 
      VALUES ($1, $2, 'PROD_1', NOW(), NOW() + interval '1 year', 5, 'ACTIVE') 
    `, [licenseId, hmac]);

    // Insert device and binding
    await dbClient.query(`
      INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES ($1, $2, NOW())
    `, [DEVICE_KEY_ID, rawPubKeyBase64url]);

    const bindingRes = await dbClient.query(`
      INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
      VALUES ($1, $2, 'ACTIVE', NOW()) RETURNING id
    `, [licenseId, DEVICE_KEY_ID]);
    bindingId = bindingRes.rows[0].id;
  });

  afterAll(async () => {
    if (dbClient) {
      dbClient.release();
    }
  });

  it('1. Create Runtime Challenge', async () => {
    const res = await request(app)
      .post('/api/v1/runtime/checkin/challenge')
      .send({ deviceKeyId: DEVICE_KEY_ID });
    
    if (res.status !== 200) {
      console.log('Challenge failed:', res.body);
    }
    
    expect(res.status).toBe(200);
    expect(res.body.challengeId).toBeDefined();
    challengeObj = res.body;
  });

  it('2. Runtime Check-In End-to-End', async () => {
    if (!challengeObj) return;
    const canonicalBytes = Buffer.from(canonicalize(challengeObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    
    const signatureDer = crypto.sign(null, dataToSign, privateKey);
    const signatureBase64url = signatureDer.toString('base64url');
    savedSignatureForIdempotency = signatureBase64url;

    const res = await request(app)
      .post('/api/v1/runtime/checkin')
      .send({
        requestId,
        licenseId: licenseId,
        deviceKeyId: DEVICE_KEY_ID,
        publicKey: rawPubKeyBase64url,
        proof: {
          challenge: challengeObj,
          signature: signatureBase64url
        }
      });

    if (res.status !== 200) {
      console.log('Check-in failed with:', res.body);
    }

    expect(res.status).toBe(200);
    expect(res.body.receipt).toBeDefined();
    expect(res.body.receipt.signature).toBeDefined();
    
    // DB Assertions
    const requestRes = await dbClient.query("SELECT * FROM runtime_checkin_requests WHERE request_id = $1", [requestId]);
    expect(requestRes.rowCount).toBe(1);
    expect(requestRes.rows[0].status).toBe('SUCCESS');

    const checkinRes = await dbClient.query("SELECT * FROM runtime_checkins WHERE request_id = $1", [requestId]);
    expect(checkinRes.rowCount).toBe(1);
    expect(checkinRes.rows[0].status).toBe('SUCCESS');
  });

  it('3. Replay Protection (Challenge Replay)', async () => {
    if (!challengeObj) return;
    const canonicalBytes = Buffer.from(canonicalize(challengeObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    const signatureDer = crypto.sign(null, dataToSign, privateKey);

    const res = await request(app)
      .post('/api/v1/runtime/checkin')
      .send({
        requestId: crypto.randomUUID(),
        licenseId: licenseId,
        deviceKeyId: DEVICE_KEY_ID,
        publicKey: rawPubKeyBase64url,
        proof: {
          challenge: challengeObj,
          signature: signatureDer.toString('base64url')
        }
      });

    expect(res.status).toBe(400); 
    expect(res.body.error).toBe('DEVICE_PROOF_INVALID');
  });

  it('4. Response-Loss Idempotency', async () => {
    if (!challengeObj) return;

    const res = await request(app)
      .post('/api/v1/runtime/checkin')
      .send({
        requestId,
        licenseId: licenseId,
        deviceKeyId: DEVICE_KEY_ID,
        publicKey: rawPubKeyBase64url,
        proof: {
          challenge: challengeObj,
          signature: savedSignatureForIdempotency
        }
      });

    // Should return success from idempotency key
    expect(res.status).toBe(200); 
    expect(res.body.receipt).toBeDefined();
  });
});
