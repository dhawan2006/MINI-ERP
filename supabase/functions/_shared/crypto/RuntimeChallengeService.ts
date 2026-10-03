import { DeviceChallenge } from '../protocol/DeviceChallenge.ts';
import { CryptoError } from '../errors/CryptoError.ts';
import { base64urlEncode } from './authorization.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

export class RuntimeChallengeService {
  /**
   * Generates a new cryptographic challenge for runtime check-in and persists it in the database.
   */
  static async createChallenge(
    tx: postgres.TransactionSql | postgres.Sql,
    deviceKeyId: string,
    ttlSeconds: number = 60
  ): Promise<DeviceChallenge> {
    const challengeId = crypto.randomUUID();
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = base64urlEncode(nonceBytes.buffer);
    
    const nowMs = Date.now();
    const expiresMs = nowMs + ttlSeconds * 1000;
    
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(expiresMs).toISOString();

    await tx`
      INSERT INTO runtime_checkin_challenges (challenge_id, device_key_id, nonce, purpose, expires_at, created_at, status)
      VALUES (${challengeId}, ${deviceKeyId}, ${nonce}, 'RUNTIME_CHECKIN', ${expiresAt}, ${issuedAt}, 'PENDING')
    `;

    return {
      protocolVersion: 1,
      challengeId,
      issuedAt,
      expiresAt,
      nonce,
      deviceKeyId,
      purpose: 'RUNTIME_CHECKIN'
    };
  }

  /**
   * Consumes a runtime challenge atomically.
   */
  static async consumeChallenge(
    tx: postgres.TransactionSql | postgres.Sql,
    challenge: DeviceChallenge,
    expectedDeviceKeyId: string
  ): Promise<void> {
    if (!challenge || challenge.protocolVersion !== 1) {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Unsupported challenge protocol version');
    }

    if (challenge.deviceKeyId !== expectedDeviceKeyId) {
      throw new CryptoError('DEVICE_KEY_MISMATCH', 'Challenge does not belong to the expected device');
    }
    
    if (challenge.purpose !== 'RUNTIME_CHECKIN') {
      throw new CryptoError('INVALID_CHALLENGE', 'Challenge purpose mismatch');
    }

    const now = new Date();
    const expires = new Date(challenge.expiresAt);

    if (now >= expires) {
      throw new CryptoError('CHALLENGE_EXPIRED', 'Challenge has expired according to its payload');
    }

    const updateRes = await tx`
      UPDATE runtime_checkin_challenges 
      SET status = 'CONSUMED' 
      WHERE challenge_id = ${challenge.challengeId} 
        AND device_key_id = ${expectedDeviceKeyId} 
        AND purpose = 'RUNTIME_CHECKIN'
        AND status = 'PENDING'
        AND expires_at > NOW()
      RETURNING challenge_id
    `;

    if (updateRes.length === 0) {
      throw new CryptoError('CHALLENGE_REPLAYED', 'Challenge is invalid, expired, or has already been consumed (replay attempt)');
    }
  }
}
