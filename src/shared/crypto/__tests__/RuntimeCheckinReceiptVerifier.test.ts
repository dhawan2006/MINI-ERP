import { describe, it, expect, beforeAll } from 'vitest';
import { RuntimeCheckinReceiptVerifier } from '../RuntimeCheckinReceiptVerifier';
import crypto from 'crypto';
import { canonicalize } from '../canonicalize';

describe('RuntimeCheckinReceiptVerifier', () => {
  let verifier: RuntimeCheckinReceiptVerifier;
  let privateKey: crypto.KeyObject;
  let publicKeyPem: string;
  const keyId = 'test-key-1';

  beforeAll(() => {
    const keyPair = crypto.generateKeyPairSync('ed25519');
    privateKey = keyPair.privateKey;
    publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    
    verifier = new RuntimeCheckinReceiptVerifier();
    verifier.registerTrustedKey(keyId, publicKeyPem);
  });

  const signPayload = (payload: any) => {
    const canonicalBytes = Buffer.from(canonicalize(payload), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-RUNTIME-CHECKIN-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalBytes]);
    const signatureDer = crypto.sign(null, dataToSign, privateKey);
    return signatureDer.toString('base64url');
  };

  const createValidPayload = () => ({
    protocolVersion: 'MINIPOS-RUNTIME-CHECKIN-V1',
    policyVersion: 1,
    licenseId: 'license-123',
    deviceKeyId: 'device-456',
    bindingId: 'binding-789',
    serverTime: new Date().toISOString(),
    checkInValidUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    directives: []
  });

  it('verifies a valid receipt correctly', () => {
    const payload = { ...createValidPayload(), signingKeyId: keyId };
    const signature = signPayload(payload);
    
    const envelope = {
      ...payload,
      signature
    };
    
    const verified = verifier.verify(envelope, 'license-123', 'device-456');
    expect(verified.licenseId).toBe('license-123');
    expect(verified.deviceKeyId).toBe('device-456');
  });

  it('rejects an invalid signature', () => {
    const payload = { ...createValidPayload(), signingKeyId: keyId };
    const envelope = {
      ...payload,
      signature: 'a'.repeat(86)
    };
    
    expect(() => verifier.verify(envelope, 'license-123', 'device-456')).toThrowError(/Signature verification failed|Malformed signature/);
  });

  it('rejects an incorrect signingKeyId', () => {
    const payload = { ...createValidPayload(), signingKeyId: 'unknown-key' };
    const signature = signPayload(payload);
    const envelope = { ...payload, signature };
    expect(() => verifier.verify(envelope, 'license-123', 'device-456')).toThrowError(/Untrusted or unknown Key ID/);
  });

  it('rejects if licenseId does not match expected', () => {
    const payload = { ...createValidPayload(), signingKeyId: keyId };
    const signature = signPayload(payload);
    const envelope = { ...payload, signature };
    // Provide a different expected license ID
    expect(() => verifier.verify(envelope, 'wrong-license', 'device-456')).toThrowError(/Receipt licenseId does not match/);
  });

  it('rejects if deviceKeyId does not match expected', () => {
    const payload = { ...createValidPayload(), signingKeyId: keyId };
    const signature = signPayload(payload);
    const envelope = { ...payload, signature };
    expect(() => verifier.verify(envelope, 'license-123', 'wrong-device')).toThrowError(/Receipt deviceKeyId does not match/);
  });
  
  it('rejects unsupported protocol version', () => {
    const payload: any = { ...createValidPayload(), signingKeyId: keyId };
    payload.protocolVersion = 2;
    const signature = signPayload(payload);
    const envelope = { ...payload, signature };
    expect(() => verifier.verify(envelope, 'license-123', 'device-456')).toThrowError(/Unsupported receipt protocol version/);
  });
});
