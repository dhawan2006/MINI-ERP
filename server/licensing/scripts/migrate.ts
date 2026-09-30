// ---------------------------------------------------------------------------
// Phase 12 — Production-Safe Migration Runner
//
// Changes from Phase 2 implementation:
//  - Each migration file now manages its own transaction (BEGIN/COMMIT).
//    The runner must NOT wrap everything in a single outer transaction, since
//    doing so creates implicit nested transactions in PostgreSQL which cause
//    the inner BEGIN/COMMIT to be treated as savepoints — and any failure in
//    migration N rolls back migrations 1..N, not just N.
//  - Migration files are each idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING).
//  - Errors include the migration filename for easy triage.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import { getClient } from '../src/config/db';

export async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && !f.startsWith('_'))
    .sort();

  console.log(`[migrate] Found ${files.length} migration(s) in ${migrationsDir}`);

  for (const file of files) {
    const client = await getClient();
    try {
      console.log(`[migrate] Running: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      // Each migration file contains its own BEGIN/COMMIT block.
      // We execute the whole file as a single statement batch.
      await client.query(sql);
      console.log(`[migrate] ✓ ${file}`);
    } catch (err: any) {
      console.error(`[migrate] ✗ ${file} failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('✅ All migrations completed successfully.');
}

// Support running directly: tsx scripts/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
