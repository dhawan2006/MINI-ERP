import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

test.describe.serial('First Launch Setup E2E', () => {
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

  test('Fresh app opens Welcome, validates store name, and completes setup', async () => {
    test.setTimeout(60000);
    // Launch app
    app = await electron.launch({ 
      args: ['tests/e2e/test-entry.js'],
      env: { ...process.env, SKIP_MOCK_LICENSE: 'true' }
    });
    page = await app.firstWindow();

    // Clear settings to simulate fresh install
    const userDataPath = await app.evaluate(({ app }: any) => app.getPath('userData'));
    const Database = require('better-sqlite3');
    db = new Database(path.join(userDataPath, 'mini-erp-data', 'billing.db'));
    db.exec('DELETE FROM settings; DELETE FROM products;'); // Ensure no existing install heuristic triggers
    
    const fs = require('fs');
    try { fs.unlinkSync(path.join(userDataPath, 'licensing', 'authorization.json')); } catch(e) {}

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

    // 3. Activation Screen (wrapped in SetupActivationScreen)
    await expect(page.getByRole('heading', { name: 'Almost ready' })).toBeVisible();
    await expect(page.getByText('Activate Mini POS to start billing.')).toBeVisible();

    // Restart app without SKIP_MOCK_LICENSE to mock the activation
    const currentUserDataPath = await app.evaluate(({ app }: any) => app.getPath('userData'));
    await app.close();
    app = await electron.launch({ 
      args: ['tests/e2e/test-entry.js', `--user-data-dir=${currentUserDataPath}`] 
    });
    page = await app.firstWindow();

    // The status is ACTIVE, so it should jump to Complete Screen
    await expect(page.getByRole('heading', { name: 'You\'re all set.' })).toBeVisible();

    // 4. Complete Setup
    await page.getByRole('button', { name: 'Open Mini POS' }).click();

    // 5. Normal POS starts
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(input).toBeVisible();
  });

  test('Restarting after completion skips onboarding', async () => {
    app = await electron.launch({ args: ['tests/e2e/test-entry.js'] });
    page = await app.firstWindow();

    // Because it shares the userData with the previous test run, it should skip setup.
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(input).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to Mini POS' })).toBeHidden();
  });
});
