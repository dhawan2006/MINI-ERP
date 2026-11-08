import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe.serial('Standalone POS Regression Suite (Licensing System Fully Removed)', () => {
  let app: any;
  let page: any;
  let tempUserData: string;

  test.beforeAll(() => {
    tempUserData = path.join(__dirname, '..', 'temp', 'standalone-test-' + Date.now());
    fs.mkdirSync(tempUserData, { recursive: true });
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  test.afterAll(() => {
    try {
      fs.rmSync(tempUserData, { recursive: true, force: true });
    } catch {}
  });

  test('A. Application starts cleanly into standalone flow without activation or licensing server', async () => {
    test.setTimeout(60000);
    app = await electron.launch({
      args: ['tests/e2e/test-entry.js', `--user-data-dir=${tempUserData}`]
    });
    page = await app.firstWindow();

    // Verify window opened
    expect(page).toBeDefined();

    // Verify absence of any licensing UI
    await expect(page.getByText('Activate License')).toBeHidden();
    await expect(page.getByText('Enter License Key')).toBeHidden();
    await expect(page.getByText('Verify Now')).toBeHidden();
    await expect(page.getByText('License Expired')).toBeHidden();
    await expect(page.getByText('Offline Lease')).toBeHidden();
    await expect(page.getByText('Grace Period')).toBeHidden();
  });

  test('B. Legacy licensing files (authorization.json and runtime_state.json) do not block or crash startup', async () => {
    test.setTimeout(60000);

    // Place dummy legacy files into licensing folder
    const legacyLicensingDir = path.join(tempUserData, 'licensing');
    fs.mkdirSync(legacyLicensingDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyLicensingDir, 'authorization.json'),
      JSON.stringify({ legacy: 'corrupt-or-expired-data', validUntil: '2020-01-01' })
    );
    fs.writeFileSync(
      path.join(legacyLicensingDir, 'runtime_state.json'),
      JSON.stringify({ state: 'EXPIRED', leaseExpiresAt: '2020-01-01' })
    );

    app = await electron.launch({
      args: ['tests/e2e/test-entry.js', `--user-data-dir=${tempUserData}`]
    });
    page = await app.firstWindow();

    // Application should still start cleanly and not fail-closed
    expect(page).toBeDefined();
    await expect(page.getByText('Activate License')).toBeHidden();
    await expect(page.getByText('License Expired')).toBeHidden();
  });

  test('C. POS Billing operates completely without licensing verification or gates', async () => {
    test.setTimeout(60000);

    // Use initDatabase to set up full SQLite schema properly
    const { initDatabase } = require('../../src/infrastructure/database/connection');
    const db = initDatabase(tempUserData);
    
    const now = Date.now();
    // Ensure setup is marked completed so we go directly to billing
    db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at) 
      VALUES ('store_profile', '{"shopName":"Standalone POS Store","status":"COMPLETED"}', ?);
    `).run(now);

    db.prepare(`
      INSERT OR REPLACE INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at)
      VALUES ('p-100', 'Organic Coffee', '1234567890', 4500, 1, ?, ?);
    `).run(now, now);
    db.close();

    app = await electron.launch({
      args: ['tests/e2e/test-entry.js', `--user-data-dir=${tempUserData}`]
    });
    page = await app.firstWindow();

    // Main POS screen should be directly visible
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(input).toBeVisible();

    // Type product name to search
    await input.fill('Organic Coffee');

    // Wait for dropdown result button and click it to add to bill
    const productOption = page.getByRole('button', { name: /Organic Coffee/i });
    await expect(productOption).toBeVisible();
    await productOption.click();

    // Item should appear in bill table
    await expect(page.getByTestId('bill-row-p-100')).toBeVisible();

    // Finalize bill without any licensing gate restriction
    const finalizeBtn = page.getByRole('button', { name: /Finalize Bill/i });
    if (await finalizeBtn.isVisible()) {
      await finalizeBtn.click();
    }
  });

  test('D. Zero outbound network requests to licensing servers', async () => {
    test.setTimeout(60000);
    const licensingRequests: string[] = [];

    app = await electron.launch({
      args: ['tests/e2e/test-entry.js', `--user-data-dir=${tempUserData}`]
    });
    page = await app.firstWindow();

    page.on('request', (request: any) => {
      const url = request.url();
      if (url.includes('license') || url.includes('checkin') || url.includes('activate') || url.includes('lease')) {
        licensingRequests.push(url);
      }
    });

    await page.waitForTimeout(2000);

    // No licensing requests should have been attempted
    expect(licensingRequests).toEqual([]);
  });
});
