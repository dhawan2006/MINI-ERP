import crypto from 'crypto';
import { canonicalize } from './canonicalize';
import { CryptoError } from './cryptoError';
import { RuntimeCheckinReceiptPayload } from './RuntimeCheckinReceiptPayload';

export class RuntimeCheckinReceiptVerifier {
  private keyMap: Map<string, crypto.KeyObject> = new Map();

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

  verify(envelope: any, expectedLicenseId: string, expectedDeviceKeyId: string): RuntimeCheckinReceiptPayload {
    if (!envelope || typeof envelope !== 'object') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Envelope must be an object');
    }

    const { signature, ...payloadObj } = envelope;

    const signingKeyId = payloadObj.signingKeyId;
    if (typeof signingKeyId !== 'string') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid signingKeyId');
    }
    if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
      throw new CryptoError('INVALID_SIGNATURE', 'Missing or invalid signature format');
    }
    
    if (payloadObj.protocolVersion !== 'MINIPOS-RUNTIME-CHECKIN-V1') {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Unsupported receipt protocol version');
    }

    // Verify context binding
    if (payloadObj.licenseId !== expectedLicenseId) {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Receipt licenseId does not match current authorization');
    }
    if (payloadObj.deviceKeyId !== expectedDeviceKeyId) {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Receipt deviceKeyId does not match current device');
    }
    
    if (typeof payloadObj.serverTime !== 'string' || typeof payloadObj.checkInValidUntil !== 'string') {
       throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid timestamps');
    }
    
    const serverTime = new Date(payloadObj.serverTime);
    const validUntil = new Date(payloadObj.checkInValidUntil);
    if (isNaN(serverTime.getTime()) || isNaN(validUntil.getTime())) {
       throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Timestamps must be valid ISO-8601');
    }

    const key = this.keyMap.get(signingKeyId);
    if (!key) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Untrusted or unknown Key ID: ${signingKeyId}`);
    }

    // Canonicalize payload
    const canonicalBytes = Buffer.from(canonicalize(payloadObj), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-RUNTIME-CHECKIN-V1:', 'utf8');
    const dataToVerify = Buffer.concat([domainSeparationTag, canonicalBytes]);

    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(signature, 'base64url');
    } catch {
      throw new CryptoError('INVALID_SIGNATURE', 'Signature must be a valid base64url string');
    }

    let isValid = false;
    try {
      isValid = crypto.verify(null, dataToVerify, key, signatureBuffer);
    } catch {
      throw new CryptoError('INVALID_SIGNATURE', 'Malformed signature bytes or verification error');
    }

    if (!isValid) {
      throw new CryptoError('INVALID_SIGNATURE', 'Signature verification failed');
    }

    return payloadObj as RuntimeCheckinReceiptPayload;
  }
}
