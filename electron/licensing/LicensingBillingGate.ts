/**
 * Mini POS — Licensing Billing Gate (Phase 8)
 *
 * Production implementation of IBillingAuthorization.
 * Backed by LicensingRuntimeService (Phase 7) — the single authoritative
 * licensing decision point.
 *
 * DEPENDENCY DIRECTION:
 *   BillingService
 *       ↓  IBillingAuthorization (application port)
 *   LicensingBillingGate  (infrastructure adapter)
 *       ↓
 *   LicensingRuntimeService  (Phase 7 Main-process authority)
 *
 * WHAT THIS DOES NOT DO:
 *   - Does NOT read the authorization file
 *   - Does NOT perform cryptographic verification
 *   - Does NOT access the Secure Enclave or native helper
 *   - Does NOT call the licensing server
 *   - Does NOT cache a boolean across requests (fresh check every call)
 *
 * SEC-BILL-001: Only Main-process authorization can permit finalization.
 * SEC-BILL-019: Billing does not duplicate cryptographic verification logic.
 * SEC-BILL-020: Unknown states fail closed.
 */

import { IBillingAuthorization, BillingNotAuthorizedError } from '../../src/application/interfaces/IBillingAuthorization';
import { LicensingRuntimeService } from './LicensingRuntimeService';
import { LicensingRuntimeState } from '../../src/shared/licensing-dto';
import { logger } from '../../src/infrastructure/logging/logger';

/**
 * Maps each Phase 7 runtime state to a cashier-facing message.
 * Never exposes cryptographic details.
 */
function denialMessage(state: LicensingRuntimeState): string {
  switch (state) {
    case 'NOT_ACTIVATED':
      return 'This POS is not activated. Please activate your Mini POS license before finalizing a new bill.';
    case 'EXPIRED':
      return 'Your Mini POS authorization has expired. Please connect to the internet and reactivate or renew your license.';
    case 'INVALID_AUTHORIZATION':
      return 'The local authorization could not be verified. Please contact support or reactivate your Mini POS license.';
    case 'DEVICE_MISMATCH':
      return 'This authorization was issued for a different device. Please activate Mini POS on this device.';
    case 'CLOCK_ANOMALY':
      return 'A system clock anomaly was detected. Please correct your system time and restart the application.';
    case 'DEVICE_IDENTITY_UNAVAILABLE':
      return 'Device identity is unavailable. Please restart the application or contact support.';
    case 'STORAGE_ERROR':
      return 'Licensing storage is unavailable. Please restart the application or contact support.';
    default:
      // Unknown future state — fail closed (SEC-BILL-020)
      return 'Mini POS authorization could not be confirmed. Finalization is not permitted.';
  }
}

export class LicensingBillingGate implements IBillingAuthorization {
  constructor(private readonly licensingRuntime: LicensingRuntimeService) {}

  /**
   * Synchronously checks the current runtime licensing state.
   * Throws BillingNotAuthorizedError if the state is not ACTIVE.
   *
   * This is called immediately before finalization — not cached.
   * SEC-BILL-001, SEC-BILL-004, SEC-BILL-007, SEC-BILL-020.
   */
  assertBillingPermitted(): void {
    // getStatusDTO() re-evaluates the time boundary on every call — no stale cache.
    const dto = this.licensingRuntime.getStatusDTO();

    if (dto.state === 'ACTIVE') {
      // Authorization confirmed. Logging at debug level to avoid log spam on every sale.
      return;
    }

    // All non-ACTIVE states → denial (fail closed)
    logger.warn(`LicensingBillingGate: Billing finalization denied. State: ${dto.state}`);
    throw new BillingNotAuthorizedError(dto.state, denialMessage(dto.state));
  }
}
