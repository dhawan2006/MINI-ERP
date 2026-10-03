import { Sql } from '../database/db.ts';
import { AuditService } from './AuditService.ts';

export class AdminLifecycleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AdminLifecycleError';
  }
}

export class AdminLifecycleService {
  static async releaseBinding(
    tx: Sql,
    adminId: string,
    licenseId: string,
    deviceKeyId: string,
    reason: string
  ): Promise<void> {
    const bindingRes = await tx`
      SELECT id, status FROM license_bindings 
      WHERE license_id = ${licenseId} AND device_key_id = ${deviceKeyId} 
      FOR UPDATE
    `;

    if (bindingRes.length === 0) {
      throw new AdminLifecycleError('BINDING_NOT_FOUND', 'No binding found for this device and license');
    }

    const binding = bindingRes[0];

    if (binding.status === 'DEACTIVATED') {
      throw new AdminLifecycleError('ALREADY_DEACTIVATED', 'Binding is already deactivated');
    }

    const now = new Date().toISOString();

    await tx`
      UPDATE license_bindings 
      SET status = 'DEACTIVATED', deactivated_at = ${now} 
      WHERE id = ${binding.id}
    `;

    await AuditService.recordEvent(
      tx,
      'ADMIN_RELEASE_BINDING',
      { bindingId: binding.id, reason },
      licenseId,
      deviceKeyId,
      undefined,
      adminId
    );
  }

  static async revokeLicense(
    tx: Sql,
    adminId: string,
    licenseId: string,
    reason: string
  ): Promise<void> {
    const res = await tx`
      SELECT status FROM licenses WHERE id = ${licenseId} FOR UPDATE
    `;
    
    if (res.length === 0) {
      throw new AdminLifecycleError('LICENSE_NOT_FOUND', 'License not found');
    }

    const license = res[0];
    if (license.status === 'REVOKED') {
      throw new AdminLifecycleError('ALREADY_REVOKED', 'License is already revoked');
    }

    await tx`
      UPDATE licenses SET status = 'REVOKED', revoked_at = NOW() WHERE id = ${licenseId}
    `;

    // Also deactivate all active bindings
    await tx`
      UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE license_id = ${licenseId} AND status = 'ACTIVE'
    `;

    await AuditService.recordEvent(
      tx,
      'ADMIN_REVOKE_LICENSE',
      { reason },
      licenseId,
      undefined,
      undefined,
      adminId
    );
  }

  static async restoreLicense(
    tx: Sql,
    adminId: string,
    licenseId: string,
    reason: string
  ): Promise<void> {
    const res = await tx`
      SELECT status FROM licenses WHERE id = ${licenseId} FOR UPDATE
    `;
    
    if (res.length === 0) {
      throw new AdminLifecycleError('LICENSE_NOT_FOUND', 'License not found');
    }

    const license = res[0];
    if (license.status !== 'REVOKED') {
      throw new AdminLifecycleError('INVALID_STATE', 'License is not revoked');
    }

    await tx`
      UPDATE licenses SET status = 'ACTIVE', revoked_at = NULL WHERE id = ${licenseId}
    `;

    await AuditService.recordEvent(
      tx,
      'ADMIN_RESTORE_LICENSE',
      { reason },
      licenseId,
      undefined,
      undefined,
      adminId
    );
  }

  static async disableLicense(
    tx: Sql,
    adminId: string,
    licenseId: string,
    reason: string
  ): Promise<void> {
    const res = await tx`
      SELECT status FROM licenses WHERE id = ${licenseId} FOR UPDATE
    `;
    
    if (res.length === 0) {
      throw new AdminLifecycleError('LICENSE_NOT_FOUND', 'License not found');
    }

    const license = res[0];
    if (license.status === 'DISABLED') {
      throw new AdminLifecycleError('ALREADY_DISABLED', 'License is already disabled');
    }

    await tx`
      UPDATE licenses SET status = 'DISABLED' WHERE id = ${licenseId}
    `;

    // Also deactivate bindings? Typically yes for disabled.
    await tx`
      UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE license_id = ${licenseId} AND status = 'ACTIVE'
    `;

    await AuditService.recordEvent(
      tx,
      'ADMIN_DISABLE_LICENSE',
      { reason },
      licenseId,
      undefined,
      undefined,
      adminId
    );
  }

  static async extendLicense(
    tx: Sql,
    adminId: string,
    licenseId: string,
    newValidUntil: string,
    reason: string
  ): Promise<void> {
    const res = await tx`
      SELECT status, valid_until FROM licenses WHERE id = ${licenseId} FOR UPDATE
    `;
    
    if (res.length === 0) {
      throw new AdminLifecycleError('LICENSE_NOT_FOUND', 'License not found');
    }

    const license = res[0];
    
    await tx`
      UPDATE licenses SET valid_until = ${newValidUntil} WHERE id = ${licenseId}
    `;

    await AuditService.recordEvent(
      tx,
      'ADMIN_EXTEND_LICENSE',
      { reason, oldValidUntil: license.valid_until, newValidUntil },
      licenseId,
      undefined,
      undefined,
      adminId
    );
  }
}
