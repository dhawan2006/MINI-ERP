import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import Database from 'better-sqlite3';

/**
 * Stage 10: Barcode Scanner Input Pipeline E2E Tests
 * 
 * These tests verify the full scanner → IPC → domain → persistence → UI pipeline.
 * 
 * IMPORTANT: Electron Playwright tests use a shared `page` from `test.beforeAll`.
 * DO NOT destructure `{ page }` from test function parameters — that gives
 * a default Chromium fixture page, NOT the Electron window.
 * 
 * Scanner simulation: We dispatch KeyboardEvent('keydown') directly on window
 * within a single page.evaluate call. All characters arrive with the same
 * Date.now() timestamp, which always satisfies the timing heuristic (avg = 0ms).
 */

test.describe.serial('Stage 10: Barcode Scanner Input Pipeline', () => {
  let app: any;
  let page: any;
  let db: any;

  test.beforeAll(async () => {
    app = await electron.launch({ args: ['tests/e2e/test-entry.js'] });
    page = await app.firstWindow();
    
    // Seed test database
    const userDataPath = await app.evaluate(({ app }: any) => app.getPath('userData'));
    const dbDir = path.join(userDataPath, 'mini-erp-data');
    if (!require('fs').existsSync(dbDir)) {
      require('fs').mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(path.join(dbDir, 'billing.db'));
    
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

    // Clear any existing draft and reload to pick up seeded data
    await page.evaluate(async () => {
      await (window as any).api.billing.clear();
    });
    await page.reload();
    await page.waitForSelector('input[placeholder="Scan a barcode or type a product name..."]');
  });

  test.afterAll(async () => {
    if (db) {
      db.prepare(`DELETE FROM products WHERE id IN ('test-p1', 'test-p2')`).run();
      db.close();
    }
    await app.close();
  });

  test.beforeEach(async () => {
    // Clear billing state before each test
    await page.evaluate(async () => {
      await (window as any).api.billing.clear();
    });
    // Reload to ensure Zustand syncs with cleared main-process state
    await page.reload();
    await page.waitForSelector('input[placeholder="Scan a barcode or type a product name..."]');
  });

  /**
   * Simulate a USB keyboard-wedge scanner input.
   * Dispatches all barcode characters + Enter suffix as KeyboardEvent('keydown')
   * on the window object within a single synchronous page.evaluate call.
   * All events share the same Date.now() timestamp → avg time per char ≈ 0ms,
   * which always passes the timing heuristic.
   */
  const simulateScan = async (barcode: string) => {
    await page.evaluate((bc: string) => {
      const dispatchKey = (key: string) => {
        const event = new KeyboardEvent('keydown', {
          key: key,
          code: key.match(/[0-9]/) ? `Digit${key}` : (key === 'Enter' ? 'Enter' : `Key${key.toUpperCase()}`),
          bubbles: true,
          cancelable: true
        });
        window.dispatchEvent(event);
      };

      for (const char of bc) {
        dispatchKey(char);
      }
      dispatchKey('Enter');
    }, barcode);
    
    // Allow IPC round-trip and React re-render
    await page.waitForTimeout(500);
  };

  // ─────────────────────────────────────────────────────────
  // Test A: One physical-like scan → product appears in bill
  // ─────────────────────────────────────────────────────────
  test('Test A: One physical-like scan', async () => {
    await simulateScan('12345'); // Test Coke

    const row = page.locator('[data-testid="bill-row-test-p1"]');
    await expect(row).toBeVisible({ timeout: 5000 });
    await expect(row.locator('.product-name')).toHaveText('Test Coke');
  });

  // ─────────────────────────────────────────────────────────
  // Test B: Ten different scans (alternating two products)
  // ─────────────────────────────────────────────────────────
  test('Test B: Ten different scans', async () => {
    for (let i = 0; i < 5; i++) {
      await simulateScan('12345');
      await simulateScan('67890');
    }

    const coke = page.locator('[data-testid="bill-row-test-p1"]');
    const water = page.locator('[data-testid="bill-row-test-p2"]');
    await expect(coke).toBeVisible();
    await expect(water).toBeVisible();
    await expect(coke.locator('.qty-display')).toHaveText('5');
    await expect(water.locator('.qty-display')).toHaveText('5');
  });

  // ─────────────────────────────────────────────────────────
  // Test C: Five repeated scans → merged to ×5
  // ─────────────────────────────────────────────────────────
  test('Test C: Five repeated scans', async () => {
    for (let i = 0; i < 5; i++) {
      await simulateScan('12345');
    }

    const row = page.locator('[data-testid="bill-row-test-p1"]');
    await expect(row).toBeVisible();
    await expect(row.locator('.qty-display')).toHaveText('5');
    
    // Only one row
    const rows = page.locator('[data-testid^="bill-row-"]');
    await expect(rows).toHaveCount(1);
  });

  // ─────────────────────────────────────────────────────────
  // Test D: Unknown barcode → valid barcode
  // ─────────────────────────────────────────────────────────
  test('Test D: Unknown barcode followed by valid barcode', async () => {
    // Valid scan
    await simulateScan('12345');
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).toBeVisible();

    // Unknown scan — bill unchanged
    await simulateScan('UNKNOWN999');
    const rows = page.locator('[data-testid^="bill-row-"]');
    await expect(rows).toHaveCount(1);

    // Another valid scan — recovers immediately
    await simulateScan('67890');
    await expect(page.locator('[data-testid="bill-row-test-p2"]')).toBeVisible();
    await expect(rows).toHaveCount(2);
  });

  // ─────────────────────────────────────────────────────────
  // Test E: Scanner while search input has focus
  // ─────────────────────────────────────────────────────────
  test('Test E: Scanner while search has focus', async () => {
    const searchInput = page.locator('input[placeholder="Scan a barcode or type a product name..."]');
    await searchInput.focus();
    
    await simulateScan('12345');

    // Product added despite search having focus
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────
  // Test F: Scanner while another UI element has focus
  // ─────────────────────────────────────────────────────────
  test('Test F: Scanner while another UI element has focus', async () => {
    // Click on the bill panel area to move focus away from search
    await page.locator('.bg-slate-50').first().click();

    await simulateScan('67890');

    await expect(page.locator('[data-testid="bill-row-test-p2"]')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────
  // Test G: Scanner during quantity edit
  // ─────────────────────────────────────────────────────────
  test('Test G: Scanner during quantity edit', async () => {
    // Add item first
    await simulateScan('12345');
    const row = page.locator('[data-testid="bill-row-test-p1"]');
    await expect(row).toBeVisible();

    // Double click quantity to open editor
    const qtyDisplay = row.locator('.qty-display');
    await qtyDisplay.dblclick();

    const qtyInput = row.locator('input[type="number"]');
    await expect(qtyInput).toBeVisible();

    // Type a new quantity value
    await qtyInput.fill('10');

    // Scan a new product while quantity editor is open
    await simulateScan('67890');

    // New product should be added
    await expect(page.locator('[data-testid="bill-row-test-p2"]')).toBeVisible();

    // Quantity editor should have closed (blurred by scanner)
    await expect(qtyInput).not.toBeVisible({ timeout: 2000 });
  });

  // ─────────────────────────────────────────────────────────
  // Test H: Rapid mixed scan sequence (stress test)
  // ─────────────────────────────────────────────────────────
  test('Test H: Rapid mixed scan sequence', async () => {
    const scans = [
      '12345',      // Coke
      '67890',      // Water
      '12345',      // Coke
      'UNKNOWN123', // Invalid
      '12345',      // Coke
      '67890'       // Water
    ];

    for (const barcode of scans) {
      await simulateScan(barcode);
    }

    const coke = page.locator('[data-testid="bill-row-test-p1"]');
    const water = page.locator('[data-testid="bill-row-test-p2"]');
    await expect(coke.locator('.qty-display')).toHaveText('3');
    await expect(water.locator('.qty-display')).toHaveText('2');

    // Only 2 rows (no phantom row for unknown)
    const rows = page.locator('[data-testid^="bill-row-"]');
    await expect(rows).toHaveCount(2);
  });

  // ─────────────────────────────────────────────────────────
  // Test I: Scanner after undo
  // ─────────────────────────────────────────────────────────
  test('Test I: Scanner after undo', async () => {
    await simulateScan('12345');
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).toBeVisible();

    // Undo via IPC (Ctrl+Z may be intercepted differently in Electron tests)
    await page.evaluate(async () => {
      await (window as any).api.billing.undo();
    });
    // Reload to sync Zustand with main-process state
    await page.reload();
    await page.waitForSelector('input[placeholder="Scan a barcode or type a product name..."]');

    // Bill should be empty after undo
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).not.toBeVisible();

    // Scan again — should work
    await simulateScan('12345');
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────
  // Test J: Scanner after clear
  // ─────────────────────────────────────────────────────────
  test('Test J: Scanner after clear', async () => {
    await simulateScan('12345');
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).toBeVisible();

    // Clear via IPC
    await page.evaluate(async () => {
      await (window as any).api.billing.clear();
    });
    await page.reload();
    await page.waitForSelector('input[placeholder="Scan a barcode or type a product name..."]');

    // Bill should be empty
    await expect(page.locator('[data-testid="bill-row-test-p1"]')).not.toBeVisible();

    // Scan — should work
    await simulateScan('67890');
    await expect(page.locator('[data-testid="bill-row-test-p2"]')).toBeVisible();
  });
});
