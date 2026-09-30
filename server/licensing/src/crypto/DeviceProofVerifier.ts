import crypto from 'crypto';
import { PoolClient } from 'pg';
import { canonicalize } from './canonicalize';
import { CryptoError } from './cryptoError';
import { DeviceChallenge, ChallengeService } from './ChallengeService';

export interface DeviceProof {
  challenge: DeviceChallenge;
  signature: string; // base64url encoded
}

export class DeviceProofVerifier {
  /**
   * Verifies a device proof against the device's public key and consumes the challenge atomically.
   */
  static async verifyAndConsume(
    client: PoolClient,
    proof: any,
    devicePublicKeyBase64url: string,
    expectedDeviceKeyId: string,
    expectedPurpose: string
  ): Promise<void> {
    if (!proof || typeof proof !== 'object') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Proof must be an object');
    }

    const { challenge, signature } = proof as DeviceProof;

    if (!challenge || typeof challenge !== 'object') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid challenge');
    }

    if (typeof signature !== 'string') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid signature');
    }

    // 1. Verify structural match
    if (challenge.deviceKeyId !== expectedDeviceKeyId) {
      throw new CryptoError('DEVICE_KEY_MISMATCH', 'Challenge does not belong to the expected device');
    }

    if (challenge.purpose !== expectedPurpose) {
      throw new CryptoError('INVALID_CHALLENGE', 'Challenge purpose mismatch');
    }

    // 2. Canonicalize the challenge
    const canonicalBytes = Buffer.from(canonicalize(challenge), 'utf8');

    // 3. Domain separation for the device signature
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToVerify = Buffer.concat([domainSeparationTag, canonicalBytes]);

    // 4. Decode base64url signature
    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(signature, 'base64url');
    } catch (err) {
      throw new CryptoError('INVALID_SIGNATURE', 'Signature must be a valid base64url string');
    }

    // 5. Load Public Key (65-byte uncompressed base64url -> SPKI format)
    let key: crypto.KeyObject;
    try {
      const pubKeyBytes = Buffer.from(devicePublicKeyBase64url, 'base64url');
      if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
        throw new CryptoError('INVALID_KEY_TYPE', 'Only uncompressed P-256 public keys are supported');
      }

      const P256_SPKI_HEADER = Buffer.from(
        '3059301306072a8648ce3d020106082a8648ce3d030107034200',
        'hex'
      );
      const spki = Buffer.concat([P256_SPKI_HEADER, pubKeyBytes]);
      
      key = crypto.createPublicKey({
        key: spki,
        format: 'der',
        type: 'spki'
      });
      
      if (key.asymmetricKeyType !== 'ec') {
        throw new CryptoError('INVALID_KEY_TYPE', 'Key is not EC type');
      }
    } catch (err: any) {
      if (err instanceof CryptoError) throw err;
      throw new CryptoError('INVALID_KEY', 'Invalid device public key format');
    }

    // 6. Verify Ed25519 Signature
    let isValid = false;
    try {
      isValid = crypto.verify(null, dataToVerify, key, signatureBuffer);
    } catch (err) {
      throw new CryptoError('INVALID_SIGNATURE', 'Malformed signature bytes or verification error');
    }

    if (!isValid) {
      throw new CryptoError('DEVICE_PROOF_INVALID', 'Device signature verification failed');
    }

    // 7. Atomically consume the challenge in the DB (throws if expired or already consumed)
    await ChallengeService.consumeChallenge(client, challenge, expectedDeviceKeyId, expectedPurpose);
  }
}
