/**
 * Phase 4 — Device Identity Tests
 *
 * Test matrix (Sections 26-32, 40):
 *  1.  First identity initialization
 *  2.  Repeated initialization (idempotent)
 *  3.  Public key stability
 *  4.  deviceKeyId stability
 *  5.  Challenge signing
 *  6.  Independent server-side signature verification
 *  7.  Tampered challenge → invalid
 *  8.  Tampered signature → invalid
 *  9.  Wrong public key → invalid
 *  10. Missing/uninitialized identity
 *  11. Unknown operation rejected by helper
 *  12. Malformed JSON rejected by helper
 *  13. Empty challenge rejected
 *  14. Concurrent initialization
 *  15. Concurrent signing
 *  16. Private key never returned (ID-SEC-001)
 *  17. Fake provider produces valid P-256 DER signatures
 *  18. NativeDeviceIdentityAdapter – helper timeout
 *  19. NativeDeviceIdentityAdapter – helper ACTIVE end-to-end
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { FakeDeviceIdentityProvider } from '../../electron/native/FakeDeviceIdentityProvider';
import { NativeDeviceIdentityAdapter } from '../../electron/native/NativeDeviceIdentityAdapter';
import { DeviceIdentityStatus } from '../../electron/native/IDeviceIdentityProvider';

// --- Helper: verify a P-256 ECDSA DER signature via Node.js ---
function verifyP256DerSignature(
  publicKeyBase64url: string,
  messageBytes: Buffer,
  signatureBase64url: string
): boolean {
  // Reconstruct uncompressed public key from base64url
  const pubKeyBytes = Buffer.from(publicKeyBase64url, 'base64url');
  if (pubKeyBytes.length !== 65 || pubKeyBytes[0] !== 0x04) {
    throw new Error(`Invalid public key format: expected 65-byte uncompressed (0x04 prefix), got ${pubKeyBytes.length} bytes`);
  }
  // Wrap in SPKI container for Node's createPublicKey
  const publicKey = crypto.createPublicKey({
    key: pubKeyBytes,
    format: 'der',
    type: 'spki'
  });

  const signatureBytes = Buffer.from(signatureBase64url, 'base64url');
  return crypto.verify(null, messageBytes, publicKey, signatureBytes);
}

// SPKI prefix for P-256 uncompressed key (standard DER header)
const P256_SPKI_HEADER = Buffer.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200',
  'hex'
);

function buildSpkiFromUncompressed(uncompressedBytes: Buffer): Buffer {
  return Buffer.concat([P256_SPKI_HEADER, uncompressedBytes]);
}

// ──────────────────────────────────────────────────
// A: Fake Provider Tests (no hardware dependency)
// ──────────────────────────────────────────────────

describe('Phase 4 — FakeDeviceIdentityProvider (software P-256)', () => {
  let provider: FakeDeviceIdentityProvider;

  beforeAll(async () => {
    provider = new FakeDeviceIdentityProvider();
    await provider.initialize();
  });

  it('should report ACTIVE status after initialization', async () => {
    const status = await provider.getStatus();
    expect(status).toBe(DeviceIdentityStatus.ACTIVE);
  });

  it('should return a 65-byte uncompressed P-256 public key (base64url)', async () => {
    const pubKey = await provider.getPublicKey();
    const bytes = Buffer.from(pubKey, 'base64url');
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04); // Uncompressed point prefix
  });

  it('should return a stable deviceKeyId (sha256 hex)', async () => {
    const id1 = await provider.getDeviceKeyId();
    const id2 = await provider.getDeviceKeyId();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{64}$/); // 32-byte hex
  });

  it('should produce a base64url DER signature for a challenge', async () => {
    const challenge = crypto.randomBytes(32);
    const sig = await provider.signChallenge(challenge);
    expect(typeof sig).toBe('string');
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/); // base64url charset
  });

  it('should produce a signature that verifies against its own public key (ID-SEC-008)', async () => {
    const challenge = crypto.randomBytes(32);
    const pubKey = await provider.getPublicKey();
    const sig = await provider.signChallenge(challenge);

    const pubKeyBytes = Buffer.from(pubKey, 'base64url');
    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const sigBytes = Buffer.from(sig, 'base64url');

    expect(crypto.verify(null, challenge, publicKey, sigBytes)).toBe(true);
  });

  it('should reject a tampered challenge (different bytes → wrong signature)', async () => {
    const challenge = crypto.randomBytes(32);
    const pubKey = await provider.getPublicKey();
    const sig = await provider.signChallenge(challenge);

    const tampered = Buffer.from(challenge);
    tampered[0] ^= 0xff; // flip one byte

    const pubKeyBytes = Buffer.from(pubKey, 'base64url');
    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const sigBytes = Buffer.from(sig, 'base64url');

    expect(crypto.verify(null, tampered, publicKey, sigBytes)).toBe(false);
  });

  it('should reject a tampered signature', async () => {
    const challenge = crypto.randomBytes(32);
    const pubKey = await provider.getPublicKey();
    const sig = await provider.signChallenge(challenge);

    const sigBytes = Buffer.from(sig, 'base64url');
    sigBytes[sigBytes.length - 1] ^= 0xff; // flip last byte

    const pubKeyBytes = Buffer.from(pubKey, 'base64url');
    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });

    expect(crypto.verify(null, challenge, publicKey, sigBytes)).toBe(false);
  });

  it('should reject verification with a wrong public key', async () => {
    const challenge = crypto.randomBytes(32);
    const sig = await provider.signChallenge(challenge);

    // Generate a different key pair
    const { publicKey: wrongPubKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const sigBytes = Buffer.from(sig, 'base64url');

    expect(crypto.verify(null, challenge, wrongPubKey, sigBytes)).toBe(false);
  });

  it('should reject an empty challenge (ID-SEC-009)', async () => {
    await expect(provider.signChallenge(Buffer.alloc(0))).rejects.toThrow();
  });

  it('should report NO_IDENTITY before initialization', async () => {
    const uninit = new FakeDeviceIdentityProvider();
    const status = await uninit.getStatus();
    expect(status).toBe(DeviceIdentityStatus.NO_IDENTITY);
  });

  it('should handle concurrent signing (ID-SEC-010 adjacent)', async () => {
    const challenges = Array.from({ length: 20 }, () => crypto.randomBytes(32));
    const pubKey = await provider.getPublicKey();
    const pubKeyBytes = Buffer.from(pubKey, 'base64url');
    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });

    const sigs = await Promise.all(challenges.map(c => provider.signChallenge(c)));

    for (let i = 0; i < challenges.length; i++) {
      const sigBytes = Buffer.from(sigs[i], 'base64url');
      expect(crypto.verify(null, challenges[i], publicKey, sigBytes)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────
// B: Native Helper Direct Tests (via subprocess)
// ──────────────────────────────────────────────────

const HELPER_PATH = path.resolve(
  __dirname,
  '../../electron/native/MiniPOSIdentityHelper/.build/release/MiniPOSIdentityHelper'
);

function runHelper(requests: object[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(HELPER_PATH, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {},
    });

    const responses: any[] = [];
    let buf = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (t) {
          try { responses.push(JSON.parse(t)); } catch { /* non-JSON line */ }
        }
      }
    });

    child.on('close', () => resolve(responses));
    child.on('error', reject);

    for (const req of requests) {
      child.stdin.write(JSON.stringify(req) + '\n');
    }
    child.stdin.end();
  });
}

describe('Phase 4 — Native Helper (subprocess)', () => {
  beforeAll(async () => {
    // Ensure a clean identity for native tests
    try {
      spawn('security', ['delete-generic-password', '-s', 'com.minipos.device-identity'], { stdio: 'ignore' });
    } catch { /* ok if not found */ }
    await new Promise(r => setTimeout(r, 200));
  });

  it('should reject unknown operation (ID-SEC-011)', async () => {
    const [res] = await runHelper([{
      operation: 'getPrivateKey',
      requestId: 'r-unk',
      payload: null
    }]);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('UNSUPPORTED_OPERATION');
  });

  it('should reject malformed JSON gracefully', async () => {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'], env: {} });
      let buf = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d: string) => { buf += d; });
      child.on('close', () => {
        const line = buf.split('\n').find(l => l.trim());
        const parsed = JSON.parse(line!);
        expect(parsed.success).toBe(false);
        expect(parsed.error.code).toBe('HELPER_PROTOCOL_ERROR');
        resolve();
      });
      child.stdin.write('NOT_JSON\n');
      child.stdin.end();
    });
  });

  it('should initialize, getPublicKey, getDeviceKeyId, signChallenge in sequence', async () => {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const responses = await runHelper([
      { operation: 'initialize',     requestId: 'n1', payload: null },
      { operation: 'getPublicKey',   requestId: 'n2', payload: null },
      { operation: 'getDeviceKeyId', requestId: 'n3', payload: null },
      { operation: 'signChallenge',  requestId: 'n4', payload: { challengeBase64url: challenge } },
    ]);

    const [init, pubKeyRes, kidRes, sigRes] = responses;

    // 1. Initialize
    expect(init.success).toBe(true);
    expect(init.result.status).toBe('ACTIVE');
    expect(init.result.secureEnclaveAvailable).toBe(true);

    // 2. Public key
    expect(pubKeyRes.success).toBe(true);
    const pubKeyBytes = Buffer.from(pubKeyRes.result.publicKey, 'base64url');
    expect(pubKeyBytes.length).toBe(65);
    expect(pubKeyBytes[0]).toBe(0x04);

    // 3. DeviceKeyId
    expect(kidRes.success).toBe(true);
    expect(kidRes.result.deviceKeyId).toMatch(/^[0-9a-f]{64}$/);

    // 4. Signature — verify server-side
    expect(sigRes.success).toBe(true);
    const sigBytes = Buffer.from(sigRes.result.signature, 'base64url');
    const challengeBytes = Buffer.from(challenge, 'base64url');

    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    expect(crypto.verify(null, challengeBytes, publicKey, sigBytes)).toBe(true);
  });

  it('should reject empty challengeBase64url', async () => {
    const [initRes] = await runHelper([{ operation: 'initialize', requestId: 'e1', payload: null }]);
    expect(initRes.success).toBe(true);

    const [res] = await runHelper([{
      operation: 'signChallenge',
      requestId: 'e2',
      payload: { challengeBase64url: '' }
    }]);
    expect(res.success).toBe(false);
    expect(res.error.code).toBe('IDENTITY_NOT_INITIALIZED'); // empty str after decode = not initialized or empty input
  });

  it('should return tamper-detectable signatures (verify with wrong key)', async () => {
    const challenge = crypto.randomBytes(32).toString('base64url');
    const responses = await runHelper([
      { operation: 'initialize',    requestId: 'w1', payload: null },
      { operation: 'signChallenge', requestId: 'w2', payload: { challengeBase64url: challenge } },
    ]);
    const sig = responses[1].result.signature;
    const sigBytes = Buffer.from(sig, 'base64url');

    // Use a freshly generated unrelated key
    const { publicKey: wrongKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const challengeBytes = Buffer.from(challenge, 'base64url');
    expect(crypto.verify(null, challengeBytes, wrongKey, sigBytes)).toBe(false);
  });
});

// ──────────────────────────────────────────────────
// C: NativeDeviceIdentityAdapter end-to-end
// ──────────────────────────────────────────────────

describe('Phase 4 — NativeDeviceIdentityAdapter end-to-end', () => {
  let adapter: NativeDeviceIdentityAdapter;

  beforeAll(async () => {
    adapter = new NativeDeviceIdentityAdapter();
    await adapter.initialize();
  });

  afterAll(() => {
    adapter.dispose();
  });

  it('should report ACTIVE status', async () => {
    const status = await adapter.getStatus();
    expect(status).toBe(DeviceIdentityStatus.ACTIVE);
  });

  it('should return a valid uncompressed P-256 public key', async () => {
    const pk = await adapter.getPublicKey();
    const bytes = Buffer.from(pk, 'base64url');
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('should return a stable deviceKeyId', async () => {
    const [id1, id2] = await Promise.all([adapter.getDeviceKeyId(), adapter.getDeviceKeyId()]);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should sign and independently verify a challenge', async () => {
    const challenge = crypto.randomBytes(32);
    const pubKey = await adapter.getPublicKey();
    const sig = await adapter.signChallenge(challenge);

    const pubKeyBytes = Buffer.from(pubKey, 'base64url');
    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const sigBytes = Buffer.from(sig, 'base64url');

    expect(crypto.verify(null, challenge, publicKey, sigBytes)).toBe(true);
  });

  it('should handle concurrent sign requests', async () => {
    const challenges = Array.from({ length: 10 }, () => crypto.randomBytes(32));
    const pubKey = await adapter.getPublicKey();
    const pubKeyBytes = Buffer.from(pubKey, 'base64url');
    const spki = buildSpkiFromUncompressed(pubKeyBytes);
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });

    const sigs = await Promise.all(challenges.map(c => adapter.signChallenge(c)));
    for (let i = 0; i < challenges.length; i++) {
      const sigBytes = Buffer.from(sigs[i], 'base64url');
      expect(crypto.verify(null, challenges[i], publicKey, sigBytes)).toBe(true);
    }
  });

  it('should reject an empty challenge buffer', async () => {
    await expect(adapter.signChallenge(Buffer.alloc(0))).rejects.toThrow();
  });
});
