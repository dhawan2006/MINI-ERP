import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../src/config/db';
import { LicenseService } from '../src/services/LicenseService';
import { runMigrations } from '../scripts/migrate';
import { clearDatabase } from './dbCleaner';
import crypto from 'crypto';

describe('Audit: License Generation', () => {
  let dbClient: any;

  beforeAll(async () => {
    await runMigrations();
    await clearDatabase();
    dbClient = await pool.connect();
  });

  afterAll(async () => {
    if (dbClient) dbClient.release();
    await pool.end();
  });

  it('A1: Create a normal valid license', async () => {
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 86400000);
    const result = await LicenseService.createLicense(dbClient, 'PROD_1', validFrom, validUntil, 1);
    
    expect(result.licenseId).toBeDefined();
    expect(result.licenseKey).toMatch(/^[A-Z0-9-]{17}$/); // 15 chars + 2 hyphens
    
    // Verify plaintext is NOT stored
    const dbRes = await dbClient.query('SELECT * FROM licenses WHERE id = $1', [result.licenseId]);
    expect(dbRes.rows[0].license_key_hmac).not.toBe(result.licenseKey);
    expect(dbRes.rows[0].license_key_hmac).not.toContain(result.licenseKey.replace(/-/g, ''));
  });

  it('A2: License uniqueness over multiple creations', async () => {
    const keys = new Set();
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const result = await LicenseService.createLicense(dbClient, 'PROD_1', new Date(), new Date(Date.now() + 86400000), 1);
      keys.add(result.licenseKey);
      ids.add(result.licenseId);
    }
    expect(keys.size).toBe(100);
    expect(ids.size).toBe(100);
  });

  it('A3: License input boundaries - negative maxDevices', async () => {
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 86400000);
    await expect(LicenseService.createLicense(dbClient, 'PROD_1', validFrom, validUntil, -1))
      .rejects.toThrow(/chk_max_devices/);
  });

  it('A3: License input boundaries - zero maxDevices', async () => {
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 86400000);
    await expect(LicenseService.createLicense(dbClient, 'PROD_1', validFrom, validUntil, 0))
      .rejects.toThrow(/chk_max_devices/);
  });

  it('A3: License input boundaries - validFrom >= validUntil', async () => {
    const validFrom = new Date();
    const validUntil = new Date(); // Same time
    await expect(LicenseService.createLicense(dbClient, 'PROD_1', validFrom, validUntil, 1))
      .rejects.toThrow(/chk_valid_dates/);
  });

  it('A4: License status', async () => {
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 86400000);
    const result = await LicenseService.createLicense(dbClient, 'PROD_1', validFrom, validUntil, 1);
    const status = await LicenseService.getLicenseStatus(result.licenseId);
    expect(status.status).toBe('ACTIVE');

    await LicenseService.revokeLicense(dbClient, result.licenseId);
    const updatedStatus = await LicenseService.getLicenseStatus(result.licenseId);
    expect(updatedStatus.status).toBe('REVOKED');
    
    // Revoking again should throw
    await expect(LicenseService.revokeLicense(dbClient, result.licenseId))
      .rejects.toThrow(/LICENSE_NOT_FOUND_OR_ALREADY_REVOKED/);
  });
});
