import crypto from 'crypto';
import { PoolClient } from 'pg';
import { CryptoError } from './cryptoError';

export interface DeviceChallenge {
  protocolVersion: 1;
  challengeId: string; // UUID
  issuedAt: string; // ISO8601
  expiresAt: string; // ISO8601
  nonce: string; // base64url 32 bytes
  deviceKeyId: string;
  purpose: string; // e.g. 'ACTIVATION'
}

export class ChallengeService {
  /**
   * Generates a new cryptographic challenge and persists it in the database.
   */
  static async createChallenge(
    client: PoolClient,
    deviceKeyId: string,
    purpose: string,
    ttlSeconds: number = 60 // Default 60 seconds validity
  ): Promise<DeviceChallenge> {
    const challengeId = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('base64url');
    
    const nowMs = Date.now();
    const expiresMs = nowMs + ttlSeconds * 1000;
    
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(expiresMs).toISOString();

    await client.query(
      `INSERT INTO device_challenges (challenge_id, device_key_id, nonce, purpose, expires_at, created_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [challengeId, deviceKeyId, nonce, purpose, expiresAt, issuedAt]
    );

    return {
      protocolVersion: 1,
      challengeId,
      issuedAt,
      expiresAt,
      nonce,
      deviceKeyId,
      purpose
    };
  }

  /**
   * Consumes a challenge atomically.
   * If the challenge is missing, expired, consumed, or wrong device/purpose, it fails.
   */
  static async consumeChallenge(
    client: PoolClient,
    challenge: DeviceChallenge,
    expectedDeviceKeyId: string,
    expectedPurpose: string
  ): Promise<void> {
    if (!challenge || challenge.protocolVersion !== 1) {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Unsupported challenge protocol version');
    }

    if (challenge.deviceKeyId !== expectedDeviceKeyId) {
      throw new CryptoError('DEVICE_KEY_MISMATCH', 'Challenge does not belong to the expected device');
    }
    
    if (challenge.purpose !== expectedPurpose) {
      throw new CryptoError('INVALID_CHALLENGE', 'Challenge purpose mismatch');
    }

    const now = new Date();
    const expires = new Date(challenge.expiresAt);

    if (now >= expires) {
      throw new CryptoError('CHALLENGE_EXPIRED', 'Challenge has expired according to its payload');
    }

    // Atomic Consumption: Ensure it's still PENDING and hasn't expired on the server side either.
    // We update it to CONSUMED in a single atomic query.
    const updateRes = await client.query(
      `UPDATE device_challenges 
       SET status = 'CONSUMED' 
       WHERE challenge_id = $1 
         AND device_key_id = $2 
         AND purpose = $3
         AND status = 'PENDING'
         AND expires_at > NOW()
       RETURNING challenge_id`,
      [challenge.challengeId, expectedDeviceKeyId, expectedPurpose]
    );

    if (updateRes.rowCount === 0) {
      // It was either not found, already consumed, expired on server side, or mismatched.
      throw new CryptoError('CHALLENGE_REPLAYED', 'Challenge is invalid, expired, or has already been consumed (replay attempt)');
    }
  }
}
