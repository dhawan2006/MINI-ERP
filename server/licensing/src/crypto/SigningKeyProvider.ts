// ---------------------------------------------------------------------------
// Phase 12 — Server Signing Key Provider Abstraction
//
// Isolates the licensing business logic from concrete key storage mechanisms.
// The current implementation loads keys from PEM strings supplied via
// environment/config. The interface leaves room for future KMS/HSM backends
// without changing any signing call sites.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { CryptoError } from './cryptoError';
import { canonicalize } from './canonicalize';
import { AuthorizationPayload } from './ServerAuthorizationSigner';

export interface IServerSigningKeyProvider {
  /** Returns the Key ID (kid) for the currently active signing key. */
  getCurrentKeyId(): string;

  /** Signs the given data buffer and returns a base64url signature. */
  sign(data: Buffer): string;

  /** Returns the public key in PEM format for distribution/verification. */
  getPublicKeyPem(): string;

  /** Returns metadata useful for logging (never includes secret material). */
  getMetadata(): { keyId: string; algorithm: string; keySize: string };
}

/**
 * Production implementation: loads the Ed25519 private key from a PEM string
 * supplied by the environment/config. Never logs or exposes key material.
 */
export class PemServerSigningKeyProvider implements IServerSigningKeyProvider {
  private readonly keyId: string;
  private readonly privateKey: crypto.KeyObject;
  private readonly publicKey: crypto.KeyObject;

  constructor(keyId: string, privateKeyPem: string) {
    if (!keyId || keyId.trim().length === 0) {
      throw new CryptoError('INVALID_KEY', 'Key ID must not be empty');
    }

    try {
      this.privateKey = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
    } catch {
      throw new CryptoError('INVALID_KEY', 'Failed to parse Ed25519 private key PEM. Ensure key is valid PKCS#8 format.');
    }

    if (this.privateKey.asymmetricKeyType !== 'ed25519') {
      throw new CryptoError('INVALID_KEY_TYPE', 'Only Ed25519 keys are supported for server authorization signing');
    }

    this.keyId = keyId;
    // Derive the public key from the loaded private key — never requires a
    // separately supplied public key, avoiding mismatched key pair bugs.
    this.publicKey = crypto.createPublicKey(this.privateKey);
  }

  getCurrentKeyId(): string {
    return this.keyId;
  }

  sign(data: Buffer): string {
    try {
      const signature = crypto.sign(null, data, this.privateKey);
      return signature.toString('base64url');
    } catch {
      throw new CryptoError('SIGNATURE_GENERATION_FAILED', 'Ed25519 signing operation failed');
    }
  }

  getPublicKeyPem(): string {
    return this.publicKey.export({ type: 'spki', format: 'pem' }) as string;
  }

  getMetadata() {
    return {
      keyId: this.keyId,
      algorithm: 'Ed25519',
      keySize: '256-bit',
    };
  }
}

// ---------------------------------------------------------------------------
// SigningKeyRegistry — multi-key rotation support
//
// Newly issued authorizations always use the "current" key.
// Older authorizations remain verifiable as long as their kid is registered.
// ---------------------------------------------------------------------------
export class SigningKeyRegistry {
  private providers: Map<string, IServerSigningKeyProvider> = new Map();
  private currentKeyId: string | null = null;

  /**
   * Register a key provider. The last one registered becomes the current
   * (active) signing key unless setCurrentKey() is called explicitly.
   */
  register(provider: IServerSigningKeyProvider): void {
    const kid = provider.getCurrentKeyId();
    this.providers.set(kid, provider);
    this.currentKeyId = kid;
  }

  /**
   * Explicitly set which registered key is the current (active) signing key.
   */
  setCurrentKey(keyId: string): void {
    if (!this.providers.has(keyId)) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Key ID '${keyId}' is not registered`);
    }
    this.currentKeyId = keyId;
  }

  getCurrent(): IServerSigningKeyProvider {
    if (!this.currentKeyId) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', 'No signing key registered');
    }
    return this.providers.get(this.currentKeyId)!;
  }

  get(keyId: string): IServerSigningKeyProvider {
    const provider = this.providers.get(keyId);
    if (!provider) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Key ID '${keyId}' is not registered`);
    }
    return provider;
  }

  getAllKeyIds(): string[] {
    return Array.from(this.providers.keys());
  }
}

// ---------------------------------------------------------------------------
// signAuthorization — domain-separated Ed25519 authorization signing
//
// Uses the IServerSigningKeyProvider abstraction instead of directly coupling
// to key material. Maintains the exact domain separator from Phase 3:
//   MINIPOS-AUTHORIZATION-V1:
// ---------------------------------------------------------------------------
export function signAuthorization(
  provider: IServerSigningKeyProvider,
  payload: AuthorizationPayload
): AuthorizationPayload & { signature: string } {
  if (payload.protocolVersion !== 1 || payload.authorizationVersion !== 1) {
    throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Only protocol/authorization version 1 is supported');
  }

  if (payload.signingKeyId !== provider.getCurrentKeyId()) {
    throw new CryptoError(
      'UNKNOWN_SIGNING_KEY',
      `Payload signingKeyId '${payload.signingKeyId}' does not match active key '${provider.getCurrentKeyId()}'`
    );
  }

  const canonicalBytes = Buffer.from(canonicalize(payload), 'utf8');
  const domainTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
  const dataToSign = Buffer.concat([domainTag, canonicalBytes]);

  const signature = provider.sign(dataToSign);
  return { ...payload, signature };
}
