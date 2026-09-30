import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'path';

test.describe('Product Management (E2E)', () => {
  let electronApp: any;
  let window: any;

  test.beforeEach(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: ['tests/e2e/test-entry.js'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MINIPOS_E2E_TEST: 'true',
      },
    });
    window = await electronApp.firstWindow();
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('can navigate to products, create a product, and search it in billing', async () => {
    // Navigate to Products
    await window.click('button:has-text("Products")');
    await expect(window.locator('h2', { hasText: 'Product Catalog' })).toBeVisible();

    // Open Add Product
    await window.click('button:has-text("+ Add Product")');
    await expect(window.locator('h2', { hasText: 'Add Product' })).toBeVisible();

    // Create a new product
    const uniqueBarcode = `E2E${Date.now()}`;
    await window.fill('input#barcode', uniqueBarcode);
    await window.fill('input#name', 'Test E2E Product');
    await window.fill('input#price', '15.50');
    await window.click('button:has-text("Save")');

    // Wait for the modal to close and the product to appear in the list
    await expect(window.locator('h2', { hasText: 'Add Product' })).toBeHidden();
    
    // Search the product in the catalog
    await window.fill('input[placeholder*="Search products..."]', uniqueBarcode);
    await expect(window.locator('td', { hasText: 'Test E2E Product' }).first()).toBeVisible();
    await expect(window.locator('td', { hasText: '15.50' }).first()).toBeVisible();

    // Navigate to Billing
    // We can use Meta+B (Mac) or Control+B (Win/Linux)
    const isMac = process.platform === 'darwin';
    await window.keyboard.press(isMac ? 'Meta+b' : 'Control+b');
    // Wait for Billing to appear
    await expect(window.locator('h1', { hasText: 'Mini POS' })).toBeVisible();

    await window.fill('input[placeholder*="Scan a barcode or type a product name..."]', uniqueBarcode);
    
    // Should see the product in search results
    await expect(window.locator('button', { hasText: 'Test E2E Product' }).first()).toBeVisible();
    await expect(window.locator('div', { hasText: '15.50' }).first()).toBeVisible();
  });
});
