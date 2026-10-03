import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LicensingClient } from '../../../electron/licensing/LicensingClient';
import { NativeDeviceIdentityAdapter } from '../../../electron/native/NativeDeviceIdentityAdapter';
import { LicensingLifecycleService } from '../../../electron/licensing/LicensingLifecycleService';

const API_BASE_URL = process.env.SUPABASE_QA_URL || `http://127.0.0.1:54321/functions/v1/api`;

describe('Client Compatibility - Supabase Edge Deactivation', () => {
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

  it('can activate and then deactivate against Supabase Local', async () => {
    const licenseKey = 'test-deact-valid'; // Must exist in the DB!
    const deviceKeyId = await hardware.getDeviceKeyId();
    const publicKey = await hardware.getPublicKey();

    // 1. Activate
    const challenge = await client.getChallenge(deviceKeyId);
    const { canonicalize } = await import('../../../src/shared/crypto/canonicalize');
    const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalChallengeBytes]);
    const signature = await hardware.signChallenge(dataToSign);

    const authorization = await client.activate(licenseKey, deviceKeyId, publicKey, { challenge, signature });
    expect(authorization).toBeDefined();
    
    await authStore.store(authorization);

    // 2. Deactivate
    await lifecycle.requestDeactivation();

    const stored = await authStore.load();
    expect(stored).toBeNull();
  });
});
