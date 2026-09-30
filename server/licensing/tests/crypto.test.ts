import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { pool } from '../src/config/db';
import { CryptoError } from '../src/crypto/cryptoError';
import { ServerAuthorizationSigner, AuthorizationPayload } from '../src/crypto/ServerAuthorizationSigner';
import { AuthorizationVerifier } from '../src/crypto/AuthorizationVerifier';
import { ChallengeService, DeviceChallenge } from '../src/crypto/ChallengeService';
import { DeviceProofVerifier, DeviceProof } from '../src/crypto/DeviceProofVerifier';
import { canonicalize } from '../src/crypto/canonicalize';
import { runMigrations } from '../scripts/migrate';
import { clearDatabase } from './dbCleaner';

describe('Phase 3 - Cryptographic Protocol Tests', () => {
  
  // Test Server Key
  let serverPrivateKeyPem: string;
  let serverPublicKeyPem: string;
  const serverKeyId = 'mpos-sign-test-01';

  // Test Device Key
  let devicePrivateKeyPem: string;
  let devicePublicKeyPem: string;
  const deviceKeyId = 'test-device-123';

  beforeAll(async () => {
    await runMigrations();
    await clearDatabase();

    // Generate ephemeral test keys for Ed25519
    const serverKey = crypto.generateKeyPairSync('ed25519');
    serverPrivateKeyPem = serverKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    serverPublicKeyPem = serverKey.publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const deviceKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    devicePrivateKeyPem = deviceKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const pubKeyDer = deviceKey.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    devicePublicKeyPem = pubKeyDer.slice(-65).toString('base64url');
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Section 2-9, 18-21: Authorization Signing and Verification', () => {
    const signer = new ServerAuthorizationSigner();
    const verifier = new AuthorizationVerifier();

    beforeAll(() => {
      signer.registerKey(serverKeyId, serverPrivateKeyPem);
      verifier.registerTrustedKey(serverKeyId, serverPublicKeyPem);
    });

    const payload: AuthorizationPayload = {
      protocolVersion: 1,
      authorizationVersion: 1,
      licenseId: crypto.randomUUID(),
      productId: 'PROD_1',
      deviceKeyId,
      signingKeyId: serverKeyId,
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      issuedAt: new Date().toISOString(),
    };

    it('should correctly sign and verify a valid payload', () => {
      const signed = signer.sign(payload);
      expect(signed.protocolVersion).toBe(1);
      expect(signed.signingKeyId).toBe(serverKeyId);
      expect(signed.signature).toMatch(/^[A-Za-z0-9_-]+$/); // Base64url

      const verifiedPayload = verifier.verify(signed);
      expect(verifiedPayload).toEqual(payload);
    });

    it('should generate a cross-implementation test vector', () => {
      const signed = signer.sign(payload);
      const vector = {
        serverPublicKeyPem,
        signedAuthorization: signed
      };
      
      const dir = path.join(__dirname, 'fixtures', 'crypto');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'vector1.json'), JSON.stringify(vector, null, 2));
      
      // Proof of existence
      expect(fs.existsSync(path.join(dir, 'vector1.json'))).toBe(true);
    });

    it('should reject a missing or invalid signature', () => {
      const signed = signer.sign(payload);
      
      const tampered1 = { ...signed, signature: 'A' + signed.signature.substring(1) };
      expect(() => verifier.verify(tampered1)).toThrowError(CryptoError);
      
      const tampered2 = { ...signed, signature: undefined };
      expect(() => verifier.verify(tampered2)).toThrowError(CryptoError);
      
      const tampered3 = { ...signed, signature: signed.signature + '===' }; // not valid base64url padding
      expect(() => verifier.verify(tampered3)).toThrowError(CryptoError);
    });

    it('should reject a modified payload', () => {
      const signed = signer.sign(payload);
      
      const tamperedPayload = { ...payload, productId: 'PROD_2' };
      const tamperedEnvelope = { ...signed, payload: tamperedPayload };
      
      expect(() => verifier.verify(tamperedEnvelope)).toThrowError(/verification failed/);
    });

    it('should reject an unknown key ID', () => {
      const signed = signer.sign(payload);
      const tamperedEnvelope = { ...signed, signingKeyId: 'unknown-key' };
      
      expect(() => verifier.verify(tamperedEnvelope)).toThrowError(/Untrusted or unknown Key ID/);
    });

    it('should reject unsupported versions', () => {
      const badPayload = { ...payload, protocolVersion: 2 };
      expect(() => signer.sign(badPayload as any)).toThrowError(/Only protocol\/authorization version 1 is supported/i);
    });

    it('should canonicalize deterministically', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { b: 2, a: 1 };
      expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    });
  });

  describe('Section 10-17, 22-23: Challenge & Device Proof', () => {
    let client: any;

    beforeAll(async () => {
      client = await pool.connect();
    });

    afterAll(() => {
      client.release();
    });

    const signChallenge = (challenge: DeviceChallenge, pkPem: string): string => {
      const canonicalBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
      const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
      const key = crypto.createPrivateKey({ key: pkPem, format: 'pem' });
      return crypto.sign(null, dataToSign, key).toString('base64url');
    };

    it('should create and verify a valid device proof', async () => {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      
      const signature = signChallenge(challenge, devicePrivateKeyPem);
      
      const proof: DeviceProof = { challenge, signature };

      await expect(
        DeviceProofVerifier.verifyAndConsume(client, proof, devicePublicKeyPem, deviceKeyId, 'ACTIVATION')
      ).resolves.not.toThrow();
      
      await client.query('ROLLBACK'); // Rollback so we don't persist it for real
    });

    it('should reject a replay of a consumed challenge', async () => {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      const signature = signChallenge(challenge, devicePrivateKeyPem);
      const proof: DeviceProof = { challenge, signature };

      // First use succeeds
      await DeviceProofVerifier.verifyAndConsume(client, proof, devicePublicKeyPem, deviceKeyId, 'ACTIVATION');

      // Second use fails
      await expect(
        DeviceProofVerifier.verifyAndConsume(client, proof, devicePublicKeyPem, deviceKeyId, 'ACTIVATION')
      ).rejects.toThrowError(/already been consumed/);
      
      await client.query('ROLLBACK');
    });

    it('should reject a challenge signed by a different key', async () => {
      await client.query('BEGIN');
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      
      const otherKey = crypto.generateKeyPairSync('ed25519');
      const otherPrivateKeyPem = otherKey.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

      const signature = signChallenge(challenge, otherPrivateKeyPem);
      const proof: DeviceProof = { challenge, signature };

      await expect(
        DeviceProofVerifier.verifyAndConsume(client, proof, devicePublicKeyPem, deviceKeyId, 'ACTIVATION')
      ).rejects.toThrowError(/Device signature verification failed/);
      
      await client.query('ROLLBACK');
    });

    it('should enforce concurrency limits for single-use challenges', async () => {
      const challenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      const signature = signChallenge(challenge, devicePrivateKeyPem);
      const proof: DeviceProof = { challenge, signature };

      // Submit 100 simultaneous consume requests
      const promises = Array.from({ length: 100 }).map(async () => {
        const tempClient = await pool.connect();
        try {
          await DeviceProofVerifier.verifyAndConsume(tempClient, proof, devicePublicKeyPem, deviceKeyId, 'ACTIVATION');
          return 'SUCCESS';
        } catch (err: any) {
          if (err instanceof CryptoError && err.code === 'CHALLENGE_REPLAYED') {
            return 'REJECTED';
          }
          throw err;
        } finally {
          tempClient.release();
        }
      });

      const results = await Promise.all(promises);
      const successes = results.filter(r => r === 'SUCCESS');
      const rejections = results.filter(r => r === 'REJECTED');

      expect(successes.length).toBe(1);
      expect(rejections.length).toBe(99);
    });

    it('should safely reject malformed crypto payloads (fuzz testing)', async () => {
      // Missing proof entirely
      await expect(
        DeviceProofVerifier.verifyAndConsume(client, null, devicePublicKeyPem, deviceKeyId, 'ACTIVATION')
      ).rejects.toThrowError(CryptoError);

      // Random string
      await expect(
        DeviceProofVerifier.verifyAndConsume(client, 'invalid_payload', devicePublicKeyPem, deviceKeyId, 'ACTIVATION')
      ).rejects.toThrowError(CryptoError);

      const validChallenge = await ChallengeService.createChallenge(client, deviceKeyId, 'ACTIVATION', 60);
      
      // Null challenge field
      await expect(
        DeviceProofVerifier.verifyAndConsume(client, { challenge: null, signature: 'abc' }, devicePublicKeyPem, deviceKeyId, 'ACTIVATION')
      ).rejects.toThrowError(CryptoError);

      // Wrong key type / format
      await expect(
        DeviceProofVerifier.verifyAndConsume(client, { challenge: validChallenge, signature: 'abc' }, 'random_string', deviceKeyId, 'ACTIVATION')
      ).rejects.toThrowError(/Only uncompressed P-256 public keys are supported/);

      // Mismatched device ID check
      await expect(
        DeviceProofVerifier.verifyAndConsume(client, { challenge: validChallenge, signature: 'abc' }, devicePublicKeyPem, 'other_device', 'ACTIVATION')
      ).rejects.toThrowError(/Challenge does not belong to the expected device/);
    });
  });
});
