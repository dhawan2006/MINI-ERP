/**
 * Mini POS — Billing Authorization Port (Phase 8)
 *
 * A narrow application-level port that allows BillingService to ask one question:
 *
 *     "Am I currently authorized to finalize a new bill?"
 *
 * BillingService must NOT know:
 *   - how Ed25519 or P-256 works
 *   - where the authorization file lives
 *   - how device identity is stored
 *   - how the licensing server communicates
 *
 * The implementation (backed by LicensingRuntimeService in production) lives in
 * the Electron Main layer and is injected via the constructor.
 *
 * SEC-BILL-001: Only Main-process authorization can permit finalization.
 * SEC-BILL-019: Billing does not duplicate cryptographic verification logic.
 */

/**
 * Thrown synchronously by IBillingAuthorization.assertBillingPermitted()
 * when the current licensing state does not allow bill finalization.
 *
 * Extends Error directly (same pattern as DomainError) to avoid a circular
 * import between src/domain/errors/index.ts and this file.
 *
 * The error code is a semantic category (not a cryptographic detail).
 * The message is safe to display to the cashier.
 */
export class BillingNotAuthorizedError extends Error {
  constructor(
    public readonly licensingState: string,
    message: string
  ) {
    super(message);
    this.name = 'BillingNotAuthorizedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Narrow port that BillingService uses to check authorization before finalization.
 *
 * Implementations:
 *   - Production: LicensingBillingGate (backed by LicensingRuntimeService)
 *   - Tests: InMemoryBillingGate (configured per test)
 */
export interface IBillingAuthorization {
  /**
   * Checks whether bill finalization is currently authorized.
   *
   * Throws BillingNotAuthorizedError synchronously if not authorized.
   * The check must be evaluated immediately before finalization —
   * never cached across requests.
   *
   * SEC-BILL-001: Decision is Main-process-owned.
   * SEC-BILL-004: Expired authorization throws.
   * SEC-BILL-007: Unavailable identity/storage throws.
   * SEC-BILL-020: Unknown states throw.
   */
  assertBillingPermitted(): void;
}
