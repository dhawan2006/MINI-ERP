import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, app: { relaunch: vi.fn(), exit: vi.fn() } }));
import { registerRestoreHandlers } from '../../electron/ipc/restore.handlers';
import { registerBillingHandlers } from '../../electron/ipc/billing.handlers';
import { registerProductHandlers } from '../../electron/ipc/products.handlers';
import { registerSettingsHandlers } from '../../electron/ipc/settings.handlers';
import { DatabaseLock } from '../../electron/ipc/DatabaseLock';

describe('Phase 3 — Restore Concurrency IPC Gate', () => {
  let restoreServiceMock: any;
  let dialogServiceMock: any;
  let billingServiceMock: any;
  let productServiceMock: any;
  let settingsServiceMock: any;
  let printServiceMock: any;

  let handlers: Record<string, Function> = {};

  beforeEach(() => {
    // Reset Lock
    DatabaseLock.release();
    
    // Reset IPC
    handlers = {};
    vi.spyOn(ipcMain, 'handle').mockImplementation((channel: string, listener: any) => {
      handlers[channel] = listener;
    });

    restoreServiceMock = {
      executeRestore: vi.fn()
    };
    dialogServiceMock = {};
    billingServiceMock = {
      hasActiveDraft: vi.fn().mockReturnValue(false),
      loadActiveDraft: vi.fn(),
      finalizeBill: vi.fn(),
      currentBill: { items: [], totalMinor: 0, isEmpty: true }
    };
    productServiceMock = {
      createProduct: vi.fn()
    };
    settingsServiceMock = {
      updateSettings: vi.fn()
    };
    printServiceMock = {
      updateConfig: vi.fn()
    };

    registerRestoreHandlers(restoreServiceMock, dialogServiceMock, billingServiceMock);
    registerBillingHandlers(billingServiceMock);
    registerProductHandlers(productServiceMock);
    registerSettingsHandlers(settingsServiceMock, printServiceMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects mutations with RESTORE_IN_PROGRESS while restore is paused at async boundary', async () => {
    let resolveRestore: any;
    const restorePromise = new Promise((res) => { resolveRestore = res; });
    
    restoreServiceMock.executeRestore.mockImplementation(async () => {
      await restorePromise; // Intentionally pause
    });

    // 1. Start restore
    const restoreCall = handlers['restore:execute']({}, 'dummy.db');
    
    // 2. Allow event loop to tick so executeRestore starts and acquires lock
    await new Promise(resolve => setTimeout(resolve, 10));

    // 3. Attempt a billing mutation
    const billingRes = await handlers['billing:loadDraft']({});
    expect(billingRes.success).toBe(false);
    expect(billingRes.error.code).toBe('RESTORE_IN_PROGRESS');

    // 4. Attempt a product mutation
    const productRes = await handlers['products:create']({}, 'test', 100);
    expect(productRes.success).toBe(false);
    expect(productRes.error.code).toBe('RESTORE_IN_PROGRESS');

    // 5. Attempt a settings mutation
    const settingsRes = await handlers['settings:update']({}, { store: { shopName: 'a', shopAddress: 'b', shopPhone: 'c' }, printer: { enabled: false, transport: 'none', paperWidth: 32, charactersPerLine: 32, supportsCut: false, feedLines: 0, encoding: 'utf8' } });
    expect(settingsRes.success).toBe(false);
    expect(settingsRes.error.code).toBe('RESTORE_IN_PROGRESS');

    // 6. Complete restore
    resolveRestore();
    await restoreCall;

    // 7. Confirm normal mutations work again
    const billingResAfter = await handlers['billing:loadDraft']({});
    expect(billingResAfter.success).toBe(false);
    expect(billingResAfter.error.code).toBe('RESTORE_IN_PROGRESS');
  });

  it('restores failure releases lock', async () => {
    restoreServiceMock.executeRestore.mockRejectedValue(new Error('Copy failed'));
    
    const restoreRes = await handlers['restore:execute']({}, 'dummy.db');
    expect(restoreRes.success).toBe(false);
    
    // Mutation should work again
    const billingRes = await handlers['billing:loadDraft']({});
    expect(billingRes.success).toBe(true);
  });

  it('does not allow multiple simultaneous restores', async () => {
    let resolveRestore: any;
    const restorePromise = new Promise((res) => { resolveRestore = res; });
    
    restoreServiceMock.executeRestore.mockImplementation(async () => {
      await restorePromise;
    });

    const restoreCall1 = handlers['restore:execute']({}, 'dummy1.db');
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const restoreCall2 = await handlers['restore:execute']({}, 'dummy2.db');
    expect(restoreCall2.success).toBe(false);
    expect(restoreCall2.error.code).toBe('RESTORE_IN_PROGRESS');
    
    resolveRestore();
    await restoreCall1;
  });
});
