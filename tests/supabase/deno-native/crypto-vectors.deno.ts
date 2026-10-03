/**
 * Native Deno Crypto Vector Suite — Checkpoint 3.1
 *
 * Runs under the ACTUAL Deno runtime (no Node polyfill).
 * Validates all crypto operations that the Edge Functions will use.
 *
 * Run: deno run --allow-read tests/supabase/deno-native/crypto-vectors.deno.ts
 */

// Import shared Edge crypto modules (relative paths)
import { canonicalize } from '../../../supabase/functions/_shared/crypto/canonicalize.ts';
import { hashLicenseKey, canonicalizeLicenseKey } from '../../../supabase/functions/_shared/crypto/licenseKey.ts';
import {
  DenoServerAuthorizationSigner,
  DenoAuthorizationVerifier,
  base64urlEncode,
  base64urlDecode,
} from '../../../supabase/functions/_shared/crypto/authorization.ts';
import { deriveDeviceKeyId, verifyDeviceProof } from '../../../supabase/functions/_shared/crypto/deviceProof.ts';
import { timingSafeEqual, timingSafeEqualStrings } from '../../../supabase/functions/_shared/crypto/timingSafe.ts';
import { CryptoError } from '../../../supabase/functions/_shared/errors/CryptoError.ts';

// ─── QA Test Material (not production) ──────────────────────────────────────
const QA_ED25519_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIE7NjFIfz3ZZLbxWv+P7yHyjJNghAehNE2mQiGSjufMj
-----END PRIVATE KEY-----`;

const QA_ED25519_PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAE6/KsNRcglPTMW1gdiZ9ZFOu6jR9LI1ZCFV3HvGGV+Y=
-----END PUBLIC KEY-----`;

const QA_SIGNING_KEY_ID = 'qa-key-2024-01';
const QA_HMAC_SECRET = 'test-hmac-secret-at-least-32-bytes-long-for-testing';

// Known-good vectors (pre-computed by Node reference and cross-verified in Checkpoint 3)
const KNOWN_VECTORS = {
  // canonicalize({z:1, m:2, a:3, b:4}) — key-sorted JCS
  keyOrderCanon: '{"a":3,"b":4,"m":2,"z":1}',
  // HMAC of 'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY' normalized → 'ABCDEFGHIJKLMNOPQRSTUVWXY' with QA_HMAC_SECRET
  knownHmac: 'd1721e63b41985e1e77fed5a7e393c724d0df29a61c42fc9e34d404a7fe48746',
  // deviceKeyId for QA_P256_PUBLIC_B64URL
  knownDeviceKeyId: 'f371f47d5a98df6e37ff6e911589a3eab9a548d3601b4d1bd9ffdcff29051a8e',
  // Known signature for authPayload with QA_ED25519_PRIVATE_PEM
  knownSig: '', // filled during test (Ed25519 is deterministic, so we generate and re-verify)
};

const QA_P256_PUBLIC_B64URL = 'BFF_kSZ7F0dP5INkRRJtCM8iuf89AMXzQs90LmVe-j3lr47YqNMk_B90XGeLESIyW_ml3tC6yyPv3Iocse_0HDQ';

// QA P-256 private key — for generating device proofs in tests only
const QA_P256_PRIVATE_PKCS8_B64 = `MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTRfj9/RzoEOJEbn3
JDP8O39PYDaElNp+tKt1QCKYR9KhRANCAARRf5EmexdHT+SDZEUSbQjPIrn/PQDF
80LPdC5lXvo95a+O2KjTJPwfdFxnixEiMlv5pd7Qussj79yKHLHv9Bw0`;

const authPayload = {
  protocolVersion: 1,
  authorizationVersion: 1,
  licenseId: '00000000-0000-0000-0000-000000000001',
  productId: 'mini-pos-v1',
  deviceKeyId: KNOWN_VECTORS.knownDeviceKeyId,
  validFrom: '2024-01-01T00:00:00.000Z',
  validUntil: '2025-01-01T00:00:00.000Z',
  issuedAt: '2024-01-01T00:00:00.000Z',
  signingKeyId: QA_SIGNING_KEY_ID,
};

let passed = 0;
const failures: string[] = [];

function pass(name: string) { console.log(`  ✅ ${name}`); passed++; }
function fail(name: string, err: unknown) {
  console.error(`  ❌ ${name}: ${err}`);
  failures.push(`${name}: ${err}`);
}
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}
function assertEqual(a: unknown, b: unknown, msg = '') {
  if (a !== b) throw new Error(`Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}${msg ? ': ' + msg : ''}`);
}

// ─── 1. CANONICALIZATION ─────────────────────────────────────────────────────
console.log('\n1. JCS Canonicalization (native Deno)');
const canonVectors: [string, unknown, string][] = [
  ['empty object', {}, '{}'],
  ['key ordering', { z: 1, m: 2, a: 3, b: 4 }, KNOWN_VECTORS.keyOrderCanon],
  ['nested', { b: { d: 1, c: 2 }, a: 3 }, '{"a":3,"b":{"c":2,"d":1}}'],
  ['array', { arr: [3, 1, 2] }, '{"arr":[3,1,2]}'],
  ['boolean', { v: true, w: false }, '{"v":true,"w":false}'],
  ['null', { n: null }, '{"n":null}'],
  ['integer', { n: 42 }, '{"n":42}'],
  ['float', { f: 1.5 }, '{"f":1.5}'],
  ['unicode', { s: '\u00e9\u4e2d\u6587' }, '{"s":"é中文"}'],
  ['escaped', { s: 'line\nbreak\ttab' }, '{"s":"line\\nbreak\\ttab"}'],
];

for (const [label, input, expected] of canonVectors) {
  try {
    const result = canonicalize(input);
    assertEqual(result, expected, label);
    pass(`canonicalize: ${label}`);
  } catch (e) { fail(`canonicalize: ${label}`, e); }
}

// Null/undefined rejection
try {
  let threw = false;
  try { canonicalize(null as any); } catch (e) { if (e instanceof CryptoError) threw = true; }
  assert(threw, 'null must throw CryptoError');
  pass('canonicalize: null throws CryptoError');
} catch (e) { fail('canonicalize: null rejection', e); }

// ─── 2. LICENSE KEY HMAC ─────────────────────────────────────────────────────
console.log('\n2. License Key HMAC (native Deno)');
const hmacVectors: [string, string][] = [
  ['ABCDE-FGHIJ-KLMNO-PQRST-UVWXY', KNOWN_VECTORS.knownHmac],
];

for (const [key, expectedHmac] of hmacVectors) {
  try {
    const result = await hashLicenseKey(key, QA_HMAC_SECRET);
    assertEqual(result, expectedHmac, `HMAC mismatch for "${key}"`);
    pass(`HMAC: "${key.substring(0, 20)}..." == known vector`);
  } catch (e) { fail(`HMAC: "${key}"`, e); }
}

// Normalization
try {
  const upper = canonicalizeLicenseKey('abcde-FGHIJ');
  assertEqual(upper, 'ABCDEFGHIJ', 'Normalization');
  pass('Normalization: lowercase + hyphens stripped');
} catch (e) { fail('Normalization', e); }

// HMAC idempotency: same key different presentation → same HMAC
try {
  const h1 = await hashLicenseKey('ABCD-EFGH', QA_HMAC_SECRET);
  const h2 = await hashLicenseKey('abcd-efgh', QA_HMAC_SECRET);
  const h3 = await hashLicenseKey('abcdefgh', QA_HMAC_SECRET);
  assert(h1 === h2 && h2 === h3, 'Case/hyphen normalization must yield identical HMAC');
  pass('HMAC: normalization idempotency (upper/lower/hyphens)');
} catch (e) { fail('HMAC normalization idempotency', e); }

// ─── 3. DEVICE KEY ID ────────────────────────────────────────────────────────
console.log('\n3. deviceKeyId (native Deno)');
try {
  const keyId = await deriveDeviceKeyId(QA_P256_PUBLIC_B64URL);
  assertEqual(keyId, KNOWN_VECTORS.knownDeviceKeyId, 'deviceKeyId');
  pass(`deviceKeyId: matches known vector (${keyId.substring(0, 16)}...)`);
} catch (e) { fail('deviceKeyId', e); }

// Invalid key format
try {
  let threw = false;
  try { await deriveDeviceKeyId('not-a-key'); } catch (e) { if (e instanceof CryptoError) threw = true; }
  assert(threw, 'Invalid key must throw CryptoError');
  pass('deviceKeyId: invalid key throws CryptoError');
} catch (e) { fail('deviceKeyId: invalid key rejection', e); }

// ─── 4. ED25519 SIGNING + VERIFICATION ───────────────────────────────────────
console.log('\n4. Ed25519 Sign/Verify (native Deno)');
const signer = new DenoServerAuthorizationSigner();
await signer.registerKey(QA_SIGNING_KEY_ID, QA_ED25519_PRIVATE_PEM);

let denoSig = '';
try {
  const signed = await signer.sign(authPayload);
  denoSig = signed.signature;
  assert(/^[A-Za-z0-9_-]{86}$/.test(denoSig), 'Signature must be 86-char base64url');
  pass('Ed25519 sign: 86-char base64url output');
} catch (e) { fail('Ed25519 sign', e); }

// Deterministic: sign again, must be byte-identical
try {
  const signed2 = await signer.sign(authPayload);
  assertEqual(signed2.signature, denoSig, 'Ed25519 must be deterministic');
  pass('Ed25519: deterministic (same key+msg → identical sig)');
} catch (e) { fail('Ed25519 determinism', e); }

// Verify own signature
const verifier = new DenoAuthorizationVerifier();
await verifier.registerTrustedKey(QA_SIGNING_KEY_ID, QA_ED25519_PUBLIC_PEM);

try {
  await verifier.verify({ ...authPayload, signature: denoSig } as any);
  pass('Ed25519: Deno verifier accepts Deno signature');
} catch (e) { fail('Ed25519 self-verify', e); }

// ─── 5. DOMAIN SEPARATION ────────────────────────────────────────────────────
console.log('\n5. Domain Separation (native Deno)');
// Tampered payload must fail
try {
  let threw = false;
  try {
    await verifier.verify({
      ...authPayload,
      licenseId: 'tampered-id-0000-0000-000000000000',
      signature: denoSig
    } as any);
  } catch { threw = true; }
  assert(threw, 'Tampered payload must fail');
  pass('Domain separation: tampered payload rejected');
} catch (e) { fail('Domain separation', e); }

// ─── 6. MALFORMED INPUTS ─────────────────────────────────────────────────────
console.log('\n6. Malformed Input Rejection (native Deno)');
const malformedCases: [string, any][] = [
  ['bad sig chars', { ...authPayload, signature: '!!INVALID!!' }],
  ['short sig', { ...authPayload, signature: 'abc' }],
  ['wrong protocol', { ...authPayload, protocolVersion: 99, signature: denoSig }],
  ['null envelope', null],
  ['unknown kid', { ...authPayload, signingKeyId: 'no-such-key', signature: denoSig }],
];
for (const [label, input] of malformedCases) {
  let threw = false;
  try { await verifier.verify(input); } catch { threw = true; }
  if (threw) pass(`Malformed: rejected "${label}"`);
  else fail(`Malformed: should reject "${label}"`, 'Did not throw');
}

// ─── 7. TIMING SAFE ──────────────────────────────────────────────────────────
console.log('\n7. Timing-Safe Comparison (native Deno)');
try {
  const enc = new TextEncoder();
  assert(timingSafeEqual(enc.encode('abc'), enc.encode('abc')), 'equal');
  assert(!timingSafeEqual(enc.encode('abc'), enc.encode('xyz')), 'not equal');
  assert(!timingSafeEqual(enc.encode('abc'), enc.encode('abcd')), 'different length');
  assert(timingSafeEqualStrings('token-abc', 'token-abc'), 'strings equal');
  assert(!timingSafeEqualStrings('token-abc', 'token-xyz'), 'strings unequal');
  pass('timingSafeEqual: all semantic cases correct');
} catch (e) { fail('timingSafeEqual', e); }

// ─── 8. P-256 DEVICE PROOF ───────────────────────────────────────────────────
console.log('\n8. P-256 Device Proof (native Deno)');

// Generate a P-256 signing key in native Deno WebCrypto
const p256TestKey = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

// Get uncompressed public key (65 bytes)
const p256PubRaw = await crypto.subtle.exportKey('raw', p256TestKey.publicKey);
const p256PubBytes = new Uint8Array(p256PubRaw);
const p256PubB64url = base64urlEncode(p256PubRaw);

// Derive expected deviceKeyId
const p256DeviceKeyId = await deriveDeviceKeyId(p256PubB64url);

const fakeChallenge = {
  protocolVersion: 1 as const,
  challengeId: 'c1234567-1234-1234-1234-123456789abc',
  issuedAt: '2024-01-01T00:00:00.000Z',
  expiresAt: '9999-12-31T23:59:59.000Z', // never expires for test
  nonce: 'dGVzdC1ub25jZS0zMi1ieXRlcy1oZXJlLXhYeVo',
  deviceKeyId: p256DeviceKeyId,
  purpose: 'ACTIVATION',
};

// Sign challenge using native Deno ECDSA (produces DER? — WebCrypto produces P1363 raw)
// WebCrypto ECDSA sign() returns P1363 raw format, NOT DER.
// The production path (Swift) produces DER. So we need to also test raw-format path.
// Our verifyDeviceProof expects DER input (for production). For Deno native test:
// we sign in raw format, then convert raw→DER for the verifier.

const challengeCanon = canonicalize(fakeChallenge);
const domainTag = new TextEncoder().encode('MINIPOS-DEVICE-CHALLENGE-V1:');
const canonBytes = new TextEncoder().encode(challengeCanon);
const challengeMsg = new Uint8Array(domainTag.length + canonBytes.length);
challengeMsg.set(domainTag);
challengeMsg.set(canonBytes, domainTag.length);

// Sign with P1363 raw format (Deno WebCrypto)
const p1363Sig = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  p256TestKey.privateKey,
  challengeMsg
);

// Convert P1363 raw → DER for verifier (reverse of derToRaw in deviceProof.ts)
function rawToDer(raw: Uint8Array): Uint8Array {
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  function encodeInt(bytes: Uint8Array): Uint8Array {
    // Strip leading zeros
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let val = bytes.slice(start);
    // If high bit set, prepend 0x00
    if (val[0] & 0x80) val = new Uint8Array([0x00, ...val]);
    return new Uint8Array([0x02, val.length, ...val]);
  }
  const rDer = encodeInt(r);
  const sDer = encodeInt(s);
  const body = new Uint8Array([...rDer, ...sDer]);
  return new Uint8Array([0x30, body.length, ...body]);
}

const derSig = rawToDer(new Uint8Array(p1363Sig));
const sigB64url = base64urlEncode(derSig.buffer);
const proof = { challenge: fakeChallenge, signature: sigB64url };

try {
  await verifyDeviceProof(proof, p256PubB64url, p256DeviceKeyId, 'ACTIVATION');
  pass('Valid P-256 device proof (Deno-generated key, DER via rawToDer) verified');
} catch (e) { fail('Valid P-256 device proof', e); }

// Tampered signature
try {
  const badSig = sigB64url.slice(0, -4) + 'AAAA';
  let threw = false;
  try { await verifyDeviceProof({ challenge: fakeChallenge, signature: badSig }, p256PubB64url, p256DeviceKeyId, 'ACTIVATION'); } catch { threw = true; }
  assert(threw);
  pass('Tampered P-256 signature rejected');
} catch (e) { fail('Tampered P-256 rejection', e); }

// Wrong purpose
try {
  let threw = false;
  try { await verifyDeviceProof(proof, p256PubB64url, p256DeviceKeyId, 'DEACTIVATION'); } catch { threw = true; }
  assert(threw);
  pass('Wrong purpose rejected');
} catch (e) { fail('Wrong purpose', e); }

// Wrong deviceKeyId in challenge
try {
  const badChallenge = { ...fakeChallenge, deviceKeyId: 'wrong-id' };
  let threw = false;
  try { await verifyDeviceProof({ challenge: badChallenge, signature: sigB64url }, p256PubB64url, p256DeviceKeyId, 'ACTIVATION'); } catch { threw = true; }
  assert(threw);
  pass('Wrong deviceKeyId in challenge rejected');
} catch (e) { fail('Wrong deviceKeyId', e); }

// Malformed signature
try {
  let threw = false;
  try { await verifyDeviceProof({ challenge: fakeChallenge, signature: 'notbase64!!!' }, p256PubB64url, p256DeviceKeyId, 'ACTIVATION'); } catch { threw = true; }
  assert(threw);
  pass('Malformed signature rejected');
} catch (e) { fail('Malformed signature', e); }

// ─── SUMMARY ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} test(s) FAILED:\n${failures.map((f) => '  • ' + f).join('\n')}`);
  Deno.exit(1);
}
console.log(`✅ All ${passed} Deno-native crypto tests PASSED`);
Deno.exit(0);
