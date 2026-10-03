/**
 * timingSafeEqual — Deno-compatible constant-time byte comparison.
 *
 * Node reference: crypto.timingSafeEqual(a, b)
 * Deno equivalent: manual XOR over all bytes, no early exit.
 *
 * Used for:
 *  - Admin token comparison (adminAuth middleware)
 *  - Any HMAC/hash comparison that must not be branch-observable
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Compare two strings in constant time (UTF-8 encoded).
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(a), enc.encode(b));
}
