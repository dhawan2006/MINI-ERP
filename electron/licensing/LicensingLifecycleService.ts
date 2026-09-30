import crypto from 'crypto';
import { LicensingClient } from './LicensingClient';
import { IDeviceIdentityProvider } from '../native/IDeviceIdentityProvider';
import { LocalAuthorizationStore } from '../../src/infrastructure/licensing/LocalAuthorizationStore';
import { logger } from '../../src/infrastructure/logging/logger';
import { canonicalize } from '../../server/licensing/src/crypto/canonicalize';

export class LicensingLifecycleService {
  constructor(
    private licensingClient: LicensingClient,
    private identityProvider: IDeviceIdentityProvider,
    private authStore: LocalAuthorizationStore
  ) {}

  async requestDeactivation(): Promise<void> {
    try {
      logger.info('LicensingLifecycle: Starting deactivation protocol...');
      const auth = await this.authStore.load();

      if (!auth) {
        throw new Error('NO_ACTIVE_LICENSE');
      }

      const deviceKeyId = await this.identityProvider.getDeviceKeyId();

      if (auth.deviceKeyId !== deviceKeyId) {
        throw new Error('DEVICE_MISMATCH');
      }

      // Step 1: Request Deactivation Challenge
      const challenge = await this.licensingClient.getDeactivationChallenge(
        deviceKeyId,
        auth.licenseId
      );

      // Step 2: Sign Deactivation Challenge
      const canonicalChallengeBytes = Buffer.from(canonicalize(challenge), 'utf8');
      const domainSeparationTag = Buffer.from('MINIPOS-DEVICE-CHALLENGE-V1:', 'utf8');
      const dataToSign = Buffer.concat([domainSeparationTag, canonicalChallengeBytes]);

      const signature = await this.identityProvider.signChallenge(dataToSign);

      const proof = {
        challenge,
        signature
      };

      // Step 3: Execute Deactivation Transaction
      const requestId = crypto.randomUUID();
      await this.licensingClient.deactivate(
        requestId,
        auth.licenseId,
        deviceKeyId,
        proof
      );

      // Step 4: Purge Local Authorization Store
      await this.authStore.clear();
      
      logger.info('LicensingLifecycle: Deactivation successful. Local authorization purged.');
    } catch (err: any) {
      logger.error(`LicensingLifecycle: Deactivation failed - ${err.message}`);
      throw err;
    }
  }
}
