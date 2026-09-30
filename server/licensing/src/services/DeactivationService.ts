import { PoolClient } from 'pg';
import crypto from 'crypto';
import { IDeviceProofVerifier } from '../crypto/deviceProof';
import { AuditService } from './AuditService';

export class DeactivationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'DeactivationError';
  }
}

export class DeactivationService {
  constructor(
    private proofVerifier: IDeviceProofVerifier
  ) {}

  async executeDeactivation(
    client: PoolClient,
    requestId: string,
    licenseId: string,
    deviceKeyId: string,
    deviceProof: any
  ): Promise<{ status: string; timestamp?: string }> {
    const payloadHash = crypto.createHash('sha256')
      .update(`${licenseId}:${deviceKeyId}`)
      .digest('hex');

    // Idempotency Race Protection
    await client.query(
      `INSERT INTO lifecycle_requests (request_id, operation, payload_hash, status, created_at)
       VALUES ($1, 'DEACTIVATION', $2, 'PENDING', NOW())
       ON CONFLICT (request_id) DO NOTHING`,
      [requestId, payloadHash]
    );

    const idempCheck = await client.query(
      `SELECT status, response_payload, payload_hash FROM lifecycle_requests WHERE request_id = $1 FOR UPDATE`,
      [requestId]
    );

    const existing = idempCheck.rows[0];
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
      const deviceRes = await client.query(
        `SELECT public_key, status FROM devices WHERE device_key_id = $1`,
        [deviceKeyId]
      );

      if (deviceRes.rows.length === 0) {
        throw new DeactivationError('DEVICE_NOT_FOUND', 'Device not found');
      }
      
      const publicKey = deviceRes.rows[0].public_key;

      // Verify proof
      try {
        await this.proofVerifier.verify(client, deviceProof, publicKey, deviceKeyId, 'DEACTIVATION');
      } catch (err: any) {
        throw new DeactivationError('DEVICE_PROOF_INVALID', err.message || 'Cryptographic device proof failed');
      }

      // Lock license bindings
      const bindingRes = await client.query(
        `SELECT id, status FROM license_bindings 
         WHERE license_id = $1 AND device_key_id = $2 
         ORDER BY activated_at DESC LIMIT 1
         FOR UPDATE`,
        [licenseId, deviceKeyId]
      );

      if (bindingRes.rows.length === 0) {
        throw new DeactivationError('BINDING_NOT_FOUND', 'No active binding found for this device and license');
      }

      const binding = bindingRes.rows[0];

      if (binding.status === 'DEACTIVATED') {
        throw new DeactivationError('ALREADY_DEACTIVATED', 'Binding is already deactivated');
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
        'DEACTIVATION_COMPLETED',
        { bindingId: binding.id },
        licenseId,
        deviceKeyId,
        requestId
      );

      const responsePayload = { status: 'DEACTIVATED', timestamp: now };

      await client.query(
        `UPDATE lifecycle_requests 
         SET status = 'SUCCESS', response_payload = $1, completed_at = NOW(), license_id = $2, device_key_id = $3
         WHERE request_id = $4`,
        [JSON.stringify(responsePayload), licenseId, deviceKeyId, requestId]
      );

      return responsePayload;
    } catch (err: any) {
      const isExpected = err instanceof DeactivationError;
      const errorCode = isExpected ? err.code : 'INTERNAL_ERROR';
      const errorMessage = isExpected ? err.message : 'An internal error occurred during deactivation';

      await client.query(
        `UPDATE lifecycle_requests 
         SET status = 'FAILED', response_payload = $1, completed_at = NOW(), license_id = $2, device_key_id = $3
         WHERE request_id = $4`,
        [JSON.stringify({ error: errorCode, message: errorMessage }), licenseId, deviceKeyId, requestId]
      );

      if (!isExpected) {
        console.error('Unexpected error during deactivation:', err);
      }
      
      throw err;
    }
  }
}
