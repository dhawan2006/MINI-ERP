/**
 * ServerAuthorizationSigner — Deno/WebCrypto implementation.
 *
 * Protocol equivalence requirement:
 *   Node: crypto.sign(null, dataToSign, ed25519PrivateKey) → base64url
 *   Deno: subtle.sign('Ed25519', key, dataToSign) → base64url
 *
 * Both Ed25519 implementations are deterministic (RFC 8032 §5.1.6) — same
 * private key + same message ALWAYS produces the same 64-byte signature.
 * Therefore cross-runtime byte equality is guaranteed.
 *
 * Domain separation tag: "MINIPOS-AUTHORIZATION-V1:"  (UTF-8, no null terminator)
 */

import { CryptoError } from '../errors/CryptoError.ts';
import { canonicalize } from './canonicalize.ts';
import { AuthorizationPayload, SignedAuthorization } from '../protocol/AuthorizationPayload.ts';

const AUTHORIZATION_DOMAIN_TAG = new TextEncoder().encode('MINIPOS-AUTHORIZATION-V1:');

export function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64urlDecode(str: string): Uint8Array {
  // Restore base64 padding
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Builds the exact domain-separated byte message that must be signed/verified.
 * MINIPOS-AUTHORIZATION-V1: || UTF8(JCS(payload))
 */
function buildSigningMessage(payload: AuthorizationPayload): ArrayBuffer {
  const canonical = canonicalize(payload);
  const canonicalBytes = new TextEncoder().encode(canonical);
  const buf = new ArrayBuffer(AUTHORIZATION_DOMAIN_TAG.length + canonicalBytes.length);
  const view = new Uint8Array(buf);
  view.set(AUTHORIZATION_DOMAIN_TAG, 0);
  view.set(canonicalBytes, AUTHORIZATION_DOMAIN_TAG.length);
  return buf;
}

export class DenoServerAuthorizationSigner {
  private keyMap: Map<string, CryptoKey> = new Map();

  /**
   * Load a PKCS#8 PEM Ed25519 private key.
   * @param kid    The stable Key ID.
   * @param pemStr The PKCS#8 PEM string (BEGIN PRIVATE KEY).
   */
  async registerKey(kid: string, pemStr: string): Promise<void> {
    // Strip PEM header/footer/whitespace
    const b64 = pemStr
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '');
    // Re-pad as standard base64 (not base64url) before decoding
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const der = new ArrayBuffer(binary.length);
    const derView = new Uint8Array(der);
    for (let i = 0; i < binary.length; i++) derView[i] = binary.charCodeAt(i);

    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'pkcs8',
        der,
        { name: 'Ed25519' },
        false,   // not extractable — private key stays opaque
        ['sign']
      );
    } catch (e) {
      throw new CryptoError('INVALID_KEY', `Failed to import Ed25519 private key for kid=${kid}: ${e}`);
    }
    this.keyMap.set(kid, key);
  }

  async sign(payload: AuthorizationPayload): Promise<SignedAuthorization> {
    const key = this.keyMap.get(payload.signingKeyId);
    if (!key) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Key ID ${payload.signingKeyId} is not registered`);
    }
    if (payload.protocolVersion !== 1 || payload.authorizationVersion !== 1) {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Only protocol/authorization version 1 is supported');
    }

    const message = buildSigningMessage(payload);

    let sigBuf: ArrayBuffer;
    try {
      sigBuf = await crypto.subtle.sign('Ed25519', key, message);
    } catch (e) {
      throw new CryptoError('SIGNATURE_GENERATION_FAILED', `Ed25519 signing failed: ${e}`);
    }

    const signature = base64urlEncode(sigBuf);
    return { ...payload, signature };
  }

  async signRuntimeCheckin(payload: any): Promise<any> {
    const key = this.keyMap.get(payload.signingKeyId);
    if (!key) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Key ID ${payload.signingKeyId} is not registered`);
    }

    const canonical = canonicalize(payload);
    const canonicalBytes = new TextEncoder().encode(canonical);
    const domainTag = new TextEncoder().encode('MINIPOS-RUNTIME-CHECKIN-V1:');
    const buf = new ArrayBuffer(domainTag.length + canonicalBytes.length);
    const view = new Uint8Array(buf);
    view.set(domainTag, 0);
    view.set(canonicalBytes, domainTag.length);

    let sigBuf: ArrayBuffer;
    try {
      sigBuf = await crypto.subtle.sign('Ed25519', key, buf);
    } catch (e) {
      throw new CryptoError('SIGNATURE_GENERATION_FAILED', `Ed25519 signing failed: ${e}`);
    }

    const signature = base64urlEncode(sigBuf);
    return { ...payload, signature };
  }
}

export class DenoAuthorizationVerifier {
  private keyMap: Map<string, CryptoKey> = new Map();

  async registerTrustedKey(kid: string, pemStr: string): Promise<void> {
    const b64 = pemStr
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const der = new ArrayBuffer(binary.length);
    const derView = new Uint8Array(der);
    for (let i = 0; i < binary.length; i++) derView[i] = binary.charCodeAt(i);

    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'spki',
        der,
        { name: 'Ed25519' },
        false,
        ['verify']
      );
    } catch (e) {
      throw new CryptoError('INVALID_KEY', `Failed to import Ed25519 public key for kid=${kid}: ${e}`);
    }
    this.keyMap.set(kid, key);
  }

  async verify(envelope: Record<string, unknown>): Promise<AuthorizationPayload> {
    if (!envelope || typeof envelope !== 'object') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Envelope must be an object');
    }

    const { signature, ...payloadObj } = envelope as { signature: string } & Record<string, unknown>;

    if (typeof envelope['signingKeyId'] !== 'string') {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid signingKeyId');
    }
    if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) {
      throw new CryptoError('INVALID_SIGNATURE', 'Missing or invalid signature format (must be 86-char base64url)');
    }
    if ((payloadObj as { protocolVersion?: number }).protocolVersion !== 1 ||
        (payloadObj as { authorizationVersion?: number }).authorizationVersion !== 1) {
      throw new CryptoError('UNSUPPORTED_PROTOCOL', 'Unsupported payload protocol version');
    }

    const key = this.keyMap.get(envelope['signingKeyId'] as string);
    if (!key) {
      throw new CryptoError('UNKNOWN_SIGNING_KEY', `Untrusted or unknown Key ID: ${envelope['signingKeyId']}`);
    }

    const message = buildSigningMessage(payloadObj as unknown as AuthorizationPayload);

    const sigBytes = base64urlDecode(signature);
    // Transfer into a plain ArrayBuffer for subtle.verify compatibility
    const sigBuf = sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer;

    let isValid: boolean;
    try {
      isValid = await crypto.subtle.verify('Ed25519', key, sigBuf, message);
    } catch {
      throw new CryptoError('INVALID_SIGNATURE', 'Malformed signature bytes or verification error');
    }

    if (!isValid) {
      throw new CryptoError('INVALID_SIGNATURE', 'Signature verification failed');
    }

    return payloadObj as unknown as AuthorizationPayload;
  }
}
