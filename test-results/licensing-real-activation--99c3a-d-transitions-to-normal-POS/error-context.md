# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: licensing-real/activation-real.spec.ts >> REAL Licensing Activation E2E - Golden Path >> L2: Real license activation succeeds and transitions to normal POS
- Location: tests/e2e/licensing-real/activation-real.spec.ts:91:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByPlaceholder('Scan a barcode or type a product name...')
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByPlaceholder('Scan a barcode or type a product name...') with timeout 20000ms
  - waiting for getByPlaceholder('Scan a barcode or type a product name...')

```

```yaml
- heading "Activate Mini POS" [level=1]
- paragraph: Please enter your license key to activate this device.
- heading "Activation Failed" [level=3]
- paragraph: Failed to activate license.
- text: License Key
- textbox "License Key":
  - /placeholder: XXXX-XXXX-XXXX-XXXX
  - text: Z5QHH-AVBH7-ZT0NZ
- button "Activate Device"
- paragraph: Activation securely binds this device using hardware-backed identity.
```

# Test source

```ts
  5   | import { Pool } from 'pg';
  6   | 
  7   | const TEST_LICENSE_KEY = 'Z5QHH-AVBH7-ZT0NZ';
  8   | const TEST_LICENSE_ID = '266c9e29-12ed-4ed4-849f-e114fdc5d122';
  9   | 
  10  | test.describe.serial('REAL Licensing Activation E2E - Golden Path', () => {
  11  |   let app: any;
  12  |   let page: any;
  13  |   let userDataPath: string;
  14  |   let dbPool: Pool;
  15  | 
  16  |   test.beforeAll(async () => {
  17  |     // Setup PG pool to verify server DB
  18  |     dbPool = new Pool({
  19  |       connectionString: 'postgres://postgres:postgres@localhost:54322/postgres'
  20  |     });
  21  | 
  22  |     const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');
  23  | 
  24  |     const testUserData = path.join(process.cwd(), 'test-data', 'real-e2e-userdata');
  25  |     if (fs.existsSync(testUserData)) fs.rmSync(testUserData, { recursive: true, force: true });
  26  |     
  27  |     const hmacSecret = 'test-hmac-secret-32-chars-min-must-be-long-enough!';
  28  |     const canonicalKey = TEST_LICENSE_KEY.toUpperCase().replace(/[^A-Z0-9]/g, '');
  29  |     const hashedKey = require('crypto').createHmac('sha256', hmacSecret).update(canonicalKey).digest('hex');
  30  |     
  31  |     await dbPool.query('DELETE FROM licenses WHERE id = $1', [TEST_LICENSE_ID]);
  32  |     const insertRes = await dbPool.query(`
  33  |       INSERT INTO licenses (id, license_key_hmac, product_id, valid_from, valid_until, max_devices, status) 
  34  |       VALUES ($1, $2, 'PROD_1', NOW(), NOW() + interval '1 year', 5, 'ACTIVE')
  35  |       RETURNING id, license_key_hmac
  36  |     `, [TEST_LICENSE_ID, hashedKey]);
  37  |     console.log('[TEST DB] Inserted license:', insertRes.rows[0]);
  38  |     
  39  |     // Bypass Setup Flow by directly writing to SQLite
  40  |     const dbDir = path.join(testUserData, 'mini-erp-data');
  41  |     fs.mkdirSync(dbDir, { recursive: true });
  42  |     const localDb = new Database(path.join(dbDir, 'billing.db'));
  43  |     localDb.exec(`
  44  |       CREATE TABLE IF NOT EXISTS settings (
  45  |         key TEXT PRIMARY KEY,
  46  |         value TEXT NOT NULL,
  47  |         updated_at INTEGER NOT NULL
  48  |       )
  49  |     `);
  50  |     localDb.prepare(`
  51  |       INSERT OR REPLACE INTO settings (key, value, updated_at) 
  52  |       VALUES ('app_setup', '{"status":"COMPLETED"}', ${Date.now()})
  53  |     `).run();
  54  |     localDb.close();
  55  |     
  56  |     // Launch the REAL electron app, NOT the mocked entry
  57  |     app = await electron.launch({
  58  |       args: ['dist-electron/main.js', `--user-data-dir=${testUserData}`],
  59  |       env: {
  60  |         ...process.env,
  61  |         MINIPOS_E2E_TEST: 'true',
  62  |         MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
  63  |         LICENSING_SERVER_URL: 'http://localhost:54321/functions/v1/api',
  64  |         NODE_ENV: 'qa',
  65  |         LICENSING_SERVER_KEY_ID: 'qa-key-1',
  66  |         LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
  67  |       }
  68  |     });
  69  |     
  70  |     app.on('console', (msg: any) => {
  71  |       console.log(`[MAIN CONSOLE] ${msg.type()}: ${msg.text()}`);
  72  |     });
  73  |     
  74  |     userDataPath = testUserData;
  75  |     console.log(`[TEST] using user data path: ${userDataPath}`);
  76  |     
  77  |     page = await app.firstWindow();
  78  |     page.on('console', (msg: any) => console.log(`[RENDERER CONSOLE] ${msg.type()}: ${msg.text()}`));
  79  |   });
  80  | 
  81  |   test.afterAll(async () => {
  82  |     await app.close();
  83  |     await dbPool.end();
  84  |   });
  85  | 
  86  |   test('L1: App starts in NOT_ACTIVATED state and shows Activation UI', async () => {
  87  |     await expect(page.getByText('Activate Mini POS')).toBeVisible({ timeout: 10000 });
  88  |     await expect(page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX')).toBeVisible();
  89  |   });
  90  | 
  91  |   test('L2: Real license activation succeeds and transitions to normal POS', async () => {
  92  |     const input = page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX');
  93  |     await input.fill(TEST_LICENSE_KEY);
  94  |     await page.getByRole('button', { name: 'Activate Device' }).click();
  95  | 
  96  |     // Check for any UI errors
  97  |     const errorAlert = page.getByText('Activation Failed');
  98  |     if (await errorAlert.isVisible({ timeout: 5000 }).catch(() => false)) {
  99  |       const errorText = await page.locator('.text-red-800').textContent();
  100 |       console.log(`[UI ERROR] ${errorText}`);
  101 |       throw new Error(`Activation failed in UI: ${errorText}`);
  102 |     }
  103 |     
  104 |     // POS UI should appear (e.g. barcode scanner)
> 105 |     await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 20000 });
      |                                                                                     ^ Error: expect(locator).toBeVisible() failed
  106 |     
  107 |     // 17. Verify authorization.json exists on disk
  108 |     const authPath = path.join(userDataPath, 'licensing', 'authorization.json');
  109 |     expect(fs.existsSync(authPath)).toBe(true);
  110 |     
  111 |     const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  112 |     expect(authData.licenseId).toBe(TEST_LICENSE_ID);
  113 |     expect(authData.signature).toBeDefined();
  114 |     
  115 |     // 15. Database post-activation verification
  116 |     const bindResult = await dbPool.query('SELECT * FROM license_bindings WHERE license_id = $1 AND device_key_id = $2', [TEST_LICENSE_ID, authData.deviceKeyId]);
  117 |     expect(bindResult.rows.length).toBe(1);
  118 |   });
  119 | 
  120 |   test('L3: Billing operates successfully after real activation', async () => {
  121 |     // We insert a product into the REAL SQLite DB
  122 |     const dbDir = path.join(userDataPath, 'mini-erp-data');
  123 |     if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  124 |     const db = new Database(path.join(dbDir, 'billing.db'));
  125 |     db.exec(`
  126 |       CREATE TABLE IF NOT EXISTS products (
  127 |         id TEXT PRIMARY KEY,
  128 |         name TEXT NOT NULL,
  129 |         barcode TEXT,
  130 |         price_minor INTEGER NOT NULL,
  131 |         is_active INTEGER DEFAULT 1,
  132 |         created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  133 |         updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  134 |       )
  135 |     `);
  136 |     const now = Date.now();
  137 |     db.prepare(`
  138 |       INSERT OR REPLACE INTO products (id, name, barcode, price_minor, is_active, created_at, updated_at)
  139 |       VALUES ('test-real-p1', 'Real Coke', '123456', 5000, 1, ${now}, ${now})
  140 |     `).run();
  141 |     db.close();
  142 | 
  143 |     // Reload page to pick up products
  144 |     await page.reload();
  145 |     
  146 |     await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 15000 });
  147 |     const reloadInput = page.getByPlaceholder('Scan a barcode or type a product name...');
  148 |     await reloadInput.fill('Real Coke');
  149 | 
  150 |     const result = page.getByRole('button', { name: /Real Coke/i });
  151 |     await expect(result).toBeVisible();
  152 |     await result.click();
  153 | 
  154 |     await expect(page.getByText('₹50.00').first()).toBeVisible();
  155 |     
  156 |     // Finalize
  157 |     await page.getByRole('button', { name: 'Finalize & Print' }).click();
  158 |     
  159 |     // Verify toast or clear
  160 |     await expect(page.getByText('No items in current bill')).toBeVisible();
  161 |   });
  162 |   test('L4: Restart app, verify it bypasses activation screen', async () => {
  163 |     await app.close();
  164 | 
  165 |     const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');
  166 | 
  167 |     app = await electron.launch({
  168 |       args: ['dist-electron/main.js', `--user-data-dir=${userDataPath}`],
  169 |       env: {
  170 |         ...process.env,
  171 |         MINIPOS_E2E_TEST: 'true',
  172 |         MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
  173 |         LICENSING_SERVER_URL: 'http://localhost:54321/functions/v1/api',
  174 |         NODE_ENV: 'qa',
  175 |         LICENSING_SERVER_KEY_ID: 'qa-key-1',
  176 |         LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
  177 |       }
  178 |     });
  179 | 
  180 |     app.on('console', (msg: any) => {
  181 |       console.log(`[MAIN CONSOLE L4] ${msg.type()}: ${msg.text()}`);
  182 |     });
  183 | 
  184 |     page = await app.firstWindow();
  185 |     
  186 |     // Should immediately go to POS UI
  187 |     await expect(page.getByPlaceholder('Scan a barcode or type a product name...')).toBeVisible({ timeout: 20000 });
  188 |   });
  189 | 
  190 |   test('L5: Offline operation, verify it continues to work', async () => {
  191 |     await app.close();
  192 | 
  193 |     const publicKeyPem = fs.readFileSync(path.join(process.cwd(), '.local-qa', 'signing', 'qa-public-key.pem'), 'utf8');
  194 | 
  195 |     // Launch with an invalid URL to simulate offline/server down
  196 |     app = await electron.launch({
  197 |       args: ['dist-electron/main.js', `--user-data-dir=${userDataPath}`],
  198 |       env: {
  199 |         ...process.env,
  200 |         MINIPOS_E2E_TEST: 'true',
  201 |         MINIPOS_E2E_TEST_DEVICE_KEY: 'test-device-id-123',
  202 |         LICENSING_SERVER_URL: 'http://localhost:9999', // INVALID URL
  203 |         NODE_ENV: 'qa',
  204 |         LICENSING_SERVER_KEY_ID: 'qa-key-1',
  205 |         LICENSING_SERVER_PUBLIC_KEY: publicKeyPem
```