/**
 * playwright.windows.config.ts
 *
 * Playwright configuration for Windows packaged application tests.
 * These tests run against the packaged Mini POS Windows executable,
 * not the Vite development server.
 *
 * Usage:
 *   npx playwright test --config=playwright.windows.config.ts
 *
 * On Windows CI runner:
 *   set MINIPOS_E2E_TEST=true
 *   npx playwright test --config=playwright.windows.config.ts
 */

import { defineConfig } from '@playwright/test';

// Ensure we don't accidentally hit the Electron dev server
delete process.env.VITE_DEV_SERVER_URL;
// Activate FakeDialogService (no native OS dialogs in headless CI)
process.env.MINIPOS_E2E_TEST = 'true';

export default defineConfig({
  testDir: './tests/e2e/windows',
  timeout: 60000,  // Packaged Electron apps take longer to start
  expect: {
    timeout: 10000,
  },
  use: {
    trace: 'on-first-retry',
  },
  // All window tests must run sequentially — the app holds a single-instance lock.
  workers: 1,
  // Retry once on failure (Electron startup race conditions on slow CI)
  retries: 1,
  // Reporter
  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/windows-e2e-results.xml' }],
  ],
  // No browser projects needed — these are Electron tests
  projects: [
    {
      name: 'windows-packaged',
      // No browser launch options — tests use electron.launch() directly
    }
  ],
});
