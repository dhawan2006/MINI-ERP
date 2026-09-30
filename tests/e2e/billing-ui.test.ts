import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import Database from 'better-sqlite3';

test.describe.serial('Stage 9 Billing UI (Cashier Tasks A-I)', () => {
  let app: any;
  let page: any;
  let db: any;

  test.beforeAll(async () => {
    // We connect to the test db directly to seed a product
    // Note: The app uses 'mini-erp-dev.sqlite' or similar depending on NODE_ENV. 
    // In playwright, typically NODE_ENV is test, but let's just insert into the dev DB or whatever is used.
    // For safety, let's just use the app's default db path or assume `mini-erp.sqlite`
    // Actually, looking at main.ts, it uses `app.getPath('userData') + '/mini-erp.sqlite'`
    // To make it deterministic, we'll launch the app, which creates the DB, and then we could insert via an IPC test helper or direct SQLite.
    // But since userData path is dynamic in playwright, it's easier to just mock the IPC for the UI test or just rely on the UI to test itself.
    // Wait, the requirements state: "Use seeded database records only for development/testing." "Do NOT mock the ProductRepository from the renderer."
    // Let's seed via a Node process before launching the app, but we don't know the exact userData path Playwright uses. 
    // Playwright Electron tests share the local userData unless overridden. Let's assume it's `./mini-erp.sqlite` if running locally, or `app.getPath('userData')`.
    app = await electron.launch({ args: ['tests/e2e/test-entry.js'] });
    page = await app.firstWindow();

    // Since we can't easily seed the Electron DB from the playwright Node context without knowing the path, 
    // let's use page.evaluate to trigger a seed if we expose a test hook, OR we can just use the DB connection path by getting it from the app context.
    const userDataPath = await app.evaluate(({ app }: any) => app.getPath('userData'));
    const dbDir = path.join(userDataPath, 'mini-erp-data');
    if (!require('fs').existsSync(dbDir)) {
      require('fs').mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(path.join(dbDir, 'billing.db'));
    
    // Seed product for test
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        barcode TEXT,
        price_minor INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const now = Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at)
      VALUES 
        ('test-p1', 'Test Coke', '12345', 4000, 1, ${now}, ${now}),
        ('test-p2', 'Test Water', '67890', 2000, 1, ${now}, ${now})
    `).run();

    // Ensure bill is clear before starting
    await page.evaluate(async () => {
      // @ts-ignore
      await window.api.billing.clear();
    });
    // Reload page to reset state
    await page.reload();
  });

  test.afterAll(async () => {
    if (db) {
      db.prepare(`DELETE FROM products WHERE id IN ('test-p1', 'test-p2')`).run();
      db.close();
    }
    await app.close();
  });

  test('Task A: Launch application -> input focused', async () => {
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('Task B: Add one product -> item appears', async () => {
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await input.fill('Test Coke');

    // Wait for search results
    const result = page.getByRole('button', { name: /Test Coke/i });
    await expect(result).toBeVisible();
    await result.click();

    // Should appear in bill
    await expect(page.getByTestId('bill-row-test-p1')).toBeVisible();
    await expect(page.getByText('₹40.00').first()).toBeVisible(); // 4000 paise
    await expect(input).toBeFocused(); // Focus should return to input
  });

  test('Task E: Add same product repeatedly -> merged quantity', async () => {
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await input.fill('Coke');

    const result = page.getByRole('button', { name: /Test Coke/i });
    await expect(result).toBeVisible();
    await result.click();

    // Quantity should now be 2, total 80
    await expect(page.getByText('₹80.00').first()).toBeVisible();
    
    // We expect a "2" somewhere in that row
    const qtyElement = page.locator('text=2').first();
    await expect(qtyElement).toBeVisible();
  });

  test('Task C: Add three products -> correct items and total', async () => {
    const input = page.getByPlaceholder('Scan a barcode or type a product name...');
    await input.fill('Test Water');
    const result = page.getByRole('button', { name: /Test Water/i });
    await result.click();

    await expect(page.locator('.bill-row', { hasText: 'Test Water' }).first()).toBeVisible();
    // Total should be 80 + 20 = 100
    await expect(page.locator('text=₹100.00').first()).toBeVisible();
  });

  test('Task F: Remove item -> authoritative result updates UI', async () => {
    // Select Test Water by clicking its row
    await page.locator('.bill-row', { hasText: 'Test Water' }).first().click();
    
    // Press Delete to remove
    await page.keyboard.press('Delete');

    // Test Water should be gone
    await expect(page.locator('.bill-row', { hasText: 'Test Water' }).first()).toBeHidden();
    // Total should be back to 80
    await expect(page.locator('text=₹80.00').first()).toBeVisible();
  });

  test('Task G: Change quantity', async () => {
    // Click quantity to edit quantity of Coke
    await page.locator('.qty-display').first().click();
    
    // Fill new quantity (5)
    await page.locator('input[data-context="quantity-editor"]').fill('5');
    await page.keyboard.press('Enter');

    // Total should be 5 * 40 = 200
    await expect(page.locator('text=₹200.00').first()).toBeVisible();
  });

  test('Task H: Undo', async () => {
    // Trigger undo directly from the UI state to ensure React updates
    // Press Control+Z (or Meta+Z) to trigger undo via keyboard shortcut
    await page.keyboard.press('Control+z');
    
    // Should revert quantity change
    await expect(page.locator('text=₹80.00').first()).toBeVisible();
  });

  test('Task I: Clear bill', async () => {
    // Escape for VOID/CLEAR (Double-Tap)
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await expect(page.getByText('No items in current bill')).toBeVisible();
    await expect(page.getByText('₹0.00', { exact: true }).first()).toBeVisible();
  });
});
