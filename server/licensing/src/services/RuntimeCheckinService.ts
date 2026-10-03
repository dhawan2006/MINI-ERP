import { PoolClient } from 'pg';
import { IDeviceProofVerifier } from '../crypto/deviceProof';
import { ServerAuthorizationSigner } from '../crypto/ServerAuthorizationSigner';
import { CryptoError } from '../../../../src/shared/crypto/cryptoError';
import crypto from 'crypto';

export class RuntimeCheckinError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'RuntimeCheckinError';
  }
}

function sha256Hex(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export class RuntimeCheckinService {
  constructor(
    private verifier: IDeviceProofVerifier,
    private signer: ServerAuthorizationSigner,
    private defaultSigningKeyId: string
  ) {}

  async executeCheckin(
    client: PoolClient,
    requestId: string,
    licenseId: string,
    deviceKeyId: string,
    publicKey: string,
    deviceProof: any
  ): Promise<{ status: string; receipt?: any; error?: string }> {
    
    // 1. Idempotency Race Protection
    const payloadHash = sha256Hex(`${licenseId}:${deviceKeyId}:${publicKey}:${JSON.stringify(deviceProof)}`);

    await client.query(`
      INSERT INTO runtime_checkin_requests (request_id, payload_hash, status, created_at)
      VALUES ($1, $2, 'PENDING', NOW())
      ON CONFLICT (request_id) DO NOTHING
    `, [requestId, payloadHash]);

    const idempCheck = await client.query(`
      SELECT status, response_payload, payload_hash FROM runtime_checkin_requests WHERE request_id = $1 FOR UPDATE
    `, [requestId]);

    const existing = idempCheck.rows[0];
    if (existing.status !== 'PENDING') {
      if (existing.payload_hash !== payloadHash) {
        throw new RuntimeCheckinError('CHECKIN_REQUEST_CONFLICT', 'Request ID reused with different payload');
      }
      return { status: existing.status, receipt: existing.response_payload?.receipt, error: existing.response_payload?.error };
    }
    
    if (existing.payload_hash !== payloadHash) {
      throw new RuntimeCheckinError('CHECKIN_REQUEST_CONFLICT', 'Request ID reused with different payload');
    }

    try {
      // 2. Authenticate Device
      try {
        await this.verifier.verify(client, deviceProof, publicKey, deviceKeyId, 'RUNTIME_CHECKIN');
        // Wait, DeviceProofVerifier.verifyAndConsume already consumes the challenge inside!
        // We shouldn't call RuntimeChallengeService.consumeChallenge again if verify does it!
      } catch (err: any) {
        if (err instanceof CryptoError || err.name === 'CryptoError') {
          throw new RuntimeCheckinError('DEVICE_PROOF_INVALID', err.message || 'Cryptographic device proof failed');
        }
        throw err;
      }

      // 3. Verify License existence and state
      const licenseRes = await client.query(`
        SELECT id, product_id, status, valid_from, valid_until, max_devices 
        FROM licenses 
        WHERE id = $1 
        FOR UPDATE
      `, [licenseId]);

      if (licenseRes.rowCount === 0) {
        throw new RuntimeCheckinError('LICENSE_NOT_FOUND', 'The license provided is invalid');
      }

      const license = licenseRes.rows[0];

      await client.query(`UPDATE runtime_checkin_requests SET license_id = $1, device_key_id = $2 WHERE request_id = $3`, [licenseId, deviceKeyId, requestId]);

      // 4. Update device last seen
      await client.query(`
        UPDATE devices 
        SET last_seen_at = NOW()
        WHERE device_key_id = $1
      `, [deviceKeyId]);

      // 5. Check existing binding
      const existingBindingRes = await client.query(`
        SELECT id, status FROM license_bindings WHERE license_id = $1 AND device_key_id = $2 ORDER BY activated_at DESC LIMIT 1 FOR UPDATE
      `, [licenseId, deviceKeyId]);

      if (existingBindingRes.rowCount === 0 || existingBindingRes.rows[0].status !== 'ACTIVE') {
        throw new RuntimeCheckinError('NO_ACTIVE_BINDING', 'No active binding found for this device');
      }
      
      const bindingId = existingBindingRes.rows[0].id;

      // 6. Calculate expiration (7 days from now, but capped by license valid_until)
      const now = new Date();
      const serverTimeStr = now.toISOString();
      const checkInValidUntilMs = now.getTime() + (7 * 24 * 60 * 60 * 1000);
      let checkInValidUntil = new Date(checkInValidUntilMs);
      const licenseValidUntil = new Date(license.valid_until);

      if (checkInValidUntil > licenseValidUntil) {
        checkInValidUntil = licenseValidUntil;
      }

      // 7. Fetch pending directives
      const directivesRes = await client.query(`
        SELECT directive_id, type, payload, priority, expires_at, requires_acknowledgement 
        FROM runtime_directives 
        WHERE target_binding_id = $1 AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at ASC
        LIMIT 10
      `, [bindingId]);

      const directives = directivesRes.rows.map(d => ({
        directiveId: d.directive_id,
        type: d.type,
        payload: d.payload,
        priority: d.priority,
        requiresAcknowledgement: d.requires_acknowledgement
      }));

      // 8. Sign Receipt
      const receiptId = crypto.randomUUID();
      const receiptPayload = {
        protocolVersion: "MINIPOS-RUNTIME-CHECKIN-V1",
        receiptId,
        licenseId: license.id,
        deviceKeyId,
        bindingId,
        serverTime: serverTimeStr,
        checkedInAt: serverTimeStr,
        checkInValidUntil: checkInValidUntil.toISOString(),
        licenseValidUntil: licenseValidUntil.toISOString(),
        licenseStatus: license.status,
        policyVersion: 1,
        signingKeyId: this.defaultSigningKeyId,
        directives
      };

      const signedReceipt = await (this.signer as any).signRuntimeCheckin(receiptPayload);

      // 9. Persist receipt
      await client.query('SAVEPOINT before_receipt');
      try {
        await client.query(`
          INSERT INTO runtime_checkins (receipt_id, request_id, binding_id, checked_in_at, check_in_valid_until, status, receipt_payload)
          VALUES ($1, $2, $3, NOW(), $4, 'SUCCESS', $5)
        `, [receiptId, requestId, bindingId, checkInValidUntil.toISOString(), signedReceipt]);

        if (directives.length > 0) {
          const directiveIds = directives.map(d => d.directiveId);
          await client.query(`
            INSERT INTO runtime_directive_deliveries (directive_id, receipt_id, status)
            SELECT unnest($1::uuid[]), $2, 'DELIVERED'
          `, [directiveIds, receiptId]);
          await client.query(`
            UPDATE runtime_directives SET status = 'DELIVERED' WHERE directive_id = ANY($1::uuid[])
          `, [directiveIds]);
        }
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT before_receipt');
        throw err;
      }
      await client.query('RELEASE SAVEPOINT before_receipt');

      // 10. Success path
      const payload = { receipt: signedReceipt };
      await this.completeRequest(client, requestId, 'SUCCESS', payload);
      await this.recordEvent(client, 'RUNTIME_CHECKIN_SUCCESS', { licenseStatus: license.status }, licenseId, deviceKeyId, requestId);

      if (directives.length > 0) {
        await this.recordEvent(client, 'RUNTIME_DIRECTIVE_DELIVERED', { count: directives.length }, licenseId, deviceKeyId, requestId);
      }

      return { status: 'SUCCESS', receipt: signedReceipt };

    } catch (err: any) {
      let errorCode = 'INTERNAL_ERROR';
      let message = err.message;
      if (err instanceof RuntimeCheckinError) {
        errorCode = err.code;
      }

      try {
        await client.query('SAVEPOINT before_error');
        try {
          const payload = { error: errorCode, message };
          await this.completeRequest(client, requestId, 'FAILED', payload);
          await this.recordEvent(client, 'RUNTIME_CHECKIN_FAILED', { error: errorCode, message }, licenseId, deviceKeyId, requestId);
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT before_error');
        }
      } catch (e) {
        // Ignore savepoint errors
      }
      throw err;
    }
  }

  private async completeRequest(client: PoolClient, requestId: string, status: string, payload: any) {
    await client.query(`
      UPDATE runtime_checkin_requests 
      SET status = $1, response_payload = $2, completed_at = NOW() 
      WHERE request_id = $3
    `, [status, payload, requestId]);
  }

  private async recordEvent(
    client: PoolClient,
    eventType: string,
    details: Record<string, any>,
    licenseId?: string,
    deviceKeyId?: string,
    requestId?: string,
    adminId?: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO audit_events (event_type, license_id, device_key_id, request_id, details, admin_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [eventType, licenseId || null, deviceKeyId || null, requestId || null, details, adminId || null]);
  }
}
