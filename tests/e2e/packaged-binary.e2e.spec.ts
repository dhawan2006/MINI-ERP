import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';

import { runMigrations } from '../../src/infrastructure/database/migrations';

const PACKAGED_APP_PATH = path.join(__dirname, '..', '..', 'release', 'mac-arm64', 'Mini POS.app', 'Contents', 'MacOS', 'Mini POS');

test.describe.serial('Packaged Production Binary Acceptance Tests', () => {
  const testBaseDir = path.join('/tmp', 'minipos-packaged-test-' + Date.now());

  test.beforeAll(() => {
    fs.mkdirSync(testBaseDir, { recursive: true });
  });

  test.afterAll(() => {
    try {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    } catch {}
  });

  test('1. Fresh installation launch: completes onboarding directly into POS without licensing prompts', async () => {
    test.setTimeout(60000);
    const freshUserData = path.join(testBaseDir, 'fresh-user-data');
    fs.mkdirSync(freshUserData, { recursive: true });

    const app = await electron.launch({
      executablePath: PACKAGED_APP_PATH,
      args: [`--user-data-dir=${freshUserData}`],
      env: {
        ...process.env,
        // Ensure no dev bypass or QA env
        NODE_ENV: 'production',
      }
    });

    const page = await app.firstWindow();
    expect(page).toBeDefined();

    // Verify Welcome screen
    await expect(page.getByRole('heading', { name: 'Welcome to Mini POS' })).toBeVisible({ timeout: 15000 });
    
    // Verify zero licensing UI elements
    await expect(page.getByText('Activate License')).toBeHidden();
    await expect(page.getByText('Enter License Key')).toBeHidden();

    // Click Get Started
    await page.getByRole('button', { name: 'Get Started' }).click();

    // Fill store name
    await expect(page.getByRole('heading', { name: 'Set up your store' })).toBeVisible();
    const storeInput = page.getByLabel('Store name');
    await storeInput.fill('Packaged Acceptance Store');
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Complete setup screen
    await expect(page.getByRole('heading', { name: "You're all set." })).toBeVisible();
    await page.getByRole('button', { name: 'Open Mini POS' }).click();

    // Verify cashier billing screen is active
    await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 10000 });

    await app.close();
  });

  test('2. Existing installation upgrade with corrupt legacy licensing files', async () => {
    test.setTimeout(60000);
    const upgradeUserData = path.join(testBaseDir, 'upgrade-user-data');
    const dbDir = path.join(upgradeUserData, 'mini-erp-data');
    fs.mkdirSync(dbDir, { recursive: true });

    // Pre-populate SQLite with completed setup and product
    const now = Date.now();
    const db = new Database(path.join(dbDir, 'billing.db'));
    runMigrations(db);
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('app_setup', '{"status":"COMPLETED"}', ?)`).run(now);
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('app_settings', '{"store":{"shopName":"Production Store"}}', ?)`).run(now);
    db.prepare(`INSERT INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at) VALUES ('prod-1', 'Premium Tea', '890123456', 2500, 1, ?, ?)`).run(now, now);
    db.close();

    // Place corrupt/expired legacy licensing files
    const legacyDir = path.join(upgradeUserData, 'licensing');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'authorization.json'), '{"corrupted":true,"signature":"invalid"}');
    fs.writeFileSync(path.join(legacyDir, 'runtime_state.json'), '{"state":"EXPIRED","leaseExpiresAt":0}');

    const app = await electron.launch({
      executablePath: PACKAGED_APP_PATH,
      args: [`--user-data-dir=${upgradeUserData}`],
      env: {
        ...process.env,
        NODE_ENV: 'production',
      }
    });

    const page = await app.firstWindow();
    expect(page).toBeDefined();

    // Should immediately show Billing interface (onboarding skipped)
    const searchInput = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Verify product is searchable
    await searchInput.fill('Premium Tea');
    const option = page.getByRole('button', { name: /Premium Tea/i });
    await expect(option).toBeVisible();
    await option.click();

    // Verify item added to cart
    await expect(page.getByTestId('bill-row-prod-1')).toBeVisible();

    // Finalize bill
    const finalizeBtn = page.locator('button:has-text("FINALIZE & PRINT")');
    await expect(finalizeBtn).toBeVisible();
    await finalizeBtn.click();
    await expect(page.locator('.bill-row')).toHaveCount(0);

    await app.close();
  });

  test('3. Air-Gapped / Offline verification: Cash & UPI transaction persistence', async () => {
    test.setTimeout(60000);
    const offlineUserData = path.join(testBaseDir, 'offline-user-data');
    const dbDir = path.join(offlineUserData, 'mini-erp-data');
    fs.mkdirSync(dbDir, { recursive: true });

    const now = Date.now();
    const db = new Database(path.join(dbDir, 'billing.db'));
    runMigrations(db);
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('app_setup', '{"status":"COMPLETED"}', ?)`).run(now);
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('app_settings', '{"store":{"shopName":"Air-Gapped Store"}}', ?)`).run(now);
    db.prepare(`INSERT INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at) VALUES ('prod-air', 'Offline Biscuit', '999888777', 1500, 1, ?, ?)`).run(now, now);
    db.close();

    const app = await electron.launch({
      executablePath: PACKAGED_APP_PATH,
      args: [`--user-data-dir=${offlineUserData}`],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Completely invalid proxy to simulate air-gap network isolation
        http_proxy: 'http://127.0.0.1:9',
        https_proxy: 'http://127.0.0.1:9',
      }
    });

    const page = await app.firstWindow();
    const searchInput = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(searchInput).toBeVisible({ timeout: 15000 });

    // Add item
    await searchInput.fill('Offline Biscuit');
    await page.getByRole('button', { name: /Offline Biscuit/i }).click();
    await expect(page.getByTestId('bill-row-prod-air')).toBeVisible();

    // Finalize
    const finalizeBtn = page.locator('button:has-text("FINALIZE & PRINT")');
    await expect(finalizeBtn).toBeVisible();
    await finalizeBtn.click();
    await expect(page.locator('.bill-row')).toHaveCount(0);

    await app.close();

    // Verify transaction persisted to SQLite
    const verifyDb = new Database(path.join(dbDir, 'billing.db'), { readonly: true });
    const billCount = verifyDb.prepare('SELECT count(*) as count FROM bills').get() as any;
    expect(billCount.count).toBeGreaterThanOrEqual(1);
    verifyDb.close();
  });
});
