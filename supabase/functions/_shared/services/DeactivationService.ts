import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { verifyDeviceProof } from '../crypto/deviceProof.ts';
import { ChallengeService } from '../crypto/ChallengeService.ts';
import { CryptoError } from '../errors/CryptoError.ts';

export class DeactivationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'DeactivationError';
  }
}

// Convert a buffer to hex string manually since node crypto isn't available
async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class DeactivationService {
  async executeDeactivation(
    tx: postgres.TransactionSql,
    requestId: string,
    licenseId: string,
    deviceKeyId: string,
    deviceProof: any
  ): Promise<{ status: string; timestamp?: string }> {
    const payloadHash = await sha256Hex(`${licenseId}:${deviceKeyId}`);

    // 1. Idempotency Race Protection
    await tx`
      INSERT INTO lifecycle_requests (request_id, operation, payload_hash, status, created_at)
      VALUES (${requestId}, 'DEACTIVATION', ${payloadHash}, 'PENDING', NOW())
      ON CONFLICT (request_id) DO NOTHING
    `;

    const idempCheck = await tx`
      SELECT status, response_payload, payload_hash FROM lifecycle_requests WHERE request_id = ${requestId} FOR UPDATE
    `;

    const existing = idempCheck[0];
    if (existing.status !== 'PENDING') {
      if (existing.payload_hash !== payloadHash) {
        throw new DeactivationError('LIFECYCLE_REQUEST_CONFLICT', 'Request ID reused with different payload');
      }
      return existing.response_payload;
    }
    
    if (existing.payload_hash !== payloadHash) {
      throw new DeactivationError('LIFECYCLE_REQUEST_CONFLICT', 'Request ID reused with different payload');
    }

    try {
      // Find the device public key
      const deviceRes = await tx`
        SELECT public_key, status FROM devices WHERE device_key_id = ${deviceKeyId}
      `;

      if (deviceRes.length === 0) {
        throw new DeactivationError('DEVICE_NOT_FOUND', 'Device not found');
      }
      
      const publicKey = deviceRes[0].public_key;

      // Verify proof
      try {
        await verifyDeviceProof(deviceProof, publicKey, deviceKeyId, 'DEACTIVATION');
        await ChallengeService.consumeChallenge(tx, deviceProof.challenge, deviceKeyId, 'DEACTIVATION');
      } catch (err: any) {
        if (err instanceof CryptoError) {
          throw new DeactivationError('DEVICE_PROOF_INVALID', err.message || 'Cryptographic device proof failed');
        }
        throw err;
      }

      // Lock license bindings
      const bindingRes = await tx`
        SELECT id, status FROM license_bindings 
        WHERE license_id = ${licenseId} AND device_key_id = ${deviceKeyId} 
        ORDER BY activated_at DESC LIMIT 1
        FOR UPDATE
      `;

      if (bindingRes.length === 0) {
        throw new DeactivationError('BINDING_NOT_FOUND', 'No active binding found for this device and license');
      }

      const binding = bindingRes[0];

      if (binding.status === 'DEACTIVATED') {
        throw new DeactivationError('ALREADY_DEACTIVATED', 'Binding is already deactivated');
      }

      const now = new Date().toISOString();

      await tx`
        UPDATE license_bindings 
        SET status = 'DEACTIVATED', deactivated_at = ${now} 
        WHERE id = ${binding.id}
      `;

      await tx`
        INSERT INTO audit_events (event_type, license_id, device_key_id, request_id, details)
        VALUES ('DEACTIVATION_COMPLETED', ${licenseId}, ${deviceKeyId}, ${requestId}, ${JSON.stringify({ bindingId: binding.id })})
      `;

      const responsePayload = { status: 'DEACTIVATED', timestamp: now };

      await tx`
        UPDATE lifecycle_requests 
        SET status = 'SUCCESS', response_payload = ${responsePayload}, completed_at = NOW(), license_id = ${licenseId}, device_key_id = ${deviceKeyId}
        WHERE request_id = ${requestId}
      `;

      return responsePayload;
    } catch (err: any) {
      const isExpected = err instanceof DeactivationError;
      const errorCode = isExpected ? err.code : 'INTERNAL_ERROR';
      const errorMessage = isExpected ? err.message : 'An internal error occurred during deactivation';

      // Attempt to save the failure state, though the throw will likely roll it back.
      // We do this to match the Node reference exactly.
      try {
        await tx.savepoint(async (sp) => {
          await sp`
            UPDATE lifecycle_requests 
            SET status = 'FAILED', response_payload = ${JSON.stringify({ error: errorCode, message: errorMessage })}, completed_at = NOW(), license_id = ${licenseId}, device_key_id = ${deviceKeyId}
            WHERE request_id = ${requestId}
          `;
        });
      } catch (e) {
        // Ignore savepoint errors
      }
      
      throw err;
    }
  }
}
