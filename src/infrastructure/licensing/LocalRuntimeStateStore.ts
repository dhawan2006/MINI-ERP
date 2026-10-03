import fs from 'fs/promises';
import path from 'path';
import { SignedRuntimeCheckinReceipt } from '../../shared/crypto/RuntimeCheckinReceiptPayload';

export class LocalRuntimeStateError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'LocalRuntimeStateError';
  }
}

export interface RuntimeStateWrapper {
  schemaVersion: number;
  receipt: SignedRuntimeCheckinReceipt;
  savedAt: string;
}

export interface ILocalRuntimeStateStore {
  load(): Promise<RuntimeStateWrapper>;
  save(receipt: SignedRuntimeCheckinReceipt): Promise<void>;
  clear(): Promise<void>;
}

export class LocalRuntimeStateStore implements ILocalRuntimeStateStore {
  private storePath: string;

  constructor(userDataPath: string) {
    const dir = path.join(userDataPath, 'licensing');
    this.storePath = path.join(dir, 'runtime-checkin.json');
  }

  private async ensureDirectory() {
    const dir = path.dirname(this.storePath);
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (err: any) {
      throw new LocalRuntimeStateError('STORAGE_FAILURE', `Failed to create directory: ${err.message}`);
    }
  }

  async load(): Promise<RuntimeStateWrapper> {
    try {
      const data = await fs.readFile(this.storePath, 'utf8');
      
      let parsed: any;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new LocalRuntimeStateError('MALFORMED', 'Stored runtime state is not valid JSON');
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new LocalRuntimeStateError('MALFORMED', 'Stored runtime state must be an object');
      }

      if (parsed.schemaVersion !== 1) {
        throw new LocalRuntimeStateError('UNSUPPORTED_SCHEMA', `Unsupported schema version: ${parsed.schemaVersion}`);
      }

      if (!parsed.receipt || typeof parsed.receipt !== 'object') {
        throw new LocalRuntimeStateError('MALFORMED', 'Missing receipt in stored wrapper');
      }

      const r = parsed.receipt;
      if (
        typeof r.signingKeyId !== 'string' ||
        typeof r.signature !== 'string' ||
        typeof r.protocolVersion !== 'string' ||
        typeof r.policyVersion !== 'number' ||
        typeof r.licenseId !== 'string' ||
        typeof r.deviceKeyId !== 'string' ||
        typeof r.bindingId !== 'string' ||
        typeof r.serverTime !== 'string' ||
        typeof r.checkInValidUntil !== 'string' ||
        typeof r.licenseStatus !== 'string' ||
        !Array.isArray(r.directives)
      ) {
        throw new LocalRuntimeStateError('MALFORMED', 'Stored receipt is missing required fields or has incorrect types');
      }

      return parsed as RuntimeStateWrapper;
    } catch (err: any) {
      if (err instanceof LocalRuntimeStateError) throw err;
      if (err.code === 'ENOENT') {
        throw new LocalRuntimeStateError('NOT_FOUND', 'No local runtime check-in state found');
      }
      throw new LocalRuntimeStateError('STORAGE_FAILURE', `Failed to load runtime state: ${err.message}`);
    }
  }

  async save(receipt: SignedRuntimeCheckinReceipt): Promise<void> {
    await this.ensureDirectory();

    const wrapper: RuntimeStateWrapper = {
      schemaVersion: 1,
      receipt,
      savedAt: new Date().toISOString()
    };

    let json: string;
    try {
      json = JSON.stringify(wrapper);
    } catch {
      throw new LocalRuntimeStateError('MALFORMED', 'Failed to serialize wrapper');
    }

    const uniqueTempPath = `${this.storePath}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;

    try {
      // 1. Write to temp file atomically over POSIX boundaries
      await fs.writeFile(uniqueTempPath, json, { encoding: 'utf8', mode: 0o600 });
      
      // 2. Atomic rename
      await fs.rename(uniqueTempPath, this.storePath);
    } catch (err: any) {
      try {
        await fs.unlink(uniqueTempPath);
      } catch { /* ignore */ }
      
      throw new LocalRuntimeStateError('STORAGE_FAILURE', `Failed to save runtime state atomically: ${err.message}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.storePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw new LocalRuntimeStateError('STORAGE_FAILURE', `Failed to clear runtime state: ${err.message}`);
      }
    }
  }
}
