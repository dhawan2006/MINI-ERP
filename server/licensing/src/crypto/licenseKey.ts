import crypto from 'crypto';
import { config } from '../config/config';

/**
 * Generates a cryptographically secure, human-readable license key.
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateLicenseKey(): string {
  const bytes = crypto.randomBytes(15);
  // Encode in Base32 to avoid ambiguous characters like 0/O, 1/I
  // Custom alphabet (Crockford's Base32)
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let result = '';
  
  for (let i = 0; i < bytes.length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  
  // Format with hyphens for readability
  return [
    result.slice(0, 5),
    result.slice(5, 10),
    result.slice(10, 15),
    result.slice(15, 20),
    result.slice(20, 25),
  ].filter(Boolean).join('-');
}

/**
 * Normalizes a license key to handle copy-paste artifacts
 */
export function canonicalizeLicenseKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Hashes the canonicalized license key for database lookup
 */
export function hashLicenseKey(key: string): string {
  const canonical = canonicalizeLicenseKey(key);
  return crypto
    .createHmac('sha256', config.LICENSE_KEY_HMAC_SECRET)
    .update(canonical)
    .digest('hex');
}
