/**
 * Mini POS — Fake Device Identity Provider
 *
 * FOR TESTS ONLY. This must NEVER be selected in production builds.
 * Uses ephemeral in-process P-256 software keys for unit testing without
 * requiring Secure Enclave hardware or Keychain access.
 *
 * ID-SEC-005: Production does not silently fall back to this provider.
 */

import { createHash, generateKeyPairSync, sign } from 'crypto';
import { IDeviceIdentityProvider, DeviceIdentityStatus } from './IDeviceIdentityProvider';

export class FakeDeviceIdentityProvider implements IDeviceIdentityProvider {
  private privateKey?: any;
  private publicKeyDer?: Buffer;
  private initialized = false;

  async initialize(): Promise<void> {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    this.privateKey = privateKey;
    // Export uncompressed X9.63 public key (65 bytes)
    this.publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    this.initialized = true;
  }

  async getStatus(): Promise<DeviceIdentityStatus> {
    return this.initialized ? DeviceIdentityStatus.ACTIVE : DeviceIdentityStatus.NO_IDENTITY;
  }

  async getPublicKey(): Promise<string> {
    if (!this.initialized || !this.publicKeyDer) throw new Error('IDENTITY_NOT_INITIALIZED');
    // Extract the 65-byte uncompressed public key from the SPKI container
    // SPKI for P-256 is 91 bytes: 26-byte header + 65-byte key
    const uncompressed = this.publicKeyDer.slice(-65);
    return uncompressed.toString('base64url');
  }

  async getDeviceKeyId(): Promise<string> {
    if (process.env.MINIPOS_E2E_TEST_DEVICE_KEY) {
      return process.env.MINIPOS_E2E_TEST_DEVICE_KEY;
    }
    if (!this.initialized || !this.publicKeyDer) throw new Error('IDENTITY_NOT_INITIALIZED');
    // Derive from compressed key: for testing we use the last 65 bytes and simulate compression
    const uncompressed = this.publicKeyDer.slice(-65);
    // Use the uncompressed key as the hash input (simplified; production uses compressed form)
    return createHash('sha256').update(uncompressed).digest('hex');
  }

  async signChallenge(challengeBytes: Buffer): Promise<string> {
    if (!this.initialized || !this.privateKey) throw new Error('IDENTITY_NOT_INITIALIZED');
    if (challengeBytes.length === 0) throw new Error('INVALID_CHALLENGE_INPUT');
    // Using SHA256 as the digest algorithm for ECDSA
    const derSig = sign('SHA256', challengeBytes, this.privateKey);
    return derSig.toString('base64url');
  }
}
