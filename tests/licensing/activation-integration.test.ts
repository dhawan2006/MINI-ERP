import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { Pool } from 'pg';
import { NativeDeviceIdentityAdapter } from '../../electron/native/NativeDeviceIdentityAdapter';
import { ChallengeService } from '../../server/licensing/src/crypto/ChallengeService';
import { ActivationService } from '../../server/licensing/src/services/ActivationService';
import { ProductionDeviceProofVerifier } from '../../server/licensing/src/crypto/deviceProof';
import { ServerAuthorizationSigner, SignedAuthorization } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';
import { AuthorizationVerifier } from '../../server/licensing/src/crypto/AuthorizationVerifier';
import { hashLicenseKey } from '../../server/licensing/src/crypto/licenseKey';
import { canonicalize } from '../../server/licensing/src/crypto/canonicalize';

describe('Phase 5 — Activation Integration (Real Native Device + Server Crypto)', () => {
  let pool: Pool;
  let identityAdapter: NativeDeviceIdentityAdapter;
  let activationService: ActivationService;
  let serverSigner: ServerAuthorizationSigner;
  let clientVerifier: AuthorizationVerifier;
  
  const licenseKey = 'TEST-PHASE-5-KEY';
  let licenseId: string;
  let deviceKeyId: string;
  let publicKey: string;

  beforeAll(async () => {
    // 1. Database Setup
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/minipos_licensing_test'
    });

    const client = await pool.connect();
    try {
      // Clear specific test data
      await client.query(`DELETE FROM license_bindings`);
      await client.query(`DELETE FROM activation_requests`);
      await client.query(`DELETE FROM device_challenges`);
      await client.query(`DELETE FROM licenses WHERE license_key_hmac = $1`, [hashLicenseKey(licenseKey)]);
      
      // Create test license
      const res = await client.query(
        `INSERT INTO licenses (product_id, license_key_hmac, status, valid_from, valid_until, max_devices)
         VALUES ('mini-pos-pro', $1, 'ACTIVE', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year', 2)
         RETURNING id`,
        [hashLicenseKey(licenseKey)]
      );
      licenseId = res.rows[0].id;
    } finally {
      client.release();
    }

    // 2. Identity Setup (Native Secure Enclave)
    identityAdapter = new NativeDeviceIdentityAdapter();
    await identityAdapter.initialize();
    deviceKeyId = await identityAdapter.getDeviceKeyId();
    publicKey = await identityAdapter.getPublicKey();

    // 3. Server Crypto Setup (Ed25519)
    const { privateKey, publicKey: edPubKey } = crypto.generateKeyPairSync('ed25519');
    
    serverSigner = new ServerAuthorizationSigner();
    serverSigner.registerKey('test-key-1', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    
    clientVerifier = new AuthorizationVerifier();
    clientVerifier.registerTrustedKey('test-key-1', edPubKey.export({ type: 'spki', format: 'pem' }).toString());

    // 4. Activation Service
    activationService = new ActivationService(new ProductionDeviceProofVerifier(), serverSigner, 'test-key-1');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should successfully perform full end-to-end cryptographic activation (AC-01, SEC-10)', async () => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Server generates challenge
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      
      // 2. Client canonically serializes and signs challenge
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparatedChallenge = Buffer.concat([
        Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8'),
        canonicalChallengeBytes
      ]);
      const signatureBase64url = await identityAdapter.signChallenge(domainSeparatedChallenge);
      
      // 3. Client constructs proof
      const proof = {
        challenge,
        signature: signatureBase64url
      };

      // 4. Client submits activation request
      const requestId = crypto.randomUUID();
      const result = await activationService.executeActivation(
        client,
        requestId,
        licenseKey,
        deviceKeyId,
        publicKey,
        proof
      );

      await client.query('COMMIT');

      // 5. Verify server returned SUCCESS and an authorization
      expect(result.status).toBe('SUCCESS');
      expect(result.payload?.authorization).toBeDefined();

      const signedAuth: SignedAuthorization = result.payload.authorization;
      
      // 6. Client independently verifies Authorization Signature
      const verifiedPayload = clientVerifier.verify(signedAuth);
      
      expect(verifiedPayload.licenseId).toBe(licenseId);
      expect(verifiedPayload.deviceKeyId).toBe(deviceKeyId);
      expect(verifiedPayload.protocolVersion).toBe(1);
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('should be idempotent for the exact same request ID (AC-04)', async () => {
    const client = await pool.connect();
    const requestId = crypto.randomUUID();
    
    try {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparatedChallenge = Buffer.concat([
        Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8'),
        canonicalChallengeBytes
      ]);
      const signatureBase64url = await identityAdapter.signChallenge(domainSeparatedChallenge);
      const proof = { challenge, signature: signatureBase64url };

      // First call
      const res1 = await activationService.executeActivation(client, requestId, licenseKey, deviceKeyId, publicKey, proof);
      expect(res1.status).toBe('SUCCESS');

      // Re-create proof is technically invalid for same DB transaction since challenge is consumed, 
      // but idempotency checks should bypass verifying proof again if it recognizes the RequestID!
      
      const res2 = await activationService.executeActivation(client, requestId, licenseKey, deviceKeyId, publicKey, proof);
      expect(res2.status).toBe('SUCCESS');
      expect(res2.payload?.authorization).toEqual(res1.payload?.authorization);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('should reject different payload on same request ID (ACTIVATION_REQUEST_CONFLICT)', async () => {
    const client = await pool.connect();
    const requestId = crypto.randomUUID();
    
    try {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparatedChallenge = Buffer.concat([Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8'), canonicalChallengeBytes]);
      const signatureBase64url = await identityAdapter.signChallenge(domainSeparatedChallenge);
      const proof = { challenge, signature: signatureBase64url };

      await activationService.executeActivation(client, requestId, licenseKey, deviceKeyId, publicKey, proof);
      
      // Attempt with different deviceKeyId
      await expect(
        activationService.executeActivation(client, requestId, licenseKey, 'DIFFERENT-DEVICE', publicKey, proof)
      ).rejects.toThrow('Request ID reused with different payload');

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('should reject a tampered challenge signature', async () => {
    const client = await pool.connect();
    const requestId = crypto.randomUUID();
    
    try {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparatedChallenge = Buffer.concat([Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8'), canonicalChallengeBytes]);
      let signatureBase64url = await identityAdapter.signChallenge(domainSeparatedChallenge);
      
      // Tamper signature
      const sigBuf = Buffer.from(signatureBase64url, 'base64url');
      sigBuf[sigBuf.length - 1] ^= 0xff;
      signatureBase64url = sigBuf.toString('base64url');

      const proof = { challenge, signature: signatureBase64url };

      await expect(
        activationService.executeActivation(client, requestId, licenseKey, deviceKeyId, publicKey, proof)
      ).rejects.toThrow('Device signature verification failed');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
  
  it('should reject a replay of an already consumed challenge (SEC-04)', async () => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparatedChallenge = Buffer.concat([Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8'), canonicalChallengeBytes]);
      const signatureBase64url = await identityAdapter.signChallenge(domainSeparatedChallenge);
      const proof = { challenge, signature: signatureBase64url };

      // Consume first time
      await activationService.executeActivation(client, crypto.randomUUID(), licenseKey, deviceKeyId, publicKey, proof);
      
      // Try using the exact same challenge again on a NEW activation request ID
      await expect(
        activationService.executeActivation(client, crypto.randomUUID(), licenseKey, deviceKeyId, publicKey, proof)
      ).rejects.toThrow('Challenge is invalid, expired, or has already been consumed');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
