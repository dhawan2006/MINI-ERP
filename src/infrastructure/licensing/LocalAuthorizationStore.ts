import fs from 'fs/promises';
import path from 'path';
import { ILocalAuthorizationStore, LocalAuthorizationError } from '../../application/interfaces/ILocalAuthorizationStore';
import { SignedAuthorization } from '../../../server/licensing/src/crypto/ServerAuthorizationSigner';

export class LocalAuthorizationStore implements ILocalAuthorizationStore {
  private authPath: string;
  private tempPath: string;

  constructor(userDataPath: string) {
    const dir = path.join(userDataPath, 'licensing');
    this.authPath = path.join(dir, 'authorization.json');
    this.tempPath = path.join(dir, 'authorization.json.tmp');
  }

  private async ensureDirectory() {
    const dir = path.dirname(this.authPath);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (err: any) {
      throw new LocalAuthorizationError('AUTHORIZATION_STORAGE_FAILURE', `Failed to create licensing directory: ${err.message}`);
    }
  }

  async load(): Promise<SignedAuthorization> {
    try {
      const data = await fs.readFile(this.authPath, 'utf8');
      
      // Strict deserialization
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        throw new LocalAuthorizationError('AUTHORIZATION_MALFORMED', 'Stored authorization is not valid JSON');
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new LocalAuthorizationError('AUTHORIZATION_MALFORMED', 'Stored authorization must be a JSON object');
      }

      // Exact field validation
      if (
        typeof parsed.protocolVersion !== 'number' ||
        typeof parsed.authorizationVersion !== 'number' ||
        typeof parsed.licenseId !== 'string' ||
        typeof parsed.productId !== 'string' ||
        typeof parsed.deviceKeyId !== 'string' ||
        typeof parsed.validFrom !== 'string' ||
        typeof parsed.validUntil !== 'string' ||
        typeof parsed.issuedAt !== 'string' ||
        typeof parsed.signingKeyId !== 'string' ||
        typeof parsed.signature !== 'string'
      ) {
        throw new LocalAuthorizationError('AUTHORIZATION_MALFORMED', 'Stored authorization is missing required fields or has incorrect types');
      }

      return parsed as SignedAuthorization;
    } catch (err: any) {
      if (err instanceof LocalAuthorizationError) {
        throw err;
      }
      if (err.code === 'ENOENT') {
        throw new LocalAuthorizationError('AUTHORIZATION_NOT_FOUND', 'No local authorization found');
      }
      throw new LocalAuthorizationError('AUTHORIZATION_STORAGE_FAILURE', `Failed to load authorization: ${err.message}`);
    }
  }

  async save(authorization: SignedAuthorization): Promise<void> {
    await this.ensureDirectory();

    let json: string;
    try {
      // Use canonicalization approach or just strict stringify. 
      // The exact canonical format doesn't technically matter for storage as long as the content matches 
      // when reconstructed, but it's cleaner to just serialize normally.
      json = JSON.stringify(authorization);
    } catch (err) {
      throw new LocalAuthorizationError('AUTHORIZATION_MALFORMED', 'Failed to serialize authorization');
    }

    try {
      // 1. Write to temp file
      await fs.writeFile(this.tempPath, json, { encoding: 'utf8', mode: 0o600 });
      
      // Node fs/promises does not natively expose fsync on writeFile. 
      // For absolute sync, one would open a file handle. For Electron/macOS typical guarantees, 
      // rename over a completed writeFile is POSIX atomic.
      // 2. Atomic rename
      await fs.rename(this.tempPath, this.authPath);
    } catch (err: any) {
      // Attempt cleanup of temp file if we failed halfway
      try {
        await fs.unlink(this.tempPath);
      } catch { /* ignore */ }
      
      throw new LocalAuthorizationError('AUTHORIZATION_STORAGE_FAILURE', `Failed to save authorization atomically: ${err.message}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.authPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw new LocalAuthorizationError('AUTHORIZATION_STORAGE_FAILURE', `Failed to clear authorization: ${err.message}`);
      }
    }
  }
}
