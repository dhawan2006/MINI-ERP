import crypto from 'crypto';
import { canonicalize } from './canonicalize';
import { CryptoError } from './cryptoError';

export interface AuthorizationPayload {
  protocolVersion: number;
  authorizationVersion: number;
  licenseId: string;
  productId: string;
  deviceKeyId: string;
  validFrom: string; // ISO8601
  validUntil: string; // ISO8601
  issuedAt: string; // ISO8601
  signingKeyId: string;
}

export type SignedAuthorization = AuthorizationPayload & {
  signature: string; // base64url encoded
};

export class ServerAuthorizationSigner {
  private keyMap: Map<string, crypto.KeyObject> = new Map();

  /**
   * Register a private signing key for a given Key ID (kid).
   */
  registerKey(kid: string, privateKeyPem: string) {
    try {
      const key = crypto.createPrivateKey({
        key: privateKeyPem,
        format: 'pem'
      });
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new CryptoError('INVALID_KEY_TYPE', 'Only Ed25519 keys are supported for signing');
      }
      this.keyMap.set(kid, key);
    } catch (err: any) {
      if (err instanceof CryptoError) throw err;
      throw new CryptoError('INVALID_KEY', 'Failed to load private key. Ensure it is a valid PEM.');
    }
  }

  /**
   * Signs the authorization payload deterministically.
   */
  sign(payload: AuthorizationPayload): SignedAuthorization {
    const key = this.keyMap.get(payload.signingKeyId);
    if (!key) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Key ID ${payload.signingKeyId} is not registered`);
    }

    if (payload.protocolVersion !== 1 || payload.authorizationVersion !== 1) {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Only protocol/authorization version 1 is supported');
    }

    // 1. Canonicalize the payload exactly as the client will see it.
    const canonicalBytes = Buffer.from(canonicalize(payload), 'utf8');

    // 2. Domain Separation: We prefix the canonical payload with a distinct purpose string.
    // This ensures a signature over this payload cannot be reused for a different protocol message.
    const domainSeparationTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);

    // 3. Sign using Ed25519 (null algorithm specified as Ed25519 dictates)
    let signatureBuffer: Buffer;
    try {
      signatureBuffer = crypto.sign(null, dataToSign, key);
    } catch (err) {
      throw new CryptoError('SIGNATURE_GENERATION_FAILED', 'Failed to generate cryptographic signature');
    }

    // 4. Encode signature securely using base64url (URL-safe, no padding)
    const signatureBase64url = signatureBuffer.toString('base64url');

    return {
      ...payload,
      signature: signatureBase64url
    };
  }
}
