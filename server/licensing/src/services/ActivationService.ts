import { PoolClient } from 'pg';
import { hashLicenseKey } from '../crypto/licenseKey';
import { AuditService } from './AuditService';
import { DeviceService } from './DeviceService';
import { IDeviceProofVerifier } from '../crypto/deviceProof';
import crypto from 'crypto';

export class ActivationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ActivationError';
  }
}

import { ServerAuthorizationSigner, SignedAuthorization } from '../crypto/ServerAuthorizationSigner';

export class ActivationService {
  constructor(
    private proofVerifier: IDeviceProofVerifier,
    private signer: ServerAuthorizationSigner,
    private defaultSigningKeyId: string  // Required — no insecure default (Phase 12)
  ) {}

  /**
   * Executes the full activation transaction.
   */
  async executeActivation(
    client: PoolClient,
    requestId: string,
    licenseKey: string,
    deviceKeyId: string,
    publicKey: string,
    deviceProof: any
  ): Promise<{ status: string; licenseId?: string; payload?: any }> {
    
    // 1. Validate request idempotency before making any changes
    const requestFingerprint = crypto.createHash('sha256')
      .update(`${licenseKey}:${deviceKeyId}:${publicKey}`)
      .digest('hex');

    // Idempotency Race Protection
    await client.query(
      `INSERT INTO activation_requests (request_id, request_fingerprint, status, created_at)
       VALUES ($1, $2, 'PENDING', NOW())
       ON CONFLICT (request_id) DO NOTHING`,
      [requestId, requestFingerprint]
    );

    const idempCheck = await client.query(
      `SELECT status, response_payload, request_fingerprint FROM activation_requests WHERE request_id = $1 FOR UPDATE`,
      [requestId]
    );

    const existing = idempCheck.rows[0];
    if (existing.status !== 'PENDING') {
      if (existing.request_fingerprint !== requestFingerprint) {
        throw new ActivationError('ACTIVATION_REQUEST_CONFLICT', 'Request ID reused with different payload');
      }
      return { status: existing.status, payload: existing.response_payload };
    }
    // If it's PENDING but fingerprint differs, it's a conflict
    if (existing.request_fingerprint !== requestFingerprint) {
      throw new ActivationError('ACTIVATION_REQUEST_CONFLICT', 'Request ID reused with different payload');
    }

    try {
      // 3. Authenticate Device (Boundary for Phase 2 crypto)
      try {
        await this.proofVerifier.verify(client, deviceProof, publicKey, deviceKeyId, 'ACTIVATION');
      } catch (err: any) {
        throw new ActivationError('DEVICE_PROOF_INVALID', err.message || 'Cryptographic device proof failed');
      }

      // 4. Verify License existence and state
      const hmac = hashLicenseKey(licenseKey);
      
      // We lock the license row to prevent max_devices concurrent race conditions.
      const licenseRes = await client.query(
        `SELECT id, product_id, status, valid_from, valid_until, max_devices 
         FROM licenses 
         WHERE license_key_hmac = $1 
         FOR UPDATE`,
        [hmac]
      );

      if (licenseRes.rows.length === 0) {
        throw new ActivationError('LICENSE_NOT_FOUND', 'The license key provided is invalid');
      }

      const license = licenseRes.rows[0];
      const licenseId = license.id;

      // 5. Register device
      await DeviceService.registerOrUpdateDevice(client, deviceKeyId, publicKey);

      // Update request with discovered license and device
      await client.query(`UPDATE activation_requests SET license_id = $1, device_key_id = $2 WHERE request_id = $3`, [licenseId, deviceKeyId, requestId]);

      if (license.status === 'REVOKED') {
        throw new ActivationError('LICENSE_REVOKED', 'This license has been revoked');
      }
      if (license.status !== 'ACTIVE') {
        throw new ActivationError('LICENSE_DISABLED', 'This license is disabled');
      }

      const now = new Date();
      if (now < new Date(license.valid_from) || now >= new Date(license.valid_until)) {
        throw new ActivationError('LICENSE_EXPIRED', 'This license is expired or not yet valid');
      }

      // 6. Check existing binding for this device on this license
      const existingBindingRes = await client.query(
        `SELECT id, status FROM license_bindings WHERE license_id = $1 AND device_key_id = $2 ORDER BY activated_at DESC LIMIT 1 FOR UPDATE`,
        [licenseId, deviceKeyId]
      );

      if (existingBindingRes.rows.length > 0 && existingBindingRes.rows[0].status === 'ACTIVE') {
        // Device is already bound and active. Idempotent logical success.
        const authPayload = this.signer.sign({
          protocolVersion: 1,
          authorizationVersion: 1,
          licenseId: license.id,
          productId: license.product_id,
          deviceKeyId,
          validFrom: new Date(license.valid_from).toISOString(),
          validUntil: new Date(license.valid_until).toISOString(),
          issuedAt: new Date().toISOString(),
          signingKeyId: this.defaultSigningKeyId
        });
        const payload = { authorization: authPayload, licenseId };
        await this.completeRequest(client, requestId, 'SUCCESS', payload);
        await AuditService.recordEvent(client, 'ACTIVATION_IDEMPOTENT_REPLAY', { licenseId }, licenseId, deviceKeyId, requestId);
        return { status: 'SUCCESS', licenseId, payload };
      }

      // 7. Enforce max_devices concurrency
      const activeBindingsRes = await client.query(
        `SELECT COUNT(*) as cnt FROM license_bindings WHERE license_id = $1 AND status = 'ACTIVE'`,
        [licenseId]
      );
      
      const activeCount = parseInt(activeBindingsRes.rows[0].cnt, 10);
      if (activeCount >= license.max_devices) {
        throw new ActivationError('DEVICE_LIMIT_REACHED', 'This license has reached its maximum number of active devices');
      }

      // 8. Bind Device to License
      await client.query('SAVEPOINT before_binding');
      try {
        await client.query(
          `INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
           VALUES ($1, $2, 'ACTIVE', NOW())`,
          [licenseId, deviceKeyId]
        );
      } catch (err: any) {
        await client.query('ROLLBACK TO SAVEPOINT before_binding');
        if (err.constraint === 'unique_active_device_binding') {
          // Seamless Renewal: The device is actively bound to an old/different license.
          // Automatically deactivate the old binding so they can smoothly transition to the new license.
          await client.query(
            `UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE device_key_id = $1 AND status = 'ACTIVE'`,
            [deviceKeyId]
          );
          // Try inserting the new active binding again
          await client.query(
            `INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
             VALUES ($1, $2, 'ACTIVE', NOW())`,
            [licenseId, deviceKeyId]
          );
        } else {
          throw err;
        }
      }
      await client.query('RELEASE SAVEPOINT before_binding');

      // 9. Success path
      const authPayload = this.signer.sign({
        protocolVersion: 1,
        authorizationVersion: 1,
        licenseId: license.id,
        productId: license.product_id,
        deviceKeyId,
        validFrom: new Date(license.valid_from).toISOString(),
        validUntil: new Date(license.valid_until).toISOString(),
        issuedAt: new Date().toISOString(),
        signingKeyId: this.defaultSigningKeyId
      });
      const payload = { authorization: authPayload, licenseId };
      await this.completeRequest(client, requestId, 'SUCCESS', payload);
      await AuditService.recordEvent(client, 'ACTIVATION_SUCCESS', {}, licenseId, deviceKeyId, requestId);

      return { status: 'SUCCESS', licenseId, payload };

    } catch (err: any) {
      // 10. Failure path
      let errorCode = 'INTERNAL_ERROR';
      let message = err.message;
      if (err instanceof ActivationError) {
        errorCode = err.code;
      }

      // If the transaction aborted entirely (not caught by savepoint), we can't complete the request here.
      // But if it's our own ActivationError, the transaction is typically still valid.
      // Let's attempt a savepoint around the failure recording, just in case.
      try {
        await client.query('SAVEPOINT before_failure_record');
        const payload = { error: errorCode, message };
        await this.completeRequest(client, requestId, 'FAILED', payload);
        await AuditService.recordEvent(client, 'ACTIVATION_FAILED', { error: errorCode, message }, undefined, deviceKeyId, requestId);
        await client.query('RELEASE SAVEPOINT before_failure_record');
      } catch (e) {
        // Transaction is completely busted. We just throw the original error.
      }
      throw err;
    }
  }

  private async completeRequest(client: PoolClient, requestId: string, status: string, payload: any) {
    await client.query(
      `UPDATE activation_requests 
       SET status = $1, response_payload = $2, completed_at = NOW() 
       WHERE request_id = $3`,
      [status, JSON.stringify(payload), requestId]
    );
  }
}
