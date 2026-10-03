/**
 * License Key Crypto — Deno-compatible HMAC-SHA256 implementation.
 *
 * Protocol equivalence requirement:
 *   Node:  crypto.createHmac('sha256', secret).update(canonical).digest('hex')
 *   Deno:  subtle.sign('HMAC', key, canonical_utf8) → hex
 *
 * Normalization: toUpperCase().replace(/[^A-Z0-9]/g, '')
 * This MUST be byte-for-byte identical to canonicalizeLicenseKey() in Node.
 *
 * HMAC secret comes from environment variable LICENSING_LICENSE_KEY_HMAC_SECRET
 * and must NEVER be hardcoded here.
 */

import { CryptoError } from '../errors/CryptoError.ts';

/**
 * Normalizes a license key for consistent DB lookups.
 * Identical to Node: key.toUpperCase().replace(/[^A-Z0-9]/g, '')
 */
export function canonicalizeLicenseKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Computes HMAC-SHA256 of the canonicalized license key.
 * Returns lowercase hex (64 chars) — identical to Node digest('hex').
 *
 * @param key    The plaintext license key (will be canonicalized internally).
 * @param secret The raw HMAC secret string (from environment).
 */
export async function hashLicenseKey(key: string, secret: string): Promise<string> {
  if (!secret || secret.length === 0) {
    throw new CryptoError('INVALID_KEY', 'HMAC secret must not be empty');
  }

  const canonical = canonicalizeLicenseKey(key);
  const enc = new TextEncoder();

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(canonical));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
