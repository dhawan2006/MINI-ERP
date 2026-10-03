/**
 * DeviceChallenge — shared data transfer type for challenge protocol.
 * Runtime-agnostic: no Node or Deno imports.
 */
export interface DeviceChallenge {
  protocolVersion: 1;
  challengeId: string;  // UUID
  issuedAt: string;     // ISO8601
  expiresAt: string;    // ISO8601
  nonce: string;        // base64url 32 bytes
  deviceKeyId: string;
  purpose: string;      // 'ACTIVATION' | 'DEACTIVATION'
}
