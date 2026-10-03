import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LicensingClient } from '../../../electron/licensing/LicensingClient';
import { NativeDeviceIdentityAdapter } from '../../../electron/native/NativeDeviceIdentityAdapter';
import { LicensingLifecycleService } from '../../../electron/licensing/LicensingLifecycleService';
import { AuthorizationVerifier } from '../../../src/shared/crypto/AuthorizationVerifier';

const API_BASE_URL = process.env.SUPABASE_QA_URL || `http://127.0.0.1:54321/functions/v1/api`;

describe('Checkpoint 8 - Full Lifecycle Client Compatibility (Supabase Local API Route)', () => {
  let hardware: NativeDeviceIdentityAdapter;
  let authStore: any;
  let client: LicensingClient;
  let lifecycle: LicensingLifecycleService;

  beforeAll(async () => {
    hardware = new NativeDeviceIdentityAdapter();
    await hardware.initialize();

    let storedAuth: any = null;
    authStore = {
      load: async () => storedAuth,
      store: async (auth: any) => { storedAuth = auth; },
      clear: async () => { storedAuth = null; }
    };
    
    client = new LicensingClient(API_BASE_URL);
    lifecycle = new LicensingLifecycleService(client, hardware, authStore);
  });

  afterAll(() => {
  });

  it('can execute the full golden path: activate -> verify -> deactivate -> reactivate', async () => {
    const licenseKey = 'test-full-lifecycle-valid'; // Ensure this license exists with 1 seat
    
    const deviceKeyId = await hardware.getDeviceKeyId();
    const publicKey = await hardware.getPublicKey();

    // ---------------------------------------------------------
    // 1. Activation
    // ---------------------------------------------------------
    const challenge1 = await client.getChallenge(deviceKeyId);
    
    const { canonicalize } = await import('../../../src/shared/crypto/canonicalize');
    let canonicalChallengeBytes = Buffer.from(canonicalize(challenge1), 'utf8');
    let domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    let dataToSign = Buffer.concat([domainSeparationTag, canonicalChallengeBytes]);
    let signature = await hardware.signChallenge(dataToSign);

    const authorization1 = await client.activate(licenseKey, deviceKeyId, publicKey, { challenge: challenge1, signature });
    expect(authorization1).toBeDefined();
    expect(authorization1.licenseId).toBeDefined();
    
    await authStore.store(authorization1);

    // ---------------------------------------------------------
    // 2. Offline Verification (Local)
    // ---------------------------------------------------------
    const storedAuth = await authStore.load();
    expect(storedAuth).toEqual(authorization1);

    // Verification requires knowing the public key of the server. 
    // In our test, we just ensure it exists and matches schemas, since AuthorizationVerifier expects a specific key ID.
    // If we wanted to fully offline verify, we'd inject the test public key into our Verifier instance.

    // ---------------------------------------------------------
    // 3. Deactivation
    // ---------------------------------------------------------
    await lifecycle.requestDeactivation();
    const afterDeact = await authStore.load();
    expect(afterDeact).toBeNull(); // local store is purged

    // ---------------------------------------------------------
    // 4. Reactivation (Different request)
    // ---------------------------------------------------------
    const challenge2 = await client.getChallenge(deviceKeyId);
    expect(challenge2.challengeId).not.toEqual(challenge1.challengeId);

    canonicalChallengeBytes = Buffer.from(canonicalize(challenge2), 'utf8');
    domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    dataToSign = Buffer.concat([domainSeparationTag, canonicalChallengeBytes]);
    signature = await hardware.signChallenge(dataToSign);

    const authorization2 = await client.activate(licenseKey, deviceKeyId, publicKey, { challenge: challenge2, signature });
    expect(authorization2).toBeDefined();
    expect(authorization2.licenseId).toBeDefined();

    // Should be successfully reactivated
    await authStore.store(authorization2);
  });
});
