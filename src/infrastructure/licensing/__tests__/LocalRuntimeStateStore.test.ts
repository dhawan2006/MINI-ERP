import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalRuntimeStateStore } from '../LocalRuntimeStateStore';
import { SignedRuntimeCheckinReceipt } from '../../../shared/crypto/RuntimeCheckinReceiptPayload';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('LocalRuntimeStateStore', () => {
  let store: LocalRuntimeStateStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'licensing-test-'));
    store = new LocalRuntimeStateStore(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createDummyReceipt = (): SignedRuntimeCheckinReceipt => ({
    signingKeyId: 'test-key',
    signature: 'fake-sig',
    protocolVersion: 'MINIPOS-RUNTIME-CHECKIN-V1',
    policyVersion: 1,
    licenseId: 'lic-123',
    deviceKeyId: 'dev-456',
    bindingId: 'bind-789',
    serverTime: new Date().toISOString(),
    checkInValidUntil: new Date(Date.now() + 86400000).toISOString(),
    licenseStatus: 'ACTIVE',
    directives: []
  });

  it('throws NOT_FOUND when file does not exist (empty state)', async () => {
    await expect(store.load()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('saves and loads a valid state successfully', async () => {
    const receipt = createDummyReceipt();
    await store.save(receipt);

    const loaded = await store.load();
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.receipt.licenseId).toBe('lic-123');
    expect(loaded.receipt.signature).toBe('fake-sig');
  });

  it('throws MALFORMED when file is invalid JSON', async () => {
    const dir = path.join(tempDir, 'licensing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'runtime-checkin.json'), '{ invalid-json', 'utf8');

    await expect(store.load()).rejects.toMatchObject({ code: 'MALFORMED' });
  });

  it('throws UNSUPPORTED_SCHEMA for wrong schema version', async () => {
    const dir = path.join(tempDir, 'licensing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'runtime-checkin.json'), JSON.stringify({ schemaVersion: 2, receipt: {} }), 'utf8');

    await expect(store.load()).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' });
  });

  it('throws MALFORMED for missing fields in receipt', async () => {
    const dir = path.join(tempDir, 'licensing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'runtime-checkin.json'), JSON.stringify({ schemaVersion: 1, receipt: { licenseId: 'missing-stuff' } }), 'utf8');

    await expect(store.load()).rejects.toMatchObject({ code: 'MALFORMED' });
  });

  it('supports clearing the store', async () => {
    const receipt = createDummyReceipt();
    await store.save(receipt);
    await store.clear();
    await expect(store.load()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('ignores clear when file does not exist', async () => {
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('ensures atomic writes survive concurrent requests', async () => {
    const promises = Array.from({ length: 50 }).map((_, i) => {
      const receipt = createDummyReceipt();
      receipt.signature = `sig-${i}`;
      return store.save(receipt);
    });

    await Promise.all(promises);

    const loaded = await store.load();
    expect(loaded.receipt.signature).toMatch(/^sig-\d+$/);
  });
});
