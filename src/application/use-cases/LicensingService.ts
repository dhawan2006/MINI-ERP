import { ILocalAuthorizationStore, LocalAuthorizationError } from '../interfaces/ILocalAuthorizationStore';
import { AuthorizationVerifier } from '../../../server/licensing/src/crypto/AuthorizationVerifier';
import { IDeviceIdentityProvider } from '../../../electron/native/IDeviceIdentityProvider';
import { SignedAuthorization, AuthorizationPayload } from '../../../server/licensing/src/crypto/ServerAuthorizationSigner';
import { logger } from '../../infrastructure/logging/logger';

export interface LicensingState {
  isActivated: boolean;
  licenseId?: string;
  productId?: string;
  validFrom?: string;
  validUntil?: string;
  error?: string;
}

export class LicensingService {
  private currentAuthorization: AuthorizationPayload | null = null;
  private memoryValidUntil: Date | null = null;

  constructor(
    private store: ILocalAuthorizationStore,
    private verifier: AuthorizationVerifier,
    private identityProvider: IDeviceIdentityProvider
  ) {}

  /**
   * Initializes the licensing service on startup.
   * Loads, cryptographically verifies, and checks device constraints.
   */
  async initialize(): Promise<LicensingState> {
    try {
      // 1. Ensure device identity is available
      const status = await this.identityProvider.getStatus();
      logger.info(`Licensing: Identity Provider Status = ${status}`);
      if (status !== 'ACTIVE') {
        logger.error('Licensing: Secure device identity is not active or unavailable');
        return this.failClosed('SECURE_IDENTITY_UNAVAILABLE');
      }
      const expectedDeviceKeyId = await this.identityProvider.getDeviceKeyId();

      // 2. Load the untrusted raw file
      let rawAuth: SignedAuthorization;
      try {
        rawAuth = await this.store.load();
      } catch (err: any) {
        if (err instanceof LocalAuthorizationError && err.code === 'AUTHORIZATION_NOT_FOUND') {
          return this.failClosed('NOT_ACTIVATED');
        }
        logger.error(`Licensing: Local storage error - ${err.message}`);
        return this.failClosed('CORRUPT_OR_MALFORMED_AUTHORIZATION');
      }

      // 3. Cryptographically verify the authorization envelope and signature
      let payload: AuthorizationPayload;
      try {
        payload = this.verifier.verify(rawAuth);
      } catch (err: any) {
        logger.error('Licensing: Cryptographic verification failed - ' + err.message);
        return this.failClosed('AUTHORIZATION_SIGNATURE_INVALID');
      }

      // 4. Verify device binding (ID-SEC-013)
      if (payload.deviceKeyId !== expectedDeviceKeyId) {
        logger.error('Licensing: Device binding mismatch. Authorization was issued for a different device.');
        return this.failClosed('AUTHORIZATION_DEVICE_MISMATCH');
      }

      // 5. Verify time window
      const now = new Date();
      const validFrom = new Date(payload.validFrom);
      const validUntil = new Date(payload.validUntil);

      if (now < validFrom || now >= validUntil) {
        logger.error(`Licensing: Time validity check failed. Now: ${now.toISOString()}, Valid: ${payload.validFrom} to ${payload.validUntil}`);
        return this.failClosed('AUTHORIZATION_EXPIRED');
      }

      // Authorization accepted!
      this.currentAuthorization = payload;
      this.memoryValidUntil = validUntil;
      
      logger.info('Licensing: Authorization successfully loaded and verified.');
      return this.getState();

    } catch (err: any) {
      logger.error('Licensing: Unexpected failure during initialization - ' + err.message);
      return this.failClosed('INTERNAL_LICENSING_ERROR');
    }
  }

  /**
   * Evaluates and persists a new authorization (e.g. immediately after activation).
   */
  async saveNewAuthorization(rawAuth: SignedAuthorization): Promise<void> {
    // 1. Verify before saving to prevent persisting garbage
    let newPayload: AuthorizationPayload;
    try {
      newPayload = this.verifier.verify(rawAuth);
    } catch (err: any) {
      logger.error('Licensing: Verification failed - ' + err.message);
      throw new LocalAuthorizationError('AUTHORIZATION_SIGNATURE_INVALID', 'Provided authorization failed verification');
    }

    // 2. Anti-Rollback Check (SEC-LOCAL-014)
    // If we already have a valid authorization in memory, we enforce the new authorization is newer.
    if (this.currentAuthorization) {
      const currentIssuedAt = new Date(this.currentAuthorization.issuedAt).getTime();
      const newIssuedAt = new Date(newPayload.issuedAt).getTime();
      
      if (newIssuedAt < currentIssuedAt) {
        logger.error('Licensing: Anti-rollback protection triggered. Rejecting older authorization.');
        throw new LocalAuthorizationError('AUTHORIZATION_ROLLBACK', 'Cannot replace current authorization with an older one.');
      }
    } else {
      // Check against disk in case we are overriding an invalid or uninitialized in-memory state
      try {
        const existingAuth = await this.store.load();
        const verifiedExisting = this.verifier.verify(existingAuth);
        if (new Date(newPayload.issuedAt).getTime() < new Date(verifiedExisting.issuedAt).getTime()) {
          logger.error('Licensing: Anti-rollback protection triggered on disk. Rejecting older authorization.');
          throw new LocalAuthorizationError('AUTHORIZATION_ROLLBACK', 'Cannot replace stored authorization with an older one.');
        }
      } catch (err: any) {
        // If the file is missing or corrupt, it's safe to overwrite
      }
    }

    // 3. Atomically persist to disk
    await this.store.save(rawAuth);

    // 4. Reload into memory to ensure all constraints (device binding, time) still hold.
    await this.initialize();
  }

  /**
   * Returns current evaluated state without re-reading the file.
   * However, it recalculates time expiration immediately.
   */
  getState(): LicensingState {
    if (!this.currentAuthorization || !this.memoryValidUntil) {
      return { isActivated: false, error: 'NOT_ACTIVATED' };
    }

    if (new Date() >= this.memoryValidUntil) {
      this.currentAuthorization = null;
      this.memoryValidUntil = null;
      return { isActivated: false, error: 'AUTHORIZATION_EXPIRED' };
    }

    return {
      isActivated: true,
      licenseId: this.currentAuthorization.licenseId,
      productId: this.currentAuthorization.productId,
      validFrom: this.currentAuthorization.validFrom,
      validUntil: this.currentAuthorization.validUntil
    };
  }

  private failClosed(errorCode: string): LicensingState {
    this.currentAuthorization = null;
    this.memoryValidUntil = null;
    return {
      isActivated: false,
      error: errorCode
    };
  }
}
