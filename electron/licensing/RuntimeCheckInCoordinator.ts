import crypto from 'crypto';
import { LicensingClient } from './LicensingClient';
import { IDeviceIdentityProvider } from '../native/IDeviceIdentityProvider';
import { ILocalRuntimeStateStore, LocalRuntimeStateError } from '../../src/infrastructure/licensing/LocalRuntimeStateStore';
import { RuntimeCheckinReceiptVerifier } from '../../src/shared/crypto/RuntimeCheckinReceiptVerifier';
import { logger } from '../../src/infrastructure/logging/logger';
import { canonicalize } from '../../src/shared/crypto/canonicalize';

export type CheckInResult = 'SUCCESS' | 'NETWORK_FAILURE' | 'HTTP_ERROR' | 'CRYPTO_ERROR' | 'NO_OP';

export class RuntimeCheckInCoordinator {
  private activeCheckInPromise: Promise<CheckInResult> | null = null;
  private attemptCount = 0;
  
  constructor(
    private licensingClient: LicensingClient,
    private identityProvider: IDeviceIdentityProvider,
    private store: ILocalRuntimeStateStore,
    private verifier: RuntimeCheckinReceiptVerifier
  ) {}

  /**
   * Safe entry point for triggering check-in.
   * Ensures single-flight execution per process.
   */
  async triggerCheckIn(licenseId: string, deviceKeyId: string): Promise<CheckInResult> {
    if (this.activeCheckInPromise) {
      logger.info('RuntimeCheckInCoordinator: Check-in already in progress. Joining existing execution.');
      return this.activeCheckInPromise;
    }
    
    this.attemptCount = 0;
    this.activeCheckInPromise = this.executeWithRetry(licenseId, deviceKeyId);
    
    try {
      return await this.activeCheckInPromise;
    } finally {
      this.activeCheckInPromise = null;
    }
  }

  private async executeWithRetry(licenseId: string, deviceKeyId: string): Promise<CheckInResult> {
    const maxAttempts = 3;
    const baseDelayMs = process.env.NODE_ENV === 'test' ? 10 : 2000;

    while (this.attemptCount < maxAttempts) {
      this.attemptCount++;
      try {
        await this.performActualCheckIn(licenseId, deviceKeyId);
        logger.info(`RuntimeCheckInCoordinator: Successfully checked in on attempt ${this.attemptCount}.`);
        return 'SUCCESS';
      } catch (err: any) {
        const errorMsg = (err && typeof err.message === 'string') ? err.message : 'Unknown error';
        
        // 1. Classification
        const isNetwork = errorMsg.includes('NETWORK_ERROR') || errorMsg.includes('fetch');
        const isRateLimit = errorMsg.includes('HTTP_429');
        const isServerError = errorMsg.includes('HTTP_500') || errorMsg.includes('HTTP_502') || errorMsg.includes('HTTP_503') || errorMsg.includes('HTTP_504');
        const isCrypto = err.name === 'CryptoError' || errorMsg.includes('INVALID_CRYPTO');
        const isStore = err instanceof LocalRuntimeStateError;
        
        if (isCrypto || isStore || (!isNetwork && !isRateLimit && !isServerError)) {
          // Hard failure (Crypto tampering, client rejected, DB error, 4xx non-retriable)
          logger.error(`RuntimeCheckInCoordinator: Non-retriable failure: ${errorMsg}`);
          return isCrypto ? 'CRYPTO_ERROR' : 'HTTP_ERROR';
        }

        logger.warn(`RuntimeCheckInCoordinator: Temporary failure (Attempt ${this.attemptCount}/${maxAttempts}): ${errorMsg}`);
        
        if (this.attemptCount >= maxAttempts) {
          logger.error('RuntimeCheckInCoordinator: Max retries exhausted. Remaining in current trusted state.');
          return isNetwork ? 'NETWORK_FAILURE' : 'HTTP_ERROR';
        }

        // Exponential backoff
        const delay = baseDelayMs * Math.pow(2, this.attemptCount - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return 'NETWORK_FAILURE'; // fallback
  }

  private async performActualCheckIn(licenseId: string, deviceKeyId: string): Promise<void> {
    logger.info('RuntimeCheckInCoordinator: Requesting challenge...');
    
    // 1. Get Challenge
    const challenge = await this.licensingClient.getRuntimeCheckInChallenge(deviceKeyId, licenseId);

    // 2. Sign Challenge (Secure Enclave)
    const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
    const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
    const dataToSign = Buffer.concat([domainSeparationTag, canonicalChallengeBytes]);

    const signature = await this.identityProvider.signChallenge(dataToSign);
    const proof = { challenge, signature };

    // 2.5 Get public key
    const publicKey = await this.identityProvider.getPublicKey();

    // 3. Submit Check-In
    logger.info('RuntimeCheckInCoordinator: Submitting signed proof...');
    const requestId = crypto.randomUUID();
    const response = await this.licensingClient.performRuntimeCheckIn(requestId, licenseId, deviceKeyId, publicKey, proof);

    if (!response || !response.receipt) {
       throw new Error('MALFORMED_RESPONSE: Missing receipt');
    }

    const envelope = response.receipt;

    // 4. Verify Receipt Crypto and Identity Bindings
    logger.info('RuntimeCheckInCoordinator: Verifying receipt cryptography...');
    const verifiedPayload = this.verifier.verify(envelope, licenseId, deviceKeyId);

    // 5. Anti-Rollback Protection
    await this.enforceAntiRollback(verifiedPayload.serverTime);

    // 6. Atomically Persist Receipt
    logger.info('RuntimeCheckInCoordinator: Persisting verified receipt atomically...');
    await this.store.save(envelope);
  }

  private async enforceAntiRollback(incomingServerTime: string): Promise<void> {
    try {
      const existing = await this.store.load();
      const existingTime = new Date(existing.receipt.serverTime).getTime();
      const incomingTime = new Date(incomingServerTime).getTime();
      
      if (incomingTime < existingTime) {
        throw new Error('ANTI_ROLLBACK_TRIGGERED: Incoming receipt is older than stored receipt.');
      }
    } catch (err: any) {
      const msg = (err && typeof err.message === 'string') ? err.message : '';
      if (err instanceof LocalRuntimeStateError && err.code === 'NOT_FOUND') {
        // No existing state -> safe to save
        return;
      }
      if (msg.includes('ANTI_ROLLBACK_TRIGGERED')) {
        throw err;
      }
      // If store fails to load for other reasons (corrupt), it's safe to overwrite with a verified new one.
      logger.warn(`RuntimeCheckInCoordinator: Previous state unreadable (${msg}). Proceeding with overwrite.`);
    }
  }

  /**
   * Evaluates the current check-in state based on persisted receipt.
   */
  async getCheckInState(licenseId: string, deviceKeyId: string) {
    try {
      const stored = await this.store.load();
      const payload = this.verifier.verify(stored, licenseId, deviceKeyId);

      if (payload.licenseStatus === 'REVOKED') return { state: 'REVOKED', payload };
      if (payload.licenseStatus === 'DISABLED') return { state: 'DISABLED', payload };

      const nowMs = Date.now();
      const validUntilMs = new Date(payload.checkInValidUntil).getTime();
      const remainingMs = validUntilMs - nowMs;

      const unacknowledgedCount = payload.directives ? payload.directives.length : 0; // In Phase 2B, we haven't implemented ack store yet, just count all

      if (remainingMs <= 0) return { state: 'OVERDUE', payload, unacknowledgedCount };
      if (remainingMs < 6 * 60 * 60 * 1000) return { state: 'REQUIRED', payload, unacknowledgedCount };
      if (remainingMs < 48 * 60 * 60 * 1000) return { state: 'DUE_SOON', payload, unacknowledgedCount };

      return { state: 'CURRENT', payload, unacknowledgedCount };
    } catch (err: any) {
      if (err instanceof LocalRuntimeStateError && err.code === 'NOT_FOUND') {
        return { state: 'MISSING' };
      }
      logger.error(`RuntimeCheckInCoordinator: Failed to evaluate check-in state: ${err.message}`);
      return { state: 'MISSING' };
    }
  }
}
