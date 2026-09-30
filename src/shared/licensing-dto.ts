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
  | 'STORAGE_ERROR';         // Licensing persistence layer is inaccessible or fatally corrupt.

/**
 * Safe, renderer-facing representation of the licensing runtime state.
 *
 * Fields present only when state === 'ACTIVE'.
 * licenseId and validUntil are display-safe (no cryptographic secrets).
 */
export interface LicensingStatusDTO {
  /** The authoritative runtime state. */
  state: LicensingRuntimeState;
  /** Present when ACTIVE. Derived from the signed payload. Display-only. */
  licenseId?: string;
  /** ISO-8601 UTC. Present when ACTIVE. */
  validFrom?: string;
  /** ISO-8601 UTC. Present when ACTIVE or EXPIRED (to show when it expired). */
  validUntil?: string;
  /**
   * Display-safe abbreviated device key identifier.
   * Only the first 16 hex chars of the full deviceKeyId are exposed.
   * Present when ACTIVE.
   */
  deviceKeyIdPrefix?: string;
}
