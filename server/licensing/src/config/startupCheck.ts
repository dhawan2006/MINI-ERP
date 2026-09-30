// ---------------------------------------------------------------------------
// Phase 12 — Server Startup Self-Check
//
// Runs once during server startup, BEFORE accepting any requests.
// Fails loudly (process.exit(1)) if any check fails.
//
// SECURITY: This module NEVER logs secret material. It only checks presence
// and structural validity of non-secret properties.
// ---------------------------------------------------------------------------

import { Pool } from 'pg';
import { config } from './config';

const EXPECTED_SCHEMA_VERSION = 4; // updated when migration 004 runs

export async function runStartupChecks(pool: Pool): Promise<void> {
  console.log('[startup-check] Running production readiness checks...');

  const failures: string[] = [];

  // 1. Environment
  if (config.NODE_ENV === 'production') {
    console.log('[startup-check] ✓ NODE_ENV = production');
  } else {
    console.log(`[startup-check] ⚠ NODE_ENV = ${config.NODE_ENV} (non-production environment)`);
  }

  // 2. Signing key configured (presence only — never log the key value)
  if (config.LICENSING_SERVER_PRIVATE_KEY && config.LICENSING_SERVER_KEY_ID) {
    console.log(`[startup-check] ✓ Signing key configured (kid: ${config.LICENSING_SERVER_KEY_ID})`);
  } else {
    failures.push('LICENSING_SERVER_PRIVATE_KEY or LICENSING_SERVER_KEY_ID is missing');
  }

  // 3. Database reachable
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('[startup-check] ✓ Database connection OK');
  } catch (err: any) {
    failures.push(`Database connection failed: ${err.message}`);
  } finally {
    client?.release();
  }

  if (failures.length > 0) {
    // Early return — no point running schema checks if DB is down
    for (const f of failures) {
      console.error(`[startup-check] ✗ ${f}`);
    }
    process.exit(1);
  }

  // 4. Check that all required tables exist
  const requiredTables = [
    'licenses',
    'devices',
    'license_bindings',
    'activation_requests',
    'device_challenges',
    'lifecycle_requests',
    'audit_events',
  ];

  let tableClient;
  try {
    tableClient = await pool.connect();
    for (const table of requiredTables) {
      const res = await tableClient.query(
        `SELECT to_regclass('public.${ table}') AS oid`
      );
      if (res.rows[0]?.oid) {
        console.log(`[startup-check] ✓ Table '${table}' exists`);
      } else {
        failures.push(`Required table '${table}' does not exist — run migrations`);
      }
    }

    // 5. Check schema version if schema_migrations table exists
    const migCheckRes = await tableClient.query(
      `SELECT to_regclass('public.schema_migrations') AS oid`
    );
    if (migCheckRes.rows[0]?.oid) {
      const versionRes = await tableClient.query(
        `SELECT MAX(version) AS max_version FROM schema_migrations`
      );
      const appliedVersion = versionRes.rows[0]?.max_version ?? 0;
      if (appliedVersion >= EXPECTED_SCHEMA_VERSION) {
        console.log(`[startup-check] ✓ Schema version ${appliedVersion} >= required ${EXPECTED_SCHEMA_VERSION}`);
      } else {
        failures.push(
          `Schema version ${appliedVersion} is below required ${EXPECTED_SCHEMA_VERSION} — run migration 004`
        );
      }
    } else {
      console.log('[startup-check] ⚠ schema_migrations table not found — skipping version check (run migration 004)');
    }
  } finally {
    tableClient?.release();
  }

  if (failures.length > 0) {
    console.error('[startup-check] ✗ Startup self-check FAILED:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  console.log('[startup-check] ✓ All startup checks passed.');
}
