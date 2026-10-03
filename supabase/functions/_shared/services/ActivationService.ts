import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { hashLicenseKey } from '../crypto/licenseKey.ts';
import { verifyDeviceProof } from '../crypto/deviceProof.ts';
import { DenoServerAuthorizationSigner } from '../crypto/authorization.ts';
import { CryptoError } from '../errors/CryptoError.ts';
import { ChallengeService } from '../crypto/ChallengeService.ts';

export class ActivationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ActivationError';
  }
}

// Convert a buffer to hex string manually since node crypto isn't available
async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class ActivationService {
  constructor(
    private signer: DenoServerAuthorizationSigner,
    private defaultSigningKeyId: string
  ) {}

  async executeActivation(
    tx: postgres.TransactionSql,
    requestId: string,
    licenseKey: string,
    deviceKeyId: string,
    publicKey: string,
    deviceProof: any
  ): Promise<{ status: string; licenseId?: string; payload?: any }> {
    
    // 1. Idempotency Race Protection
    const requestFingerprint = await sha256Hex(`${licenseKey}:${deviceKeyId}:${publicKey}`);

    await tx`
      INSERT INTO activation_requests (request_id, request_fingerprint, status, created_at)
      VALUES (${requestId}, ${requestFingerprint}, 'PENDING', NOW())
      ON CONFLICT (request_id) DO NOTHING
    `;

    const idempCheck = await tx`
      SELECT status, response_payload, request_fingerprint FROM activation_requests WHERE request_id = ${requestId} FOR UPDATE
    `;

    const existing = idempCheck[0];
    if (existing.status !== 'PENDING') {
      if (existing.request_fingerprint !== requestFingerprint) {
        throw new ActivationError('ACTIVATION_REQUEST_CONFLICT', 'Request ID reused with different payload');
      }
      return { status: existing.status, payload: existing.response_payload };
    }
    
    if (existing.request_fingerprint !== requestFingerprint) {
      throw new ActivationError('ACTIVATION_REQUEST_CONFLICT', 'Request ID reused with different payload');
    }

    try {
      // 3. Authenticate Device
      try {
        await verifyDeviceProof(deviceProof, publicKey, deviceKeyId, 'ACTIVATION');
        await ChallengeService.consumeChallenge(tx, deviceProof.challenge, deviceKeyId, 'ACTIVATION');
      } catch (err: any) {
        if (err instanceof CryptoError) {
          throw new ActivationError('DEVICE_PROOF_INVALID', err.message || 'Cryptographic device proof failed');
        }
        throw err;
      }

      // 4. Verify License existence and state
      const hmac = await hashLicenseKey(licenseKey, Deno.env.get('LICENSE_KEY_HMAC_SECRET')!);
      
      const licenseRes = await tx`
        SELECT id, product_id, status, valid_from, valid_until, max_devices 
        FROM licenses 
        WHERE license_key_hmac = ${hmac} 
        FOR UPDATE
      `;

      if (licenseRes.length === 0) {
        throw new ActivationError('LICENSE_NOT_FOUND', 'The license key provided is invalid');
      }

      const license = licenseRes[0];
      const licenseId = license.id;

      // 5. Register device
      await tx`
        INSERT INTO devices (device_key_id, public_key, last_seen_at)
        VALUES (${deviceKeyId}, ${publicKey}, NOW())
        ON CONFLICT (device_key_id) DO UPDATE 
        SET last_seen_at = NOW(), public_key = EXCLUDED.public_key
      `;

      await tx`UPDATE activation_requests SET license_id = ${licenseId}, device_key_id = ${deviceKeyId} WHERE request_id = ${requestId}`;

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

      // 6. Check existing binding
      const existingBindingRes = await tx`
        SELECT id, status FROM license_bindings WHERE license_id = ${licenseId} AND device_key_id = ${deviceKeyId} ORDER BY activated_at DESC LIMIT 1 FOR UPDATE
      `;

      if (existingBindingRes.length > 0 && existingBindingRes[0].status === 'ACTIVE') {
        const authPayload = await this.signer.sign({
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
        await this.completeRequest(tx, requestId, 'SUCCESS', payload);
        await this.recordEvent(tx, 'ACTIVATION_IDEMPOTENT_REPLAY', { licenseId }, licenseId, deviceKeyId, requestId);
        return { status: 'SUCCESS', licenseId, payload };
      }

      // 7. Enforce max_devices concurrency
      const activeBindingsRes = await tx`
        SELECT COUNT(*) as cnt FROM license_bindings WHERE license_id = ${licenseId} AND status = 'ACTIVE'
      `;
      
      const activeCount = parseInt(activeBindingsRes[0].cnt, 10);
      if (activeCount >= license.max_devices) {
        throw new ActivationError('DEVICE_LIMIT_REACHED', 'This license has reached its maximum number of active devices');
      }

      // 8. Bind Device to License
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
            VALUES (${licenseId}, ${deviceKeyId}, 'ACTIVE', NOW())
          `;
        });
      } catch (err: any) {
        if (err.code === '23505' && err.constraint_name === 'unique_active_device_binding') {
          await tx`
            UPDATE license_bindings SET status = 'DEACTIVATED', deactivated_at = NOW() WHERE device_key_id = ${deviceKeyId} AND status = 'ACTIVE'
          `;
          await tx`
            INSERT INTO license_bindings (license_id, device_key_id, status, activated_at)
            VALUES (${licenseId}, ${deviceKeyId}, 'ACTIVE', NOW())
          `;
        } else {
          throw err;
        }
      }

      // 9. Success path
      const authPayload = await this.signer.sign({
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
      await this.completeRequest(tx, requestId, 'SUCCESS', payload);
      await this.recordEvent(tx, 'ACTIVATION_SUCCESS', {}, licenseId, deviceKeyId, requestId);

      return { status: 'SUCCESS', licenseId, payload };

    } catch (err: any) {
      let errorCode = 'INTERNAL_ERROR';
      let message = err.message;
      if (err instanceof ActivationError) {
        errorCode = err.code;
      }

      try {
        await tx.savepoint(async (sp) => {
          const payload = { error: errorCode, message };
          await this.completeRequest(sp, requestId, 'FAILED', payload);
          await this.recordEvent(sp, 'ACTIVATION_FAILED', { error: errorCode, message }, undefined, deviceKeyId, requestId);
        });
      } catch (e) {
        // Ignore failure to record error
      }
      throw err;
    }
  }

  private async completeRequest(tx: postgres.TransactionSql | postgres.Sql, requestId: string, status: string, payload: any) {
    await tx`
      UPDATE activation_requests 
      SET status = ${status}, response_payload = ${payload}, completed_at = NOW() 
      WHERE request_id = ${requestId}
    `;
  }

  private async recordEvent(
    tx: postgres.TransactionSql | postgres.Sql,
    eventType: string,
    details: Record<string, any>,
    licenseId?: string,
    deviceKeyId?: string,
    requestId?: string,
    adminId?: string
  ): Promise<void> {
    await tx`
      INSERT INTO audit_events (event_type, license_id, device_key_id, request_id, details, admin_id)
      VALUES (${eventType}, ${licenseId || null}, ${deviceKeyId || null}, ${requestId || null}, ${details}, ${adminId || null})
    `;
  }
}
