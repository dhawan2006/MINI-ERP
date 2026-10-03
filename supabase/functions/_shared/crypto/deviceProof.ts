/**
 * DeviceProofVerifier — Deno/WebCrypto implementation.
 *
 * Domain separation tag: "MINIPOS-DEVICE-CHALLENGE-V1:" (UTF-8, no null terminator)
 *
 * Signature format: DER-encoded ECDSA-SHA256 (from Swift SecureEnclave via
 * P256.Signing.ECDSASignature.derRepresentation), base64url encoded.
 * WebCrypto's P-256 verify() expects IEEE P1363 raw (r||s) format, so we
 * must convert DER → raw before calling subtle.verify().
 */

import { CryptoError } from '../errors/CryptoError.ts';
import { canonicalize } from './canonicalize.ts';
import { DeviceChallenge } from '../protocol/DeviceChallenge.ts';
import { base64urlDecode } from './authorization.ts';

const CHALLENGE_DOMAIN_TAG = new TextEncoder().encode('MINIPOS-DEVICE-CHALLENGE-V1:');

/**
 * Converts a DER-encoded ECDSA signature to IEEE P1363 raw (r||s) format
 * required by WebCrypto's subtle.verify() for ECDSA.
 *
 * DER ECDSA structure:
 *   30 <len> 02 <rlen> <r bytes> 02 <slen> <s bytes>
 */
function derToRaw(der: Uint8Array, coordLen = 32): ArrayBuffer {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new CryptoError('INVALID_SIGNATURE', 'Invalid DER SEQUENCE tag');
  // Skip length (may be short or long form)
  const seqLen = der[offset];
  if (seqLen & 0x80) {
    offset += 1 + (seqLen & 0x7f);
  } else {
    offset++;
  }
  // Parse r
  if (der[offset++] !== 0x02) throw new CryptoError('INVALID_SIGNATURE', 'Invalid DER INTEGER tag for r');
  const rLen = der[offset++];
  let rBytes = der.slice(offset, offset + rLen);
  offset += rLen;
  // Parse s
  if (der[offset++] !== 0x02) throw new CryptoError('INVALID_SIGNATURE', 'Invalid DER INTEGER tag for s');
  const sLen = der[offset++];
  let sBytes = der.slice(offset, offset + sLen);

  // DER integers may have a leading 0x00 byte to indicate positive sign
  if (rBytes[0] === 0x00) rBytes = rBytes.slice(1);
  if (sBytes[0] === 0x00) sBytes = sBytes.slice(1);

  // Pad to coordLen
  const raw = new ArrayBuffer(coordLen * 2);
  const rawView = new Uint8Array(raw);
  rawView.set(rBytes, coordLen - rBytes.length);
  rawView.set(sBytes, coordLen + coordLen - sBytes.length);
  return raw;
}

/**
 * Imports a P-256 public key from base64url-encoded uncompressed X9.63 (65 bytes).
 */
async function importP256PublicKey(publicKeyBase64url: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64urlDecode(publicKeyBase64url);
  } catch {
    throw new CryptoError('INVALID_KEY', 'Invalid base64url encoding for public key');
  }

  if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
    throw new CryptoError('INVALID_KEY_TYPE', 'Only uncompressed P-256 public keys are supported (65 bytes, 0x04 prefix)');
  }

  // Transfer into plain ArrayBuffer for subtle.importKey compatibility
  const keyBuf = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;

  try {
    return await crypto.subtle.importKey(
      'raw',
      keyBuf,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
  } catch (e) {
    throw new CryptoError('INVALID_KEY', `Failed to import P-256 public key: ${e}`);
  }
}

/**
 * Derives the deviceKeyId from an uncompressed P-256 public key (65 bytes, base64url).
 * Algorithm: SHA-256( compress(publicKey) ) → lowercase hex.
 */
export async function deriveDeviceKeyId(publicKeyBase64url: string): Promise<string> {
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64urlDecode(publicKeyBase64url);
  } catch {
    throw new CryptoError('INVALID_KEY_TYPE', 'Invalid base64url encoding for public key');
  }
  if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
    throw new CryptoError('INVALID_KEY_TYPE', 'Only uncompressed P-256 public keys are supported');
  }

  const x = keyBytes.slice(1, 33);
  const y = keyBytes.slice(33, 65);
  const prefix = (y[31] % 2 === 0) ? 0x02 : 0x03;

  const compressedBuf = new ArrayBuffer(33);
  const compressedView = new Uint8Array(compressedBuf);
  compressedView[0] = prefix;
  compressedView.set(x, 1);

  const hashBuf = await crypto.subtle.digest('SHA-256', compressedBuf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies a device proof without consuming the challenge.
 */
export async function verifyDeviceProof(
  proof: Record<string, unknown>,
  devicePublicKeyBase64url: string,
  expectedDeviceKeyId: string,
  expectedPurpose: string
): Promise<void> {
  if (!proof || typeof proof !== 'object') {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Proof must be an object');
  }

  const challenge = proof['challenge'] as DeviceChallenge | undefined;
  const signature = proof['signature'] as string | undefined;

  if (!challenge || typeof challenge !== 'object') {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid challenge');
  }
  if (typeof signature !== 'string') {
    throw new CryptoError('INVALID_CRYPTO_PAYLOAD', 'Missing or invalid signature');
  }

  // 1. Structural match
  if (challenge.deviceKeyId !== expectedDeviceKeyId) {
    throw new CryptoError('DEVICE_KEY_MISMATCH', 'Challenge does not belong to the expected device');
  }
  if (challenge.purpose !== expectedPurpose) {
    throw new CryptoError('INVALID_CHALLENGE', 'Challenge purpose mismatch');
  }

  // 2. Canonicalize challenge → domain-separated message
  const canonical = canonicalize(challenge);
  const canonicalBytes = new TextEncoder().encode(canonical);
  const messageBuf = new ArrayBuffer(CHALLENGE_DOMAIN_TAG.length + canonicalBytes.length);
  const messageView = new Uint8Array(messageBuf);
  messageView.set(CHALLENGE_DOMAIN_TAG, 0);
  messageView.set(canonicalBytes, CHALLENGE_DOMAIN_TAG.length);

  // 3. Decode DER signature
  let sigDer: Uint8Array;
  try {
    sigDer = base64urlDecode(signature);
  } catch {
    throw new CryptoError('INVALID_SIGNATURE', 'Signature must be a valid base64url string');
  }

  // 4. Convert DER → IEEE P1363 raw
  let sigRaw: ArrayBuffer;
  try {
    sigRaw = derToRaw(sigDer, 32);
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('INVALID_SIGNATURE', `DER to raw conversion failed: ${e}`);
  }

  // 5. Import public key
  const key = await importP256PublicKey(devicePublicKeyBase64url);

  // 6. Verify
  let isValid: boolean;
  try {
    isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      sigRaw,
      messageBuf
    );
  } catch {
    throw new CryptoError('INVALID_SIGNATURE', 'Malformed signature bytes or verification error');
  }

  if (!isValid) {
    throw new CryptoError('DEVICE_PROOF_INVALID', 'Device signature verification failed');
  }
}
