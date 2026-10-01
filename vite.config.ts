import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      react(),
      electron([
        {
          entry: 'electron/main.ts',
          vite: {
            build: {
              rollupOptions: {
                external: ['better-sqlite3']
              }
            },
            define: {
              '__PROD_LICENSING_SERVER_PUBLIC_KEY__': JSON.stringify(env.LICENSING_SERVER_PUBLIC_KEY || '')
            }
          }
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload()
          },
        },
      ]),
      renderer(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**'],
      fileParallelism: false,
      env: {
        DATABASE_URL: 'postgres://laksh@localhost:5432/minipos_licensing_test',
        ADMIN_API_TOKEN: 'test_admin_token_1234567890_32_chars_long',
        LICENSE_KEY_HMAC_SECRET: 'test_hmac_secret_12345678901234567890'
      }
    }
  }
})
