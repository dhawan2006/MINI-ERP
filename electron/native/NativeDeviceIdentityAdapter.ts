/**
 * Mini POS — Native Device Identity Adapter
 *
 * Bridges TypeScript Electron Main to the Swift MiniPOSIdentityHelper process.
 *
 * Communication: JSONL over stdin/stdout (one JSON object per line).
 * The helper binary path is resolved relative to this file's location to
 * prevent attacker-controlled path injection.
 *
 * Security guarantees:
 *   ID-SEC-001: No private key data flows through this adapter.
 *   ID-SEC-002: IPC payload contains only typed operations.
 *   ID-SEC-011: The helper rejects unknown operations at the Swift level.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { IDeviceIdentityProvider, DeviceIdentityStatus } from './IDeviceIdentityProvider';

// --- Types mirroring the Swift protocol ---

interface HelperRequest {
  operation: string;
  requestId: string;
  payload: Record<string, string> | null;
}

interface HelperResponse {
  requestId: string;
  success: boolean;
  result?: {
    status?: string;
    publicKey?: string;
    deviceKeyId?: string;
    signature?: string;
    secureEnclaveAvailable?: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}

class IdentityAdapterError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'IdentityAdapterError';
  }
}

// --- Adapter ---

export class NativeDeviceIdentityAdapter implements IDeviceIdentityProvider {
  private process: ChildProcess | null = null;
  private pendingRequests = new Map<string, {
    resolve: (r: HelperResponse) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private lineBuffer = '';
  private readonly REQUEST_TIMEOUT_MS = 10_000;

  /**
   * Resolves the helper path safely.
   * - In production (packaged): <app>/Contents/Helpers/MiniPOSIdentityHelper
   * - In development: built from source at the relative location.
   *
   * We NEVER accept a user-supplied path to prevent path-injection attacks.
   */
  private get helperPath(): string {
    // Detect packaged app
    if (process.env.NODE_ENV === 'production' || __dirname.includes('app.asar')) {
      return path.join(process.resourcesPath, 'native', 'MiniPOSIdentityHelper');
    }
    // Development: use the built Swift binary
    return path.resolve(
      __dirname,
      // In prod, __dirname is dist-electron/native (or app.asar). In dev/test, it is electron/native.
      __dirname.includes('dist-electron') ? '../electron/native/MiniPOSIdentityHelper/.build/release/MiniPOSIdentityHelper' : 'MiniPOSIdentityHelper/.build/release/MiniPOSIdentityHelper'
    );
  }

  private ensureProcess(): void {
    if (this.process && !this.process.killed) return;

    const helperPath = this.helperPath;

    this.process = spawn(helperPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Inherit restricted environment — do NOT pass shell or arbitrary env.
      env: {},
    });

    this.lineBuffer = '';

    this.process.stdout!.setEncoding('utf8');
    this.process.stdout!.on('data', (chunk: string) => {
      this.lineBuffer += chunk;
      const lines = this.lineBuffer.split('\n');
      this.lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.handleLine(trimmed);
      }
    });

    // Drain stderr for diagnostics (never log to user-visible output)
    this.process.stderr!.setEncoding('utf8');
    this.process.stderr!.on('data', (data: string) => {
      // Only log in development; production should suppress or forward to app log
      if (process.env.NODE_ENV !== 'production') {
        process.stderr.write(`[identity-helper] ${data}`);
      }
    });

    this.process.on('exit', (code) => {
      this.rejectAllPending(
        new IdentityAdapterError(
          'HELPER_UNAVAILABLE',
          `Identity helper exited unexpectedly with code ${code}`
        )
      );
      this.process = null;
    });

    this.process.on('error', (err) => {
      this.rejectAllPending(
        new IdentityAdapterError(
          'HELPER_UNAVAILABLE',
          `Failed to start identity helper: ${err.message}`
        )
      );
      this.process = null;
    });
  }

  private handleLine(line: string): void {
    let parsed: HelperResponse;
    try {
      parsed = JSON.parse(line) as HelperResponse;
    } catch {
      console.error('[identity-adapter] Failed to parse helper response:', line);
      return;
    }

    const pending = this.pendingRequests.get(parsed.requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(parsed.requestId);

    if (parsed.success) {
      pending.resolve(parsed);
    } else {
      const err = parsed.error;
      pending.reject(
        new IdentityAdapterError(
          err?.code ?? 'HELPER_PROTOCOL_ERROR',
          err?.message ?? 'Unknown identity helper error'
        )
      );
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  private sendRequest(request: HelperRequest): Promise<HelperResponse> {
    this.ensureProcess();
    if (!this.process?.stdin?.writable) {
      return Promise.reject(
        new IdentityAdapterError('HELPER_UNAVAILABLE', 'Helper process stdin is not writable')
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject(
          new IdentityAdapterError(
            'HELPER_UNAVAILABLE',
            `Identity helper request ${request.requestId} timed out after ${this.REQUEST_TIMEOUT_MS}ms`
          )
        );
      }, this.REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(request.requestId, { resolve, reject, timer });

      const line = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(line);
    });
  }

  // --- IDeviceIdentityProvider implementation ---

  async initialize(): Promise<void> {
    const res = await this.sendRequest({
      operation: 'initialize',
      requestId: crypto.randomUUID(),
      payload: null,
    });
    if (!res.success) {
      throw new IdentityAdapterError(
        res.error?.code ?? 'IDENTITY_NOT_INITIALIZED',
        res.error?.message ?? 'Initialization failed'
      );
    }
  }

  async getStatus(): Promise<DeviceIdentityStatus> {
    const res = await this.sendRequest({
      operation: 'getStatus',
      requestId: crypto.randomUUID(),
      payload: null,
    });
    const statusStr = res.result?.status ?? 'HELPER_UNAVAILABLE';
    return (DeviceIdentityStatus[statusStr as keyof typeof DeviceIdentityStatus] ??
      DeviceIdentityStatus.HELPER_UNAVAILABLE);
  }

  async getPublicKey(): Promise<string> {
    const res = await this.sendRequest({
      operation: 'getPublicKey',
      requestId: crypto.randomUUID(),
      payload: null,
    });
    const pk = res.result?.publicKey;
    if (!pk) throw new IdentityAdapterError('PUBLIC_KEY_UNAVAILABLE', 'Helper returned no public key');
    return pk;
  }

  async getDeviceKeyId(): Promise<string> {
    const res = await this.sendRequest({
      operation: 'getDeviceKeyId',
      requestId: crypto.randomUUID(),
      payload: null,
    });
    const id = res.result?.deviceKeyId;
    if (!id) throw new IdentityAdapterError('IDENTITY_NOT_INITIALIZED', 'Helper returned no deviceKeyId');
    return id;
  }

  async signChallenge(challengeBytes: Buffer): Promise<string> {
    if (!challengeBytes || challengeBytes.length === 0) {
      throw new IdentityAdapterError('INVALID_CHALLENGE_INPUT', 'Challenge bytes must not be empty');
    }
    const challengeBase64url = challengeBytes.toString('base64url');
    const res = await this.sendRequest({
      operation: 'signChallenge',
      requestId: crypto.randomUUID(),
      payload: { challengeBase64url },
    });
    const sig = res.result?.signature;
    if (!sig) throw new IdentityAdapterError('SIGNING_FAILED', 'Helper returned no signature');
    return sig;
  }

  /** Gracefully terminates the helper process. Call on app quit. */
  dispose(): void {
    if (this.process && !this.process.killed) {
      this.process.stdin?.end();
      this.process.kill();
    }
    this.rejectAllPending(
      new IdentityAdapterError('HELPER_UNAVAILABLE', 'Identity adapter disposed')
    );
    this.process = null;
  }
}
