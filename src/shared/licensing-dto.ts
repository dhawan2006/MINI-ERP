/**
 * Mini POS — Licensing Shared DTOs & Constants
 *
 * These types cross the IPC boundary: Main → Renderer.
 *
 * SECURITY: This file must NEVER include:
 *   - private keys
 *   - authorization signatures
 *   - internal filesystem paths
 *   - cryptographic internals
 *   - server credentials
 *
 * The renderer is presentation-only and must never use these values
 * to make security decisions.
 */

/**
 * Authoritative runtime state of the local licensing subsystem.
 * Computed by Electron Main; never mutable by the Renderer.
 */
export type LicensingRuntimeState =
  | 'NOT_ACTIVATED'          // No local authorization file exists.
  | 'ACTIVE'                 // Valid signed authorization; device-bound; within validFrom..validUntil.
  | 'EXPIRED'                // Authorization existed but currentTime >= validUntil.
  | 'INVALID_AUTHORIZATION'  // Authorization file exists but fails signature or structural validation.
  | 'DEVICE_MISMATCH'        // Authorization belongs to a different cryptographic device identity.
  | 'CLOCK_ANOMALY'          // System clock indicates an impossible time relationship.
  | 'DEVICE_IDENTITY_UNAVAILABLE' // Native Secure Enclave / identity helper is not accessible.
  | 'STORAGE_ERROR'          // Licensing persistence layer is inaccessible or fatally corrupt.
  | 'REVOKED'                // Check-in indicates the license is permanently revoked.
  | 'DISABLED'               // Check-in indicates the license is temporarily disabled.
  | 'CHECKIN_OVERDUE';       // Check-in deadline exceeded; billing blocked.

export type RuntimeCheckInWarningState =
  | 'CURRENT'
  | 'DUE_SOON' // < 48h
  | 'REQUIRED' // < 6h
  | 'OVERDUE'; // deadline reached

/**
 * Safe, renderer-facing representation of the licensing runtime state.
 *
 * Fields present only when state === 'ACTIVE' or 'CHECKIN_OVERDUE'.
 * licenseId and validUntil are display-safe (no cryptographic secrets).
 */
export interface LicensingStatusDTO {
  /** The authoritative runtime state. */
  state: LicensingRuntimeState;
  /** Present when ACTIVE or CHECKIN_OVERDUE. Derived from the signed payload. Display-only. */
  licenseId?: string;
  /** ISO-8601 UTC. Present when ACTIVE or CHECKIN_OVERDUE. */
  validFrom?: string;
  /** ISO-8601 UTC. Present when ACTIVE, EXPIRED, or CHECKIN_OVERDUE. */
  validUntil?: string;
  /**
   * Display-safe abbreviated device key identifier.
   * Only the first 16 hex chars of the full deviceKeyId are exposed.
   * Present when ACTIVE or CHECKIN_OVERDUE.
   */
  deviceKeyIdPrefix?: string;

  /** V1 Check-In specific properties (only present if policyVersion > 0) */
  policyVersion?: number;
  /** ISO-8601 UTC when the check-in receipt expires */
  checkInValidUntil?: string;
  /** Current check-in warning state */
  checkInState?: RuntimeCheckInWarningState;
  /** Number of pending unacknowledged directives */
  pendingDirectivesCount?: number;
}
