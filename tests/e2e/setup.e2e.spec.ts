import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

test.describe.serial('First Launch Setup E2E (Standalone Mode)', () => {
  let app: any;
  let page: any;
  let db: any;

  test.afterEach(async () => {
    if (db) {
      db.close();
      db = null;
    }
    if (app) {
      await app.close();
      app = null;
    }
  });

  test('Fresh app opens Welcome, validates store name, and completes setup directly without activation', async () => {
    test.setTimeout(60000);
    // Launch app
    app = await electron.launch({ 
      args: ['tests/e2e/test-entry.js']
    });
    page = await app.firstWindow();

    // Clear settings to simulate fresh install
    const userDataPath = await app.evaluate(({ app }: any) => app.getPath('userData'));
    const Database = require('better-sqlite3');
    db = new Database(path.join(userDataPath, 'mini-erp-data', 'billing.db'));
    db.exec('DELETE FROM settings; DELETE FROM products;'); // Ensure no existing install heuristic triggers

    // Reload to apply fresh state
    await page.reload();

    // 1. Welcome Screen
    await expect(page.getByRole('heading', { name: 'Welcome to Mini POS' })).toBeVisible();
    await page.getByRole('button', { name: 'Get Started' }).click();

    // 2. Store Setup Screen
    await expect(page.getByRole('heading', { name: 'Set up your store' })).toBeVisible();
    const storeInput = page.getByLabel('Store name');
    await expect(storeInput).toBeVisible();

    // Test validation
    const continueBtn = page.getByRole('button', { name: 'Continue' });
    await expect(continueBtn).toBeDisabled();
    
    await storeInput.fill('   ');
    await expect(continueBtn).toBeDisabled(); // Trims to empty

    await storeInput.fill('E2E Test Store');
    await expect(continueBtn).toBeEnabled();
    
    await continueBtn.click();

    // 3. Complete Setup directly (No license activation screen!)
    await expect(page.getByRole('heading', { name: 'You\'re all set.' })).toBeVisible();
    await expect(page.getByText('Activate Mini POS to start billing.')).toBeHidden();

    // 4. Complete Setup and enter POS
    await page.getByRole('button', { name: 'Open Mini POS' }).click();

    // 5. Normal POS starts immediately
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(input).toBeVisible();
  });

  test('Restarting after completion skips onboarding directly into POS', async () => {
    app = await electron.launch({ args: ['tests/e2e/test-entry.js'] });
    page = await app.firstWindow();

    // Because it shares the userData with the previous test run, it should skip setup.
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(input).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to Mini POS' })).toBeHidden();
  });
});
