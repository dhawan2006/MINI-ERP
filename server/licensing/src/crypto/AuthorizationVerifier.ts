import crypto from 'crypto';
import { canonicalize } from './canonicalize';
import { CryptoError } from './cryptoError';
import { AuthorizationPayload } from './ServerAuthorizationSigner';

export class AuthorizationVerifier {
  private keyMap: Map<string, crypto.KeyObject> = new Map();

  /**
   * Register a trusted public verification key for a given Key ID (kid).
   */
  registerTrustedKey(kid: string, publicKeyPem: string) {
    try {
      const key = crypto.createPublicKey({
        key: publicKeyPem,
        format: 'pem'
      });
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new CryptoError('INVALID_KEY_TYPE', 'Only Ed25519 keys are supported for verification');
      }
      this.keyMap.set(kid, key);
    } catch (err: any) {
      if (err instanceof CryptoError) throw err;
      throw new CryptoError('INVALID_KEY', 'Failed to load public key. Ensure it is a valid PEM.');
    }
  }

  verify(envelope: any): AuthorizationPayload {
    if (!envelope || typeof envelope !== 'object') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Envelope must be an object');
    }

    const { signature, ...payloadObj } = envelope;

    if (typeof envelope.signingKeyId !== 'string') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid signingKeyId');
    }
    if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
      throw new CryptoError('INVALID_SIGNATURE', 'Missing or invalid signature format (must be 86-char base64url)');
    }
    if (payloadObj.protocolVersion !== 1 || payloadObj.authorizationVersion !== 1) {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Unsupported payload protocol version');
    }

    const key = this.keyMap.get(envelope.signingKeyId);
    if (!key) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Untrusted or unknown Key ID: ${envelope.signingKeyId}`);
    }

    // 1. Canonicalize the received payload deterministically
    const canonicalBytes = Buffer.from(canonicalize(payloadObj), 'utf8');

    // 2. Domain Separation: re-apply the exact same purpose string
    const domainSeparationTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
    const dataToVerify = Buffer.concat([domainSeparationTag, canonicalBytes]);

    // 3. Decode base64url signature
    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(signature, 'base64url');
    } catch (err) {
      throw new CryptoError('INVALID_SIGNATURE', 'Signature must be a valid base64url string');
    }

    // 4. Verify Ed25519 signature
    let isValid = false;
    try {
      isValid = crypto.verify(null, dataToVerify, key, signatureBuffer);
    } catch (err) {
      throw new CryptoError('INVALID_SIGNATURE', 'Malformed signature bytes or verification error');
    }

    if (!isValid) {
      throw new CryptoError('INVALID_SIGNATURE', 'Signature verification failed');
    }

    return payloadObj as AuthorizationPayload;
  }
}
