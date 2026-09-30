import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { canonicalize } from '../src/crypto/canonicalize';

const QA_SERVER_URL = process.env.LICENSING_SERVER_URL || 'http://localhost:3456';
const QA_DB_URL = 'postgres://laksh@localhost:5432/minipos_licensing_qa';
const QA_KEY = 'QA-LICENSE-001';
const DEVICE_KEY_ID = 'qa-test-device-' + crypto.randomUUID();

describe('QA Local Licensing Lifecycle', () => {
  let dbClient: any;
  let challengeObj: any;
  let requestId = crypto.randomUUID();
  let privateKey: crypto.KeyObject;
  let publicKey: crypto.KeyObject;
  let rawPubKeyBase64url: string;
  let licenseId: string;

  beforeAll(async () => {
    const pool = new Pool({ connectionString: QA_DB_URL });
    dbClient = await pool.connect();
    await dbClient.query('DELETE FROM license_bindings');
    await dbClient.query('DELETE FROM activation_requests');
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    
    // Extract raw 65-byte uncompressed key
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const rawPubKey = spkiDer.subarray(-65);
    rawPubKeyBase64url = rawPubKey.toString('base64url');
  });

  afterAll(async () => {
    if (dbClient) {
      dbClient.release();
    }
  });

  it('1. Server Health', async () => {
    const res = await request(QA_SERVER_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('2. Create Activation Challenge', async () => {
    const res = await request(QA_SERVER_URL)
      .post('/api/v1/activation/challenge')
      .send({ deviceKeyId: DEVICE_KEY_ID });
    
    if (res.status !== 200) {
      console.log('Challenge failed:', res.body);
    }
    
    expect(res.status).toBe(200);
    expect(res.body.challengeId).toBeDefined();
    challengeObj = res.body;
  });

  it('3. Activation End-to-End', async () => {
    const canonicalBytes = Buffer.from(canonicalize(challengeObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    
    const signatureDer = crypto.sign(null, dataToSign, privateKey);
    const signatureBase64url = signatureDer.toString('base64url');

    const res = await request(QA_SERVER_URL)
      .post('/api/v1/activation')
      .send({
        requestId,
        licenseKey: QA_KEY,
        deviceKeyId: DEVICE_KEY_ID,
        publicKey: rawPubKeyBase64url,
        deviceProof: {
          challenge: challengeObj,
          signature: signatureBase64url
        }
      });

    if (res.status !== 200) {
      console.log('Activation failed with:', res.body);
    }

    expect(res.status).toBe(200);
    expect(res.body.payload.authorization).toBeDefined();
    licenseId = res.body.licenseId;

    // Verify DB
    const bindingRes = await dbClient.query("SELECT * FROM license_bindings WHERE device_key_id = $1", [DEVICE_KEY_ID]);
    expect(bindingRes.rowCount).toBe(1);
    expect(bindingRes.rows[0].status).toBe('ACTIVE');
  });

  it('4. Replay Protection (Challenge Replay)', async () => {
    const canonicalBytes = Buffer.from(canonicalize(challengeObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    const signatureDer = crypto.sign(null, dataToSign, privateKey);

    const res = await request(QA_SERVER_URL)
      .post('/api/v1/activation')
      .send({
        requestId: crypto.randomUUID(),
        licenseKey: QA_KEY,
        deviceKeyId: DEVICE_KEY_ID,
        publicKey: rawPubKeyBase64url,
        deviceProof: {
          challenge: challengeObj,
          signature: signatureDer.toString('base64url')
        }
      });

    expect(res.status).toBe(400); 
  });

  it('5. Response-Loss Idempotency', async () => {
    const canonicalBytes = Buffer.from(canonicalize(challengeObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    const signatureDer = crypto.sign(null, dataToSign, privateKey);

    const res = await request(QA_SERVER_URL)
      .post('/api/v1/activation')
      .send({
        requestId,
        licenseKey: QA_KEY,
        deviceKeyId: DEVICE_KEY_ID,
        publicKey: rawPubKeyBase64url,
        deviceProof: {
          challenge: challengeObj,
          signature: signatureDer.toString('base64url')
        }
      });

    // Should return success from idempotency key
    expect(res.status).toBe(200); 
  });

  it('6. Deactivation End-to-End', async () => {
    const cRes = await request(QA_SERVER_URL)
      .post('/api/v1/lifecycle/deactivation/challenge')
      .send({
        deviceKeyId: DEVICE_KEY_ID,
        licenseId: licenseId
      });
    const deactChallengeObj = cRes.body;

    const canonicalBytes = Buffer.from(canonicalize(deactChallengeObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    const signatureDer = crypto.sign(null, dataToSign, privateKey);

    const newRequestId = crypto.randomUUID();
    const res = await request(QA_SERVER_URL)
      .post('/api/v1/lifecycle/deactivation')
      .send({
        requestId: newRequestId,
        licenseId: licenseId,
        deviceKeyId: DEVICE_KEY_ID,
        proof: {
          challenge: deactChallengeObj,
          signature: signatureDer.toString('base64url')
        }
      });

    if (res.status !== 200) {
      console.log('Deactivation failed with:', res.body);
    }
    expect(res.status).toBe(200);

    const bindingRes = await dbClient.query("SELECT * FROM license_bindings WHERE device_key_id = $1 ORDER BY activated_at DESC LIMIT 1", [DEVICE_KEY_ID]);
    expect(bindingRes.rows[0].status).toBe('DEACTIVATED');
  });

  it('7. Admin Reset Test', async () => {
    // Attempt admin reset with wrong token
    const wrongRes = await request(QA_SERVER_URL)
      .post('/api/v1/admin/lifecycle/release-binding')
      .set('Authorization', 'Bearer wrong_token')
      .send({
        licenseId,
        deviceKeyId: DEVICE_KEY_ID,
        reason: 'Lost device'
      });
    expect(wrongRes.status).toBe(401);

    // Valid token
    const rightRes = await request(QA_SERVER_URL)
      .post('/api/v1/admin/lifecycle/release-binding')
      .set('Authorization', 'Bearer qa_admin_token_qa_admin_token_qa_admin_token_123')
      .send({
        licenseId,
        deviceKeyId: DEVICE_KEY_ID,
        reason: 'Lost device'
      });
    expect(rightRes.status).toBe(400);
    expect(rightRes.body.error).toBe('ALREADY_DEACTIVATED');
  });
});
