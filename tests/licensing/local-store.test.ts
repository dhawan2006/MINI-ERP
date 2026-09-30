import { describe, expect, test, beforeAll, afterAll, beforeEach, vi as jest } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { LocalAuthorizationStore } from '../../src/infrastructure/licensing/LocalAuthorizationStore';
import { LicensingService } from '../../src/application/use-cases/LicensingService';
import { AuthorizationVerifier } from '../../server/licensing/src/crypto/AuthorizationVerifier';
import { ServerAuthorizationSigner, AuthorizationPayload, SignedAuthorization } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';
import { IDeviceIdentityProvider, DeviceIdentityStatus } from '../../electron/native/IDeviceIdentityProvider';
import { LocalAuthorizationError } from '../../src/application/interfaces/ILocalAuthorizationStore';
import crypto from 'crypto';

class MockIdentityProvider implements IDeviceIdentityProvider {
  async initialize(): Promise<void> {}
  async getStatus(): Promise<DeviceIdentityStatus> {
    return DeviceIdentityStatus.ACTIVE;
  }
  async getPublicKey(): Promise<string> {
    return 'mock-public-key';
  }
  async getDeviceKeyId(): Promise<string> {
    return 'mock-device-key-id';
  }
  async signChallenge(challengeBytes: Buffer): Promise<string> {
    return 'mock-signature';
  }
}

describe('Phase 6 Local Authorization Store', () => {
  const testUserDataPath = path.join(__dirname, 'test-user-data');
  const authFilePath = path.join(testUserDataPath, 'licensing', 'authorization.json');
  const authTmpFilePath = path.join(testUserDataPath, 'licensing', 'authorization.json.tmp');

  const signer = new ServerAuthorizationSigner();
  const verifier = new AuthorizationVerifier();
  const identityProvider = new MockIdentityProvider();
  let store: LocalAuthorizationStore;
  let service: LicensingService;

  // We need a key pair to sign and verify.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  
  beforeAll(async () => {
    signer.registerKey('server-key-1', privPem);
    verifier.registerTrustedKey('server-key-1', pubPem);
    await fs.mkdir(testUserDataPath, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testUserDataPath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    store = new LocalAuthorizationStore(testUserDataPath);
    service = new LicensingService(store, verifier, identityProvider);
    await store.clear();
  });

  const generateValidPayload = (offsetDays = 1, issuedAtOffsetDays = 0): AuthorizationPayload => {
    const now = new Date();
    const validFrom = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
    const validUntil = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    const issuedAt = new Date(now.getTime() + issuedAtOffsetDays * 24 * 60 * 60 * 1000);

    return {
      protocolVersion: 1,
      authorizationVersion: 1,
      licenseId: 'TEST-LIC-' + crypto.randomBytes(4).toString('hex'),
      productId: 'MINIPOS-V1',
      deviceKeyId: 'mock-device-key-id',
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
      issuedAt: issuedAt.toISOString(),
      signingKeyId: 'server-key-1'
    };
  };

  test('Missing authorization correctly fails closed', async () => {
    const state = await service.initialize();
    expect(state.isActivated).toBe(false);
    expect(state.error).toBe('NOT_ACTIVATED');
  });

  test('Restart-style initialization loads valid authorization successfully', async () => {
    const signedAuth = signer.sign(generateValidPayload());
    
    // Simulate activation saving it
    await service.saveNewAuthorization(signedAuth);

    // Simulate complete process restart by instantiating new service & store
    const newStore = new LocalAuthorizationStore(testUserDataPath);
    const newService = new LicensingService(newStore, verifier, identityProvider);

    // Offline startup! No network calls here.
    const state = await newService.initialize();
    
    expect(state.isActivated).toBe(true);
    expect(state.licenseId).toBe(signedAuth.licenseId);
  });

  test('Offline behavior: works even if "server" is totally unavailable', async () => {
    const signedAuth = signer.sign(generateValidPayload());
    await service.saveNewAuthorization(signedAuth);

    // We do not even pass any network-capable objects into LicensingService
    // Its behavior is entirely offline based on the local file.
    const state = await service.initialize();
    expect(state.isActivated).toBe(true);
  });

  test('Anti-rollback: Reject older authorization', async () => {
    const payloadOld = generateValidPayload();
    payloadOld.issuedAt = '2020-01-01T00:00:00Z';
    const signedOld = signer.sign(payloadOld);

    const payloadNew = generateValidPayload();
    payloadNew.issuedAt = '2025-01-01T00:00:00Z';
    const signedNew = signer.sign(payloadNew);

    // Save older first (simulate old valid state)
    await store.save(signedOld);
    const state1 = await service.initialize();
    expect(state1.isActivated).toBe(true);

    // Now accept newer
    await service.saveNewAuthorization(signedNew);
    const state2 = await service.initialize();
    expect(state2.isActivated).toBe(true);
    expect(state2.licenseId).toBe(payloadNew.licenseId);

    // Try to rollback
    await expect(service.saveNewAuthorization(signedOld)).rejects.toThrow('Cannot replace current authorization with an older one.');
    
    // Simulating attacker replacing the file on disk behind our back
    await store.save(signedOld);
    
    // Restart... but notice! If the attacker manually overwrites the file and the service restarts, 
    // we only catch anti-rollback if we have the *newer* authorization as a reference.
    // As documented, a file deletion/overwrite without an OS marker bypasses anti-rollback across restarts.
    // The requirement was: "Implement anti-rollback protection only using protocol-supported ordering semantics. Document the limitation."
  });

  describe('Tampering Tests (Fail Closed)', () => {
    test('A. Modify licenseId', async () => {
      const signed = signer.sign(generateValidPayload());
      signed.licenseId = 'TAMPERED';
      await store.save(signed); // Write directly to bypass save-verification
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('B. Modify deviceKeyId', async () => {
      const signed = signer.sign(generateValidPayload());
      signed.deviceKeyId = 'TAMPERED';
      await store.save(signed);
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('F. Modify signature bytes', async () => {
      const signed = signer.sign(generateValidPayload());
      signed.signature = 'aaaaa' + signed.signature.substring(5);
      await store.save(signed);
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('G. Random JSON', async () => {
      await fs.mkdir(path.dirname(authFilePath), { recursive: true });
      await fs.writeFile(authFilePath, '{"hello":"world"}');
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('CORRUPT_OR_MALFORMED_AUTHORIZATION');
    });

    test('C. Modify validFrom', async () => {
      const signed = signer.sign(generateValidPayload());
      signed.validFrom = new Date(Date.now() - 1000).toISOString();
      await store.save(signed);
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('D. Modify validUntil', async () => {
      const signed = signer.sign(generateValidPayload());
      signed.validUntil = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
      await store.save(signed);
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('E. Modify protocolVersion', async () => {
      const signed = signer.sign(generateValidPayload());
      signed.protocolVersion = 2;
      await store.save(signed);
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('H. Untrusted signing key', async () => {
      const untrustedSigner = new ServerAuthorizationSigner();
      const { privateKey } = crypto.generateKeyPairSync('ed25519');
      untrustedSigner.registerKey('untrusted-key', privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
      
      const payload = generateValidPayload();
      payload.signingKeyId = 'untrusted-key';
      const signed = untrustedSigner.sign(payload);
      
      await store.save(signed);
      
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_SIGNATURE_INVALID');
    });

    test('I. Copy authorization from another device', async () => {
      const payload = generateValidPayload();
      payload.deviceKeyId = 'another-device-id';
      const signed = signer.sign(payload);
      
      // Save it bypassing the service
      await store.save(signed);
      
      // Load it
      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_DEVICE_MISMATCH');
    });
  });

  describe('Time Expiry', () => {
    test('Authorization expired', async () => {
      const payload = generateValidPayload();
      const past = new Date(Date.now() - 10000).toISOString();
      payload.validFrom = new Date(Date.now() - 20000).toISOString();
      payload.validUntil = past; // expired
      const signed = signer.sign(payload);
      await store.save(signed);

      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_EXPIRED');
    });

    test('Authorization not yet valid', async () => {
      const payload = generateValidPayload();
      const future = new Date(Date.now() + 10000).toISOString();
      payload.validFrom = future;
      const signed = signer.sign(payload);
      await store.save(signed);

      const state = await service.initialize();
      expect(state.isActivated).toBe(false);
      expect(state.error).toBe('AUTHORIZATION_EXPIRED');
    });
  });

  describe('Atomic Persistence & Crash Safety', () => {
    test('Successful save overwrites gracefully', async () => {
      const signed1 = signer.sign(generateValidPayload(-1, 0)); // will be expired
      await store.save(signed1);
      
      const signed2 = signer.sign(generateValidPayload(1, 1));
      await service.saveNewAuthorization(signed2);

      const state = await service.initialize();
      expect(state.isActivated).toBe(true);
      expect(state.licenseId).toBe(signed2.licenseId);
      
      // Temp file is gone
      await expect(fs.access(authTmpFilePath)).rejects.toThrow();
    });

    test('Atomic write leaves previous file untouched if it fails midway', async () => {
      const signed1 = signer.sign(generateValidPayload());
      await service.saveNewAuthorization(signed1);

      // Force a failure during the next save by overriding rename
      const originalRename = fs.rename;
      fs.rename = jest.fn().mockRejectedValue(new Error('Simulated crash during rename')) as any;

      const signed2 = signer.sign(generateValidPayload(2, 2));
      await expect(store.save(signed2)).rejects.toThrow('Simulated crash during rename');

      // Restore
      fs.rename = originalRename;

      // Ensure original file is still there and still valid
      const state = await service.initialize();
      expect(state.isActivated).toBe(true);
      expect(state.licenseId).toBe(signed1.licenseId);
    });
  });

  test('Key loss fails closed', async () => {
    const signed = signer.sign(generateValidPayload());
    await service.saveNewAuthorization(signed);

    // Simulate key loss
    class NoKeyIdentityProvider extends MockIdentityProvider {
      async getStatus(): Promise<DeviceIdentityStatus> {
        return DeviceIdentityStatus.KEY_MISSING;
      }
    }
    const noKeyService = new LicensingService(store, verifier, new NoKeyIdentityProvider());
    
    const state = await noKeyService.initialize();
    expect(state.isActivated).toBe(false);
    expect(state.error).toBe('SECURE_IDENTITY_UNAVAILABLE');
  });
});
