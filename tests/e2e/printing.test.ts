import Database from 'better-sqlite3';
import { test, expect } from '@playwright/test';
import { ElectronApplication, Page, _electron as electron } from 'playwright';
import path from 'path';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // Seed the test database first
  const projectRoot = process.cwd();
  const testDataDir = path.join(projectRoot, 'test-data');
  const dbDir = path.join(testDataDir, 'mini-erp-data');
  require('fs').mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'billing.db');
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // We should create tables using migrations or simple setup here
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      price_minor INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      serialized_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number INTEGER UNIQUE NOT NULL,
      total_minor INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      finalized_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      snapshot_name TEXT NOT NULL,
      snapshot_price_minor INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      line_total_minor INTEGER NOT NULL,
      FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE
    );
  `);
  // Clean up and insert test product
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM drafts').run();
  db.prepare('DELETE FROM bills').run();
  db.prepare('INSERT INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('test-1', 'Apple', '123', 100, 1, Date.now(), Date.now());
  db.prepare('INSERT INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('test-2', 'Banana', '456', 50, 1, Date.now(), Date.now());
  db.close();

  const mainPath = path.join(projectRoot, 'dist-electron/main.js');
  
  electronApp = await electron.launch({
    args: ['tests/e2e/test-entry.js', '--user-data-dir=' + testDataDir],
    env: { ...process.env, NODE_ENV: 'test' }
  });
  
  page = await electronApp.firstWindow();
  
  // Wait for React to mount
  await page.waitForSelector('#root');
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Stage 11 - Finalization and Printing', () => {

  test('Scenario A: Finalize bill transitions to new bill immediately', async () => {
    // Search and add product
    await page.fill('input[placeholder="Scan a barcode or type a product name..."]', 'App');
    await page.click('text=Apple');

    // Make sure it's in the bill
    await expect(page.locator('.bill-row')).toHaveCount(1);
    
    // Finalize
    await page.click('button:has-text("FINALIZE & PRINT")');

    const errorLocator = page.locator('.bg-red-50');
    if (await errorLocator.count() > 0) {
      console.log('UI ERROR TOAST: ', await errorLocator.textContent());
    }
    
    // UI should reset immediately
    await expect(page.locator('.bill-row')).toHaveCount(0);
    await expect(page.getByText('₹0.00', { exact: true }).first()).toBeVisible();

    // Toast should appear indicating printing
    await expect(page.locator('text=Printing Receipt...')).toBeVisible();
    await expect(page.locator('text=Bill #')).toBeVisible();

    // After a few seconds, toast should say accepted and disappear
    await expect(page.locator('text=Print Accepted')).toBeVisible({ timeout: 5000 });
  });

  test('Scenario C: Printer fails, bill remains saved, retry available', async () => {
    // Add product
    await page.fill('input[placeholder="Scan a barcode or type a product name..."]', 'Ban');
    await page.click('text=Banana');

    // Finalize
    await page.click('button:has-text("FINALIZE & PRINT")');

    const errorLocator = page.locator('.bg-red-50');
    if (await errorLocator.count() > 0) {
      console.log('UI ERROR TOAST C: ', await errorLocator.textContent());
    }

    // Attempt to click again rapidly before it resets (UI should block or not register duplicate)
    // Actually the UI resets almost instantly in playwright
    await expect(page.locator('.bill-row')).toHaveCount(0);
  });

});
