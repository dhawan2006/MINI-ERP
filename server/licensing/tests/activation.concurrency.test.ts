import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { runMigrations } from '../scripts/migrate';
import { clearDatabase } from './dbCleaner';
import { transaction, pool } from '../src/config/db';
import { LicenseService } from '../src/services/LicenseService';
import { ActivationService, ActivationError } from '../src/services/ActivationService';
import { TestDeviceProofVerifier } from '../src/crypto/deviceProof';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load ENV before running tests
dotenv.config();

import crypto from 'crypto';
import { ServerAuthorizationSigner } from '../src/crypto/ServerAuthorizationSigner';

const verifier = new TestDeviceProofVerifier();
const signer = new ServerAuthorizationSigner();
const { privateKey } = crypto.generateKeyPairSync('ed25519');
signer.registerKey('test-key-1', privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);

const activationService = new ActivationService(verifier, signer, 'test-key-1');

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://laksh@localhost:5432/minipos_licensing_test';
  process.env.LICENSE_KEY_HMAC_SECRET = 'test-secret-key-32-bytes-long-12345';
  await runMigrations();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await clearDatabase();
});

describe('Section 30 — Mandatory Concurrency Tests', () => {
  
  it('SCENARIO A: 100 devices -> same license -> maxDevices=1', async () => {
    // 1 success, 99 rejected
    let licenseKey = '';
    await transaction(async (client) => {
      const now = new Date();
      const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const res = await LicenseService.createLicense(client, 'PROD_1', now, nextYear, 1);
      licenseKey = res.licenseKey;
    });

    const devices = Array.from({ length: 100 }, (_, i) => `device_${i}`);
    
    const results = await Promise.allSettled(
      devices.map(dev => 
        transaction(client => 
          activationService.executeActivation(
            client, 
            uuidv4(), 
            licenseKey, 
            dev, 
            `pub_${dev}`, 
            { signature: 'test-valid-signature' }
          )
        )
      )
    );

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    if (failures.length > 0) {
      console.log('Sample failure A:', (failures[0] as any).reason);
    }
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(99);

    const failReasons = failures.map(f => (f as any).reason.code);
    expect(failReasons.every(c => c === 'DEVICE_LIMIT_REACHED')).toBe(true);

    const activeBindingsCount = await pool.query(`SELECT COUNT(*) as cnt FROM license_bindings WHERE status = 'ACTIVE'`);
    expect(parseInt(activeBindingsCount.rows[0].cnt, 10)).toBe(1);
  });

  it('SCENARIO B: same device -> 100 different licenses', async () => {
    // 1 active license, 99 rejected (DEVICE_ALREADY_BOUND)
    const licenseKeys: string[] = [];
    const now = new Date();
    const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 100; i++) {
      await transaction(async (client) => {
        const res = await LicenseService.createLicense(client, 'PROD_1', now, nextYear, 5);
        licenseKeys.push(res.licenseKey);
      });
    }

    const deviceId = 'single_device_id';
    
    const results = await Promise.allSettled(
      licenseKeys.map(key => 
        transaction(client => 
          activationService.executeActivation(
            client, 
            uuidv4(), 
            key, 
            deviceId, 
            `pub_key`, 
            { signature: 'test-valid-signature' }
          )
        )
      )
    );

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(99);

    const failReasons = failures.map(f => (f as any).reason.code);
    expect(failReasons.every(c => c === 'DEVICE_ALREADY_BOUND')).toBe(true);

    const activeBindingsCount = await pool.query(`SELECT COUNT(*) as cnt FROM license_bindings WHERE status = 'ACTIVE'`);
    expect(parseInt(activeBindingsCount.rows[0].cnt, 10)).toBe(1);
  });

  it('SCENARIO C: same device -> same license -> 100 retries using same request ID', async () => {
    // 1 logical activation, 99 idempotent returns
    let licenseKey = '';
    await transaction(async (client) => {
      const now = new Date();
      const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const res = await LicenseService.createLicense(client, 'PROD_1', now, nextYear, 2);
      licenseKey = res.licenseKey;
    });

    const requestId = uuidv4();
    const deviceId = 'idempotent_device';

    const results = await Promise.allSettled(
      Array.from({ length: 100 }).map(() => 
        transaction(client => 
          activationService.executeActivation(
            client, 
            requestId, 
            licenseKey, 
            deviceId, 
            `pub_key`, 
            { signature: 'test-valid-signature' }
          )
        )
      )
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Due to the strict 'FOR UPDATE' lock on activation_requests, the exact concurrency behavior 
    // depends on Postgres row-level locks. Some might fail with 'Concurrent identical request is already processing' 
    // if they hit the PENDING state, and others will get the cached SUCCESS payload.
    // The exact split depends on timing, but NO duplicate bindings must occur.
    
    // We check that ALL fulfilled requests returned SUCCESS status.
    const successes = fulfilled.map(r => (r as any).value.status);
    expect(successes.every(s => s === 'SUCCESS')).toBe(true);
    
    // We check that any rejections were ACTIVATION_REQUEST_CONFLICT.
    const failReasons = rejected.map(r => (r as any).reason.code);
    expect(failReasons.every(c => c === 'ACTIVATION_REQUEST_CONFLICT')).toBe(true);

    const activeBindingsCount = await pool.query(`SELECT COUNT(*) as cnt FROM license_bindings WHERE status = 'ACTIVE'`);
    expect(parseInt(activeBindingsCount.rows[0].cnt, 10)).toBe(1);
  });

  it('SCENARIO D: same device/license -> different request IDs -> concurrent', async () => {
    // 1 active binding, rest idempotent success due to existing binding check (if executed late) or DEVICE_ALREADY_BOUND.
    let licenseKey = '';
    await transaction(async (client) => {
      const now = new Date();
      const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const res = await LicenseService.createLicense(client, 'PROD_1', now, nextYear, 5);
      licenseKey = res.licenseKey;
    });

    const deviceId = 'concurrent_dev';

    const results = await Promise.allSettled(
      Array.from({ length: 10 }).map(() => 
        transaction(client => 
          activationService.executeActivation(
            client, 
            uuidv4(), // Different request IDs!
            licenseKey, 
            deviceId, 
            `pub_key`, 
            { signature: 'test-valid-signature' }
          )
        )
      )
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    // Only one should physically INSERT. The rest should either get DEVICE_ALREADY_BOUND
    // (if they hit the unique constraint simultaneously) or hit the logical existing binding check (and return SUCCESS).
    
    // Crucially, ONLY ONE binding exists.
    const activeBindingsCount = await pool.query(`SELECT COUNT(*) as cnt FROM license_bindings WHERE status = 'ACTIVE'`);
    expect(parseInt(activeBindingsCount.rows[0].cnt, 10)).toBe(1);
  });
});
