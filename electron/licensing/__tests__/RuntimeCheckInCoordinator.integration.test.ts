import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { LicensingClient } from '../LicensingClient';
import { RuntimeCheckInCoordinator } from '../RuntimeCheckInCoordinator';
import { LocalRuntimeStateStore } from '../../../src/infrastructure/licensing/LocalRuntimeStateStore';
import { RuntimeCheckinReceiptVerifier } from '../../../src/shared/crypto/RuntimeCheckinReceiptVerifier';


const QA_SERVER_URL = 'http://127.0.0.1:54321/functions/v1/api';

describe('RuntimeCheckInCoordinator Integration', () => {
  let coordinator: RuntimeCheckInCoordinator;
  let tempDir: string;
  let licenseId: string;
  let deviceKeyId: string;
  let fakeIdentity: any;

  beforeAll(async () => {
    // 1. Prepare temp dir for store
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'licensing-integration-'));
    const store = new LocalRuntimeStateStore(tempDir);

    // 2. Prepare fake identity provider
    const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
    const rawPubKeyBase64url = spkiDer.subarray(-65).toString('base64url');
    deviceKeyId = 'integration-dev-' + crypto.randomUUID();

    fakeIdentity = {
      getStatus: async () => 'ACTIVE',
      getDeviceKeyId: async () => deviceKeyId,
      getPublicKey: async () => rawPubKeyBase64url,
      signChallenge: async (dataToSign: Buffer) => crypto.sign(null, dataToSign, keyPair.privateKey).toString('base64url')
    };

    // 3. Setup client and verifier
    const client = new LicensingClient(QA_SERVER_URL);
    
    // We need the server's public key to verify receipts
    // In QA, the public key is saved in .local-qa/signing/qa-public-key.pem
    // Read the private key from supabase/.env.local to derive the public key for the edge function
    const envLocal = await fs.readFile(path.join(process.cwd(), 'supabase/.env.local'), 'utf8');
    const privateKeyMatch = envLocal.match(/LICENSING_SERVER_PRIVATE_KEY="([^"]+)"/);
    if (!privateKeyMatch) throw new Error('Could not find private key in supabase/.env.local');
    const privateKeyPem = privateKeyMatch[1];
    const serverPrivateKey = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
    const qaPublicKeyPem = crypto.createPublicKey(serverPrivateKey).export({ type: 'spki', format: 'pem' });
    
    const verifier = new RuntimeCheckinReceiptVerifier();
    // In Edge Functions the key id is test-key-id as defined in supabase/.env.local
    verifier.registerTrustedKey('test-key-id', qaPublicKeyPem as string);

    coordinator = new RuntimeCheckInCoordinator(client, fakeIdentity, store, verifier);

    // 4. Seed database via a hacky direct PG connection (or just activate a new license)
    // To do it cleanly, we can just call client.activate() to generate a license on the fly.
    // Wait, activate needs a valid licenseKey. Let's hit the DB directly.
    const { Pool } = require('pg');
    const db = new Pool({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
    const qaKey = 'INTEGRATION-KEY-' + crypto.randomUUID();
    licenseId = crypto.randomUUID();
    const hmacSecret = 'qa_hmac_secret_qa_hmac_secret_qa_hmac_secret_123';
    const hmac = crypto.createHmac('sha256', hmacSecret).update(qaKey).digest('hex');

    await db.query(`
      INSERT INTO licenses (id, license_key_hmac, product_id, valid_from, valid_until, max_devices, status) 
      VALUES ($1, $2, 'PROD_1', NOW(), NOW() + interval '1 year', 5, 'ACTIVE') 
    `, [licenseId, hmac]);

    await db.query(`
      INSERT INTO devices (device_key_id, public_key, last_seen_at) VALUES ($1, $2, NOW())
    `, [deviceKeyId, rawPubKeyBase64url]);

    await db.query(`
      INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
      VALUES ($1, $2, 'ACTIVE', NOW())
    `, [licenseId, deviceKeyId]);
    await db.end();
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('performs end-to-end checkin against local QA server', async () => {
    const result = await coordinator.triggerCheckIn(licenseId, deviceKeyId);
    expect(result).toBe('SUCCESS');
    
    // Check if store persisted it
    const store = new LocalRuntimeStateStore(tempDir);
    const state = await store.load();
    expect(state.receipt.licenseId).toBe(licenseId);
  });
});
