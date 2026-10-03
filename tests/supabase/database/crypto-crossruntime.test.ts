/**
 * Cross-Runtime Crypto Vector Suite
 *
 * Runs under Node.js (tsx from repo root) and validates:
 *  1. Canonicalization parity:  Node canonicalize@5 == Deno JCS impl
 *  2. HMAC-SHA256 parity:       Node crypto == Deno WebCrypto
 *  3. deviceKeyId parity:       Node SHA256(compressed) == Deno SHA256(compressed)
 *  4. Ed25519 signing parity:   Node crypto.sign == Deno subtle.sign (same key+msg → same bytes)
 *  5. Ed25519 cross-verify:     Node sig verifiable by Deno verifier & vice versa
 *  6. Domain separation tests
 *  7. Malformed input rejection
 *  8. Timing-safe comparison
 *  9. P-256 device proof verification
 * 10. License key normalization
 *
 * Node crypto primitives are inlined (not imported from server/licensing/) to
 * avoid cross-package dependency issues. They are the exact same calls used
 * in the reference implementation.
 *
 * IMPORTANT: QA test keypair ONLY — no production secrets here.
 */

import crypto, { webcrypto } from 'crypto';
import * as assert from 'node:assert/strict';
import canonicalizeNode from 'canonicalize';

// Supply WebCrypto to globalThis so Deno-targeting modules work under Node
Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

// ─── QA Test Keys (generated solely for testing, not production) ─────────────
const QA_ED25519_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIE7NjFIfz3ZZLbxWv+P7yHyjJNghAehNE2mQiGSjufMj
-----END PRIVATE KEY-----`;

const QA_ED25519_PUBLIC_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAE6/KsNRcglPTMW1gdiZ9ZFOu6jR9LI1ZCFV3HvGGV+Y=
-----END PUBLIC KEY-----`;

const QA_SIGNING_KEY_ID = 'qa-key-2024-01';
const QA_HMAC_SECRET = 'test-hmac-secret-at-least-32-bytes-long-for-testing';

// QA P-256 device keypair
const QA_P256_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgTRfj9/RzoEOJEbn3
JDP8O39PYDaElNp+tKt1QCKYR9KhRANCAARRf5EmexdHT+SDZEUSbQjPIrn/PQDF
80LPdC5lXvo95a+O2KjTJPwfdFxnixEiMlv5pd7Qussj79yKHLHv9Bw0
-----END PRIVATE KEY-----`;

const QA_P256_PUBLIC_B64URL = 'BFF_kSZ7F0dP5INkRRJtCM8iuf89AMXzQs90LmVe-j3lr47YqNMk_B90XGeLESIyW_ml3tC6yyPv3Iocse_0HDQ';
const QA_EXPECTED_DEVICE_KEY_ID = 'f371f47d5a98df6e37ff6e911589a3eab9a548d3601b4d1bd9ffdcff29051a8e';

// ─── Node Reference Functions (inlined from server/licensing/src/) ────────────

function nodeCanonicalizeKey(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function nodeHashLicenseKey(key: string, secret: string): string {
  return crypto.createHmac('sha256', secret)
    .update(key.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');
}

function nodeDeviceKeyId(publicKeyBase64url: string): string {
  const rawBytes = Buffer.from(publicKeyBase64url, 'base64url');
  const x = rawBytes.slice(1, 33);
  const y = rawBytes.slice(33, 65);
  const prefix = (y[31] % 2 === 0) ? 0x02 : 0x03;
  const compressed = Buffer.concat([Buffer.from([prefix]), x]);
  return crypto.createHash('sha256').update(compressed).digest('hex');
}

function nodeSignAuthorization(payload: any): string {
  const canonical = canonicalizeNode(payload)!;
  const canonicalBytes = Buffer.from(canonical, 'utf8');
  const domainTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
  const dataToSign = Buffer.concat([domainTag, canonicalBytes]);
  const privKey = crypto.createPrivateKey({ key: QA_ED25519_PRIVATE_PEM, format: 'pem' });
  return crypto.sign(null, dataToSign, privKey).toString('base64url');
}

function nodeVerifyAuthorization(envelope: any): boolean {
  const { signature, ...payloadObj } = envelope;
  const canonical = canonicalizeNode(payloadObj)!;
  const canonicalBytes = Buffer.from(canonical, 'utf8');
  const domainTag = Buffer.from('MINIPOS-AUTHORIZATION-V1:', 'utf8');
  const dataToVerify = Buffer.concat([domainTag, canonicalBytes]);
  const sigBuf = Buffer.from(signature, 'base64url');
  const pubKey = crypto.createPublicKey({ key: QA_ED25519_PUBLIC_PEM, format: 'pem' });
  return crypto.verify(null, dataToVerify, pubKey, sigBuf);
}

async function runAll() {
  // Import Deno-targeting modules (after webcrypto is patched into globalThis)
  const { canonicalize: denoCanon } = await import('../../../supabase/functions/_shared/crypto/canonicalize.ts');
  const { hashLicenseKey: denoHashLK, canonicalizeLicenseKey: denoCanonLK } = await import('../../../supabase/functions/_shared/crypto/licenseKey.ts');
  const { DenoServerAuthorizationSigner, DenoAuthorizationVerifier } = await import('../../../supabase/functions/_shared/crypto/authorization.ts');
  const { deriveDeviceKeyId, verifyDeviceProof } = await import('../../../supabase/functions/_shared/crypto/deviceProof.ts');
  const { timingSafeEqual, timingSafeEqualStrings } = await import('../../../supabase/functions/_shared/crypto/timingSafe.ts');

  let passed = 0;
  const failures: string[] = [];

  function pass(name: string) { console.log(`  ✅ ${name}`); passed++; }
  function fail(name: string, err: unknown) {
    console.error(`  ❌ ${name}: ${err}`);
    failures.push(`${name}: ${err}`);
  }

  const authPayload = {
    protocolVersion: 1,
    authorizationVersion: 1,
    licenseId: '00000000-0000-0000-0000-000000000001',
    productId: 'mini-pos-v1',
    deviceKeyId: QA_EXPECTED_DEVICE_KEY_ID,
    validFrom: '2024-01-01T00:00:00.000Z',
    validUntil: '2025-01-01T00:00:00.000Z',
    issuedAt: '2024-01-01T00:00:00.000Z',
    signingKeyId: QA_SIGNING_KEY_ID,
  };

  // ─── 1. CANONICALIZATION PARITY ──────────────────────────────────────────
  console.log('\n1. Canonicalization Parity');
  const canonVectors: [string, unknown][] = [
    ['empty object', {}],
    ['key ordering', { z: 1, m: 2, a: 3, b: 4 }],
    ['nested object', { b: { d: 1, c: 2 }, a: 3 }],
    ['array preserved order', { arr: [3, 1, 2] }],
    ['boolean', { v: true, w: false }],
    ['null value', { n: null }],
    ['number integer', { n: 42 }],
    ['number float', { f: 1.5 }],
    ['number zero', { z: 0 }],
    ['unicode', { s: '\u00e9\u4e2d\u6587' }],
    ['escaped chars', { s: 'line\nbreak\ttab' }],
    ['deep nesting', { a: { b: { c: { d: 4 } } } }],
    ['string with quotes', { s: 'say "hi"' }],
    ['authorization payload', authPayload],
  ];
  for (const [label, input] of canonVectors) {
    try {
      const nodeResult = canonicalizeNode(input);
      const denoResult = denoCanon(input);
      assert.strictEqual(denoResult, nodeResult);
      pass(`canonicalize: ${label}`);
    } catch (e) { fail(`canonicalize: ${label}`, e); }
  }

  // ─── 2. LICENSE KEY HMAC ─────────────────────────────────────────────────
  console.log('\n2. License Key HMAC Parity');
  const hmacVectors = [
    'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY',
    'abcde-fghij-klmno-pqrst-uvwxy',
    'abc123-DEF456',
    ' A B C - D E F ',
    'ABCDEFGHIJKLMN',
  ];
  for (const key of hmacVectors) {
    try {
      const nodeHmac = nodeHashLicenseKey(key, QA_HMAC_SECRET);
      const denoHmac = await denoHashLK(key, QA_HMAC_SECRET);
      assert.strictEqual(denoHmac, nodeHmac);
      assert.strictEqual(denoCanonLK(key), nodeCanonicalizeKey(key));
      pass(`HMAC + normalization: "${key.trim().substring(0, 25)}"`);
    } catch (e) { fail(`HMAC: "${key}"`, e); }
  }

  // ─── 3. DEVICE KEY ID ────────────────────────────────────────────────────
  console.log('\n3. deviceKeyId Parity');
  try {
    const nodeKeyId = nodeDeviceKeyId(QA_P256_PUBLIC_B64URL);
    const denoKeyId = await deriveDeviceKeyId(QA_P256_PUBLIC_B64URL);
    assert.strictEqual(denoKeyId, nodeKeyId);
    assert.strictEqual(denoKeyId, QA_EXPECTED_DEVICE_KEY_ID);
    pass('deriveDeviceKeyId: Node == Deno == expected');
  } catch (e) { fail('deriveDeviceKeyId', e); }

  // ─── 4. ED25519 SIGNING BYTE EQUALITY ────────────────────────────────────
  console.log('\n4. Ed25519 Signing Parity');
  let nodeSig = '';
  let denoSig = '';
  try {
    nodeSig = nodeSignAuthorization(authPayload);
    assert.match(nodeSig, /^[A-Za-z0-9_-]{86}$/, 'Node sig format');
    pass('Node Ed25519 sign: 86-char base64url');
  } catch (e) { fail('Node Ed25519 sign', e); }

  try {
    const signer = new DenoServerAuthorizationSigner();
    await signer.registerKey(QA_SIGNING_KEY_ID, QA_ED25519_PRIVATE_PEM);
    const signed = await signer.sign(authPayload);
    denoSig = signed.signature;
    assert.match(denoSig, /^[A-Za-z0-9_-]{86}$/, 'Deno sig format');
    pass('Deno Ed25519 sign: 86-char base64url');
  } catch (e) { fail('Deno Ed25519 sign', e); }

  try {
    assert.strictEqual(denoSig, nodeSig, 'Ed25519 must be byte-identical (deterministic)');
    pass('Node signature === Deno signature (byte-identical)');
  } catch (e) { fail('Ed25519 byte equality', e); }

  // ─── 5. CROSS-VERIFY ─────────────────────────────────────────────────────
  console.log('\n5. Ed25519 Cross-Verification');
  try {
    // Node verifies Deno-signed
    assert.ok(nodeVerifyAuthorization({ ...authPayload, signature: denoSig }));
    pass('Node verifier accepts Deno signature');
  } catch (e) { fail('Node verifies Deno sig', e); }

  try {
    // Deno verifies Node-signed
    const verifier = new DenoAuthorizationVerifier();
    await verifier.registerTrustedKey(QA_SIGNING_KEY_ID, QA_ED25519_PUBLIC_PEM);
    await verifier.verify({ ...authPayload, signature: nodeSig } as any);
    pass('Deno verifier accepts Node signature');
  } catch (e) { fail('Deno verifies Node sig', e); }

  // ─── 6. DOMAIN SEPARATION ────────────────────────────────────────────────
  console.log('\n6. Domain Separation');
  try {
    const verifier = new DenoAuthorizationVerifier();
    await verifier.registerTrustedKey(QA_SIGNING_KEY_ID, QA_ED25519_PUBLIC_PEM);
    // Tampered payload with valid sig from different payload
    let threw = false;
    try {
      await verifier.verify({ ...authPayload, licenseId: 'deadbeef-dead-dead-dead-deadbeefdead', signature: denoSig } as any);
    } catch { threw = true; }
    assert.ok(threw);
    pass('Tampered payload correctly rejected');
  } catch (e) { fail('Domain separation: tampered payload', e); }

  // ─── 7. MALFORMED INPUTS ─────────────────────────────────────────────────
  console.log('\n7. Malformed Input Rejection');
  const verifier = new DenoAuthorizationVerifier();
  await verifier.registerTrustedKey(QA_SIGNING_KEY_ID, QA_ED25519_PUBLIC_PEM);
  const malformed: [string, any][] = [
    ['bad sig chars', { ...authPayload, signature: '!!!' }],
    ['short sig', { ...authPayload, signature: 'tooshort' }],
    ['wrong proto version', { ...authPayload, protocolVersion: 2, signature: denoSig }],
    ['null envelope', null],
    ['unknown kid', { ...authPayload, signingKeyId: 'unknown-kid', signature: denoSig }],
  ];
  for (const [label, input] of malformed) {
    let threw = false;
    try { await verifier.verify(input); } catch { threw = true; }
    if (threw) pass(`Rejected: ${label}`);
    else fail(`Should reject: ${label}`, 'Did not throw');
  }

  // ─── 8. TIMING SAFE ──────────────────────────────────────────────────────
  console.log('\n8. Timing Safe Comparison');
  try {
    const enc = new TextEncoder();
    assert.ok(timingSafeEqual(enc.encode('abc'), enc.encode('abc')));
    assert.ok(!timingSafeEqual(enc.encode('abc'), enc.encode('xyz')));
    assert.ok(!timingSafeEqual(enc.encode('abc'), enc.encode('abcd')));
    assert.ok(timingSafeEqualStrings('admin-token', 'admin-token'));
    assert.ok(!timingSafeEqualStrings('admin-token', 'wrong-token'));
    pass('timingSafeEqual: all cases correct');
  } catch (e) { fail('timingSafeEqual', e); }

  // ─── 9. P-256 DEVICE PROOF ───────────────────────────────────────────────
  console.log('\n9. P-256 Device Proof Verification');
  const fakeChallenge = {
    protocolVersion: 1 as const,
    challengeId: 'c1234567-1234-1234-1234-123456789abc',
    issuedAt: '2024-01-01T00:00:00.000Z',
    expiresAt: '2024-01-01T00:01:00.000Z',
    nonce: 'dGVzdC1ub25jZS0zMi1ieXRlcy1oZXJlLXhYeVo',
    deviceKeyId: QA_EXPECTED_DEVICE_KEY_ID,
    purpose: 'ACTIVATION',
  };

  // Create signature using Node P-256 (proxy for Swift Secure Enclave)
  const challengeCanon = canonicalizeNode(fakeChallenge)!;
  const domainTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
  const challengeMsgBytes = Buffer.concat([domainTag, Buffer.from(challengeCanon, 'utf8')]);
  const p256PrivKey = crypto.createPrivateKey({ key: QA_P256_PRIVATE_PEM, format: 'pem' });
  const derSig = crypto.sign('SHA256', challengeMsgBytes, p256PrivKey);
  const sigB64url = derSig.toString('base64url');
  const proof = { challenge: fakeChallenge, signature: sigB64url };

  try {
    await verifyDeviceProof(proof, QA_P256_PUBLIC_B64URL, QA_EXPECTED_DEVICE_KEY_ID, 'ACTIVATION');
    pass('Valid P-256 device proof verified by Deno');
  } catch (e) { fail('Valid P-256 device proof', e); }

  // Tampered sig
  try {
    const bad = { challenge: fakeChallenge, signature: sigB64url.slice(0, -4) + 'AAAA' };
    let threw = false;
    try { await verifyDeviceProof(bad, QA_P256_PUBLIC_B64URL, QA_EXPECTED_DEVICE_KEY_ID, 'ACTIVATION'); } catch { threw = true; }
    assert.ok(threw);
    pass('Tampered P-256 signature rejected');
  } catch (e) { fail('Tampered P-256 rejection', e); }

  // Wrong purpose
  try {
    let threw = false;
    try { await verifyDeviceProof(proof, QA_P256_PUBLIC_B64URL, QA_EXPECTED_DEVICE_KEY_ID, 'DEACTIVATION'); } catch { threw = true; }
    assert.ok(threw);
    pass('Wrong purpose rejected');
  } catch (e) { fail('Wrong purpose rejection', e); }

  // Wrong domain (sign with different prefix, verify with correct domain)
  try {
    const wrongMsg = Buffer.concat([Buffer.from('WRONG-DOMAIN:'), Buffer.from(challengeCanon)]);
    const wrongSig = crypto.sign('SHA256', wrongMsg, p256PrivKey).toString('base64url');
    let threw = false;
    try { await verifyDeviceProof({ challenge: fakeChallenge, signature: wrongSig }, QA_P256_PUBLIC_B64URL, QA_EXPECTED_DEVICE_KEY_ID, 'ACTIVATION'); } catch { threw = true; }
    assert.ok(threw);
    pass('Wrong domain device proof rejected');
  } catch (e) { fail('Wrong domain rejection', e); }

  // Malformed signature (not valid DER)
  try {
    const bad = { challenge: fakeChallenge, signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
    let threw = false;
    try { await verifyDeviceProof(bad, QA_P256_PUBLIC_B64URL, QA_EXPECTED_DEVICE_KEY_ID, 'ACTIVATION'); } catch { threw = true; }
    assert.ok(threw);
    pass('Malformed DER signature rejected');
  } catch (e) { fail('Malformed DER rejection', e); }

  // Malformed public key
  try {
    let threw = false;
    try { await verifyDeviceProof(proof, 'not-a-real-key', QA_EXPECTED_DEVICE_KEY_ID, 'ACTIVATION'); } catch { threw = true; }
    assert.ok(threw);
    pass('Malformed public key rejected');
  } catch (e) { fail('Malformed public key rejection', e); }

  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} test(s) FAILED:\n${failures.map(f => '  • ' + f).join('\n')}`);
    process.exit(1);
  }
  console.log(`✅ All ${passed} cross-runtime crypto tests PASSED`);
  process.exit(0);
}

runAll().catch(e => { console.error('Fatal:', e); process.exit(1); });
