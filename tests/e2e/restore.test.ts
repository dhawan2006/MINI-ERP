import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/infrastructure/database/migrations';

let electronApp: ElectronApplication;
let window: Page;

test.describe('Safe Database Restore', () => {
  const userDataPath = '/tmp/minipos-e2e-restore-test';
  const testBackupsDir = path.join(userDataPath, 'e2e-test-backups');
  const mockRestorePath = path.join(testBackupsDir, 'mock-restore.db');

  test.beforeEach(async () => {
    // Clean up
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testBackupsDir, { recursive: true });

    // Create a valid backup that FakeDialogService will select
    const db = new Database(mockRestorePath);
    runMigrations(db);
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('store.shopName', '"Restored Shop Name"', ?)`).run(Date.now());
    db.close();

    electronApp = await electron.launch({
      args: ['tests/e2e/test-entry.js', '--user-data-dir=' + userDataPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MINIPOS_E2E_TEST: 'true'
      }
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    
    // Ensure initial app is ready
    await window.waitForSelector('text=Billing');
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
  });

  test('blocks restore if active draft exists', async () => {
    // 1. Inject an active draft using the application's IPC to ensure BillingService is updated
    await window.evaluate(async () => {
      // @ts-ignore
      await window.api.products.create('Mock', 100, '123');
      // @ts-ignore
      await window.api.billing.addByBarcode('123');
    });

    // 2. Go to Settings and try to restore
    await window.locator('button:has-text("Settings")').click();
    await window.waitForTimeout(1000); // Give settings a moment to load
    await window.locator('button:has-text("Restore Database")').click();
    
    // File is selected automatically by FakeDialogService, which triggers validation and reveals the modal
    await expect(window.locator('text=Warning: Destructive Operation')).toBeVisible();

    // 3. Type RESTORE to confirm
    await window.fill('input[placeholder="RESTORE"]', 'RESTORE');
    await window.getByRole('button', { name: 'Confirm Restore' }).click();

    // 4. Verify that it was blocked due to active draft
    await expect(window.locator('text=An active draft exists')).toBeVisible();
  });

  test('successfully executes restore and safely replaces data', async () => {
    await window.locator('button:has-text("Settings")').click();
    await window.waitForTimeout(1000); // Give settings a moment to load

    // Initial store name should not be the restored one
    const shopNameInput = window.locator('input[type="text"]').first();
    await expect(shopNameInput).not.toHaveValue('Restored Shop Name');

    // Restore
    await window.locator('button:has-text("Restore Database")').click();
    
    await expect(window.locator('text=Warning: Destructive Operation')).toBeVisible();
    await window.fill('input[placeholder="RESTORE"]', 'RESTORE');
    await window.click('button:has-text("Confirm Restore")');

    // The backend should succeed and trigger a restart. 
    // Playwright won't survive the restart easily in this test setup, 
    // so we just verify the DB file on disk has the restored data.
    
    // Wait for the restored DB to actually be swapped in
    await new Promise(r => setTimeout(r, 2000)); 

    const activeDbPath = path.join(userDataPath, 'mini-erp-data', 'billing.db');
    const db = new Database(activeDbPath, { readonly: true });
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'store.shopName'`).get() as any;
    expect(row).toBeDefined();
    expect(row.value).toBe('"Restored Shop Name"');
    db.close();
  });
});
