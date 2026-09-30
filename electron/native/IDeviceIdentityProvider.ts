/**
 * Mini POS — Device Identity Interface
 *
 * This interface defines the ONLY surface through which Electron Main
 * may interact with the native device identity system.
 *
 * ID-SEC-001: No method returns private key material.
 * ID-SEC-002: No method sends private key material over IPC.
 */
export interface IDeviceIdentityProvider {
  /** Initialise or recover the device identity. Must be called before any other method. */
  initialize(): Promise<void>;

  /** Returns the current identity status. */
  getStatus(): Promise<DeviceIdentityStatus>;

  /**
   * Returns the 65-byte X9.63 uncompressed P-256 public key encoded as base64url.
   * This is the representation transmitted to the licensing server.
   */
  getPublicKey(): Promise<string>;

  /**
   * Returns the stable deviceKeyId: hex-encoded SHA-256 of the compressed public key.
   * Deterministic — same key always produces the same ID.
   */
  getDeviceKeyId(): Promise<string>;

  /**
   * Signs exactly the provided raw bytes using the Secure Enclave P-256 private key.
   * Returns a DER-encoded ECDSA-SHA256 signature encoded as base64url.
   *
   * The calling layer is responsible for all protocol-level canonicalization
   * (e.g., domain separation prefix). This method signs whatever bytes it receives.
   */
  signChallenge(challengeBytes: Buffer): Promise<string>;
}

export enum DeviceIdentityStatus {
  NO_IDENTITY = 'NO_IDENTITY',
  ACTIVE = 'ACTIVE',
  KEY_MISSING = 'KEY_MISSING',
  KEY_CORRUPTED = 'KEY_CORRUPTED',
  SECURE_ENCLAVE_UNAVAILABLE = 'SECURE_ENCLAVE_UNAVAILABLE',
  HELPER_UNAVAILABLE = 'HELPER_UNAVAILABLE',
}

export interface DeviceIdentityError {
  code: string;
  message: string;
}
