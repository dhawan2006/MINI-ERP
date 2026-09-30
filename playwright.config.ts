import { defineConfig } from '@playwright/test';

process.env.MINIPOS_E2E_TEST = 'true';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    trace: 'on-first-retry',
  },
  workers: 1,
});
