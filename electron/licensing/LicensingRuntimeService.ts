/**
 * Mini POS — Licensing Runtime Service (Phase 7)
 *
 * This is the SINGLE authoritative runtime licensing decision point inside
 * Electron Main. It is the only place in the application that may declare
 * a license ACTIVE.
 *
 * ARCHITECTURE:
 *   LicensingRuntimeService
 *       ↓
 *   LicensingService (Phase 6: load + verify + device-bind)
 *       ↓
 *   LocalAuthorizationStore  (Phase 6: atomic persistence)
 *       ↓
 *   AuthorizationVerifier    (Phase 3: Ed25519 crypto)
 *       ↓
 *   NativeDeviceIdentityAdapter (Phase 4: Secure Enclave)
 *
 * SECURITY INVARIANTS (SEC-RT-*):
 *   SEC-RT-001: Main process is the licensing authority.
 *   SEC-RT-002: Renderer cannot set or override licensing state.
 *   SEC-RT-003: IPC failure never defaults to ACTIVE.
 *   SEC-RT-004: Valid local authorization remains valid offline until expiry.
 *   SEC-RT-005: Network availability does not determine locally valid authorization.
 *   SEC-RT-006: Runtime expiry = currentTime >= validUntil (strict, no grace period).
 *   SEC-RT-007: No technical lease introduced.
 *   SEC-RT-008: No offline grace period introduced.
 *   SEC-RT-009: No heartbeat or periodic licensing network check introduced.
 *   SEC-RT-010: Authorization state is derived from cryptographically verified evidence.
 *   SEC-RT-011: Zustand is presentation state only.
 *   SEC-RT-012: Private keys remain inaccessible to Renderer.
 *   SEC-RT-013: Raw filesystem access remains inaccessible to Renderer.
 *   SEC-RT-014: Phase 5 and Phase 6 cryptographic guarantees remain intact.
 *   SEC-RT-015: Deleting authorization does not fabricate or preserve ACTIVE state.
 */

import { LicensingService } from '../../src/application/use-cases/LicensingService';
import { SignedAuthorization } from '../../server/licensing/src/crypto/ServerAuthorizationSigner';
import { LicensingStatusDTO, LicensingRuntimeState } from '../../src/shared/licensing-dto';
import { logger } from '../../src/infrastructure/logging/logger';
import { BrowserWindow } from 'electron';
import os from 'os';
import { LicensingClient } from './LicensingClient';
import { IDeviceIdentityProvider } from '../native/IDeviceIdentityProvider';
import { canonicalize } from '../../server/licensing/src/crypto/canonicalize';

/** Map internal LicensingService codes → authoritative LicensingRuntimeState. */
function mapErrorToRuntimeState(errorCode: string | undefined): LicensingRuntimeState {
  switch (errorCode) {
    case 'NOT_ACTIVATED':
      return 'NOT_ACTIVATED';
    case 'SECURE_IDENTITY_UNAVAILABLE':
    case 'DEVICE_IDENTITY_UNAVAILABLE':
      return 'DEVICE_IDENTITY_UNAVAILABLE';
    case 'CORRUPT_OR_MALFORMED_AUTHORIZATION':
    case 'AUTHORIZATION_PROTOCOL_INVALID':
      return 'INVALID_AUTHORIZATION';
    case 'AUTHORIZATION_SIGNATURE_INVALID':
      return 'INVALID_AUTHORIZATION';
    case 'AUTHORIZATION_DEVICE_MISMATCH':
      return 'DEVICE_MISMATCH';
    case 'AUTHORIZATION_EXPIRED':
      return 'EXPIRED';
    case 'AUTHORIZATION_ROLLBACK':
      return 'INVALID_AUTHORIZATION';
    case 'INTERNAL_LICENSING_ERROR':
      return 'STORAGE_ERROR';
    default:
      return 'STORAGE_ERROR';
  }
}

export class LicensingRuntimeService {
  private currentDTO: LicensingStatusDTO = { state: 'NOT_ACTIVATED' };
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly licensingService: LicensingService,
    private readonly identityProvider: IDeviceIdentityProvider,
    private readonly licensingClient: LicensingClient
  ) {}

  /**
   * Must be called once during Main startup, before the BrowserWindow is shown.
   * Derives runtime state from persisted authorization (offline-safe).
   * Never returns a fail-open result.
   */
  async initialize(): Promise<void> {
    logger.info('LicensingRuntime: Initializing...');
    await this.recomputeState();
    logger.info(`LicensingRuntime: State after initialization: ${this.currentDTO.state}`);
  }

  /**
   * Returns current evaluated state without re-reading the file.
   * However, it recalculates time expiration immediately.
   * Returns a fresh copy — mutations to the returned DTO do not affect service state.
   */
  getStatusDTO(): LicensingStatusDTO {
    // Always re-evaluate time boundary in case the clock moved forward
    // while the app was open. No I/O — uses in-memory state from LicensingService.
    const freshState = this.licensingService.getState();

    if (freshState.isActivated) {
      const dto: LicensingStatusDTO = {
        state: 'ACTIVE',
        licenseId: freshState.licenseId,
        validFrom: freshState.validFrom,
        validUntil: freshState.validUntil,
        // Preserve deviceKeyIdPrefix from the last full recompute
        deviceKeyIdPrefix: this.currentDTO.state === 'ACTIVE'
          ? this.currentDTO.deviceKeyIdPrefix
          : undefined,
      };
      this.currentDTO = { ...dto }; // store as internal reference copy
      return { ...dto }; // return a fresh copy to caller
    }

    // isActivated === false: check if it is now expired vs. original state
    if (
      freshState.error === 'AUTHORIZATION_EXPIRED' &&
      this.currentDTO.state === 'ACTIVE'
    ) {
      // Authorization was ACTIVE but has now crossed validUntil boundary.
      const expiredDTO: LicensingStatusDTO = {
        state: 'EXPIRED',
        validUntil: this.currentDTO.validUntil,
      };
      this.currentDTO = { ...expiredDTO };
      logger.info('LicensingRuntime: Authorization crossed validUntil boundary. State → EXPIRED.');
      this.broadcastStateChange();
      return { ...expiredDTO };
    }

    return { ...this.currentDTO }; // fresh copy
  }


  /**
   * Performs a full async re-computation from disk.
   * Called on startup, resume-from-sleep, and explicit refresh.
   * Never returns a fail-open result.
   */
  async recomputeState(): Promise<LicensingStatusDTO> {
    try {
      const state = await this.licensingService.initialize();

      if (state.isActivated) {
        this.currentDTO = {
          state: 'ACTIVE',
          licenseId: state.licenseId,
          validFrom: state.validFrom,
          validUntil: state.validUntil,
          // Truncate deviceKeyId prefix for display — the full ID stays in Main
          deviceKeyIdPrefix: undefined, // We don't expose deviceKeyId at all in this DTO
        };
        this.scheduleExpiryCheck(new Date(state.validUntil!));
      } else {
        this.clearExpiryTimer();
        this.currentDTO = {
          state: mapErrorToRuntimeState(state.error),
        };
        // Preserve validUntil for EXPIRED state so UI can display when it expired
        if (state.error === 'AUTHORIZATION_EXPIRED' && state.validUntil) {
          this.currentDTO.validUntil = state.validUntil;
        }
      }
    } catch (err: any) {
      logger.error('LicensingRuntime: Unexpected error during recompute: ' + err?.message);
      this.clearExpiryTimer();
      // Fail closed — never default to ACTIVE
      this.currentDTO = { state: 'STORAGE_ERROR' };
    }

    return this.currentDTO;
  }

  /**
   * Phase 9: Initiates the activation workflow from the renderer.
   * Completes the crypto challenge, HTTP request, and persistence.
   */
  async activate(licenseKey: string): Promise<LicensingStatusDTO> {
    logger.info('LicensingRuntime: Starting activation workflow...');
    try {
      // 1. Verify device identity
      const status = await this.identityProvider.getStatus();
      if (status !== 'ACTIVE') throw new Error('DEVICE_IDENTITY_UNAVAILABLE');

      const deviceKeyId = await this.identityProvider.getDeviceKeyId();
      const publicKey = await this.identityProvider.getPublicKey();

      // 2. Fetch challenge
      logger.info('LicensingRuntime: Fetching challenge...');
      const challenge = await this.licensingClient.getChallenge(deviceKeyId);

      // 3. Sign challenge
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparatedChallenge = Buffer.concat([
        Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8'),
        canonicalChallengeBytes
      ]);
      const signatureBase64url = await this.identityProvider.signChallenge(domainSeparatedChallenge);
      const proof = { challenge, signature: signatureBase64url };

      // 4. Submit activation
      logger.info('LicensingRuntime: Submitting activation request...');
      const signedAuth = await this.licensingClient.activate(
        licenseKey,
        deviceKeyId,
        publicKey,
        proof,
        os.hostname()
      );

      // 5. Success -> pass to persistence and state refresh
      return await this.handleActivationSuccess(signedAuth);
    } catch (err: any) {
      logger.error('LicensingRuntime: Activation failed - ' + err.message);
      // We do not change current state if activation fails.
      // We just throw back to the IPC handler.
      throw err;
    }
  }

  /**
   * Called after a successful activation (Phase 5 flow).
   * Persists the signed authorization through LicensingService (Phase 6),
   * then re-derives runtime state. Never short-circuits verification.
   */
  async handleActivationSuccess(signedAuth: SignedAuthorization): Promise<LicensingStatusDTO> {
    logger.info('LicensingRuntime: Processing activation result...');
    // LicensingService.saveNewAuthorization() runs full verification + anti-rollback + atomic persist
    await this.licensingService.saveNewAuthorization(signedAuth);
    // Re-derive from disk to ensure state is consistent
    const dto = await this.recomputeState();
    this.broadcastStateChange();
    logger.info(`LicensingRuntime: Post-activation state: ${dto.state}`);
    return dto;
  }

  /**
   * Should be called on system resume-from-sleep or any explicit refresh.
   * Re-reads disk and re-validates. Offline-safe.
   */
  async refreshAfterResume(): Promise<void> {
    logger.info('LicensingRuntime: Refreshing state after resume...');
    const previousState = this.currentDTO.state;
    await this.recomputeState();
    if (this.currentDTO.state !== previousState) {
      logger.info(
        `LicensingRuntime: State changed after resume: ${previousState} → ${this.currentDTO.state}`
      );
      this.broadcastStateChange();
    }
  }

  /**
   * Schedules a local-only timer to re-check authorization when validUntil is reached.
   * This is NOT license renewal — it only transitions ACTIVE → EXPIRED at the exact boundary.
   * No network call is made.
   */
  private scheduleExpiryCheck(validUntil: Date): void {
    this.clearExpiryTimer();
    const msUntilExpiry = validUntil.getTime() - Date.now();
    if (msUntilExpiry <= 0) {
      // Already expired — state will be caught by getStatusDTO()
      return;
    }
    // Cap to 24h to handle very long validity windows and avoid timer integer overflow.
    // getStatusDTO() re-checks on every call, so we'll catch intermediate states.
    const timerMs = Math.min(msUntilExpiry + 1000, 24 * 60 * 60 * 1000);
    this.expiryTimer = setTimeout(async () => {
      logger.info('LicensingRuntime: Expiry timer fired. Re-evaluating state...');
      // Re-check via getStatusDTO() — no I/O, just time boundary re-evaluation.
      const dto = this.getStatusDTO();
      if (dto.state === 'EXPIRED') {
        logger.info('LicensingRuntime: Authorization expired. Broadcasting state change.');
        this.broadcastStateChange();
      } else if (dto.state === 'ACTIVE') {
        // validUntil hasn't arrived yet (timer fired slightly early) — reschedule
        this.scheduleExpiryCheck(validUntil);
      }
    }, timerMs);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  /**
   * Pushes the current safe DTO to all renderer windows.
   * Renderer cannot request this; Main drives it.
   * No-op in test/non-Electron environments where BrowserWindow is unavailable.
   */
  private broadcastStateChange(): void {
    const dto = this.currentDTO;
    // Guard: BrowserWindow.getAllWindows may not exist in test environments
    try {
      const windows = BrowserWindow.getAllWindows?.();
      if (!windows) return;
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('license:stateChanged', dto);
        }
      }
    } catch {
      // Silently ignore — this is expected in test environments.
    }
  }

  /** Cleanup on app quit. */
  dispose(): void {
    this.clearExpiryTimer();
  }
}
