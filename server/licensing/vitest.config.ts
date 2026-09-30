import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false, // Prevents tests from corrupting the shared test database
    testTimeout: 10000,
    env: {
      DATABASE_URL: 'postgres://laksh@localhost:5432/minipos_licensing_test',
      ADMIN_API_TOKEN: 'test-admin-token-32-chars-long-min',
      LICENSE_KEY_HMAC_SECRET: 'test-secret-key-32-bytes-long-12345',
    },
    setupFiles: ['./vitest.setup.ts']
  }
});
