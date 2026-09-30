import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Backup E2E', () => {
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
    
    // Capture Main process logs
    electronApp.process().stdout.on('data', (data: Buffer) => {
      console.log(`MAIN STDOUT: ${data.toString()}`);
    });
    electronApp.process().stderr.on('data', (data: Buffer) => {
      console.error(`MAIN STDERR: ${data.toString()}`);
    });

    electronApp.on('window', (page: any) => {
      page.on('console', (msg: any) => console.log('PAGE:', msg.text()));
    });
    window = await electronApp.firstWindow();
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('can trigger backup from settings and verify success', async () => {
    // Navigate to Settings
    await window.click('button:has-text("Settings")');
    
    // Wait for Settings to appear (h2 in new layout)
    await expect(window.locator('h2', { hasText: 'Settings' })).toBeVisible();

    // Navigate to Data Management tab
    const dataTab = window.getByTestId('settings-tab-data');
    await dataTab.click();

    // Click the Backup Database button
    const backupBtn = window.getByRole('button', { name: 'Backup Database' });
    await backupBtn.click();
    
    // Wait for success toast
    await expect(window.locator('p', { hasText: 'Backup created successfully.' })).toBeVisible({ timeout: 10000 });
    
    // Check if FakeDialogService successfully output the file
    // userData + 'e2e-test-backups' + 'Mini-POS-Backup...db'
    const userData = await electronApp.evaluate(({ app }: any) => {
      return app.getPath('userData');
    });
    const backupDir = path.join(userData, 'e2e-test-backups');
    const files = fs.readdirSync(backupDir);
    expect(files.some(f => f.startsWith('Mini-POS-Backup-') && f.endsWith('.db'))).toBe(true);
  });
});
