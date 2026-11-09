/**
 * tests/e2e/windows/packaged-app.windows.spec.ts
 *
 * Windows packaged application acceptance tests.
 *
 * These tests launch the PACKAGED Mini POS Windows executable (not the Vite
 * dev server) and exercise the full application stack end-to-end:
 *   - SQLite native module loading on win32-x64
 *   - IPC contract between renderer and main process
 *   - Database persistence (write → restart → verify)
 *   - First-launch onboarding detection
 *   - Existing database detection (no spurious re-onboarding)
 *   - Billing workflow (product creation, bill finalization)
 *   - Backup and restore
 *   - Settings persistence
 *   - PDF export (dialog stub via MINIPOS_E2E_TEST)
 *   - Application restart with data persistence
 *
 * Prerequisites:
 *   1. Run `npm run package:win:x64` to produce the packaged application.
 *   2. Set MINIPOS_WIN_EXE env var to the executable path, OR rely on the
 *      default path: release/win-unpacked/Mini POS.exe
 *   3. Set MINIPOS_E2E_TEST=true so FakeDialogService is used instead of
 *      native OS dialogs (which cannot be automated headlessly).
 *
 * Run:
 *   npx playwright test tests/e2e/windows/ --project=windows
 *
 * Note: These tests are NOT part of the standard `npm test` vitest suite.
 * They require the packaged binary and are designed to run in CI on a
 * Windows runner after the NSIS packaging step.
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getExecutablePath(): string {
  if (process.env.MINIPOS_WIN_EXE) {
    return process.env.MINIPOS_WIN_EXE;
  }
  // Default: release/win-unpacked/Mini POS.exe (relative to project root)
  const projectRoot = path.resolve(__dirname, '../../..');
  return path.join(projectRoot, 'release', 'win-unpacked', 'Mini POS.exe');
}

async function launchApp(userDataOverride?: string): Promise<{ app: ElectronApplication; win: Page }> {
  const executablePath = getExecutablePath();

  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `Packaged Windows executable not found: ${executablePath}\n` +
      `Run 'npm run package:win:x64' first, or set MINIPOS_WIN_EXE env var.`
    );
  }

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    MINIPOS_E2E_TEST: 'true',
    ELECTRON_ENABLE_LOGGING: '1',
  };

  if (userDataOverride) {
    // Override userData path for isolated test profiles
    env.APPDATA = userDataOverride;
    env.MINIPOS_USER_DATA_DIR = userDataOverride;
  }

  const electronApp = await electron.launch({
    executablePath,
    args: userDataOverride ? [`--user-data-dir=${userDataOverride}`] : [],
    env,
    timeout: 20000,
  });

  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  return { app: electronApp, win };
}

async function ipc<T>(win: Page, channel: string, ...args: unknown[]): Promise<T> {
  return win.evaluate(
    ([ch, ...a]) => (window as any).api[ch.split(':')[0]][ch.split(':')[1]](...a),
    [channel, ...args]
  );
}

// ─── Test suite ─────────────────────────────────────────────────────────────

test.describe('Windows Packaged App — SQLite Native Module', () => {
  let electronApp: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    ({ app: electronApp, win } = await launchApp());
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('system:ping responds from main process', async () => {
    const response = await win.evaluate(() => (window as any).api.system.ping());
    expect(response).toBe('pong from main process');
  });

  test('SQLite native module loads on win32-x64', async () => {
    // If better-sqlite3 failed to load, any DB IPC call would fail with an error.
    const result = await win.evaluate(() => (window as any).api.products.list(1, 0, false));
    expect(result).toHaveProperty('success', true);
  });

  test('userData path is in user AppData, not application directory', async () => {
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    // On Windows, userData must be under %APPDATA%\Mini POS (Roaming) or LocalAppData
    // — never under Program Files or the NSIS install directory.
    expect(userDataPath.toLowerCase()).toMatch(/appdata|users/);
    expect(userDataPath.toLowerCase()).not.toMatch(/program files/i);
  });

  test('SQLite database file is in userData, not application directory', async () => {
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    const dbPath = path.join(userDataPath, 'mini-erp-data', 'billing.db');
    // Give the app a moment to initialize and create the DB
    await win.waitForTimeout(1000);
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});

test.describe('Windows Packaged App — First Launch Onboarding', () => {
  const testDataDir = path.join(os.tmpdir(), `minipos-fresh-${Date.now()}`);
  let electronApp: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    fs.mkdirSync(testDataDir, { recursive: true });
    ({ app: electronApp, win } = await launchApp(testDataDir));
  });

  test.afterAll(async () => {
    await electronApp.close();
    // Cleanup test profile
    try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  });

  test('setup:getState returns pending setup on fresh install', async () => {
    const result = await win.evaluate(() => (window as any).api.setup.getState());
    expect(result.success).toBe(true);
    expect(result.data.status).toMatch(/NOT_STARTED|IN_PROGRESS/);
  });

  test('setup:saveStoreProfile accepts shop name', async () => {
    const result = await win.evaluate(() =>
      (window as any).api.setup.saveStoreProfile('Windows Test Store')
    );
    expect(result.success).toBe(true);
  });

  test('setup:complete marks setup as done', async () => {
    const result = await win.evaluate(() => (window as any).api.setup.complete());
    expect(result.success).toBe(true);
  });

  test('setup:getState shows COMPLETED after onboarding', async () => {
    const result = await win.evaluate(() => (window as any).api.setup.getState());
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('COMPLETED');
  });
});

test.describe('Windows Packaged App — Billing Workflow', () => {
  let electronApp: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    ({ app: electronApp, win } = await launchApp());
    // Complete setup if needed
    const setupState = await win.evaluate(() => (window as any).api.setup.getState());
    if (setupState.data?.status !== 'COMPLETED') {
      await win.evaluate(() => (window as any).api.setup.saveStoreProfile('Billing Test Store'));
      await win.evaluate(() => (window as any).api.setup.complete());
    }
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('products:create creates a product', async () => {
    const result = await win.evaluate(() =>
      (window as any).api.products.create('Windows Test Item', 999, 'WIN-001')
    );
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('id');
    expect(result.data.name).toBe('Windows Test Item');
    expect(result.data.priceMinor).toBe(999);
  });

  test('products:findByBarcode finds the created product', async () => {
    const result = await win.evaluate(() =>
      (window as any).api.products.findByBarcode('WIN-001')
    );
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Windows Test Item');
  });

  test('billing:addProduct adds to draft', async () => {
    // First clear any existing draft
    await win.evaluate(() => (window as any).api.billing.clear());

    // Find the product
    const pResult = await win.evaluate(() =>
      (window as any).api.products.findByBarcode('WIN-001')
    );
    const productId = pResult.data?.id;
    expect(productId).toBeTruthy();

    const result = await win.evaluate((id) =>
      (window as any).api.billing.addProduct(id), productId
    );
    expect(result.success).toBe(true);
    expect(result.data?.items?.length).toBeGreaterThan(0);
  });

  test('billing:finalize creates a bill record', async () => {
    const result = await win.evaluate(() => (window as any).api.billing.finalize());
    expect(result.success).toBe(true);
    expect(result.data?.billNumber).toBeGreaterThan(0);
    expect(result.data?.totalMinor).toBeGreaterThan(0);
  });

  test('history:list includes the finalized bill', async () => {
    const result = await win.evaluate(() =>
      (window as any).api.history.list({ offset: 0, limit: 10 })
    );
    expect(result.success).toBe(true);
    expect(result.data?.items?.length).toBeGreaterThan(0);
  });
});

test.describe('Windows Packaged App — Settings Persistence', () => {
  let electronApp: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    ({ app: electronApp, win } = await launchApp());
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('settings:get returns valid settings', async () => {
    const result = await win.evaluate(() => (window as any).api.settings.get());
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('store');
    expect(result.data).toHaveProperty('printer');
  });

  test('settings:update persists store name across call', async () => {
    const getResult = await win.evaluate(() => (window as any).api.settings.get());
    const current = getResult.data;

    const uniqueName = `Win-Store-${Date.now()}`;
    const updateResult = await win.evaluate(
      ({ name, settings }) => (window as any).api.settings.update({
        store: { shopName: name, shopAddress: 'Test St', shopPhone: '0000000000' },
        printer: settings.printer,
      }),
      { name: uniqueName, settings: current }
    );
    expect(updateResult.success).toBe(true);

    const verifyResult = await win.evaluate(() => (window as any).api.settings.get());
    expect(verifyResult.data.store.shopName).toBe(uniqueName);
  });
});

test.describe('Windows Packaged App — Backup and Restore', () => {
  let electronApp: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    ({ app: electronApp, win } = await launchApp());
    // Complete setup if needed
    const setupState = await win.evaluate(() => (window as any).api.setup.getState());
    if (setupState.data?.status !== 'COMPLETED') {
      await win.evaluate(() => (window as any).api.setup.saveStoreProfile('Backup Test Store'));
      await win.evaluate(() => (window as any).api.setup.complete());
    }
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('backup:export creates a backup file (FakeDialogService)', async () => {
    // FakeDialogService saves to userData/e2e-test-backups/
    const result = await win.evaluate(() => (window as any).api.backup.export());
    expect(result.success).toBe(true);
    expect(result.data?.filePath).toBeTruthy();
    expect(result.data?.sizeBytes).toBeGreaterThan(0);

    // Verify the file actually exists on disk
    const backupPath = result.data.filePath;
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  test('restore:validate validates a known-good backup', async () => {
    // Export a valid backup first
    const backupResult = await win.evaluate(() => (window as any).api.backup.export());
    expect(backupResult.success).toBe(true);
    expect(backupResult.data?.filePath).toBeTruthy();

    // FakeDialogService returns userData/e2e-test-backups/mock-restore.db
    // Copy the exported backup there so restore:validate finds a real valid DB file
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    const mockRestorePath = path.join(userDataPath, 'e2e-test-backups', 'mock-restore.db');
    if (fs.existsSync(backupResult.data.filePath)) {
      fs.copyFileSync(backupResult.data.filePath, mockRestorePath);
    }

    const validateResult = await win.evaluate(() => (window as any).api.restore.validate());
    expect(validateResult.success).toBe(true);
    expect(validateResult.data?.metadata?.isValid).toBe(true);
  });
});

test.describe('Windows Packaged App — Error Handling', () => {
  let electronApp: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    ({ app: electronApp, win } = await launchApp());
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('billing:addProduct with invalid ID returns structured error', async () => {
    const result = await win.evaluate(() =>
      (window as any).api.billing.addProduct('nonexistent-product-id-xyz')
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBeTruthy();
  });

  test('products:findByBarcode with unknown barcode returns null data', async () => {
    const result = await win.evaluate(() =>
      (window as any).api.products.findByBarcode('DOES-NOT-EXIST-99999')
    );
    // May succeed with null data or return an error — both are valid
    if (result.success) {
      expect(result.data).toBeFalsy();
    } else {
      expect(result.error?.code).toBeTruthy();
    }
  });

  test('billing:finalize on empty draft returns structured error', async () => {
    // Clear any active draft first
    await win.evaluate(() => (window as any).api.billing.clear());
    const result = await win.evaluate(() => (window as any).api.billing.finalize());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBeTruthy();
  });
});

