import { PoolClient } from 'pg';
import { CryptoError } from '../../../../src/shared/crypto/cryptoError';
import crypto from 'crypto';

export class RuntimeChallengeService {
  /**
   * Generates a new cryptographic challenge for runtime check-in and persists it in the database.
   */
  static async createChallenge(
    client: PoolClient,
    deviceKeyId: string,
    ttlSeconds: number = 60
  ): Promise<any> {
    const challengeId = crypto.randomUUID();
    const nonceBytes = crypto.randomBytes(32);
    const nonce = nonceBytes.toString('base64url');
    
    const nowMs = Date.now();
    const expiresMs = nowMs + ttlSeconds * 1000;
    
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(expiresMs).toISOString();

    await client.query(`
      INSERT INTO runtime_checkin_challenges (challenge_id, device_key_id, nonce, purpose, expires_at, created_at, status)
      VALUES ($1, $2, $3, 'RUNTIME_CHECKIN', $4, $5, 'PENDING')
    `, [challengeId, deviceKeyId, nonce, expiresAt, issuedAt]);

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
    client: PoolClient,
    challenge: any,
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

    const updateRes = await client.query(`
      UPDATE runtime_checkin_challenges 
      SET status = 'CONSUMED' 
      WHERE challenge_id = $1 
        AND device_key_id = $2 
        AND purpose = 'RUNTIME_CHECKIN'
        AND status = 'PENDING'
        AND expires_at > NOW()
      RETURNING challenge_id
    `, [challenge.challengeId, expectedDeviceKeyId]);

    if (updateRes.rowCount === 0) {
      throw new CryptoError('CHALLENGE_REPLAYED', 'Challenge is invalid, expired, or has already been consumed (replay attempt)');
    }
  }
}
