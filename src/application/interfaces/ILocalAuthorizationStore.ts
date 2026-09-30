import { SignedAuthorization } from '../../../server/licensing/src/crypto/ServerAuthorizationSigner';

export class LocalAuthorizationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'LocalAuthorizationError';
  }
}

export interface ILocalAuthorizationStore {
  /**
   * Retrieves the currently stored authorization.
   * Does NOT perform cryptographic verification (that is the responsibility of AuthorizationVerifier).
   * It only performs strict JSON deserialization and structural checking.
   * Throws LocalAuthorizationError if the file is malformed, missing, or otherwise unreadable.
   */
  load(): Promise<SignedAuthorization>;

  /**
   * Saves a new authorization atomically.
   * Replaces any existing authorization in a crash-safe manner.
   */
  save(authorization: SignedAuthorization): Promise<void>;

  /**
   * Clears the local authorization (for factory reset or testing).
   */
  clear(): Promise<void>;
}
