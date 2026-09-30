// ---------------------------------------------------------------------------
// Phase 12 — Production Server Entry Point
//
// Startup order:
//  1. Validate config (done at import time in config.ts — process exits if invalid)
//  2. Run startup self-check (DB reachable, tables exist, schema version correct)
//  3. Start HTTP server
// ---------------------------------------------------------------------------

import app from './app';
import { config } from './config/config';
import { pool } from './config/db';
import { runStartupChecks } from './config/startupCheck';

async function start() {
  try {
    // Run all startup checks before accepting requests.
    // runStartupChecks() calls process.exit(1) on any failure.
    await runStartupChecks(pool);

    const server = app.listen(config.PORT, () => {
      console.log(`🚀 Licensing Server running on port ${config.PORT} [${config.NODE_ENV}]`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`[server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await pool.end();
        console.log('[server] Shutdown complete.');
        process.exit(0);
      });
      // Force exit after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        console.error('[server] Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (err: any) {
    console.error('❌ Failed to start licensing server:', err?.message);
    process.exit(1);
  }
}

start();
