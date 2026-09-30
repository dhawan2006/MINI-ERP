import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { Pool } from 'pg';

const TEST_LICENSE_KEY = 'Z5QHH-AVBH7-ZT0NZ';
const TEST_LICENSE_ID = '266c9e29-12ed-4ed4-849f-e114fdc5d122';

test.describe.serial('REAL Licensing Activation E2E - Golden Path', () => {
  let app: any;
  let page: any;
  let userDataPath: string;
  let dbPool: Pool;

  test.beforeAll(async () => {
    // Setup PG pool to verify server DB
    dbPool = new Pool({
      connectionString: 'postgres://laksh@localhost:5432/minipos_licensing_qa'
    });

    const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');

    const testUserData = path.join(process.cwd(), 'test-data', 'real-e2e-userdata');
    if (fs.existsSync(testUserData)) fs.rmSync(testUserData, { recursive: true, force: true });
    
    // Launch the REAL electron app, NOT the mocked entry
    app = await electron.launch({
      args: ['dist-electron/main.js', `--user-data-dir=${testUserData}`],
      env: {
        ...process.env,
        MINIPOS_E2E_TEST: 'true',
        MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
        LICENSING_SERVER_URL: 'http://localhost:3456',
        NODE_ENV: 'qa',
        LICENSING_SERVER_KEY_ID: 'qa-key-1',
        LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
      }
    });
    
    app.on('console', (msg: any) => {
      console.log(`[MAIN CONSOLE] ${msg.type()}: ${msg.text()}`);
    });
    
    userDataPath = testUserData;
    console.log(`[TEST] using user data path: ${userDataPath}`);
    
    page = await app.firstWindow();
    page.on('console', (msg: any) => console.log(`[RENDERER CONSOLE] ${msg.type()}: ${msg.text()}`));
  });

  test.afterAll(async () => {
    await app.close();
    await dbPool.end();
  });

  test('L1: App starts in NOT_ACTIVATED state and shows Activation UI', async () => {
    await expect(page.getByText('Activate Mini POS')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX')).toBeVisible();
  });

  test('L2: Real license activation succeeds and transitions to normal POS', async () => {
    const input = page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX');
    await input.fill(TEST_LICENSE_KEY);
    await page.getByRole('button', { name: 'Activate Device' }).click();

    // Check for any UI errors
    const errorAlert = page.getByText('Activation Failed');
    if (await errorAlert.isVisible({ timeout: 5000 }).catch(() => false)) {
      const errorText = await page.locator('.text-red-800').textContent();
      console.log(`[UI ERROR] ${errorText}`);
      throw new Error(`Activation failed in UI: ${errorText}`);
    }
    
    // POS UI should appear (e.g. barcode scanner)
    await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 20000 });
    
    // 17. Verify authorization.json exists on disk
    const authPath = path.join(userDataPath, 'licensing', 'authorization.json');
    expect(fs.existsSync(authPath)).toBe(true);
    
    const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    expect(authData.licenseId).toBe(TEST_LICENSE_ID);
    expect(authData.signature).toBeDefined();
    
    // 15. Database post-activation verification
    const bindResult = await dbPool.query('SELECT * FROM license_bindings WHERE license_id = $1', [TEST_LICENSE_ID]);
    expect(bindResult.rows.length).toBe(1);
    expect(bindResult.rows[0].device_key_id).toBe(authData.deviceKeyId);
  });

  test('L3: Billing operates successfully after real activation', async () => {
    // We insert a product into the REAL SQLite DB
    const dbDir = path.join(userDataPath, 'mini-erp-data');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const db = new Database(path.join(dbDir, 'billing.db'));
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
      VALUES ('test-real-p1', 'Real Coke', '123456', 5000, 1, ${now}, ${now})
    `).run();
    db.close();

    // Reload page to pick up products
    await page.reload();
    
    await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 15000 });
    const reloadInput = page.getByPlaceholder('Scan a barcode or type a product name...');
    await reloadInput.fill('Real Coke');

    const result = page.getByRole('button', { name: /Real Coke/i });
    await expect(result).toBeVisible();
    await result.click();

    await expect(page.getByText('₹50.00').first()).toBeVisible();
    
    // Finalize
    await page.getByRole('button', { name: 'Finalize & Print' }).click();
    
    // Verify toast or clear
    await expect(page.getByText('No items in current bill')).toBeVisible();
  });
  test('L4: Restart app, verify it bypasses activation screen', async () => {
    await app.close();

    const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');

    app = await electron.launch({
      args: ['dist-electron/main.js', `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        MINIPOS_E2E_TEST: 'true',
        MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
        LICENSING_SERVER_URL: 'http://localhost:3456',
        NODE_ENV: 'qa',
        LICENSING_SERVER_KEY_ID: 'qa-key-1',
        LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
      }
    });

    app.on('console', (msg: any) => {
      console.log(`[MAIN CONSOLE L4] ${msg.type()}: ${msg.text()}`);
    });

    page = await app.firstWindow();
    
    // Should immediately go to POS UI
    await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 20000 });
  });

  test('L5: Offline operation, verify it continues to work', async () => {
    await app.close();

    const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');

    // Launch with an invalid URL to simulate offline/server down
    app = await electron.launch({
      args: ['dist-electron/main.js', `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        MINIPOS_E2E_TEST: 'true',
        MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
        LICENSING_SERVER_URL: 'http://localhost:9999', // INVALID URL
        NODE_ENV: 'qa',
        LICENSING_SERVER_KEY_ID: 'qa-key-1',
        LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
      }
    });

    app.on('console', (msg: any) => {
      console.log(`[MAIN CONSOLE L5] ${msg.type()}: ${msg.text()}`);
    });

    page = await app.firstWindow();
    
    // Should immediately go to POS UI despite offline
    await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 20000 });
  });
  test('L6: Adversarial - Modifying authorization.json triggers INVALID_AUTHORIZATION', async () => {
    await app.close();
    
    // Read and tamper with the file
    const authPath = path.join(userDataPath, 'licensing', 'authorization.json');
    const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    
    // Tamper with validUntil to extend it artificially
    authData.validUntil = '2099-12-31T23:59:59Z';
    fs.writeFileSync(authPath, JSON.stringify(authData), 'utf8');

    const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');

    app = await electron.launch({
      args: ['dist-electron/main.js', `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        MINIPOS_E2E_TEST: 'true',
        MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
        LICENSING_SERVER_URL: 'http://localhost:3456',
        NODE_ENV: 'qa',
        LICENSING_SERVER_KEY_ID: 'qa-key-1',
        LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
      }
    });

    app.on('console', (msg: any) => {
      console.log(`[MAIN CONSOLE L6] ${msg.type()}: ${msg.text()}`);
    });

    page = await app.firstWindow();
    
    // Because signature verification fails, we should be kicked back to Activation UI
    await expect(page.getByText('Activate Mini POS')).toBeVisible({ timeout: 20000 });
  });

  test('L7: Erroneous - Corrupt authorization.json triggers INVALID_AUTHORIZATION', async () => {
    await app.close();
    
    const authPath = path.join(userDataPath, 'licensing', 'authorization.json');
    // Write complete garbage
    fs.writeFileSync(authPath, '{{corrupt json!!}}', 'utf8');

    const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');

    app = await electron.launch({
      args: ['dist-electron/main.js', `--user-data-dir=${userDataPath}`],
      env: {
        ...process.env,
        MINIPOS_E2E_TEST: 'true',
        MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
        LICENSING_SERVER_URL: 'http://localhost:3456',
        NODE_ENV: 'qa',
        LICENSING_SERVER_KEY_ID: 'qa-key-1',
        LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
      }
    });

    app.on('console', (msg: any) => {
      console.log(`[MAIN CONSOLE L7] ${msg.type()}: ${msg.text()}`);
    });

    page = await app.firstWindow();
    
    // Should fallback to Activation UI
    await expect(page.getByText('Activate Mini POS')).toBeVisible({ timeout: 20000 });
  });
});
