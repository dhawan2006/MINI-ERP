import canonicalizeLib from 'canonicalize';
import { CryptoError } from './cryptoError';

/**
 * Deterministically canonicalizes a JSON object into a string according to RFC 8785.
 * This guarantees that both the Server and Client compute the exact same bytes 
 * for signature generation and verification.
 */
export function canonicalize(payload: any): string {
  if (payload === undefined || payload === null) {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Payload cannot be null or undefined');
  }
  
  const serialized = canonicalizeLib(payload);
  
  if (serialized === undefined) {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Payload could not be canonicalized');
  }

  return serialized;
}
