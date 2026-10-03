/**
 * JCS Canonicalization — Deno/WebCrypto-compatible implementation.
 *
 * Implements RFC 8785 (JSON Canonicalization Scheme) manually, producing
 * byte-for-byte identical output to the Node `canonicalize@5.1.0` npm package
 * used in the reference implementation.
 *
 * IMPORTANT: This MUST NOT diverge from the Node reference in any encoding
 * detail. Both runtimes must produce the same UTF-8 bytes for every input.
 *
 * Source reference: Node reference uses `canonicalize` npm package v5.1.0,
 * which is itself an implementation of RFC 8785.
 */

import { CryptoError } from '../errors/CryptoError.ts';

/**
 * Serializes a value using JCS (RFC 8785):
 *  - Keys sorted lexicographically (by Unicode code point)
 *  - No extraneous whitespace
 *  - Numbers: IEEE 754 with no trailing zeros (uses ES JSON.stringify rules
 *    which match JCS for all finite, non-special numbers)
 *  - Strings: JSON-escaped
 *  - Arrays: ordered
 *  - undefined: NOT allowed (throws)
 *
 * Returns a plain string. Caller must encode to UTF-8 bytes.
 */
function jcsSerialize(value: unknown): string {
  if (value === undefined) {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'undefined is not a valid JCS value');
  }
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Non-finite number cannot be canonicalized');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => jcsSerialize(v));
    return '[' + items.join(',') + ']';
  }
  if (typeof value === 'object') {
    // Sort keys by Unicode code point (same as localeCompare with 'en' produces
    // for purely ASCII keys; for unicode keys this is code-point order).
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map((k) => {
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) return null; // skip undefined fields (matches canonicalize@5 behavior)
      return JSON.stringify(k) + ':' + jcsSerialize(v);
    }).filter((p): p is string => p !== null);
    return '{' + pairs.join(',') + '}';
  }
  throw new CryptoError('INVALID_CRYPTO_PAYLOAD', `Unsupported type: ${typeof value}`);
}

/**
 * Canonical entry point.
 * Mirrors the Node `canonicalize()` wrapper in src/shared/crypto/canonicalize.ts.
 */
export function canonicalize(payload: unknown): string {
  if (payload === undefined || payload === null) {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Payload cannot be null or undefined');
  }
  const serialized = jcsSerialize(payload);
  if (serialized === undefined) {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Payload could not be canonicalized');
  }
  return serialized;
}
