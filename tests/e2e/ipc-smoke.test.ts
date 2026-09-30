import { test, expect, _electron as electron } from '@playwright/test';

import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('IPC Integration Smoke Test', () => {
  let app: any;
  const userDataPath = path.join(os.tmpdir(), 'minipos-e2e-ipc-smoke');

  test.beforeAll(async () => {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
    app = await electron.launch({ 
      args: ['tests/e2e/test-entry.js', '--user-data-dir=' + userDataPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MINIPOS_E2E_TEST: 'true'
      }
    });
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('IPC Billing API is exposed to renderer and functional', async () => {
    const page = await app.firstWindow();
    
    // Evaluate in the browser context (Renderer process)
    const draftResponse = await page.evaluate(async () => {
      // @ts-ignore
      return await window.api.billing.loadDraft();
    });

    // The boundary should return a structured IpcResponse
    expect(draftResponse).toBeDefined();
    expect(draftResponse.success).toBe(true);
    // Even if empty, it should return the ActiveBillDTO
    expect(draftResponse.data).toBeDefined();
    expect(draftResponse.data.isEmpty).toBe(true);
    expect(draftResponse.data.items).toEqual([]);
    expect(draftResponse.data.totalMinor).toBe(0);
  });

  test('IPC Product API is exposed to renderer and gracefully handles missing products', async () => {
    const page = await app.firstWindow();
    
    const productResponse = await page.evaluate(async () => {
      // @ts-ignore
      return await window.api.products.findByBarcode('UNKNOWN_BARCODE_999');
    });

    expect(productResponse).toBeDefined();
    expect(productResponse.success).toBe(true);
    expect(productResponse.data).toBeNull();
  });
});
