import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { verifyDeviceProof } from '../crypto/deviceProof.ts';
import { DenoServerAuthorizationSigner, base64urlEncode } from '../crypto/authorization.ts';
import { CryptoError } from '../errors/CryptoError.ts';
import { ChallengeService } from '../crypto/ChallengeService.ts';

export class RuntimeCheckinError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'RuntimeCheckinError';
  }
}

// Convert a buffer to hex string manually since node crypto isn't available
async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class RuntimeCheckinService {
  constructor(
    private signer: DenoServerAuthorizationSigner,
    private defaultSigningKeyId: string
  ) {}

  async executeCheckin(
    tx: postgres.TransactionSql,
    requestId: string,
    licenseId: string,
    deviceKeyId: string,
    publicKey: string,
    deviceProof: any
  ): Promise<{ status: string; receipt?: any; error?: string }> {
    
    // 1. Idempotency Race Protection
    const payloadHash = await sha256Hex(`${licenseId}:${deviceKeyId}:${publicKey}:${JSON.stringify(deviceProof)}`);

    await tx`
      INSERT INTO runtime_checkin_requests (request_id, payload_hash, status, created_at)
      VALUES (${requestId}, ${payloadHash}, 'PENDING', NOW())
      ON CONFLICT (request_id) DO NOTHING
    `;

    const idempCheck = await tx`
      SELECT status, response_payload, payload_hash FROM runtime_checkin_requests WHERE request_id = ${requestId} FOR UPDATE
    `;

    const existing = idempCheck[0];
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
        await verifyDeviceProof(deviceProof, publicKey, deviceKeyId, 'RUNTIME_CHECKIN');
        await ChallengeService.consumeChallenge(tx, deviceProof.challenge, deviceKeyId, 'RUNTIME_CHECKIN');
      } catch (err: any) {
        if (err instanceof CryptoError) {
          throw new RuntimeCheckinError('DEVICE_PROOF_INVALID', err.message || 'Cryptographic device proof failed');
        }
        throw err;
      }

      // 3. Verify License existence and state
      const licenseRes = await tx`
        SELECT id, product_id, status, valid_from, valid_until, max_devices 
        FROM licenses 
        WHERE id = ${licenseId} 
        FOR UPDATE
      `;

      if (licenseRes.length === 0) {
        throw new RuntimeCheckinError('LICENSE_NOT_FOUND', 'The license provided is invalid');
      }

      const license = licenseRes[0];

      // Update request with IDs
      await tx`UPDATE runtime_checkin_requests SET license_id = ${licenseId}, device_key_id = ${deviceKeyId} WHERE request_id = ${requestId}`;

      // We explicitly process revoked and disabled licenses rather than strictly failing.
      // We still issue a receipt but it will state 'REVOKED' or 'DISABLED'.
      // Only EXPIRED or INVALID fails directly.

      // 4. Update device last seen
      await tx`
        UPDATE devices 
        SET last_seen_at = NOW()
        WHERE device_key_id = ${deviceKeyId}
      `;

      // 5. Check existing binding
      const existingBindingRes = await tx`
        SELECT id, status FROM license_bindings WHERE license_id = ${licenseId} AND device_key_id = ${deviceKeyId} ORDER BY activated_at DESC LIMIT 1 FOR UPDATE
      `;

      if (existingBindingRes.length === 0 || existingBindingRes[0].status !== 'ACTIVE') {
        throw new RuntimeCheckinError('NO_ACTIVE_BINDING', 'No active binding found for this device');
      }
      
      const bindingId = existingBindingRes[0].id;

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
      const directivesRes = await tx`
        SELECT directive_id, type, payload, priority, expires_at, requires_acknowledgement 
        FROM runtime_directives 
        WHERE target_binding_id = ${bindingId} AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at ASC
        LIMIT 10
      `;

      const directives = directivesRes.map(d => ({
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

      const signedReceipt = await this.signer.signRuntimeCheckin(receiptPayload);

      // 9. Persist receipt
      await tx.savepoint(async (sp) => {
        await sp`
          INSERT INTO runtime_checkins (receipt_id, request_id, binding_id, checked_in_at, check_in_valid_until, status, receipt_payload)
          VALUES (${receiptId}, ${requestId}, ${bindingId}, NOW(), ${checkInValidUntil.toISOString()}, 'SUCCESS', ${signedReceipt})
        `;

        if (directives.length > 0) {
          const directiveIds = directives.map(d => d.directiveId);
          await sp`
            INSERT INTO runtime_directive_deliveries (directive_id, receipt_id, status)
            SELECT unnest(${directiveIds}::uuid[]), ${receiptId}, 'DELIVERED'
          `;
          await sp`
            UPDATE runtime_directives SET status = 'DELIVERED' WHERE directive_id = ANY(${directiveIds}::uuid[])
          `;
        }
      });

      // 10. Success path
      const payload = { receipt: signedReceipt };
      await this.completeRequest(tx, requestId, 'SUCCESS', payload);
      await this.recordEvent(tx, 'RUNTIME_CHECKIN_SUCCESS', { licenseStatus: license.status }, licenseId, deviceKeyId, requestId);

      if (directives.length > 0) {
        await this.recordEvent(tx, 'RUNTIME_DIRECTIVE_DELIVERED', { count: directives.length }, licenseId, deviceKeyId, requestId);
      }

      return { status: 'SUCCESS', receipt: signedReceipt };

    } catch (err: any) {
      let errorCode = 'INTERNAL_ERROR';
      let message = err.message;
      if (err instanceof RuntimeCheckinError) {
        errorCode = err.code;
      }

      try {
        await tx.savepoint(async (sp) => {
          const payload = { error: errorCode, message };
          await this.completeRequest(sp, requestId, 'FAILED', payload);
          await this.recordEvent(sp, 'RUNTIME_CHECKIN_FAILED', { error: errorCode, message }, licenseId, deviceKeyId, requestId);
        });
      } catch (e) {
        // Ignore failure to record error
      }
      throw err;
    }
  }

  private async completeRequest(tx: postgres.TransactionSql | postgres.Sql, requestId: string, status: string, payload: any) {
    await tx`
      UPDATE runtime_checkin_requests 
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
