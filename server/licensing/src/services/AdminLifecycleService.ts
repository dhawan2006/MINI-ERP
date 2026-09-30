import { PoolClient } from 'pg';
import { AuditService } from './AuditService';
import { v4 as uuidv4 } from 'uuid';

export class AdminLifecycleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AdminLifecycleError';
  }
}

export class AdminLifecycleService {
  static async releaseBinding(
    client: PoolClient,
    adminId: string,
    licenseId: string,
    deviceKeyId: string,
    reason: string
  ): Promise<void> {
    const bindingRes = await client.query(
      `SELECT id, status FROM license_bindings 
       WHERE license_id = $1 AND device_key_id = $2 
       FOR UPDATE`,
      [licenseId, deviceKeyId]
    );

    if (bindingRes.rows.length === 0) {
      throw new AdminLifecycleError('BINDING_NOT_FOUND', 'No binding found for this device and license');
    }

    const binding = bindingRes.rows[0];

    if (binding.status === 'DEACTIVATED') {
      throw new AdminLifecycleError('ALREADY_DEACTIVATED', 'Binding is already deactivated');
    }

    const now = new Date().toISOString();

    await client.query(
      `UPDATE license_bindings 
       SET status = 'DEACTIVATED', deactivated_at = $1 
       WHERE id = $2`,
      [now, binding.id]
    );

    await AuditService.recordEvent(
      client,
      'ADMIN_RELEASE_BINDING',
      { bindingId: binding.id, reason },
      licenseId,
      deviceKeyId,
      undefined,
      adminId
    );
  }

  static async revokeLicense(
    client: PoolClient,
    adminId: string,
    licenseId: string,
    reason: string
  ): Promise<void> {
    const res = await client.query(
      `SELECT status FROM licenses WHERE id = $1 FOR UPDATE`,
      [licenseId]
    );
    if (res.rows.length === 0) {
      throw new AdminLifecycleError('LICENSE_NOT_FOUND', 'License not found');
    }

    const license = res.rows[0];
    if (license.status === 'REVOKED') {
      throw new AdminLifecycleError('ALREADY_REVOKED', 'License is already revoked');
    }

    await client.query(
      `UPDATE licenses SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1`,
      [licenseId]
    );

    // Also deactivate all active bindings
    await client.query(
      `UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE license_id = $1 AND status = 'ACTIVE'`,
      [licenseId]
    );

    await AuditService.recordEvent(
      client,
      'ADMIN_REVOKE_LICENSE',
      { reason },
      licenseId,
      undefined,
      undefined,
      adminId
    );
  }

  static async restoreLicense(
    client: PoolClient,
    adminId: string,
    licenseId: string,
    reason: string
  ): Promise<void> {
    const res = await client.query(
      `SELECT status FROM licenses WHERE id = $1 FOR UPDATE`,
      [licenseId]
    );
    if (res.rows.length === 0) {
      throw new AdminLifecycleError('LICENSE_NOT_FOUND', 'License not found');
    }

    const license = res.rows[0];
    if (license.status !== 'REVOKED') {
      throw new AdminLifecycleError('INVALID_STATE', 'License is not revoked');
    }

    await client.query(
      `UPDATE licenses SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1`,
      [licenseId]
    );

    await AuditService.recordEvent(
      client,
      'ADMIN_RESTORE_LICENSE',
      { reason },
      licenseId,
      undefined,
      undefined,
      adminId
    );
  }
}
