import { PoolClient } from 'pg';
import { generateLicenseKey, hashLicenseKey } from '../crypto/licenseKey';
import { AuditService } from './AuditService';
import { query } from '../config/db';

export class LicenseService {
  /**
   * Admin-only: Creates a new commercial license.
   * Returns the plaintext license key exactly once.
   */
  static async createLicense(
    client: PoolClient,
    productId: string,
    validFrom: Date,
    validUntil: Date,
    maxDevices: number
  ): Promise<{ licenseId: string; licenseKey: string }> {
    const plaintextKey = generateLicenseKey();
    const hmac = hashLicenseKey(plaintextKey);

    const result = await client.query(
      `INSERT INTO licenses (product_id, license_key_hmac, status, valid_from, valid_until, max_devices)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [productId, hmac, 'ACTIVE', validFrom.toISOString(), validUntil.toISOString(), maxDevices]
    );

    const licenseId = result.rows[0].id;

    await AuditService.recordEvent(client, 'LICENSE_CREATED', {
      productId,
      maxDevices,
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString()
    }, licenseId);

    return { licenseId, licenseKey: plaintextKey };
  }

  static async revokeLicense(client: PoolClient, licenseId: string): Promise<void> {
    const result = await client.query(
      `UPDATE licenses 
       SET status = 'REVOKED', updated_at = NOW(), revoked_at = NOW()
       WHERE id = $1 AND status != 'REVOKED'
       RETURNING id`,
      [licenseId]
    );

    if (result.rowCount === 0) {
      throw new Error('LICENSE_NOT_FOUND_OR_ALREADY_REVOKED');
    }

    // Also conceptually, any active bindings remain ACTIVE in DB until deactivated,
    // though they can no longer be reactivated/renewed.

    await AuditService.recordEvent(client, 'LICENSE_REVOKED', {}, licenseId);
  }

  static async getLicenseStatus(licenseId: string): Promise<any> {
    const result = await query(
      `SELECT id, product_id, status, valid_from, valid_until, max_devices, created_at, revoked_at
       FROM licenses WHERE id = $1`,
      [licenseId]
    );
    return result.rows[0] || null;
  }
}
